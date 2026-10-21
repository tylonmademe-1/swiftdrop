import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.resolve(DB_DIR, 'swiftdrop.db');

export function initDatabase(customPath?: string): DatabaseSync {
  const targetPath = customPath || DB_PATH;

  if (targetPath !== ':memory:') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(targetPath);

  // Enable foreign keys and Write-Ahead Logging (WAL) for concurrency & durability
  db.exec('PRAGMA foreign_keys = ON;');
  if (targetPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
  }

  runMigrations(db);

  return db;
}

function runMigrations(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT version FROM schema_migrations ORDER BY version ASC').all() as Array<{ version: number }>;
  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  // Migration 1: Base tables
  if (!appliedVersions.has(1)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        normalized_email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        email_verified_at INTEGER,
        account_status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_login_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_token_hash TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        revoked_at INTEGER,
        device_label TEXT
      );

      CREATE TABLE IF NOT EXISTS transfers (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        session_id TEXT,
        direction TEXT NOT NULL, -- 'sent' | 'received'
        status TEXT NOT NULL,    -- 'completed' | 'failed' | 'cancelled' | 'in_progress'
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        failed_at INTEGER,
        total_bytes INTEGER NOT NULL DEFAULT 0,
        file_count INTEGER NOT NULL DEFAULT 0,
        sender_device_label TEXT,
        receiver_device_label TEXT,
        failure_code TEXT
      );

      CREATE TABLE IF NOT EXISTS transfer_files (
        id TEXT PRIMARY KEY,
        transfer_id TEXT NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
        original_filename TEXT NOT NULL,
        declared_size INTEGER NOT NULL DEFAULT 0,
        mime_type TEXT,
        verification_status TEXT DEFAULT 'pending', -- 'verified' | 'failed' | 'skipped' | 'pending'
        transfer_status TEXT DEFAULT 'pending',     -- 'completed' | 'failed' | 'cancelled' | 'pending'
        saved_status TEXT DEFAULT 'unknown',        -- 'saved' | 'download_initiated' | 'unknown'
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        theme TEXT NOT NULL DEFAULT 'system',
        save_transfer_history INTEGER NOT NULL DEFAULT 1,
        default_device_label TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_defined_label TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        revoked_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        used_at INTEGER,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        event_type TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        metadata TEXT
      );

      -- Performance Indexes
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(normalized_email);
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON auth_sessions(session_token_hash);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_transfers_user ON transfers(owner_user_id);
      CREATE INDEX IF NOT EXISTS idx_transfers_started ON transfers(started_at);
      CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status);
      CREATE INDEX IF NOT EXISTS idx_files_transfer ON transfer_files(transfer_id);
      CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
      CREATE INDEX IF NOT EXISTS idx_reset_token ON password_reset_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_events(user_id);

      INSERT INTO schema_migrations (version, applied_at) VALUES (1, ${Date.now()});
    `);
  }

  // Migration 2: Transfer sessions persistence
  if (!appliedVersions.has(2)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS transfer_sessions (
        id TEXT PRIMARY KEY,
        code_hash TEXT NOT NULL,
        sender_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        receiver_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        connected_at INTEGER,
        completed_at INTEGER,
        total_bytes INTEGER DEFAULT 0,
        file_count INTEGER DEFAULT 0,
        sender_device_label TEXT,
        receiver_device_label TEXT,
        failure_reason TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_ts_code ON transfer_sessions(code_hash);
      CREATE INDEX IF NOT EXISTS idx_ts_status ON transfer_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_ts_created ON transfer_sessions(created_at);

      INSERT INTO schema_migrations (version, applied_at) VALUES (2, ${Date.now()});
    `);
  }

  // Migration 3: Passkey / WebAuthn credentials persistence
  if (!appliedVersions.has(3)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS passkey_credentials (
        credential_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        public_key TEXT NOT NULL,
        device_label TEXT,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_passkey_user ON passkey_credentials(user_id);

      INSERT INTO schema_migrations (version, applied_at) VALUES (3, ${Date.now()});
    `);
  }

  // Migration 4: Store-and-Forward Chunked Upload Packages (WeTransfer / SwissTransfer model)
  if (!appliedVersions.has(4)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cloud_packages (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        sender_device_id TEXT,
        sender_label TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'uploading', -- 'uploading' | 'ready' | 'expired' | 'deleted'
        total_bytes INTEGER NOT NULL DEFAULT 0,
        uploaded_bytes INTEGER NOT NULL DEFAULT 0,
        file_count INTEGER NOT NULL DEFAULT 0,
        download_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cloud_package_files (
        id TEXT PRIMARY KEY,
        package_id TEXT NOT NULL REFERENCES cloud_packages(id) ON DELETE CASCADE,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        uploaded_bytes INTEGER NOT NULL DEFAULT 0,
        total_chunks INTEGER NOT NULL DEFAULT 1,
        uploaded_chunks INTEGER NOT NULL DEFAULT 0,
        storage_path TEXT NOT NULL,
        sha256_hash TEXT,
        status TEXT NOT NULL DEFAULT 'uploading', -- 'uploading' | 'ready'
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cp_code ON cloud_packages(code);
      CREATE INDEX IF NOT EXISTS idx_cp_expires ON cloud_packages(expires_at);
      CREATE INDEX IF NOT EXISTS idx_cpf_pkg ON cloud_package_files(package_id);

      INSERT INTO schema_migrations (version, applied_at) VALUES (4, ${Date.now()});
    `);
  }
}
