import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import { generateSessionToken, hashToken } from '../security/auth';

export interface UserRow {
  id: string;
  display_name: string;
  normalized_email: string;
  password_hash: string;
  email_verified_at: number | null;
  account_status: string;
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
}

export interface SessionRow {
  id: string;
  user_id: string;
  session_token_hash: string;
  created_at: number;
  expires_at: number;
  last_seen_at: number;
  revoked_at: number | null;
  device_label: string | null;
}

export interface UserPreferencesRow {
  user_id: string;
  theme: 'light' | 'dark' | 'system';
  save_transfer_history: number;
  default_device_label: string | null;
  created_at: number;
  updated_at: number;
}

export class UserRepository {
  constructor(private db: DatabaseSync) {}

  public createUser(displayName: string, email: string, passwordHash: string): UserRow {
    const id = crypto.randomUUID();
    const normalizedEmail = email.trim().toLowerCase();
    const now = Date.now();

    const insertUser = this.db.prepare(`
      INSERT INTO users (id, display_name, normalized_email, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertUser.run(id, displayName.trim(), normalizedEmail, passwordHash, now, now);

    // Create default preferences
    this.db.prepare(`
      INSERT INTO user_preferences (user_id, theme, save_transfer_history, default_device_label, created_at, updated_at)
      VALUES (?, 'system', 1, NULL, ?, ?)
    `).run(id, now, now);

    return this.findUserById(id)!;
  }

  public findUserByEmail(email: string): UserRow | null {
    const normalized = email.trim().toLowerCase();
    const row = this.db.prepare('SELECT * FROM users WHERE normalized_email = ?').get(normalized) as UserRow | undefined;
    return row || null;
  }

  public findUserById(id: string): UserRow | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row || null;
  }

  public updateLastLogin(id: string): void {
    this.db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(Date.now(), Date.now(), id);
  }

  public createSession(userId: string, deviceLabel?: string, expiryDays = 30): { rawToken: string; sessionId: string; expiresAt: number } {
    const { rawToken, tokenHash } = generateSessionToken();
    const sessionId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + expiryDays * 24 * 60 * 60 * 1000;

    this.db.prepare(`
      INSERT INTO auth_sessions (id, user_id, session_token_hash, created_at, expires_at, last_seen_at, revoked_at, device_label)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
    `).run(sessionId, userId, tokenHash, now, expiresAt, now, deviceLabel || null);

    return { rawToken, sessionId, expiresAt };
  }

  public validateSession(rawToken: string): { user: UserRow; session: SessionRow } | null {
    if (!rawToken) return null;
    const tokenHash = hashToken(rawToken);
    const now = Date.now();

    const session = this.db.prepare(`
      SELECT * FROM auth_sessions
      WHERE session_token_hash = ? AND revoked_at IS NULL AND expires_at > ?
    `).get(tokenHash, now) as SessionRow | undefined;

    if (!session) return null;

    // Refresh last_seen_at
    this.db.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?').run(now, session.id);

    const user = this.findUserById(session.user_id);
    if (!user || user.account_status !== 'active') return null;

    return { user, session };
  }

  public revokeSession(sessionId: string, userId: string): boolean {
    const result = this.db.prepare(`
      UPDATE auth_sessions SET revoked_at = ?
      WHERE id = ? AND user_id = ? AND revoked_at IS NULL
    `).run(Date.now(), sessionId, userId);
    return Number(result.changes) > 0;
  }

  public revokeOtherSessions(userId: string, currentSessionId: string): void {
    this.db.prepare(`
      UPDATE auth_sessions SET revoked_at = ?
      WHERE user_id = ? AND id != ? AND revoked_at IS NULL
    `).run(Date.now(), userId, currentSessionId);
  }

  public revokeAllUserSessions(userId: string): void {
    this.db.prepare(`
      UPDATE auth_sessions SET revoked_at = ?
      WHERE user_id = ? AND revoked_at IS NULL
    `).run(Date.now(), userId);
  }

  public savePasskeyCredential(userId: string, credentialId: string, publicKey: string, deviceLabel?: string): void {
    const now = Date.now();
    this.db.prepare(`
      INSERT OR REPLACE INTO passkey_credentials (credential_id, user_id, public_key, device_label, created_at, last_used_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(credentialId, userId, publicKey, deviceLabel || null, now, now);
  }

  public findUserByPasskeyCredential(credentialId: string): UserRow | null {
    const row = this.db.prepare(`
      SELECT user_id FROM passkey_credentials WHERE credential_id = ?
    `).get(credentialId) as { user_id: string } | undefined;

    if (!row) return null;
    this.db.prepare('UPDATE passkey_credentials SET last_used_at = ? WHERE credential_id = ?').run(Date.now(), credentialId);
    return this.findUserById(row.user_id);
  }

  public listUserSessions(userId: string): SessionRow[] {
    return this.db.prepare(`
      SELECT id, user_id, created_at, expires_at, last_seen_at, revoked_at, device_label
      FROM auth_sessions
      WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
      ORDER BY last_seen_at DESC
    `).all(userId, Date.now()) as unknown as SessionRow[];
  }

  public getPreferences(userId: string): UserPreferencesRow {
    const row = this.db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId) as UserPreferencesRow | undefined;
    if (row) return row;

    const now = Date.now();
    this.db.prepare(`
      INSERT OR IGNORE INTO user_preferences (user_id, theme, save_transfer_history, default_device_label, created_at, updated_at)
      VALUES (?, 'system', 1, NULL, ?, ?)
    `).run(userId, now, now);

    return {
      user_id: userId,
      theme: 'system',
      save_transfer_history: 1,
      default_device_label: null,
      created_at: now,
      updated_at: now
    };
  }

  public updatePreferences(userId: string, updates: Partial<{ theme: 'light' | 'dark' | 'system'; save_transfer_history: boolean; default_device_label: string }>): void {
    const current = this.getPreferences(userId);
    const theme = updates.theme !== undefined ? updates.theme : current.theme;
    const saveHistory = updates.save_transfer_history !== undefined ? (updates.save_transfer_history ? 1 : 0) : current.save_transfer_history;
    const deviceLabel = updates.default_device_label !== undefined ? updates.default_device_label : current.default_device_label;

    this.db.prepare(`
      UPDATE user_preferences
      SET theme = ?, save_transfer_history = ?, default_device_label = ?, updated_at = ?
      WHERE user_id = ?
    `).run(theme, saveHistory, deviceLabel, Date.now(), userId);
  }

  public updateProfile(userId: string, displayName: string): void {
    this.db.prepare(`
      UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?
    `).run(displayName.trim(), Date.now(), userId);
  }

  public changePassword(userId: string, newPasswordHash: string): void {
    this.db.prepare(`
      UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?
    `).run(newPasswordHash, Date.now(), userId);
  }

  public createPasswordResetToken(userId: string): string {
    // Invalidate any previous unused reset tokens for this user first
    const now = Date.now();
    this.db.prepare(`
      UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL
    `).run(now, userId);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const id = crypto.randomUUID();
    const expiresAt = now + 60 * 60 * 1000; // 1 hour

    this.db.prepare(`
      INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, tokenHash, expiresAt, now);

    return rawToken;
  }

  public resetPasswordWithToken(rawToken: string, newPasswordHash: string): boolean {
    if (!rawToken || typeof rawToken !== 'string') return false;
    const tokenHash = hashToken(rawToken.trim());
    const now = Date.now();

    const record = this.db.prepare(`
      SELECT * FROM password_reset_tokens
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
    `).get(tokenHash, now) as { id: string; user_id: string } | undefined;

    if (!record) return false;

    this.db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(now, record.id);
    this.changePassword(record.user_id, newPasswordHash);
    // Revoke all existing sessions for security when password is reset
    this.revokeAllUserSessions(record.user_id);
    return true;
  }

  public logAuditEvent(userId: string | null, eventType: string, metadata?: any): void {
    this.db.prepare(`
      INSERT INTO audit_events (id, user_id, event_type, created_at, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), userId, eventType, Date.now(), metadata ? JSON.stringify(metadata) : null);
  }

  public exportUserData(userId: string): any {
    const user = this.findUserById(userId);
    if (!user) return null;

    const prefs = this.getPreferences(userId);
    const devices = this.db.prepare('SELECT id, user_defined_label, metadata, created_at, last_seen_at FROM devices WHERE user_id = ?').all(userId);
    const transfers = this.db.prepare(`
      SELECT id, direction, status, started_at, completed_at, total_bytes, file_count, sender_device_label, receiver_device_label
      FROM transfers WHERE owner_user_id = ?
    `).all(userId);

    return {
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        displayName: user.display_name,
        email: user.normalized_email,
        createdAt: new Date(user.created_at).toISOString(),
        lastLoginAt: user.last_login_at ? new Date(user.last_login_at).toISOString() : null
      },
      preferences: {
        theme: prefs.theme,
        saveTransferHistory: Boolean(prefs.save_transfer_history),
        defaultDeviceLabel: prefs.default_device_label
      },
      devices,
      transfers
    };
  }

  public deleteAccount(userId: string): void {
    // Delete all user data via cascade
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }
}
