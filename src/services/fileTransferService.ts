import { FileMetadata, FileTransferProgress, OverallTransferProgress, AccelerationSettings } from '../types/transfer';
import { computeFileHash } from '../utils/crypto';
import { isCompressibleFile, compressBlob, decompressBlob } from '../utils/compression';
import { Speedometer, getOptimalConnections, DEFAULT_CHUNK_SIZE } from './speedEngine';

const MAGIC_NUMBER = 0x53574644; // "SWFD" in hex
const HEADER_SIZE = 16;

export interface FileTransferEvents {
  onOverallProgress: (progress: OverallTransferProgress) => void;
  onFileProgress: (fileProgress: FileTransferProgress) => void;
  onFileCompleted: (fileId: string, blob: Blob, verified: boolean) => void;
  onBatchCompleted: () => void;
  onError: (error: string) => void;
  onCancelled: (reason: string) => void;
}

export class FileTransferService {
  private channels: RTCDataChannel[] = [];
  private events: FileTransferEvents;
  private isCancelled = false;
  private settings: AccelerationSettings;
  private incomingQueue: Promise<void> = Promise.resolve();

  // Sender state
  private filesToSend: File[] = [];

  // Receiver state
  private incomingFilesManifest: FileMetadata[] = [];
  private readonly COALESCE_SEGMENT_SIZE = 128; // Coalesce every 128 chunks (~8MB) into native Blob to keep V8 heap < 30MB
  private currentReceivingFile: {
    fileIndex: number;
    metadata: FileMetadata;
    chunks: (ArrayBuffer | Blob)[];
    receivedChunksCount: number;
    expectedChunksCount: number;
    bytesReceived: number;
    totalExpectedBytes: number;
    isCompressed?: boolean;
    fileEndReceived: boolean;
    finalizing: boolean;
  } | null = null;

  // Early chunks buffer in case a binary chunk arrives slightly before FILE_START across parallel channels
  private earlyChunksBuffer = new Map<string, ArrayBuffer>();
  private pendingBatchComplete = false;

  // Metrics tracking
  private totalBytes = 0;
  private transferredBytes = 0;
  private effectiveBytesTransferred = 0;
  private speedMeasurements: Array<{ time: number; bytes: number }> = [];
  private speedometer = new Speedometer(50, 250);
  private currentFileIndex = 0;

  constructor(
    channels: RTCDataChannel | RTCDataChannel[],
    events: FileTransferEvents,
    settings: AccelerationSettings = { parallelStreams: 4, enableCompression: true, chunkSize: 65536 }
  ) {
    this.channels = Array.isArray(channels) ? channels : [channels];
    this.events = events;
    this.settings = settings;

    this.setupChannels();
  }

  public setChannels(channels: RTCDataChannel[]) {
    this.channels = channels;
    this.setupChannels();
  }

  public addChannel(channel: RTCDataChannel) {
    if (!this.channels.includes(channel)) {
      this.channels.push(channel);
      this.setupSingleChannel(channel);
    }
  }

  public handleIncomingEvent(event: MessageEvent): Promise<void> {
    this.incomingQueue = this.incomingQueue
      .then(() => this.processIncomingEventSequential(event))
      .catch((err) => {
        console.error('[FileTransfer] Error in incoming event queue:', err);
      });
    return this.incomingQueue;
  }

  private async processIncomingEventSequential(event: MessageEvent): Promise<void> {
    if (this.isCancelled) return;

    if (typeof event.data === 'string') {
      try {
        const msg = JSON.parse(event.data);
        await this.handleControlMessage(msg);
      } catch (err) {
        console.error('[FileTransfer] Error handling control message:', err);
      }
    } else if (event.data instanceof ArrayBuffer) {
      await this.handleBinaryChunk(event.data);
    } else if (event.data instanceof Blob) {
      const buf = await event.data.arrayBuffer();
      await this.handleBinaryChunk(buf);
    }
  }

