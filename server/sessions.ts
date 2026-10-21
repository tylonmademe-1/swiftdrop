import crypto from 'crypto';

export type SessionStatus =
  | 'created'
  | 'waiting_for_receiver'
  | 'receiver_pending'
  | 'negotiating'
  | 'connected'
  | 'awaiting_acceptance'
  | 'transferring'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'rejected'
  | 'failed';

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified?: number;
  hash?: string;
}

export interface SessionRecord {
  id: string;
  code: string;
  token: string;
  status: SessionStatus;
  createdAt: number;
  expiresAt: number;
  senderWsId: string | null;
  receiverWsId: string | null;
  senderDeviceId?: string;
  receiverDeviceId?: string;
  senderLabel: string;
  receiverLabel: string | null;
  manifest?: {
    files: FileMetadata[];
    totalBytes: number;
    totalFiles: number;
  };
  acceptedAt?: number;
  completedAt?: number;
}

const UNAMBIGUOUS_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function generatePairingCode(): string {
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    const index = bytes[i] % UNAMBIGUOUS_CHARS.length;
    code += UNAMBIGUOUS_CHARS[index];
  }
  // Format as XXX-XXX for readability (uppercase letters only)
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export class SessionManager {
  private sessions = new Map<string, SessionRecord>();
  private codeToSessionId = new Map<string, string>();
  private rateLimits = new Map<string, { count: number; resetAt: number; lockedUntil?: number }>();
  private cleanupInterval: NodeJS.Timeout;
  private readonly defaultExpirySeconds: number;

  constructor(expirySeconds: number = 300) {
    this.defaultExpirySeconds = expirySeconds;
    // Periodic sweep every 30 seconds
    this.cleanupInterval = setInterval(() => this.cleanupExpired(), 30000);
  }

  public destroy(): void {
    clearInterval(this.cleanupInterval);
    this.sessions.clear();
    this.codeToSessionId.clear();
    this.rateLimits.clear();
  }

  public checkRateLimit(ipKey: string): { allowed: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    const entry = this.rateLimits.get(ipKey);

    if (entry) {
      if (entry.lockedUntil && now < entry.lockedUntil) {
        return {
          allowed: false,
          retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000)
        };
      }
      if (now > entry.resetAt) {
        this.rateLimits.set(ipKey, { count: 1, resetAt: now + 60000 });
        return { allowed: true };
      }
      entry.count += 1;
      if (entry.count > 5) {
        // Lock for 60 seconds
        entry.lockedUntil = now + 60000;
        return {
          allowed: false,
          retryAfterSeconds: 60
        };
      }
      return { allowed: true };
    }

    this.rateLimits.set(ipKey, { count: 1, resetAt: now + 60000 });
    return { allowed: true };
  }

  public createSession(
    senderWsId: string,
    senderLabel: string,
    manifest?: SessionRecord['manifest'],
    senderDeviceId?: string
  ): SessionRecord {
    const id = crypto.randomUUID();
    const token = crypto.randomBytes(16).toString('hex');
    let code = generatePairingCode();

    // Ensure code uniqueness among active sessions
    let attempts = 0;
    while (this.codeToSessionId.has(code) && attempts < 10) {
      code = generatePairingCode();
      attempts++;
    }

    const now = Date.now();
    const expiresAt = now + this.defaultExpirySeconds * 1000;

    const session: SessionRecord = {
      id,
      code,
      token,
      status: 'waiting_for_receiver',
      createdAt: now,
      expiresAt,
      senderWsId,
      receiverWsId: null,
      senderDeviceId,
      senderLabel: senderLabel || 'Sending Device',
      receiverLabel: null,
      manifest
    };

    this.sessions.set(id, session);
    this.codeToSessionId.set(code.replace('-', '').toUpperCase(), id);
    this.codeToSessionId.set(code.toUpperCase(), id);

    return session;
  }

  public getSessionById(sessionId: string): SessionRecord | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    if (Date.now() > session.expiresAt && session.status === 'waiting_for_receiver') {
      session.status = 'expired';
      this.deleteSession(sessionId);
      return undefined;
    }
    return session;
  }

  public getSessionByCode(codeRaw: string): SessionRecord | undefined {
    const clean = codeRaw.replace(/[^A-Za-z]/g, '').toUpperCase();
    const sessionId = this.codeToSessionId.get(clean);
    if (!sessionId) return undefined;
    return this.getSessionById(sessionId);
  }

  public validateToken(sessionId: string, token: string): boolean {
    const session = this.getSessionById(sessionId);
    if (!session || !token) return false;
    const bufA = Buffer.from(session.token);
    const bufB = Buffer.from(token);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  public transitionStatus(sessionId: string, newStatus: SessionStatus): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Validate state machine progression
    const validTransitions: Record<SessionStatus, SessionStatus[]> = {
      created: ['waiting_for_receiver', 'cancelled'],
      waiting_for_receiver: ['receiver_pending', 'negotiating', 'cancelled', 'expired'],
      receiver_pending: ['negotiating', 'connected', 'awaiting_acceptance', 'waiting_for_receiver', 'rejected', 'cancelled', 'failed'],
      negotiating: ['connected', 'awaiting_acceptance', 'waiting_for_receiver', 'failed', 'cancelled'],
      connected: ['awaiting_acceptance', 'transferring', 'failed', 'cancelled'],
      awaiting_acceptance: ['transferring', 'rejected', 'cancelled', 'failed'],
      transferring: ['completed', 'failed', 'cancelled'],
      completed: [],
      cancelled: [],
      expired: [],
      rejected: [],
      failed: ['negotiating', 'waiting_for_receiver', 'cancelled'] // allow retry from failed if safe
    };

    const allowed = validTransitions[session.status];
    if (!allowed || !allowed.includes(newStatus)) {
      // If already in terminal state, don't allow change unless idempotent
      if (session.status === newStatus) return true;
      return false;
    }

    session.status = newStatus;
    if (newStatus === 'completed' || newStatus === 'cancelled' || newStatus === 'rejected') {
      session.completedAt = session.completedAt || Date.now();
      // Clean up code lookup immediately so code cannot be reused
      this.codeToSessionId.delete(session.code);
      this.codeToSessionId.delete(session.code.replace('-', ''));
    }
    return true;
  }

  public assignReceiver(
    sessionId: string,
    receiverWsId: string,
    receiverLabel: string,
    receiverDeviceId?: string
  ): boolean {
    const session = this.getSessionById(sessionId);
    if (!session) return false;
    // Prevent sender from receiving their own file
    if (session.senderWsId && session.senderWsId === receiverWsId) {
      return false;
    }
    if (session.senderDeviceId && receiverDeviceId && session.senderDeviceId === receiverDeviceId) {
      return false;
    }
    if (session.receiverWsId && session.receiverWsId !== receiverWsId) {
      // Already has a receiver connected! Reject duplicate join attempts
      return false;
    }
    session.receiverWsId = receiverWsId;
    session.receiverDeviceId = receiverDeviceId;
    session.receiverLabel = receiverLabel || 'Receiving Device';
    return true;
  }

  public deleteSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.codeToSessionId.delete(session.code);
      this.codeToSessionId.delete(session.code.replace('-', ''));
      this.sessions.delete(sessionId);
    }
  }

  public cleanupExpired(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now > session.expiresAt && session.status === 'waiting_for_receiver') {
        session.status = 'expired';
        this.deleteSession(id);
      } else if (session.status === 'completed' || session.status === 'cancelled' || session.status === 'rejected') {
        // Keep terminal records briefly (30s) then evict
        const finishedAt = session.completedAt || session.createdAt;
        if (now - finishedAt > 30000) {
          this.deleteSession(id);
        }
      }
    }
    for (const [ipKey, entry] of this.rateLimits.entries()) {
      if (now > entry.resetAt && (!entry.lockedUntil || now > entry.lockedUntil)) {
        this.rateLimits.delete(ipKey);
      }
    }
  }
}
