import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';

const UPLOADS_ROOT = process.env.SWIFTDROP_UPLOADS_DIR || path.join(os.tmpdir(), 'swiftdrop-uploads');
const PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export interface CloudPackageRow {
  id: string;
  code: string;
  owner_user_id: string | null;
  sender_device_id: string | null;
  sender_label: string;
  status: 'uploading' | 'ready' | 'expired' | 'deleted';
  total_bytes: number;
  uploaded_bytes: number;
  file_count: number;
  download_count: number;
  created_at: number;
  expires_at: number;
}

export interface CloudPackageFileRow {
  id: string;
  package_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_bytes: number;
  total_chunks: number;
  uploaded_chunks: number;
  storage_path: string;
  sha256_hash: string | null;
  status: 'uploading' | 'ready';
  created_at: number;
}

export class CloudPackageRepository {
  private uploadsDir: string;

  constructor(private db: DatabaseSync, customUploadsDir?: string) {
    this.uploadsDir = customUploadsDir || UPLOADS_ROOT;
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  private generateUniqueAlphaCode(preferredCode?: string): string {
    if (preferredCode) {
      const clean = preferredCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
      if (clean.length === 6) {
        const existing = this.db
          .prepare('SELECT id, status, expires_at FROM cloud_packages WHERE code = ?')
          .get(clean) as { id: string; status: string; expires_at: number } | undefined;
        if (!existing || existing.expires_at <= Date.now() || existing.status === 'deleted') {
          if (existing) {
            this.deletePackage(existing.id);
          }
          return clean;
        }
      }
    }

    for (let attempt = 0; attempt < 50; attempt++) {
      let raw = '';
      for (let i = 0; i < 6; i++) {
        raw += PAIRING_ALPHABET[crypto.randomInt(0, PAIRING_ALPHABET.length)];
      }
      const existing = this.db.prepare('SELECT id FROM cloud_packages WHERE code = ?').get(raw);
      if (!existing) return raw;
    }

    return crypto.randomBytes(4).toString('hex').replace(/[^a-f]/g, 'A').toUpperCase().slice(0, 6).padEnd(6, 'X');
  }

  public formatCodeWithHyphen(code: string): string {
    const clean = code.replace(/[^A-Za-z]/g, '').toUpperCase();
    if (clean.length === 6) {
      return `${clean.slice(0, 3)}-${clean.slice(3)}`;
    }
    return clean;
  }

  public createPackage(params: {
    ownerUserId?: string | null;
    senderDeviceId?: string | null;
    senderLabel: string;
    preferredCode?: string;
    retentionHours?: number;
    chunkSize?: number;
    files: Array<{
      id?: string;
      name: string;
      size: number;
      type?: string;
    }>;
  }): {
    package: CloudPackageRow;
    formattedCode: string;
    files: CloudPackageFileRow[];
    chunkSize: number;
  } {
    const packageId = crypto.randomUUID();
    const code = this.generateUniqueAlphaCode(params.preferredCode);
    const now = Date.now();
    // Default retention: 72 hours (3 days), configurable via FILE_RETENTION_HOURS env var
    const defaultHours = parseInt(process.env.FILE_RETENTION_HOURS || '72', 10);
    const retentionHours = params.retentionHours || defaultHours;
    const expiresAt = now + retentionHours * 60 * 60 * 1000;
    const chunkSize = params.chunkSize || 5 * 1024 * 1024; // 5 MB chunks

    const totalBytes = params.files.reduce((sum, f) => sum + Math.max(0, Number(f.size) || 0), 0);
    const pkgDir = path.join(this.uploadsDir, packageId);
    fs.mkdirSync(pkgDir, { recursive: true });

    this.db
      .prepare(`
        INSERT INTO cloud_packages (
          id, code, owner_user_id, sender_device_id, sender_label,
          status, total_bytes, uploaded_bytes, file_count, download_count, created_at, expires_at
        )
        VALUES (?, ?, ?, ?, ?, 'uploading', ?, 0, ?, 0, ?, ?)
      `)
      .run(
        packageId,
        code,
        params.ownerUserId || null,
        params.senderDeviceId || null,
        params.senderLabel || 'Peer Device',
        totalBytes,
        params.files.length,
        now,
        expiresAt
      );

    const insertFile = this.db.prepare(`
      INSERT INTO cloud_package_files (
        id, package_id, original_name, mime_type, size_bytes,
        uploaded_bytes, total_chunks, uploaded_chunks, storage_path, status, created_at
      )
      VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, 'uploading', ?)
    `);

    const createdFiles: CloudPackageFileRow[] = [];

    for (const f of params.files) {
      const fileId = f.id && /^[a-zA-Z0-9_-]+$/.test(f.id) ? `${packageId}_${f.id}` : crypto.randomUUID();
      const safeName = path.basename(f.name || 'file.bin').replace(/[^\w.\- ()]/g, '_');
      const storagePath = path.join(pkgDir, `${fileId}_${safeName}`);
      const sizeBytes = Math.max(0, Number(f.size) || 0);
      const totalChunks = Math.max(1, Math.ceil(sizeBytes / chunkSize));

      // Create empty file on disk ready for chunk writes
      fs.writeFileSync(storagePath, Buffer.alloc(0));

      insertFile.run(
        fileId,
        packageId,
        f.name || safeName,
        f.type || 'application/octet-stream',
        sizeBytes,
        totalChunks,
        storagePath,
        now
      );

      const row = this.getFileById(fileId)!;
      createdFiles.push(row);
    }

    return {
      package: this.getPackageById(packageId)!,
      formattedCode: this.formatCodeWithHyphen(code),
      files: createdFiles,
      chunkSize
    };
  }

  public writeFileChunk(params: {
    packageId: string;
    fileId: string;
    chunkIndex: number;
    offsetBytes: number;
    chunkBuffer: Buffer;
  }): {
    file: CloudPackageFileRow;
    package: CloudPackageRow;
    packageReady: boolean;
  } {
    const pkg = this.getPackageById(params.packageId);
    if (!pkg || pkg.status === 'deleted' || pkg.expires_at <= Date.now()) {
      throw new Error('Transfer package not found or expired.');
    }

    const file = this.getFileById(params.fileId);
    if (!file || file.package_id !== params.packageId) {
      throw new Error('File not found in transfer package.');
    }

    const safeOffset = Math.max(0, Math.floor(params.offsetBytes));
    if (safeOffset > file.size_bytes || safeOffset + params.chunkBuffer.length > file.size_bytes + 65536) {
      throw new Error('Chunk offset exceeds declared file size.');
    }

    const dir = path.dirname(file.storage_path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write chunk at exact byte offset so resumable & chunked uploads work reliably
    const fd = fs.openSync(file.storage_path, fs.existsSync(file.storage_path) ? 'r+' : 'w');
    try {
      fs.writeSync(fd, params.chunkBuffer, 0, params.chunkBuffer.length, safeOffset);
    } finally {
      fs.closeSync(fd);
    }

    const stat = fs.statSync(file.storage_path);
    const newUploadedBytes = Math.min(
      file.size_bytes,
      Math.max(file.uploaded_bytes, safeOffset + params.chunkBuffer.length, stat.size)
    );
    const newUploadedChunks = Math.min(file.total_chunks, file.uploaded_chunks + 1);
    const isFileComplete = newUploadedBytes >= file.size_bytes;

    let sha256Hash = file.sha256_hash;
    if (isFileComplete && !sha256Hash) {
      if (file.size_bytes <= 32 * 1024 * 1024) {
        const fileBytes = fs.readFileSync(file.storage_path);
        sha256Hash = crypto.createHash('sha256').update(fileBytes).digest('hex');
      } else {
        // For large files (>32 MB), compute a bounded digest without loading gigabytes into RAM synchronously
        sha256Hash = crypto
          .createHash('sha256')
          .update(`${file.size_bytes}:`)
          .update(params.chunkBuffer)
          .digest('hex');
      }
    }

    this.db
      .prepare(`
        UPDATE cloud_package_files
        SET uploaded_bytes = ?,
            uploaded_chunks = ?,
            sha256_hash = ?,
            status = ?
        WHERE id = ?
      `)
      .run(
        newUploadedBytes,
        newUploadedChunks,
        sha256Hash,
        isFileComplete ? 'ready' : 'uploading',
        file.id
      );

    // Recalculate package uploaded_bytes & check if all files in package are ready
    const allFiles = this.getPackageFiles(params.packageId);
    const pkgUploadedBytes = allFiles.reduce((sum, item) => sum + item.uploaded_bytes, 0);
    const allReady = allFiles.length > 0 && allFiles.every((item) => item.status === 'ready');

    this.db
      .prepare(`
        UPDATE cloud_packages
        SET uploaded_bytes = ?,
            status = ?
        WHERE id = ?
      `)
      .run(pkgUploadedBytes, allReady ? 'ready' : 'uploading', params.packageId);

    return {
      file: this.getFileById(file.id)!,
      package: this.getPackageById(params.packageId)!,
      packageReady: allReady
    };
  }

  public getPackageById(packageId: string): CloudPackageRow | null {
    const row = this.db
      .prepare('SELECT * FROM cloud_packages WHERE id = ?')
      .get(packageId) as CloudPackageRow | undefined;
    return row || null;
  }

  public getPackageByCode(code: string): {
    package: CloudPackageRow;
    formattedCode: string;
    files: CloudPackageFileRow[];
  } | null {
    const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!clean) return null;

    const pkg = this.db
      .prepare('SELECT * FROM cloud_packages WHERE code = ? AND status != ?')
      .get(clean, 'deleted') as CloudPackageRow | undefined;

    if (!pkg) return null;

    if (pkg.expires_at <= Date.now()) {
      this.deletePackage(pkg.id);
      return null;
    }

    const files = this.getPackageFiles(pkg.id);
    return {
      package: pkg,
      formattedCode: this.formatCodeWithHyphen(pkg.code),
      files
    };
  }

  public getFileById(fileId: string): CloudPackageFileRow | null {
    const row = this.db
      .prepare('SELECT * FROM cloud_package_files WHERE id = ?')
      .get(fileId) as CloudPackageFileRow | undefined;
    return row || null;
  }

  public getPackageFiles(packageId: string): CloudPackageFileRow[] {
    return this.db
      .prepare('SELECT * FROM cloud_package_files WHERE package_id = ? ORDER BY created_at ASC')
      .all(packageId) as unknown as CloudPackageFileRow[];
  }

  public incrementDownloadCount(packageId: string): void {
    this.db
      .prepare('UPDATE cloud_packages SET download_count = download_count + 1 WHERE id = ?')
      .run(packageId);
  }

  public deletePackage(packageId: string): boolean {
    const pkg = this.getPackageById(packageId);
    if (!pkg) return false;

    const pkgDir = path.join(this.uploadsDir, packageId);
    try {
      if (fs.existsSync(pkgDir)) {
        fs.rmSync(pkgDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore fs cleanup errors
    }

    this.db.prepare('DELETE FROM cloud_packages WHERE id = ?').run(packageId);
    return true;
  }

  public cleanupExpiredPackages(): number {
    const now = Date.now();
    const expired = this.db
      .prepare('SELECT id FROM cloud_packages WHERE expires_at <= ? OR status = ?')
      .all(now, 'deleted') as Array<{ id: string }>;

    let removedCount = 0;
    for (const item of expired) {
      if (this.deletePackage(item.id)) {
        removedCount++;
      }
    }
    return removedCount;
  }
}
