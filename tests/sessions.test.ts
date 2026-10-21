import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../server/sessions';

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    // 2-second expiry for fast testing
    sessionManager = new SessionManager(2);
  });

  afterEach(() => {
    sessionManager.destroy();
  });

  it('creates session with valid random ID, 6-letter formatted pairing code, and secret token', () => {
    const session = sessionManager.createSession('ws-sender-1', 'MacBook Pro');
    expect(session.id).toBeDefined();
    expect(session.token).toBeDefined();
    expect(session.token.length).toBeGreaterThanOrEqual(16);
    expect(session.code).toMatch(/^[A-Z]{3}-[A-Z]{3}$/);
    expect(session.status).toBe('waiting_for_receiver');
    expect(session.senderLabel).toBe('MacBook Pro');
  });

  it('allows looking up session by case-insensitive pairing code with or without hyphen', () => {
    const session = sessionManager.createSession('ws-sender-1', 'Pixel 8');
    const withHyphen = session.code.toLowerCase();
    const withoutHyphen = session.code.replace('-', '').toLowerCase();

    const found1 = sessionManager.getSessionByCode(withHyphen);
    expect(found1?.id).toBe(session.id);

    const found2 = sessionManager.getSessionByCode(withoutHyphen);
    expect(found2?.id).toBe(session.id);
  });

  it('validates secret session token securely', () => {
    const session = sessionManager.createSession('ws-sender-1', 'Windows PC');
    expect(sessionManager.validateToken(session.id, session.token)).toBe(true);
    expect(sessionManager.validateToken(session.id, 'invalid-token-123')).toBe(false);
  });

  it('enforces rate limiting on repeated attempts from the same IP', () => {
    const ip = '192.168.1.100';
    for (let i = 0; i < 5; i++) {
      const check = sessionManager.checkRateLimit(ip);
      expect(check.allowed).toBe(true);
    }

    // 6th attempt should be blocked
    const blockedCheck = sessionManager.checkRateLimit(ip);
    expect(blockedCheck.allowed).toBe(false);
    expect(blockedCheck.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('validates state transitions and rejects illegal transitions', () => {
    const session = sessionManager.createSession('ws-sender-1', 'Ubuntu');
    expect(session.status).toBe('waiting_for_receiver');

    // Valid: waiting_for_receiver -> receiver_pending
    const ok1 = sessionManager.transitionStatus(session.id, 'receiver_pending');
    expect(ok1).toBe(true);
    expect(session.status).toBe('receiver_pending');

    // Valid: receiver_pending -> negotiating
    const ok2 = sessionManager.transitionStatus(session.id, 'negotiating');
    expect(ok2).toBe(true);

    // Invalid: negotiating -> completed directly (must go through connected & transferring)
    const invalid = sessionManager.transitionStatus(session.id, 'completed');
    expect(invalid).toBe(false);
  });

  it('prevents duplicate receivers from hijacking an assigned session and blocks sender from receiving own file', () => {
    const session = sessionManager.createSession('ws-sender-1', 'iPad', undefined, 'device-abc');

    // Sender trying to receive their own file on same wsId or same deviceId must be rejected
    expect(sessionManager.assignReceiver(session.id, 'ws-sender-1', 'iPad')).toBe(false);
    expect(sessionManager.assignReceiver(session.id, 'ws-sender-tab2', 'iPad', 'device-abc')).toBe(false);

    // Distinct receiver device is allowed
    const assigned1 = sessionManager.assignReceiver(session.id, 'ws-receiver-1', 'iPhone 15', 'device-xyz');
    expect(assigned1).toBe(true);

    // Second receiver trying to join same session should be rejected
    const assigned2 = sessionManager.assignReceiver(session.id, 'ws-receiver-2', 'Android Phone', 'device-999');
    expect(assigned2).toBe(false);
  });

  it('expires session after timeout and prevents code reuse', async () => {
    const session = sessionManager.createSession('ws-sender-1', 'MacBook');
    const code = session.code;

    // Fast-forward past expiry
    await new Promise((resolve) => setTimeout(resolve, 2100));

    const expiredLookup = sessionManager.getSessionByCode(code);
    expect(expiredLookup).toBeUndefined();
  });

  it('supports Send Anywhere style 6-digit numeric keys and resolves cleanly', () => {
    const numericSession = sessionManager.createSession('ws-sender-num', 'Pixel 9', undefined, undefined, 'numeric');
    expect(numericSession.code).toMatch(/^[0-9]{3}-[0-9]{3}$/);

    const lookupFormatted = sessionManager.getSessionByCode(numericSession.code);
    expect(lookupFormatted?.id).toBe(numericSession.id);

    const plain = numericSession.code.replace('-', '');
    const lookupPlain = sessionManager.getSessionByCode(plain);
    expect(lookupPlain?.id).toBe(numericSession.id);
  });
});
