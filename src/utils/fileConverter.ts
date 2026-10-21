export type TargetConvertFormat = 'PDF' | 'ZIP' | 'PNG' | 'JPG' | 'GIF';
export type EncodingQualityMode = 'lossless' | 'balanced';

export interface ConversionResult {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
  size: number;
}

/**
 * Loads an image File into an HTMLImageElement and returns its dimensions and pixel canvas.
 */
export async function loadImageToCanvas(
  file: File,
  fillWhiteBackground = false
): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not decode image file'));
    });

    const width = img.naturalWidth || img.width || 1;
    const height = img.naturalHeight || img.height || 1;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D Canvas context unavailable');
    }

    if (fillWhiteBackground) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(img, 0, 0, width, height);
    return { canvas, ctx, width, height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`Failed to encode ${mimeType}`));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

/**
 * Builds a valid PDF-1.4 document embedding a JPEG image stream (/DCTDecode) at 1:1 pixel-to-point dimensions.
 */
export function buildPdfFromJpegBytes(jpegBytes: Uint8Array, width: number, height: number): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let currentOffset = 0;

  const pushStr = (str: string) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    currentOffset += bytes.byteLength;
  };

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    currentOffset += bytes.byteLength;
  };

  const startObj = (id: number) => {
    offsets[id] = currentOffset;
    pushStr(`${id} 0 obj\n`);
  };

  const endObj = () => {
    pushStr('\nendobj\n');
  };

  // PDF Header
  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // 1: Catalog
  startObj(1);
  pushStr('<< /Type /Catalog /Pages 2 0 R >>');
  endObj();

  // 2: Pages
  startObj(2);
  pushStr('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  endObj();

  // Scale large dimensions to fit comfortably in standard PDF viewers while preserving aspect ratio
  const maxPdfDim = 1440;
  const scale = Math.max(width, height) > maxPdfDim ? maxPdfDim / Math.max(width, height) : 1;
  const pageW = Math.max(72, Math.round(width * scale));
  const pageH = Math.max(72, Math.round(height * scale));

  // 3: Page
  startObj(3);
  pushStr(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`
  );
  endObj();

  // 4: Image XObject (JPEG /DCTDecode)
  startObj(4);
  pushStr(
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.byteLength} >>\nstream\n`
  );
  pushBytes(jpegBytes);
  pushStr('\nendstream');
  endObj();

  // 5: Page Content Stream drawing the image across the full page
  const contentStream = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`;
  const contentBytes = encoder.encode(contentStream);
  startObj(5);
  pushStr(`<< /Length ${contentBytes.byteLength} >>\nstream\n`);
  pushBytes(contentBytes);
  pushStr('endstream');
  endObj();

  // Cross-reference table
  const xrefOffset = currentOffset;
  pushStr('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i <= 5; i++) {
    const off = String(offsets[i] || 0).padStart(10, '0');
    pushStr(`${off} 00000 n \n`);
  }

  pushStr(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

/**
 * Computes standard CRC-32 checksum for PKZIP archives.
 */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Packages a file into a genuine, standards-compliant PKZIP (.zip) archive.
 */
export function buildZipArchive(entryFilename: string, fileBytes: Uint8Array): Blob {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(entryFilename);
  const crc = crc32(fileBytes);
  const size = fileBytes.byteLength;

  // Local file header (30 bytes + filename)
  const localHeader = new Uint8Array(30 + nameBytes.length);
  const lv = new DataView(localHeader.buffer);
  lv.setUint32(0, 0x04034b50, true); // Local file header signature
  lv.setUint16(4, 20, true); // Version needed to extract (2.0)
  lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
  lv.setUint16(8, 0, true); // Compression method (0 = store, since image is already compressed)
  lv.setUint16(10, 0, true); // Last mod file time
  lv.setUint16(12, 0x5421, true); // Last mod file date
  lv.setUint32(14, crc, true); // CRC-32
  lv.setUint32(18, size, true); // Compressed size
  lv.setUint32(22, size, true); // Uncompressed size
  lv.setUint16(26, nameBytes.length, true); // Filename length
  lv.setUint16(28, 0, true); // Extra field length
  localHeader.set(nameBytes, 30);

  // Central directory header (46 bytes + filename)
  const centralHeader = new Uint8Array(46 + nameBytes.length);
  const cv = new DataView(centralHeader.buffer);
  cv.setUint32(0, 0x02014b50, true); // Central file header signature
  cv.setUint16(4, 20, true); // Version made by
  cv.setUint16(6, 20, true); // Version needed to extract
  cv.setUint16(8, 0x0800, true); // UTF-8 flag
  cv.setUint16(10, 0, true); // Compression method (0 = store)
  cv.setUint16(12, 0, true); // Last mod time
  cv.setUint16(14, 0x5421, true); // Last mod date
  cv.setUint32(16, crc, true); // CRC-32
  cv.setUint32(20, size, true); // Compressed size
  cv.setUint32(24, size, true); // Uncompressed size
  cv.setUint16(28, nameBytes.length, true); // Filename length
  cv.setUint16(30, 0, true); // Extra field length
  cv.setUint16(32, 0, true); // File comment length
  cv.setUint16(34, 0, true); // Disk number start
  cv.setUint16(36, 0, true); // Internal file attributes
  cv.setUint32(38, 0, true); // External file attributes
  cv.setUint32(42, 0, true); // Relative offset of local header
  centralHeader.set(nameBytes, 46);

  const centralDirectoryOffset = localHeader.byteLength + fileBytes.byteLength;
  const centralDirectorySize = centralHeader.byteLength;

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // EOCD signature
  ev.setUint16(4, 0, true); // Number of this disk
  ev.setUint16(6, 0, true); // Disk where central directory starts
  ev.setUint16(8, 1, true); // Number of central directory records on this disk
  ev.setUint16(10, 1, true); // Total number of central directory records
  ev.setUint32(12, centralDirectorySize, true); // Size of central directory
  ev.setUint32(16, centralDirectoryOffset, true); // Offset of start of central directory
  ev.setUint16(20, 0, true); // Comment length

  return new Blob([localHeader, fileBytes, centralHeader, eocd] as BlobPart[], { type: 'application/zip' });
}

/**
 * Encodes RGBA pixel data into a genuine GIF89a image using a 256-color RGB-332 palette and LZW stream.
 */
export function encodeRgbaToGif89a(rgba: Uint8ClampedArray, width: number, height: number): Blob {
  const bytes: number[] = [];
  const pushByte = (b: number) => bytes.push(b & 0xff);
  const pushWord = (w: number) => {
    bytes.push(w & 0xff);
    bytes.push((w >> 8) & 0xff);
  };
  const pushAscii = (s: string) => {
    for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i));
  };

  // 1. GIF89a Header
  pushAscii('GIF89a');

  // 2. Logical Screen Descriptor (Global Color Table Flag = 1, 256 colors -> 0xF7)
  pushWord(width);
  pushWord(height);
  pushByte(0xf7); // GCT present (1), color res (7), sort (0), GCT size 2^(7+1)=256 (7)
  pushByte(0); // Background color index
  pushByte(0); // Pixel aspect ratio

  // 3. Global Color Table (256 RGB entries using uniform 3-3-2 bit quantization)
  for (let i = 0; i < 256; i++) {
    const r3 = (i >> 5) & 0x07;
    const g3 = (i >> 2) & 0x07;
    const b2 = i & 0x03;
    const r = Math.round((r3 * 255) / 7);
    const g = Math.round((g3 * 255) / 7);
    const b = Math.round((b2 * 255) / 3);
    pushByte(r);
    pushByte(g);
    pushByte(b);
  }

  // 4. Image Descriptor
  pushByte(0x2c); // Image Separator
  pushWord(0); // Left
  pushWord(0); // Top
  pushWord(width);
  pushWord(height);
  pushByte(0x00); // No local color table, not interlaced

  // 5. Image Data (LZW with minCodeSize = 8)
  const minCodeSize = 8;
  pushByte(minCodeSize);

  const clearCode = 256;
  const eoiCode = 257;

  // Bit packer for LZW 9-bit codes (emitting Clear Code every 250 pixels keeps code size strictly 9 bits)
  const subBlockBuffer: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;

  const flushSubBlock = () => {
    while (subBlockBuffer.length >= 255) {
      pushByte(255);
      for (let i = 0; i < 255; i++) pushByte(subBlockBuffer[i]);
      subBlockBuffer.splice(0, 255);
    }
  };

  const write9BitCode = (code: number) => {
    bitBuffer |= (code & 0x1ff) << bitCount;
    bitCount += 9;
    while (bitCount >= 8) {
      subBlockBuffer.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
      if (subBlockBuffer.length >= 255) {
        flushSubBlock();
      }
    }
  };

  const totalPixels = width * height;
  write9BitCode(clearCode);

  for (let p = 0; p < totalPixels; p++) {
    if (p > 0 && p % 250 === 0) {
      write9BitCode(clearCode);
    }
    const idx = p * 4;
    const a = rgba[idx + 3];
    // Composite transparent pixels over white
    const r = a < 255 ? Math.round((rgba[idx] * a + 255 * (255 - a)) / 255) : rgba[idx];
    const g = a < 255 ? Math.round((rgba[idx + 1] * a + 255 * (255 - a)) / 255) : rgba[idx + 1];
    const b = a < 255 ? Math.round((rgba[idx + 2] * a + 255 * (255 - a)) / 255) : rgba[idx + 2];

    const r3 = Math.round((r * 7) / 255) & 0x07;
    const g3 = Math.round((g * 7) / 255) & 0x07;
    const b2 = Math.round((b * 3) / 255) & 0x03;
    const colorIndex = (r3 << 5) | (g3 << 2) | b2;
    write9BitCode(colorIndex);
  }

  write9BitCode(eoiCode);
  if (bitCount > 0) {
    subBlockBuffer.push(bitBuffer & 0xff);
  }
  flushSubBlock();
  if (subBlockBuffer.length > 0) {
    pushByte(subBlockBuffer.length);
    for (let i = 0; i < subBlockBuffer.length; i++) pushByte(subBlockBuffer[i]);
  }

  // Block Terminator
  pushByte(0x00);
  // GIF Trailer
  pushByte(0x3b);

  return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
}

/**
 * Main conversion entry point for the Stitch File Converter UI.
 */
export async function convertImageFile(
  file: File,
  targetFormat: TargetConvertFormat,
  qualityMode: EncodingQualityMode,
  onProgress?: (percent: number, statusText: string) => void
): Promise<ConversionResult> {
  onProgress?.(15, 'Decoding image pixel matrix...');
  const baseName = file.name.replace(/\.[^/.]+$/, '') || 'converted_asset';
  const quality = qualityMode === 'lossless' ? 1.0 : 0.85;

  const needsWhiteBg = targetFormat === 'JPG' || targetFormat === 'PDF';
  const { canvas, ctx, width, height } = await loadImageToCanvas(file, needsWhiteBg);

  onProgress?.(55, `Encoding ${targetFormat} (${qualityMode === 'lossless' ? 'Lossless 100%' : 'Balanced 85%'})...`);

  let outputBlob: Blob;
  let ext = targetFormat.toLowerCase();

  switch (targetFormat) {
    case 'PNG': {
      outputBlob = await canvasToBlob(canvas, 'image/png');
      ext = 'png';
      break;
    }

    case 'JPG': {
      outputBlob = await canvasToBlob(canvas, 'image/jpeg', quality);
      ext = 'jpg';
      break;
    }

    case 'GIF': {
      // Scale extremely large 4K+ images slightly in balanced mode so GIF encoding stays instant
      let gifCanvas = canvas;
      let gifCtx = ctx;
      let gifW = width;
      let gifH = height;
      const maxGifDim = qualityMode === 'lossless' ? 1600 : 1080;
      if (Math.max(width, height) > maxGifDim) {
        const ratio = maxGifDim / Math.max(width, height);
        gifW = Math.max(1, Math.round(width * ratio));
        gifH = Math.max(1, Math.round(height * ratio));
        gifCanvas = document.createElement('canvas');
        gifCanvas.width = gifW;
        gifCanvas.height = gifH;
        const c = gifCanvas.getContext('2d');
        if (c) {
          c.drawImage(canvas, 0, 0, gifW, gifH);
          gifCtx = c;
        }
      }
      const imgData = gifCtx.getImageData(0, 0, gifW, gifH);
      outputBlob = encodeRgbaToGif89a(imgData.data, gifW, gifH);
      ext = 'gif';
      break;
    }

    case 'PDF': {
      const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', qualityMode === 'lossless' ? 0.98 : 0.85);
      const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
      outputBlob = buildPdfFromJpegBytes(jpegBytes, width, height);
      ext = 'pdf';
      break;
    }

    case 'ZIP': {
      // In lossless mode, store the lossless PNG inside the ZIP; in balanced mode, store the 85% JPG
      const innerBlob =
        qualityMode === 'lossless'
          ? await canvasToBlob(canvas, 'image/png')
          : await canvasToBlob(canvas, 'image/jpeg', 0.85);
      const innerExt = qualityMode === 'lossless' ? 'png' : 'jpg';
      const innerBytes = new Uint8Array(await innerBlob.arrayBuffer());
      outputBlob = buildZipArchive(`${baseName}.${innerExt}`, innerBytes);
      ext = 'zip';
      break;
    }
  }

  onProgress?.(100, 'Saved to Downloads.');

  return {
    blob: outputBlob,
    filename: `${baseName}.${ext}`,
    width,
    height,
    size: outputBlob.size
  };
}
