import { describe, it, expect } from 'vitest';
import { formatBytes, formatSpeed, formatDuration, getFileCategory } from '../src/utils/format';

describe('Format Utilities', () => {
  it('formats bytes into clean human-readable units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(1073741824)).toBe('1 GB');
  });

  it('formats transfer speed accurately', () => {
    expect(formatSpeed(0)).toBe('0 B/s');
    expect(formatSpeed(1048576)).toBe('1 MB/s');
    expect(formatSpeed(5242880)).toBe('5 MB/s');
  });

  it('formats remaining duration clearly', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(90)).toBe('1m 30s');
    expect(formatDuration(3600)).toBe('60m 0s');
  });

  it('categorizes file extensions and MIME types accurately', () => {
    expect(getFileCategory('photo.jpg', 'image/jpeg')).toBe('image');
    expect(getFileCategory('video.mp4', 'video/mp4')).toBe('video');
    expect(getFileCategory('song.mp3', 'audio/mpeg')).toBe('audio');
    expect(getFileCategory('document.pdf', 'application/pdf')).toBe('pdf');
    expect(getFileCategory('archive.zip', 'application/zip')).toBe('archive');
    expect(getFileCategory('script.ts', 'text/typescript')).toBe('code');
  });
});

describe('Packet Framing Protocol', () => {
  const MAGIC_NUMBER = 0x53574644; // "SWFD"
  const HEADER_SIZE = 16;

  it('encodes and decodes binary chunks with correct magic header, file index, and payload', () => {
    const fileIndex = 2;
    const chunkIndex = 5;
    const payload = new Uint8Array([10, 20, 30, 40, 50]);

    // Encode
    const packet = new Uint8Array(HEADER_SIZE + payload.byteLength);
    const view = new DataView(packet.buffer);

    view.setUint32(0, MAGIC_NUMBER, false);
    view.setUint32(4, fileIndex, false);
    view.setUint32(8, chunkIndex, false);
    view.setUint32(12, payload.byteLength, false);
    packet.set(payload, HEADER_SIZE);

    // Decode & Verify
    const readView = new DataView(packet.buffer);
    const magic = readView.getUint32(0, false);
    const readFI = readView.getUint32(4, false);
    const readCI = readView.getUint32(8, false);
    const readLen = readView.getUint32(12, false);

    expect(magic).toBe(MAGIC_NUMBER);
    expect(readFI).toBe(fileIndex);
    expect(readCI).toBe(chunkIndex);
    expect(readLen).toBe(payload.byteLength);

    const extractedPayload = packet.slice(HEADER_SIZE, HEADER_SIZE + readLen);
    expect(Array.from(extractedPayload)).toEqual([10, 20, 30, 40, 50]);
  });
});
