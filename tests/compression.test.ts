import { describe, it, expect } from 'vitest';
import { isCompressibleFile, compressBlob, decompressBlob } from '../src/utils/compression';

describe('On-the-Fly Stream Compression', () => {
  it('correctly categorizes compressible files vs incompressible binary media', () => {
    // Compressible
    expect(isCompressibleFile('code.ts', 'text/typescript')).toBe(true);
    expect(isCompressibleFile('document.txt', 'text/plain')).toBe(true);
    expect(isCompressibleFile('data.json', 'application/json')).toBe(true);
    expect(isCompressibleFile('vector.svg', 'image/svg+xml')).toBe(true);
    expect(isCompressibleFile('log.log', 'text/plain')).toBe(true);
    expect(isCompressibleFile('styles.css', 'text/css')).toBe(true);

    // Incompressible (already compressed images/videos/archives)
    expect(isCompressibleFile('photo.jpg', 'image/jpeg')).toBe(false);
    expect(isCompressibleFile('song.mp3', 'audio/mpeg')).toBe(false);
    expect(isCompressibleFile('video.mp4', 'video/mp4')).toBe(false);
    expect(isCompressibleFile('archive.zip', 'application/zip')).toBe(false);
    expect(isCompressibleFile('backup.gz', 'application/gzip')).toBe(false);
  });

  it('compresses repetitive compressible data and decompresses with 100% fidelity', async () => {
    const originalText = 'SwiftDrop Ultra High Speed File Transfer Acceleration Protocol! '.repeat(500);
    const originalBlob = new Blob([originalText], { type: 'text/plain' });

    // Compress
    const { compressedBlob, ratio } = await compressBlob(originalBlob);
    expect(compressedBlob.size).toBeLessThan(originalBlob.size);
    expect(ratio).toBeGreaterThan(0.5); // At least 50% bandwidth reduction on repetitive text

    // Decompress
    const decompressedBlob = await decompressBlob(compressedBlob);
    const restoredText = await decompressedBlob.text();
    expect(restoredText).toBe(originalText);
  });
});
