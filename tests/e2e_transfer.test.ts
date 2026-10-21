import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { SessionManager } from '../server/sessions';
import { computeBufferHash } from '../src/utils/crypto';

describe('End-to-End Transfer Workflow & Session Code Pairing', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager(300); // 5 minute expiry
  });

  it('generates a 6-letter uppercase session code (A-Z only, no numbers) and registers active session', async () => {
    const { formatAlphaSessionCode } = await import('../src/utils/clipboard');
    const session = sessionManager.createSession('ws-sender-1', 'MacBook Air');

    expect(session.id).toBeDefined();
    expect(session.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{3}-[ABCDEFGHJKLMNPQRSTUVWXYZ]{3}$/);
    expect(session.status).toBe('waiting_for_receiver');
    expect(session.senderLabel).toBe('MacBook Air');
    expect(session.token).toHaveLength(32); // 16 bytes hex
    expect(session.expiresAt).toBeGreaterThan(Date.now());

    // Verify input formatter strips numbers and special characters, keeping only uppercase A-Z with '-'
    expect(formatAlphaSessionCode('a1b2c3-d4e5f6!@#')).toBe('ABC-DEF');
    expect(formatAlphaSessionCode('kwm xqp')).toBe('KWM-XQP');
  });

  it('allows receiver to join using formatted code or plain alphanumeric code', () => {
    const session = sessionManager.createSession('ws-sender-2', 'Linux Desktop');
    const formattedCode = session.code; // e.g. "K7M-9XP"
    const plainCode = session.code.replace('-', ''); // "K7M9XP"

    // 1. Lookup by formatted code
    const foundByFormatted = sessionManager.getSessionByCode(formattedCode);
    expect(foundByFormatted).toBeDefined();
    expect(foundByFormatted?.id).toBe(session.id);

    // 2. Lookup by unformatted plain code
    const foundByPlain = sessionManager.getSessionByCode(plainCode);
    expect(foundByPlain).toBeDefined();
    expect(foundByPlain?.id).toBe(session.id);

    // 3. Lookup case-insensitively
    const foundLower = sessionManager.getSessionByCode(plainCode.toLowerCase());
    expect(foundLower).toBeDefined();
    expect(foundLower?.id).toBe(session.id);
  });

  it('validates QR code URL pairing parameters and authenticates token safely', () => {
    const session = sessionManager.createSession('ws-sender-3', 'Sender PC');
    const lanAppUrl = 'http://192.168.1.100:3000';
    const qrUrl = `${lanAppUrl}/receive?session=${session.id}&token=${session.token}&code=${session.code}`;

    // Receiver parses query URL
    const parsed = new URL(qrUrl);
    const sessionId = parsed.searchParams.get('session');
    const token = parsed.searchParams.get('token');
    const code = parsed.searchParams.get('code');

    expect(sessionId).toBe(session.id);
    expect(token).toBe(session.token);
    expect(code).toBe(session.code);

    // Timing-safe token validation
    expect(sessionManager.validateToken(sessionId!, token!)).toBe(true);
    expect(sessionManager.validateToken(sessionId!, 'invalid-fake-token-value')).toBe(false);
  });

  it('enforces pairing rate limiting to prevent brute force code guessing', () => {
    const clientIp = '192.168.1.55';

    // First 5 attempts should be permitted
    for (let i = 0; i < 5; i++) {
      const check = sessionManager.checkRateLimit(clientIp);
      expect(check.allowed).toBe(true);
    }

    // 6th attempt must be locked
    const lockedCheck = sessionManager.checkRateLimit(clientIp);
    expect(lockedCheck.allowed).toBe(false);
    expect(lockedCheck.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('progresses session state machine across complete real transfer lifecycle', () => {
    const session = sessionManager.createSession('ws-sender-4', 'Studio Laptop');

    // Receiver joins
    expect(sessionManager.assignReceiver(session.id, 'ws-receiver-4', 'Galaxy Tab')).toBe(true);
    expect(sessionManager.transitionStatus(session.id, 'receiver_pending')).toBe(true);

    // WebRTC handshake / negotiating
    expect(sessionManager.transitionStatus(session.id, 'negotiating')).toBe(true);

    // Manifest offered & awaiting receiver approval
    expect(sessionManager.transitionStatus(session.id, 'awaiting_acceptance')).toBe(true);

    // Receiver accepts -> transfer starts
    expect(sessionManager.transitionStatus(session.id, 'transferring')).toBe(true);

    // All files stream & verify -> complete
    expect(sessionManager.transitionStatus(session.id, 'completed')).toBe(true);

    const finalSession = sessionManager.getSessionById(session.id);
    expect(finalSession?.status).toBe('completed');
  });

  it('encodes binary packets, reorders chunks, and verifies SHA-256 file integrity', async () => {
    const MAGIC_NUMBER = 0x53574644; // "SWFD"
    const HEADER_SIZE = 16;

    // Create a sample 64 KB test file payload
    const originalBytes = crypto.randomBytes(65536);
    const originalHash = crypto.createHash('sha256').update(originalBytes).digest('hex');

    // Split into 4 chunks of 16 KB each
    const chunkSize = 16384;
    const totalChunks = 4;
    const packets: Uint8Array[] = [];

    for (let c = 0; c < totalChunks; c++) {
      const slice = originalBytes.subarray(c * chunkSize, (c + 1) * chunkSize);
      const packet = new Uint8Array(HEADER_SIZE + slice.byteLength);
      const view = new DataView(packet.buffer);

      view.setUint32(0, MAGIC_NUMBER, false);
      view.setUint32(4, 0, false); // fileIndex 0
      view.setUint32(8, c, false); // chunkIndex c
      view.setUint32(12, slice.byteLength, false);
      packet.set(slice, HEADER_SIZE);

      packets.push(packet);
    }

    // Simulate packets arriving out of order: chunk 2, 0, 3, 1
    const outOfOrder = [packets[2], packets[0], packets[3], packets[1]];

    // Receiver buffer reassembly
    const receivedChunks: ArrayBuffer[] = new Array(totalChunks);

    for (const pkt of outOfOrder) {
      const view = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
      const magic = view.getUint32(0, false);
      expect(magic).toBe(MAGIC_NUMBER);

      const chunkIndex = view.getUint32(8, false);
      const payloadLength = view.getUint32(12, false);
      const chunkData = pkt.slice(HEADER_SIZE, HEADER_SIZE + payloadLength).buffer;

      receivedChunks[chunkIndex] = chunkData;
    }

    // Reconstruct file
    const assembledBlobParts = receivedChunks.map((b) => new Uint8Array(b));
    const totalLength = assembledBlobParts.reduce((acc, p) => acc + p.length, 0);
    const assembledFile = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of assembledBlobParts) {
      assembledFile.set(part, offset);
      offset += part.length;
    }

    // Compute SHA-256 of assembled bytes
    const assembledHash = await computeBufferHash(assembledFile.buffer);

    expect(assembledHash).toBe(originalHash);
    expect(assembledFile.byteLength).toBe(originalBytes.byteLength);
    expect(Buffer.from(assembledFile).equals(originalBytes)).toBe(true);
  });

  it('reconstructs file via QRFerry optical stream with out-of-order frames and XOR fountain repair after frame loss', async () => {
    const { createQRFerryStream, QRFerryReceiver } = await import('../src/services/qrFerryService');

    const content = Array.from({ length: 80 }, (_, i) => `Frame-Line-${i}-${crypto.randomUUID()}`).join('\n');
    const sampleFile = new File([content], 'optical-notes.txt', { type: 'text/plain' });

    const stream = await createQRFerryStream(sampleFile, 120);
    expect(stream.metadata.sourceFramesCount).toBeGreaterThanOrEqual(4);
    expect(stream.frames.length).toBeGreaterThan(stream.metadata.sourceFramesCount);

    const receiver = new QRFerryReceiver();

    // Simulate dropping source frame index 1 (second frame in group 0..3) and delivering remaining frames in reverse order!
    const framesExceptIndex1 = stream.frames.filter((f) => !f.includes('|S|1|')).reverse();

    let lastProgress = null;
    for (const frame of framesExceptIndex1) {
      lastProgress = await receiver.processFrame(frame);
      if (lastProgress?.isComplete) break;
    }

    expect(lastProgress).not.toBeNull();
    expect(lastProgress?.isComplete).toBe(true);
    expect(lastProgress?.verified).toBe(true);
    expect(lastProgress?.fileName).toBe('optical-notes.txt');

    const reconstructedText = await lastProgress!.blob!.text();
    expect(reconstructedText).toBe(content);
  });
});