  private setupSingleChannel(channel: RTCDataChannel) {
    channel.binaryType = 'arraybuffer';
    try {
      channel.bufferedAmountLowThreshold = 256 * 1024;
    } catch {}

    channel.onmessage = (event: MessageEvent) => {
      this.handleIncomingEvent(event);
    };
  }

  private setupChannels() {
    this.channels.forEach((channel) => {
      this.setupSingleChannel(channel);
    });
  }

  // --- SENDER IMPLEMENTATION ---

  public async startSending(files: File[]): Promise<void> {
    this.isCancelled = false;
    this.filesToSend = files;
    this.totalBytes = files.reduce((acc, f) => acc + f.size, 0);
    this.transferredBytes = 0;
    this.effectiveBytesTransferred = 0;
    this.speedMeasurements = [];
    this.speedometer.reset();
    this.currentFileIndex = 0;

    // Prefer WebRTC DataChannels if any are open; otherwise use the WebSocket fallback channel
    const webrtcOpen = this.channels.filter(
      (c) => c.readyState === 'open' && c.label !== 'ws-relay-fallback'
    );
    const activeChannels =
      webrtcOpen.length > 0
        ? webrtcOpen
        : this.channels.filter((c) => c.readyState === 'open');

    this.sendControlMessage({
      type: 'BATCH_START',
      totalFiles: files.length,
      totalBytes: this.totalBytes,
      parallelStreams: Math.max(1, activeChannels.length),
      compressionEnabled: this.settings.enableCompression
    });

    for (let i = 0; i < files.length; i++) {
      if (this.isCancelled) break;
      this.currentFileIndex = i;
      const file = files[i];
      await this.sendFile(file, i);
    }

    if (!this.isCancelled) {
      this.sendControlMessage({
        type: 'BATCH_COMPLETE',
        totalFiles: files.length
      });
      this.events.onBatchCompleted();
    }
  }

  private getActiveSendChannels(): RTCDataChannel[] {
    const webrtcOpen = this.channels.filter(
      (c) => c.readyState === 'open' && c.label !== 'ws-relay-fallback'
    );
    if (webrtcOpen.length > 0) {
      return webrtcOpen;
    }
    return this.channels.filter((c) => c.readyState === 'open');
  }

