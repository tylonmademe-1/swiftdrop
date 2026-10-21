import QRCode from 'qrcode';
import { compressBlob, decompressBlob } from '../utils/compression';

/**
 * QRFerry Optical Data Transfer Protocol (inspired by deedy/qr-data-transfer)
 * - Compresses file payload with Gzip when it saves optical bytes
 * - Splits payload into source symbols + interleaved XOR fountain repair symbols
 * - Protects every frame with a 32-bit CRC-32 checksum and compact header
 * - Receiver can join mid-stream, collect frames out-of-order, recover from dropped frames
 *   using repair symbols, verify whole-file CRC-32, and reconstruct the file in-browser.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint8ToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUint8(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export interface QRFerryStreamMetadata {
  transferId: string;
  fileName: string;
  mimeType: string;
  originalSize: number;
  wireSize: number;
  compressed: boolean;
  fileCrc: string;
  sourceFramesCount: number;
  totalFramesCount: number;
  chunkSize: number;
  parityGroupSize: number;
}

export interface QRFerryEncodedStream {
  metadata: QRFerryStreamMetadata;
  frames: string[]; // Raw QR string payloads (source + parity repair frames)
}

export interface QRFerryReceiveProgress {
  transferId: string;
  fileName: string;
  mimeType: string;
  originalSize: number;
  receivedSourceFrames: number;
  totalSourceFrames: number;
  repairFramesCollected: number;
  percent: number;
  fpsScanned: number;
  isComplete: boolean;
  verified?: boolean;
  blob?: Blob;
  error?: string;
}

const GROUP_SIZE = 4; // 1 XOR parity repair frame for every 4 source frames

/**
 * Encodes a File or Blob into a QRFerry optical stream with source symbols and XOR repair symbols.
 */
export async function createQRFerryStream(
  file: File,
  chunkSize = 480
): Promise<QRFerryEncodedStream> {
  const originalBuffer = await file.arrayBuffer();
  const originalBytes = new Uint8Array(originalBuffer);
  const fileCrcHex = crc32(originalBytes).toString(16).padStart(8, '0');

  // Attempt Gzip compression; retain only when it saves optical bytes
  let wireBytes = originalBytes;
  let compressed = false;
  try {
    const compResult = await compressBlob(file);
    if (compResult.compressedSize > 0 && compResult.compressedSize < originalBytes.byteLength) {
      const compBuf = await compResult.compressedBlob.arrayBuffer();
      wireBytes = new Uint8Array(compBuf);
      compressed = true;
    }
  } catch {
    // Keep uncompressed if CompressionStream is unavailable
  }

  const wireSize = wireBytes.byteLength;
  const sourceFramesCount = Math.max(1, Math.ceil(wireSize / chunkSize));
  const transferId = Math.random().toString(36).substring(2, 8).toUpperCase();

  // Slice into fixed-length padded chunks for clean XOR parity recovery
  const sourceChunks: Uint8Array[] = [];
  for (let i = 0; i < sourceFramesCount; i++) {
    const start = i * chunkSize;
    const slice = wireBytes.subarray(start, Math.min(wireSize, start + chunkSize));
    sourceChunks.push(slice);
  }

  const encodedMeta = encodeURIComponent(file.name) + '|' + encodeURIComponent(file.type || 'application/octet-stream');
  const frames: string[] = [];

  // Build source frames:
  // Format: QRF1|transferId|S|index|sourceCount|origSize|wireSize|compFlag|fileCrc|frameCrc|meta(on frame 0 or every 4th)|base64Data
  for (let i = 0; i < sourceFramesCount; i++) {
    const chunk = sourceChunks[i];
    const frameCrcHex = crc32(chunk).toString(16).padStart(8, '0');
    const b64 = uint8ToBase64Url(chunk);
    // Include file metadata in every frame so receiver can join mid-stream immediately!
    const frameStr = `QRF1|${transferId}|S|${i}|${sourceFramesCount}|${ originalBytes.byteLength}|${wireSize}|${compressed ? 1 : 0}|${fileCrcHex}|${frameCrcHex}|${encodedMeta}|${b64}`;
    frames.push(frameStr);

    // Every GROUP_SIZE frames, emit a fountain XOR parity repair frame covering [i - GROUP_SIZE + 1 .. i]
    if ((i + 1) % GROUP_SIZE === 0 && sourceFramesCount >= GROUP_SIZE) {
      const groupStart = i - GROUP_SIZE + 1;
      const parityBytes = new Uint8Array(chunkSize);
      for (let g = groupStart; g <= i; g++) {
        const src = sourceChunks[g];
        for (let b = 0; b < src.length; b++) {
          parityBytes[b] ^= src[b];
        }
      }
      const parityCrcHex = crc32(parityBytes).toString(16).padStart(8, '0');
      const parityB64 = uint8ToBase64Url(parityBytes);
      const repairFrameStr = `QRF1|${transferId}|R|${groupStart}|${sourceFramesCount}|${originalBytes.byteLength}|${wireSize}|${compressed ? 1 : 0}|${fileCrcHex}|${parityCrcHex}|${encodedMeta}|${parityB64}`;
      frames.push(repairFrameStr);
    }
  }

  const metadata: QRFerryStreamMetadata = {
    transferId,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    originalSize: originalBytes.byteLength,
    wireSize,
    compressed,
    fileCrc: fileCrcHex,
    sourceFramesCount,
    totalFramesCount: frames.length,
    chunkSize,
    parityGroupSize: GROUP_SIZE
  };

  return { metadata, frames };
}

