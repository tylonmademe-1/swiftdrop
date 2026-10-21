const COMPRESSIBLE_EXTENSIONS = new Set([
  'txt', 'md', 'json', 'csv', 'tsv', 'log', 'xml', 'html', 'htm', 'css',
  'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'rs',
  'go', 'rb', 'php', 'sql', 'sh', 'bat', 'yaml', 'yml', 'toml', 'ini',
  'svg', 'bmp', 'wav', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'rtf', 'pdf', 'tar'
]);

const INCOMPRESSIBLE_EXTENSIONS = new Set([
  'zip', 'gz', 'bz2', 'xz', '7z', 'rar', 'tgz', 'zst',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'avif',
  'mp4', 'mkv', 'webm', 'mov', 'avi', 'wmv',
  'mp3', 'aac', 'flac', 'ogg', 'm4a', 'wma'
]);

export function isCompressibleFile(filename: string, mimeType: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (INCOMPRESSIBLE_EXTENSIONS.has(ext)) {
    return false;
  }

  if (COMPRESSIBLE_EXTENSIONS.has(ext)) {
    return true;
  }

  if (
    mimeType.startsWith('text/') ||
    mimeType.includes('json') ||
    mimeType.includes('xml') ||
    mimeType.includes('javascript') ||
    mimeType.includes('typescript') ||
    mimeType.includes('svg')
  ) {
    return true;
  }

  return false;
}

export async function compressBlob(blob: Blob): Promise<{
  compressedBlob: Blob;
  originalSize: number;
  compressedSize: number;
  ratio: number;
}> {
  if (typeof CompressionStream === 'undefined') {
    return {
      compressedBlob: blob,
      originalSize: blob.size,
      compressedSize: blob.size,
      ratio: 1
    };
  }

  const cs = new CompressionStream('gzip');
  const stream = blob.stream().pipeThrough(cs);
  const response = new Response(stream);
  const compressedBlob = await response.blob();

  // If compression actually inflated the file (can happen with random binary or tiny files), discard
  if (compressedBlob.size >= blob.size) {
    return {
      compressedBlob: blob,
      originalSize: blob.size,
      compressedSize: blob.size,
      ratio: 1
    };
  }

  const ratio = (1 - compressedBlob.size / blob.size);

  return {
    compressedBlob,
    originalSize: blob.size,
    compressedSize: compressedBlob.size,
    ratio
  };
}

export async function decompressBlob(blob: Blob): Promise<Blob> {
  if (typeof DecompressionStream === 'undefined') {
    return blob;
  }

  try {
    const ds = new DecompressionStream('gzip');
    const stream = blob.stream().pipeThrough(ds);
    const response = new Response(stream);
    return await response.blob();
  } catch (err) {
    console.warn('[Compression] Decompression error, falling back to raw blob:', err);
    return blob;
  }
}
