import { buildAuthHeaders } from './apiClient';

export interface CloudTransferInitResponse {
  packageId: string;
  code: string;
  formattedCode: string;
  expiresAt: number;
  chunkSize: number;
  files: Array<{
    id: string;
    originalName: string;
    sizeBytes: number;
    mimeType: string;
    totalChunks: number;
  }>;
}

export interface CloudPackageManifest {
  packageId: string;
  code: string;
  formattedCode: string;
  senderLabel: string;
  status: 'uploading' | 'ready' | 'expired' | 'deleted';
  totalBytes: number;
  uploadedBytes: number;
  fileCount: number;
  expiresAt: number;
  files: Array<{
    id: string;
    name: string;
    size: number;
    type: string;
    sha256: string | null;
    status: 'uploading' | 'ready';
    downloadUrl: string;
  }>;
}

export interface ChunkUploadProgress {
  packageId: string;
  code: string;
  formattedCode: string;
  transferredBytes: number;
  totalBytes: number;
  percent: number;
  speedBytesPerSec: number;
  currentFileName: string;
  packageReady: boolean;
}

/**
 * Uploads selected files to the SwiftDrop server using 5MB resumable chunks
 * (WeTransfer / SwissTransfer Store-and-Forward architecture).
 */
export async function uploadFilesInChunks(params: {
  files: File[];
  senderLabel: string;
  senderDeviceId: string;
  preferredCode?: string;
  retentionHours?: number;
  signal?: AbortSignal;
  onInit?: (initData: CloudTransferInitResponse) => void;
  onProgress?: (progress: ChunkUploadProgress) => void;
}): Promise<CloudTransferInitResponse> {
  const { files, senderLabel, senderDeviceId, preferredCode, retentionHours, signal, onInit, onProgress } = params;

  const initRes = await fetch('/api/cloud-transfer/init', {
    method: 'POST',
    headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'same-origin',
    signal,
    body: JSON.stringify({
      senderLabel,
      senderDeviceId,
      preferredCode,
      retentionHours: retentionHours || 72, // Default 3 days auto-expiration
      files: files.map((f, idx) => ({
        id: `f${idx}`,
        name: f.name,
        size: f.size,
        type: f.type || 'application/octet-stream'
      }))
    })
  });

  const initData = await initRes.json();
  if (!initRes.ok) {
    throw new Error(initData.error || 'Failed to initialize chunked upload');
  }

  onInit?.(initData);

  const chunkSize = initData.chunkSize || 5 * 1024 * 1024; // 5 MB chunks
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  let totalUploadedSoFar = 0;
  const startTime = performance.now();

  for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
    const file = files[fileIdx];
    const serverFileMeta = initData.files[fileIdx];
    if (!serverFileMeta) continue;

    const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      if (signal?.aborted) {
        throw new Error('Upload cancelled');
      }

      const offset = chunkIndex * chunkSize;
      const end = Math.min(file.size, offset + chunkSize);
      const chunkBlob = file.slice(offset, end);

      let attempt = 0;
      let chunkResult: any = null;

      while (attempt < 3) {
        try {
          const chunkRes = await fetch(
            `/api/cloud-transfer/${initData.packageId}/files/${serverFileMeta.id}/chunk?chunkIndex=${chunkIndex}&offset=${offset}`,
            {
              method: 'PUT',
              headers: buildAuthHeaders({ 'Content-Type': 'application/octet-stream' }),
              credentials: 'same-origin',
              signal,
              body: chunkBlob
            }
          );

          chunkResult = await chunkRes.json();
          if (!chunkRes.ok) {
            throw new Error(chunkResult.error || `Chunk ${chunkIndex} upload failed`);
          }
          break;
        } catch (err) {
          attempt++;
          if (signal?.aborted || attempt >= 3) throw err;
          await new Promise((r) => setTimeout(r, 400 * attempt));
        }
      }

      totalUploadedSoFar += end - offset;
      const elapsedSec = Math.max(0.05, (performance.now() - startTime) / 1000);
      const speedBytesPerSec = totalUploadedSoFar / elapsedSec;
      const percent = totalBytes > 0 ? Math.min(100, Math.round((totalUploadedSoFar / totalBytes) * 100)) : 100;

      onProgress?.({
        packageId: initData.packageId,
        code: initData.code,
        formattedCode: initData.formattedCode,
        transferredBytes: totalUploadedSoFar,
        totalBytes,
        percent,
        speedBytesPerSec,
        currentFileName: file.name,
        packageReady: Boolean(chunkResult?.packageReady)
      });
    }
  }

  return initData;
}

/**
 * Fetches a stored package manifest by its 6-letter Session Code.
 */
export async function fetchCloudPackageByCode(
  code: string,
  receiverDeviceId: string
): Promise<{ found: boolean; manifest?: CloudPackageManifest; selfReceiveBlocked?: boolean; error?: string }> {
  const cleanCode = code.replace(/[^A-Za-z]/g, '').toUpperCase();
  const res = await fetch(
    `/api/cloud-transfer/code/${encodeURIComponent(cleanCode)}?deviceId=${encodeURIComponent(receiverDeviceId)}`,
    {
      headers: buildAuthHeaders(),
      credentials: 'same-origin'
    }
  );

  if (res.status === 404) {
    return { found: false };
  }

  const data = await res.json();
  if (res.status === 403) {
    return { found: false, selfReceiveBlocked: true, error: data.error };
  }

  if (!res.ok) {
    return { found: false, error: data.error || 'Could not load transfer package' };
  }

  return { found: true, manifest: data as CloudPackageManifest };
}

/**
 * Streams a stored file from the server to the Receiver browser with real-time speed & progress telemetry.
 */
export async function downloadCloudPackageFile(params: {
  downloadUrl: string;
  expectedSize: number;
  signal?: AbortSignal;
  onProgress?: (receivedBytes: number, speedBytesPerSec: number) => void;
}): Promise<Blob> {
  const { downloadUrl, expectedSize, signal, onProgress } = params;
  const startTime = performance.now();

  const res = await fetch(downloadUrl, {
    headers: buildAuthHeaders(),
    credentials: 'same-origin',
    signal
  });

  if (!res.ok) {
    throw new Error('Failed to download file from server');
  }

  if (!res.body) {
    const blob = await res.blob();
    const elapsedSec = Math.max(0.05, (performance.now() - startTime) / 1000);
    onProgress?.(blob.size, blob.size / elapsedSec);
    return blob;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      receivedBytes += value.byteLength;
      const elapsedSec = Math.max(0.05, (performance.now() - startTime) / 1000);
      const speedBytesPerSec = receivedBytes / elapsedSec;
      onProgress?.(Math.min(expectedSize || receivedBytes, receivedBytes), speedBytesPerSec);
    }
  }

  const contentType = res.headers.get('Content-Type') || 'application/octet-stream';
  return new Blob(chunks as BlobPart[], { type: contentType });
}