/**
 * Renders a QRFerry frame string to a fast data URL image
 */
export async function renderQRFerryFrame(frameData: string): Promise<string> {
  return QRCode.toDataURL(frameData, {
    width: 300,
    margin: 1,
    errorCorrectionLevel: 'L', // V30-L equivalent low ECC for maximum optical byte density & crisp modules
    color: {
      dark: '#141413',
      light: '#FFFFFF'
    }
  });
}

export function isQRFerryFrame(data: string): boolean {
  return typeof data === 'string' && data.startsWith('QRF1|');
}

/**
 * Stateful QRFerry Optical Receiver
 * Collects source and repair frames out-of-order, verifies per-frame CRC-32,
 * applies XOR fountain repair when 3 of 4 frames in a group are present,
 * and reconstructs + verifies the full file.
 */
export class QRFerryReceiver {
  private transferId: string | null = null;
  private fileName = 'transferred-file';
  private mimeType = 'application/octet-stream';
  private originalSize = 0;
  private wireSize = 0;
  private compressed = false;
  private expectedFileCrc = '';
  private sourceFramesCount = 0;
  private chunkSize = 480;

  private sourceChunks = new Map<number, Uint8Array>();
  private repairChunks = new Map<number, Uint8Array>(); // keyed by groupStart index
  private scanTimestamps: number[] = [];
  private isCompleted = false;
  private completedBlob: Blob | null = null;

  public reset(): void {
    this.transferId = null;
    this.sourceChunks.clear();
    this.repairChunks.clear();
    this.scanTimestamps = [];
    this.isCompleted = false;
    this.completedBlob = null;
  }

  public async processFrame(rawFrame: string): Promise<QRFerryReceiveProgress | null> {
    if (!isQRFerryFrame(rawFrame)) return null;

    const parts = rawFrame.split('|');
    // QRF1 | transferId | S/R | index | sourceCount | origSize | wireSize | compFlag | fileCrc | frameCrc | fileName | mimeType | b64
    if (parts.length < 13) return null;

    const [
      ,
      transferId,
      frameType,
      indexStr,
      sourceCountStr,
      origSizeStr,
      wireSizeStr,
      compFlagStr,
      fileCrcHex,
      frameCrcHex,
      encName,
      encMime,
      b64Payload
    ] = parts;

    const frameIndex = parseInt(indexStr, 10);
    const sourceCount = parseInt(sourceCountStr, 10);
    const origSize = parseInt(origSizeStr, 10);
    const wireSize = parseInt(wireSizeStr, 10);
    const compressed = compFlagStr === '1';

    if (isNaN(frameIndex) || isNaN(sourceCount) || sourceCount <= 0) {
      return null;
    }

    // If a new transferId starts, reset state
    if (this.transferId !== transferId) {
      this.reset();
      this.transferId = transferId;
      this.fileName = decodeURIComponent(encName || 'transferred-file');
      this.mimeType = decodeURIComponent(encMime || 'application/octet-stream');
      this.originalSize = origSize;
      this.wireSize = wireSize;
      this.compressed = compressed;
      this.expectedFileCrc = fileCrcHex;
      this.sourceFramesCount = sourceCount;
    }

    if (this.isCompleted && this.completedBlob) {
      return this.buildProgress(true, true);
    }

    // Decode payload and verify per-frame CRC-32
    let payloadBytes: Uint8Array;
    try {
      payloadBytes = base64UrlToUint8(b64Payload);
    } catch {
      return null;
    }

    const actualFrameCrc = crc32(payloadBytes).toString(16).padStart(8, '0');
    if (actualFrameCrc !== frameCrcHex) {
      // Corrupted optical frame — reject!
      return this.buildProgress(false);
    }

    // Track scan rate
    const now = Date.now();
    this.scanTimestamps.push(now);
    this.scanTimestamps = this.scanTimestamps.filter((t) => now - t <= 2000);

    if (frameType === 'S') {
      if (!this.sourceChunks.has(frameIndex)) {
        if (frameIndex === 0 && payloadBytes.byteLength > 0 && this.sourceFramesCount > 1) {
          this.chunkSize = payloadBytes.byteLength;
        }
        this.sourceChunks.set(frameIndex, payloadBytes);
        this.tryFountainRepair();
      }
    } else if (frameType === 'R') {
      if (!this.repairChunks.has(frameIndex)) {
        this.chunkSize = payloadBytes.byteLength;
        this.repairChunks.set(frameIndex, payloadBytes);
        this.tryFountainRepair();
      }
    }

    // Check if all source frames have been recovered
    if (this.sourceChunks.size === this.sourceFramesCount) {
      return await this.finalizeReconstruction();
    }

    return this.buildProgress(false);
  }