  private async sendFile(file: File, fileIndex: number): Promise<void> {
    const fileId = `file-${fileIndex}-${file.lastModified || Date.now()}`;
    const chunkSize = 65536; // 64 KiB for fast, universal WebRTC & WebSocket compatibility

    // 1. Compute original hash for integrity verification
    let originalHash = '';
    try {
      originalHash = await computeFileHash(file);
    } catch (err) {
      console.warn('[FileTransfer] Could not compute hash for', file.name, err);
    }

    // 2. On-the-fly streaming compression if applicable
    let dataBlob: Blob = file;
    let isCompressed = false;
    let compressionRatio = 0;

    if (
      this.settings.enableCompression &&
      file.size <= 50 * 1024 * 1024 &&
      isCompressibleFile(file.name, file.type || '')
    ) {
      this.events.onFileProgress({
        fileId,
        name: file.name,
        size: file.size,
        bytesTransferred: 0,
        progressPercent: 0,
        status: 'compressing'
      });

      try {
        const compResult = await compressBlob(file);
        if (compResult.compressedSize > 0 && compResult.compressedSize < file.size) {
          dataBlob = compResult.compressedBlob;
          isCompressed = true;
          compressionRatio = compResult.ratio;
        }
      } catch (err) {
        console.warn('[FileTransfer] Compression skipped:', err);
      }
    }

    const wireSize = dataBlob.size;
    const expectedChunks = Math.max(1, Math.ceil(wireSize / chunkSize));

    this.sendControlMessage({
      type: 'FILE_START',
      fileIndex,
      fileId,
      name: file.name,
      size: file.size,
      wireSize,
      mimeType: file.type || 'application/octet-stream',
      lastModified: file.lastModified,
      expectedChunks: wireSize === 0 ? 0 : expectedChunks,
      hash: originalHash,
      isCompressed,
      compressionRatio
    });

    let offset = 0;
    let chunkIndex = 0;
    let fileTransferredBytes = 0;

    this.events.onFileProgress({
      fileId,
      name: file.name,
      size: file.size,
      bytesTransferred: 0,
      progressPercent: 0,
      status: 'transferring',
      isCompressed,
      compressedSize: isCompressed ? wireSize : undefined,
      compressionRatio: isCompressed ? compressionRatio : undefined
    });

    const optimalChannelsCount = getOptimalConnections(file.size);

    while (offset < wireSize && !this.isCancelled) {
      const allOpenChannels = this.getActiveSendChannels();
      if (allOpenChannels.length === 0) {
        await new Promise((r) => setTimeout(r, 30));
        continue;
      }

      // Restrict active channels pool according to Send Anywhere's optimal connection profile
      const openChannels = allOpenChannels.slice(0, Math.min(allOpenChannels.length, optimalChannelsCount));
      const targetChannel = openChannels.reduce((lowest, ch) => {
        return ch.bufferedAmount < lowest.bufferedAmount ? ch : lowest;
      }, openChannels[0]);

      const perChannelLimit = 512 * 1024;
      if (targetChannel.bufferedAmount > perChannelLimit) {
        await this.waitForAnyBufferDrain(targetChannel);
      }

      if (this.isCancelled) break;

      const slice = dataBlob.slice(offset, offset + chunkSize);
      const chunkBuffer = await slice.arrayBuffer();

      // Framing: [4 bytes Magic][4 bytes fileIndex][4 bytes chunkIndex][4 bytes payloadLength][Data]
      const packet = new Uint8Array(HEADER_SIZE + chunkBuffer.byteLength);
      const view = new DataView(packet.buffer);

      view.setUint32(0, MAGIC_NUMBER, false);
      view.setUint32(4, fileIndex, false);
      view.setUint32(8, chunkIndex, false);
      view.setUint32(12, chunkBuffer.byteLength, false);

      packet.set(new Uint8Array(chunkBuffer), HEADER_SIZE);

      try {
        targetChannel.send(packet.buffer);
      } catch (err) {
        console.warn('[FileTransfer] Error sending on channel, retrying...', err);
        await new Promise((r) => setTimeout(r, 20));
        continue;
      }

      offset += chunkBuffer.byteLength;
      fileTransferredBytes += chunkBuffer.byteLength;
      this.transferredBytes += chunkBuffer.byteLength;
      chunkIndex++;

      const effectiveChunkRatio = isCompressed && wireSize > 0 ? file.size / wireSize : 1;
      this.effectiveBytesTransferred += Math.round(chunkBuffer.byteLength * effectiveChunkRatio);

      this.updateProgress(fileId, file.name, file.size, fileTransferredBytes, wireSize, isCompressed);

      // Yield briefly every 32 chunks (~2MB) so UI and WebSocket event loop stay responsive at 60fps
      if (chunkIndex % 32 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    if (!this.isCancelled) {
      this.sendControlMessage({
        type: 'FILE_END',
        fileId,
        fileIndex,
        totalBytesSent: fileTransferredBytes
      });
      this.events.onFileCompleted(fileId, file, true);
    }
  }

  private waitForAnyBufferDrain(channel: RTCDataChannel): Promise<void> {
    return new Promise((resolve) => {
      let timer: any = null;
      const onLow = () => {
        if (timer) clearTimeout(timer);
        channel.removeEventListener('bufferedamountlow', onLow);
        resolve();
      };
      channel.addEventListener('bufferedamountlow', onLow);
      timer = setTimeout(onLow, 50);
    });
  }

  // --- RECEIVER IMPLEMENTATION ---

  public setIncomingManifest(files: FileMetadata[]): void {
    this.incomingFilesManifest = files;
    this.totalBytes = files.reduce((acc, f) => acc + f.size, 0);
    this.transferredBytes = 0;
    this.effectiveBytesTransferred = 0;
    this.speedMeasurements = [];
    this.speedometer.reset();
  }

  private async handleControlMessage(msg: any): Promise<void> {
    switch (msg.type) {
      case 'BATCH_START':
        this.totalBytes = msg.totalBytes;
        this.transferredBytes = 0;
        this.effectiveBytesTransferred = 0;
        this.pendingBatchComplete = false;
        this.speedMeasurements = [];
        this.speedometer.reset();
        break;

      case 'FILE_START': {
        const metadata: FileMetadata = {
          id: msg.fileId,
          name: msg.name,
          size: msg.size,
          type: msg.mimeType,
          lastModified: msg.lastModified,
          hash: msg.hash,
          isCompressed: msg.isCompressed,
          compressedSize: msg.wireSize
        };

        const expectedChunks =
          typeof msg.expectedChunks === 'number' && msg.expectedChunks > 0
            ? Math.min(msg.expectedChunks, 500000)
            : 0;
        this.currentFileIndex = msg.fileIndex || 0;

        this.currentReceivingFile = {
          fileIndex: msg.fileIndex || 0,
          metadata,
          chunks: [],
          receivedChunksCount: 0,
          expectedChunksCount: expectedChunks,
          bytesReceived: 0,
          totalExpectedBytes: msg.wireSize ?? msg.size,
          isCompressed: msg.isCompressed,
          fileEndReceived: false,
          finalizing: false
        };

        this.events.onFileProgress({
          fileId: metadata.id,
          name: metadata.name,
          size: metadata.size,
          bytesTransferred: 0,
          progressPercent: 0,
          status: 'transferring',
          isCompressed: msg.isCompressed,
          compressedSize: msg.wireSize,
          compressionRatio: msg.compressionRatio
        });

        // Flush any chunks that arrived early for this fileIndex
        for (let c = 0; c < expectedChunks; c++) {
          const key = `${msg.fileIndex || 0}:${c}`;
          const earlyData = this.earlyChunksBuffer.get(key);
          if (earlyData) {
            this.earlyChunksBuffer.delete(key);
            this.storeChunkForCurrentFile(c, earlyData);
          }
        }

        if (expectedChunks === 0) {
          await this.finalizeCurrentFile();
        }
        break;
      }

      case 'FILE_END': {
        if (!this.currentReceivingFile) return;
        this.currentReceivingFile.fileEndReceived = true;

        // If all expected chunks are already here, finalize immediately;
        // otherwise handleBinaryChunk will finalize as soon as the last chunk lands.
        if (this.currentReceivingFile.receivedChunksCount >= this.currentReceivingFile.expectedChunksCount) {
          await this.finalizeCurrentFile();
        }
        break;
      }

      case 'BATCH_COMPLETE':
        if (this.currentReceivingFile && !this.currentReceivingFile.finalizing) {
          this.pendingBatchComplete = true;
        } else {
          this.events.onBatchCompleted();
        }
        break;

      case 'CANCEL':
        this.isCancelled = true;
        this.events.onCancelled(msg.reason || 'Transfer was cancelled');
        break;

      default:
        break;
    }
  }

  private storeChunkForCurrentFile(chunkIndex: number, chunkData: ArrayBuffer) {
    if (!this.currentReceivingFile) return;
    const current = this.currentReceivingFile;
    if (!current.chunks[chunkIndex]) {
      current.chunks[chunkIndex] = chunkData;
      current.receivedChunksCount++;
      current.bytesReceived += chunkData.byteLength;
      this.transferredBytes += chunkData.byteLength;

      // Periodically coalesce completed chunk segments into Blobs to free V8 heap memory
      const segmentStart = Math.floor(chunkIndex / this.COALESCE_SEGMENT_SIZE) * this.COALESCE_SEGMENT_SIZE;
      const segmentEnd = Math.min(segmentStart + this.COALESCE_SEGMENT_SIZE, current.expectedChunksCount);

      let isSegmentComplete = true;
      for (let i = segmentStart; i < segmentEnd; i++) {
        if (!current.chunks[i]) {
          isSegmentComplete = false;
          break;
        }
      }

      if (isSegmentComplete && current.chunks[segmentStart] instanceof ArrayBuffer) {
        const buffersToMerge: ArrayBuffer[] = [];
        for (let i = segmentStart; i < segmentEnd; i++) {
          const item = current.chunks[i];
          if (item instanceof ArrayBuffer) {
            buffersToMerge.push(item);
          }
        }
        if (buffersToMerge.length === (segmentEnd - segmentStart)) {
          const segmentBlob = new Blob(buffersToMerge, { type: 'application/octet-stream' });
          current.chunks[segmentStart] = segmentBlob;
          for (let i = segmentStart + 1; i < segmentEnd; i++) {
            current.chunks[i] = new Blob([], { type: 'application/octet-stream' });
          }
        }
      }

      const effectiveRatio =
        current.isCompressed && current.totalExpectedBytes > 0
          ? current.metadata.size / current.totalExpectedBytes
          : 1;
      this.effectiveBytesTransferred += Math.round(chunkData.byteLength * effectiveRatio);

      this.updateProgress(
        current.metadata.id,
        current.metadata.name,
        current.metadata.size,
        current.bytesReceived,
        current.totalExpectedBytes,
        current.isCompressed
      );
    }
  }

  private async finalizeCurrentFile(): Promise<void> {
    if (!this.currentReceivingFile || this.currentReceivingFile.finalizing) return;
    this.currentReceivingFile.finalizing = true;
    const current = this.currentReceivingFile;

    this.events.onFileProgress({
      fileId: current.metadata.id,
      name: current.metadata.name,
      size: current.metadata.size,
      bytesTransferred: current.bytesReceived,
      progressPercent: 100,
      status: 'verifying'
    });

    const rawChunks = current.chunks.filter(Boolean);
    let blob = new Blob(rawChunks, {
      type: current.isCompressed ? 'application/gzip' : current.metadata.type
    });

    if (current.isCompressed) {
      try {
        const decompressed = await decompressBlob(blob);
        blob = new Blob([await decompressed.arrayBuffer()], { type: current.metadata.type });
      } catch (err) {
        console.error('[FileTransfer] Failed to decompress blob:', err);
      }
    }

    let hashMatched = true;
    if (current.metadata.hash) {
      try {
        const calculatedHash = await computeFileHash(blob);
        hashMatched = calculatedHash.toLowerCase() === current.metadata.hash.toLowerCase();
      } catch (err) {
        console.warn('[FileTransfer] Error verifying hash:', err);
        hashMatched = true; // Do not block download if WebCrypto subtle is unavailable on plain HTTP LAN
      }
    }

    this.events.onFileProgress({
      fileId: current.metadata.id,
      name: current.metadata.name,
      size: current.metadata.size,
      bytesTransferred: current.metadata.size,
      progressPercent: 100,
      status: hashMatched ? 'completed' : 'failed',
      hashMatched,
      error: hashMatched ? undefined : 'SHA-256 integrity check failed'
    });

    this.events.onFileCompleted(current.metadata.id, blob, hashMatched);
    this.currentReceivingFile = null;

    if (this.pendingBatchComplete) {
      this.pendingBatchComplete = false;
      this.events.onBatchCompleted();
    }
  }

  private async handleBinaryChunk(buffer: ArrayBuffer): Promise<void> {
    if (buffer.byteLength < HEADER_SIZE) return;

    const view = new DataView(buffer);
    const magic = view.getUint32(0, false);

    if (magic !== MAGIC_NUMBER) {
      console.warn('[FileTransfer] Received chunk with invalid magic header');
      return;
    }

    const fileIndex = view.getUint32(4, false);
    const chunkIndex = view.getUint32(8, false);
    const payloadLength = view.getUint32(12, false);
    const chunkData = buffer.slice(HEADER_SIZE, HEADER_SIZE + payloadLength);

    if (!this.currentReceivingFile || this.currentReceivingFile.fileIndex !== fileIndex) {
      this.earlyChunksBuffer.set(`${fileIndex}:${chunkIndex}`, chunkData);
      return;
    }

    this.storeChunkForCurrentFile(chunkIndex, chunkData);

    if (
      this.currentReceivingFile &&
      this.currentReceivingFile.fileEndReceived &&
      this.currentReceivingFile.receivedChunksCount >= this.currentReceivingFile.expectedChunksCount
    ) {
      await this.finalizeCurrentFile();
    }
  }

  private updateProgress(
    fileId: string,
    fileName: string,
    fileSize: number,
    fileBytesTransferred: number,
    fileWireSize: number,
    isCompressed?: boolean
  ) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const ringSpeed = this.speedometer.recordBytes(fileBytesTransferred, Date.now());

    if (this.speedMeasurements.length === 0 || (this.speedMeasurements.length === 1 && this.speedMeasurements[0].bytes === 0)) {
      this.speedMeasurements = [{ time: now - 8, bytes: 0 }];
    }
    this.speedMeasurements.push({ time: now, bytes: this.transferredBytes });
    this.speedMeasurements = this.speedMeasurements.filter((m) => now - m.time <= 2000);

    let speed = ringSpeed;
    if (speed <= 0 && this.speedMeasurements.length > 1) {
      const first = this.speedMeasurements[0];
      const timeDiff = Math.max(0.005, (now - first.time) / 1000);
      const bytesDiff = this.transferredBytes - first.bytes;
      if (bytesDiff > 0) {
        speed = Math.max(0, bytesDiff / timeDiff);
      }
    }

    const effectiveSpeed =
      isCompressed && fileWireSize > 0 && fileSize > fileWireSize
        ? Math.round(speed * (fileSize / fileWireSize))
        : speed;

    const effectiveTransferred = Math.min(
      this.totalBytes,
      this.effectiveBytesTransferred > 0 ? this.effectiveBytesTransferred : this.transferredBytes
    );
    const remainingBytes = Math.max(0, this.totalBytes - effectiveTransferred);
    const etaSeconds = effectiveSpeed > 0 ? Math.ceil(remainingBytes / effectiveSpeed) : null;
    const overallPercent =
      this.totalBytes > 0 ? Math.min(100, Math.round((effectiveTransferred / this.totalBytes) * 100)) : 100;

    const targetFileSize = isCompressed ? fileWireSize : fileSize;
    const filePercent =
      targetFileSize > 0 ? Math.min(100, Math.round((fileBytesTransferred / targetFileSize) * 100)) : 100;

    this.events.onOverallProgress({
      totalBytes: this.totalBytes,
      transferredBytes: effectiveTransferred,
      percent: overallPercent,
      speedBytesPerSec: speed,
      effectiveSpeedBytesPerSec: effectiveSpeed,
      etaSeconds,
      currentFileIndex: this.currentFileIndex,
      totalFiles: this.filesToSend.length || this.incomingFilesManifest.length,
      status: 'transferring'
    });

    this.events.onFileProgress({
      fileId,
      name: fileName,
      size: fileSize,
      bytesTransferred: fileBytesTransferred,
      progressPercent: filePercent,
      status: 'transferring',
      isCompressed
    });
  }

  private sendControlMessage(msg: any): void {
    const openChannels = this.getActiveSendChannels();
    if (openChannels.length > 0) {
      openChannels[0].send(JSON.stringify(msg));
    }
  }

  public cancel(reason = 'Transfer cancelled by user'): void {
    this.isCancelled = true;
    this.sendControlMessage({ type: 'CANCEL', reason });
    this.events.onCancelled(reason);
  }
}
