import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDatabase } from '../server/db/index';
import { UserRepository } from '../server/db/users';
import { TransferRepository } from '../server/db/transfers';
import { DeviceRepository } from '../server/db/devices';
import { CloudPackageRepository } from '../server/db/cloudPackages';
import { hashPassword, verifyPassword } from '../server/security/auth';

describe('Authentication & SQLite Database Architecture', () => {
  let db: DatabaseSync;
  let userRepo: UserRepository;
  let transferRepo: TransferRepository;
  let deviceRepo: DeviceRepository;
  let cloudRepo: CloudPackageRepository;
  let tempStorageDir: string;

  beforeEach(() => {
    // In-memory SQLite for test isolation
    db = initDatabase(':memory:');
    userRepo = new UserRepository(db);
    transferRepo = new TransferRepository(db);
    deviceRepo = new DeviceRepository(db);
    tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swiftdrop-cloud-test-'));
    cloudRepo = new CloudPackageRepository(db, tempStorageDir);
  });

  it('securely hashes passwords with scrypt and salt, verifying correctly', () => {
    const rawPassword = 'superSecretPassword123!';
    const hash = hashPassword(rawPassword);

    expect(hash).toContain(':');
    expect(verifyPassword(rawPassword, hash)).toBe(true);
    expect(verifyPassword('wrongPassword', hash)).toBe(false);
  });

  it('registers users with normalized emails and creates default preferences', () => {
    const user = userRepo.createUser('Alex Hunter', '  ALEX@Example.com ', hashPassword('secret123'));
    expect(user.id).toBeDefined();
    expect(user.display_name).toBe('Alex Hunter');
    expect(user.normalized_email).toBe('alex@example.com');

    // Default preferences
    const prefs = userRepo.getPreferences(user.id);
    expect(prefs.theme).toBe('system');
    expect(prefs.save_transfer_history).toBe(1);
  });

  it('creates, validates, and revokes cryptographic auth sessions', () => {
    const user = userRepo.createUser('Morgan', 'morgan@example.com', hashPassword('secret123'));
    const { rawToken, sessionId } = userRepo.createSession(user.id, 'Safari on Mac');

    // Validate valid session
    const validated = userRepo.validateSession(rawToken);
    expect(validated).not.toBeNull();
    expect(validated?.user.id).toBe(user.id);
    expect(validated?.session.id).toBe(sessionId);

    // Revoke session
    const revoked = userRepo.revokeSession(sessionId, user.id);
    expect(revoked).toBe(true);

    // Validate revoked session should fail
    const afterRevoke = userRepo.validateSession(rawToken);
    expect(afterRevoke).toBeNull();
  });

  it('generates and redeems single-use password reset tokens', () => {
    const user = userRepo.createUser('Casey', 'casey@example.com', hashPassword('oldPassword123'));
    const resetToken = userRepo.createPasswordResetToken(user.id);

    // Reset password with token
    const newHash = hashPassword('brandNewPassword456');
    const success = userRepo.resetPasswordWithToken(resetToken, newHash);
    expect(success).toBe(true);

    // Token cannot be reused
    const reuse = userRepo.resetPasswordWithToken(resetToken, hashPassword('anotherPassword'));
    expect(reuse).toBe(false);

    // User can authenticate with new password
    const updatedUser = userRepo.findUserById(user.id)!;
    expect(verifyPassword('brandNewPassword456', updatedUser.password_hash)).toBe(true);
  });

  it('records transfer sessions and computes accurate dashboard statistics', () => {
    const user = userRepo.createUser('Taylor', 'taylor@example.com', hashPassword('pass123'));

    // 1. Outgoing transfer completed (100MB)
    const t1 = transferRepo.createTransfer(
      user.id,
      'session-1',
      'sent',
      [{ name: 'video.mp4', size: 104857600, mimeType: 'video/mp4' }],
      'MacBook Pro',
      'Pixel 8'
    );
    transferRepo.updateTransferStatus(t1.id, 'completed', 104857600);

    // 2. Incoming transfer completed (50MB)
    const t2 = transferRepo.createTransfer(
      user.id,
      'session-2',
      'received',
      [{ name: 'report.pdf', size: 52428800, mimeType: 'application/pdf' }],
      'iPhone 15',
      'MacBook Pro'
    );
    transferRepo.updateTransferStatus(t2.id, 'completed', 52428800);

    // 3. Cancelled transfer (10MB)
    const t3 = transferRepo.createTransfer(
      user.id,
      'session-3',
      'sent',
      [{ name: 'archive.zip', size: 10485760 }],
      'MacBook Pro',
      'Windows PC'
    );
    transferRepo.updateTransferStatus(t3.id, 'cancelled');

    const metrics = transferRepo.getDashboardSummary(user.id);
    expect(metrics.successfulTransfers).toBe(2);
    expect(metrics.totalSentBytes).toBe(104857600);
    expect(metrics.totalReceivedBytes).toBe(52428800);
    expect(metrics.failedOrCancelledTransfers).toBe(1);
    expect(metrics.recentActivity.length).toBe(3);
  });

  it('enforces strict authorization: User A cannot access or delete User B records', () => {
    const userA = userRepo.createUser('User A', 'usera@example.com', hashPassword('pass123'));
    const userB = userRepo.createUser('User B', 'userb@example.com', hashPassword('pass123'));

    const transferB = transferRepo.createTransfer(
      userB.id,
      'session-b',
      'sent',
      [{ name: 'private_doc.pdf', size: 1024 }]
    );

    // User A attempts to read User B's transfer details
    const accessByA = transferRepo.getTransferDetails(transferB.id, userA.id);
    expect(accessByA).toBeNull();

    // User A attempts to delete User B's transfer
    const deletedByA = transferRepo.deleteTransfer(transferB.id, userA.id);
    expect(deletedByA).toBe(false);

    // User B can access their own record
    const accessByB = transferRepo.getTransferDetails(transferB.id, userB.id);
    expect(accessByB).not.toBeNull();
    expect(accessByB?.files.length).toBe(1);
  });

  it('exports user data safely without exposing sensitive secrets', () => {
    const user = userRepo.createUser('Sam', 'sam@example.com', hashPassword('secretPassword'));
    deviceRepo.saveDevice(user.id, 'Sam iPad');
    transferRepo.createTransfer(user.id, 'sess-1', 'sent', [{ name: 'pic.jpg', size: 2048 }]);

    const exportData = userRepo.exportUserData(user.id);
    expect(exportData.profile.displayName).toBe('Sam');
    expect(exportData.profile.email).toBe('sam@example.com');
    expect(exportData.devices.length).toBe(1);
    expect(exportData.transfers.length).toBe(1);

    // Ensure password_hash, token_hash are NOT in the export!
    const jsonStr = JSON.stringify(exportData);
    expect(jsonStr).not.toContain('password_hash');
    expect(jsonStr).not.toContain('session_token_hash');
  });

  it('revokes all existing active sessions when a password reset token is redeemed', () => {
    const user = userRepo.createUser('Jordan', 'jordan@example.com', hashPassword('oldSecret123'));
    const { rawToken: session1 } = userRepo.createSession(user.id, 'Chrome Desktop');
    const { rawToken: session2 } = userRepo.createSession(user.id, 'iPhone Safari');

    expect(userRepo.validateSession(session1)).not.toBeNull();
    expect(userRepo.validateSession(session2)).not.toBeNull();

    const resetToken = userRepo.createPasswordResetToken(user.id);
    const resetOk = userRepo.resetPasswordWithToken(resetToken, hashPassword('newSecret456!'));
    expect(resetOk).toBe(true);

    // Both old sessions must be immediately revoked!
    expect(userRepo.validateSession(session1)).toBeNull();
    expect(userRepo.validateSession(session2)).toBeNull();
  });

  it('stores and resolves Passkey WebAuthn credentials accurately', () => {
    const user = userRepo.createUser('Passkey Owner', 'pk@example.com', hashPassword('randomPass123'));
    userRepo.savePasskeyCredential(user.id, 'cred-xyz-987', 'webauthn-es256-pub', 'MacBook TouchID');

    const resolvedUser = userRepo.findUserByPasskeyCredential('cred-xyz-987');
    expect(resolvedUser).not.toBeNull();
    expect(resolvedUser?.id).toBe(user.id);
    expect(resolvedUser?.normalized_email).toBe('pk@example.com');
  });

  it('assembles multi-chunk Store-and-Forward uploads, computes SHA-256, and verifies stored files', () => {
    const chunk1 = Buffer.from('Hello WeTransfer-style ');
    const chunk2 = Buffer.from('chunked file transfer!');
    const totalSize = chunk1.length + chunk2.length;

    const created = cloudRepo.createPackage({
      senderLabel: 'MacBook',
      senderDeviceId: 'dev-sender-1',
      preferredCode: 'KWMXQP',
      retentionHours: 72,
      files: [{ name: 'test_video.mp4', size: totalSize, type: 'video/mp4' }]
    });

    expect(created.package.code).toBe('KWMXQP');
    expect(created.formattedCode).toBe('KWM-XQP');
    expect(created.files.length).toBe(1);
    const fileId = created.files[0].id;

    // Write chunk 1
    const res1 = cloudRepo.writeFileChunk({
      packageId: created.package.id,
      fileId,
      chunkIndex: 0,
      offsetBytes: 0,
      chunkBuffer: chunk1
    });
    expect(res1.file.status).toBe('uploading');
    expect(res1.package.status).toBe('uploading');

    // Write chunk 2
    const res2 = cloudRepo.writeFileChunk({
      packageId: created.package.id,
      fileId,
      chunkIndex: 1,
      offsetBytes: chunk1.length,
      chunkBuffer: chunk2
    });
    expect(res2.file.status).toBe('ready');
    expect(res2.package.status).toBe('ready');
    expect(res2.packageReady).toBe(true);
    expect(res2.file.sha256_hash).toBeTruthy();

    // Verify assembled file content on disk
    const lookup = cloudRepo.getPackageByCode('KWM-XQP');
    expect(lookup).not.toBeNull();
    expect(lookup?.package.status).toBe('ready');
    const diskBytes = fs.readFileSync(lookup!.files[0].storage_path);
    expect(diskBytes.toString('utf8')).toBe('Hello WeTransfer-style chunked file transfer!');

    fs.rmSync(tempStorageDir, { recursive: true, force: true });
  });
});