  private tryFountainRepair(): void {
    for (const [groupStart, parityBytes] of this.repairChunks.entries()) {
      let missingCount = 0;
      let missingIndex = -1;

      for (let i = groupStart; i < groupStart + GROUP_SIZE; i++) {
        if (!this.sourceChunks.has(i)) {
          missingCount++;
          missingIndex = i;
        }
      }

      // If exactly 1 frame in this group of 4 was missed by the camera, recover it via XOR!
      if (missingCount === 1 && missingIndex >= 0) {
        const recovered = new Uint8Array(parityBytes.length);
        recovered.set(parityBytes);

        for (let i = groupStart; i < groupStart + GROUP_SIZE; i++) {
          if (i === missingIndex) continue;
          const present = this.sourceChunks.get(i)!;
          for (let b = 0; b < present.length; b++) {
            recovered[b] ^= present[b];
          }
        }

        // Trim last frame if it's the final frame of the wire payload
        let finalRecovered = recovered;
        if (missingIndex === this.sourceFramesCount - 1) {
          const expectedLastLen = this.wireSize - missingIndex * recovered.length;
          if (expectedLastLen > 0 && expectedLastLen < recovered.length) {
            finalRecovered = recovered.subarray(0, expectedLastLen);
          }
        }

        this.sourceChunks.set(missingIndex, finalRecovered);
      }
    }
  }

  private async finalizeReconstruction(): Promise<QRFerryReceiveProgress> {
    const orderedParts: Uint8Array[] = [];
    let totalLen = 0;
    for (let i = 0; i < this.sourceFramesCount; i++) {
      const part = this.sourceChunks.get(i);
      if (!part) {
        return this.buildProgress(false);
      }
      orderedParts.push(part);
      totalLen += part.byteLength;
    }

    const wireBuffer = new Uint8Array(totalLen);
    let offset = 0;
    for (const part of orderedParts) {
      wireBuffer.set(part, offset);
      offset += part.byteLength;
    }

    let finalBlob = new Blob([wireBuffer], {
      type: this.compressed ? 'application/gzip' : this.mimeType
    });

    if (this.compressed) {
      try {
        finalBlob = await decompressBlob(finalBlob);
        finalBlob = new Blob([await finalBlob.arrayBuffer()], { type: this.mimeType });
      } catch (err) {
        return {
          ...this.buildProgress(false),
          error: 'Failed to decompress optical payload'
        };
      }
    }

    const finalBytes = new Uint8Array(await finalBlob.arrayBuffer());
    const actualFileCrc = crc32(finalBytes).toString(16).padStart(8, '0');
    const verified = actualFileCrc === this.expectedFileCrc;

    if (!verified) {
      return {
        ...this.buildProgress(false),
        error: `Checksum mismatch (expected ${this.expectedFileCrc}, got ${actualFileCrc})`
      };
    }

    this.isCompleted = true;
    this.completedBlob = finalBlob;
    return this.buildProgress(true, true);
  }

  private buildProgress(isComplete: boolean, verified?: boolean): QRFerryReceiveProgress {
    const received = this.sourceChunks.size;
    const total = Math.max(1, this.sourceFramesCount);
    const percent = Math.min(100, Math.round((received / total) * 100));
    const fps = Math.round(this.scanTimestamps.length / 2);

    return {
      transferId: this.transferId || '',
      fileName: this.fileName,
      mimeType: this.mimeType,
      originalSize: this.originalSize,
      receivedSourceFrames: received,
      totalSourceFrames: total,
      repairFramesCollected: this.repairChunks.size,
      percent,
      fpsScanned: fps,
      isComplete,
      verified,
      blob: this.completedBlob || undefined
    };
  }
}
