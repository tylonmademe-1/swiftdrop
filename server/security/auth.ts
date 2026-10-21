import crypto from 'crypto';

const DUMMY_PASSWORD_HASH = (() => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync('dummy_timing_defense_password', salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
})();

export function hashPassword(password: string): string {
  const normalized = password.slice(0, 128);
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(normalized, salt, 64, { N: 16384, r: 8, p: 1 });
  return `${salt}:${derivedKey.toString('hex')}`;
}

export function verifyPassword(password: string, combinedHash: string): boolean {
  try {
    if (!password || !combinedHash || password.length > 128) return false;
    const parts = combinedHash.split(':');
    if (parts.length !== 2) return false;
    const [salt, key] = parts;
    const derivedKey = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
    const keyBuffer = Buffer.from(key, 'hex');
    if (keyBuffer.length !== derivedKey.length) return false;
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

/**
 * Constant-time password verification that runs a dummy scrypt computation
 * even when the user record does not exist, preventing user enumeration via timing side-channels.
 */
export function verifyPasswordTimingSafe(password: string, combinedHash?: string | null): boolean {
  if (!combinedHash) {
    verifyPassword(password || 'invalid', DUMMY_PASSWORD_HASH);
    return false;
  }
  return verifyPassword(password, combinedHash);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateSessionToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  return { rawToken, tokenHash };
}

export function validateEmailFormat(email: unknown): email is string {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

export function validatePasswordStrength(password: unknown): { valid: boolean; error?: string } {
  if (typeof password !== 'string') {
    return { valid: false, error: 'Password is required.' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long.' };
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password must not exceed 128 characters.' };
  }
  return { valid: true };
}

export function sanitizeDisplayName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, 64);
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
  lockedUntil?: number;
}

export class AuthRateLimiter {
  private attempts = new Map<string, RateLimitEntry>();

  constructor(
    private maxAttempts = 8,
    private windowMs = 15 * 60 * 1000, // 15 minutes
    private lockoutMs = 15 * 60 * 1000 // 15 minutes
  ) {}

  public check(key: string): { allowed: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    const entry = this.attempts.get(key);

    if (!entry) {
      return { allowed: true };
    }

    if (entry.lockedUntil && entry.lockedUntil > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000)
      };
    }

    if (now > entry.resetAt) {
      this.attempts.delete(key);
      return { allowed: true };
    }

    if (entry.count >= this.maxAttempts) {
      entry.lockedUntil = now + this.lockoutMs;
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(this.lockoutMs / 1000)
      };
    }

    return { allowed: true };
  }

  public recordFailure(key: string): void {
    const now = Date.now();
    const existing = this.attempts.get(key);
    if (!existing || now > existing.resetAt) {
      this.attempts.set(key, {
        count: 1,
        resetAt: now + this.windowMs
      });
      return;
    }

    existing.count += 1;
    if (existing.count >= this.maxAttempts) {
      existing.lockedUntil = now + this.lockoutMs;
    }
  }

  public clear(key: string): void {
    this.attempts.delete(key);
  }
}
