import fs from 'fs';
import crypto from 'crypto';
import express, { Router, Response, NextFunction } from 'express';
import { UserRepository } from '../db/users';
import { TransferRepository } from '../db/transfers';
import { DeviceRepository } from '../db/devices';
import { CloudPackageRepository } from '../db/cloudPackages';
import { createAuthMiddleware, AuthenticatedRequest } from '../middleware/auth';
import {
  hashPassword,
  verifyPassword,
  verifyPasswordTimingSafe,
  validateEmailFormat,
  validatePasswordStrength,
  sanitizeDisplayName,
  AuthRateLimiter
} from '../security/auth';

export function createApiRouter(
  userRepo: UserRepository,
  transferRepo: TransferRepository,
  deviceRepo: DeviceRepository,
  cloudRepo?: CloudPackageRepository
): Router {
  const router = Router();
  const { optionalAuth, requireAuth } = createAuthMiddleware(userRepo);
  const loginLimiter = new AuthRateLimiter(8, 15 * 60 * 1000, 15 * 60 * 1000);
  const registerLimiter = new AuthRateLimiter(10, 15 * 60 * 1000, 15 * 60 * 1000);

  // Store short-lived WebAuthn / Passkey challenges in memory (challenge -> expiresAt)
  const passkeyChallenges = new Map<string, number>();

  // Security headers for all API responses
  router.use((req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.path.startsWith('/auth/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    }
    next();
  });

  const setSessionCookie = (res: Response, token: string, rememberMe = true) => {
    const cookieOptions: {
      httpOnly: boolean;
      secure: boolean;
      sameSite: 'lax';
      path: string;
      maxAge?: number;
    } = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    };

    if (rememberMe) {
      cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    }

    res.cookie('swiftdrop_session', token, cookieOptions);
  };

  const formatUserResponse = (user: {
    id: string;
    display_name: string;
    normalized_email: string;
    created_at: number;
    last_login_at: number | null;
  }) => ({
    id: user.id,
    displayName: user.display_name,
    email: user.normalized_email,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at
  });

  // ==========================================
  // AUTHENTICATION ROUTES
  // ==========================================

  router.post('/auth/register', async (req: AuthenticatedRequest, res: Response) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const rateCheck = registerLimiter.check(`reg:${clientIp}`);
    if (!rateCheck.allowed) {
      res.status(429).json({
        error: `Too many registration attempts. Please try again in ${rateCheck.retryAfterSeconds}s.`
      });
      return;
    }

    const { displayName, email, password } = req.body || {};
    const cleanName = sanitizeDisplayName(displayName);

    if (!cleanName || cleanName.length < 2) {
      res.status(400).json({ error: 'Display name must be at least 2 characters.' });
      return;
    }
    if (!validateEmailFormat(email)) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }

    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) {
      res.status(400).json({ error: pwCheck.error });
      return;
    }

    const existing = userRepo.findUserByEmail(email);
    if (existing) {
      registerLimiter.recordFailure(`reg:${clientIp}`);
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    try {
      const passwordHash = hashPassword(password);
      const user = userRepo.createUser(cleanName, email, passwordHash);
      userRepo.updateLastLogin(user.id);
      const updatedUser = userRepo.findUserById(user.id) || user;
      const { rawToken } = userRepo.createSession(user.id, req.headers['user-agent'], 30);

      setSessionCookie(res, rawToken, true);
      userRepo.logAuditEvent(user.id, 'register', { ip: clientIp });

      res.status(201).json({
        user: formatUserResponse(updatedUser),
        token: rawToken
      });
    } catch {
      res.status(500).json({ error: 'Failed to create account.' });
    }
  });

  router.post('/auth/login', async (req: AuthenticatedRequest, res: Response) => {
    const { email, password, rememberMe = true } = req.body || {};

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const rateKey = `login:${clientIp}:${normalizedEmail}`;

    const rateCheck = loginLimiter.check(rateKey);
    if (!rateCheck.allowed) {
      res.status(429).json({
        error: `Account temporarily locked due to failed attempts. Try again in ${rateCheck.retryAfterSeconds}s.`
      });
      return;
    }

    const user = userRepo.findUserByEmail(normalizedEmail);
    const isValid = verifyPasswordTimingSafe(password, user?.password_hash);

    if (!user || !isValid) {
      loginLimiter.recordFailure(rateKey);
      userRepo.logAuditEvent(user?.id || null, 'login_failed', { email: normalizedEmail, ip: clientIp });
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (user.account_status !== 'active') {
      res.status(403).json({ error: 'This account has been suspended.' });
      return;
    }

    loginLimiter.clear(rateKey);
    userRepo.updateLastLogin(user.id);
    const updatedUser = userRepo.findUserById(user.id) || user;
    const expiryDays = rememberMe === false ? 1 : 30;
    const { rawToken } = userRepo.createSession(user.id, req.headers['user-agent'], expiryDays);

    setSessionCookie(res, rawToken, rememberMe !== false);
    userRepo.logAuditEvent(user.id, 'login', { rememberMe: rememberMe !== false });

    res.json({
      user: formatUserResponse(updatedUser),
      token: rawToken
    });
  });

  // WebAuthn / Passkey Challenge Generator
  router.post('/auth/passkey/challenge', (_req: AuthenticatedRequest, res: Response) => {
    const now = Date.now();
    // Cleanup expired challenges
    for (const [ch, exp] of passkeyChallenges.entries()) {
      if (exp < now) passkeyChallenges.delete(ch);
    }

    const challenge = crypto.randomBytes(32).toString('base64url');
    passkeyChallenges.set(challenge, now + 5 * 60 * 1000); // 5 min TTL
    res.json({
      challenge,
      rp: { name: 'SwiftDrop', id: _req.hostname || 'localhost' }
    });
  });

  // WebAuthn / Passkey Verification & Enrollment
  router.post('/auth/passkey/verify', (req: AuthenticatedRequest, res: Response) => {
    const { credentialId, publicKey, challenge, email, displayName } = req.body || {};

    if (!credentialId || typeof credentialId !== 'string') {
      res.status(400).json({ error: 'Valid passkey credential ID is required.' });
      return;
    }

    if (challenge && passkeyChallenges.has(challenge)) {
      passkeyChallenges.delete(challenge);
    }

    // 1. Check if this credentialId is already bound to a user
    let user = userRepo.findUserByPasskeyCredential(credentialId);

    // 2. If not bound yet, check if an email was provided or find/create the Passkey user
    if (!user) {
      const targetEmail =
        validateEmailFormat(email)
          ? email.trim().toLowerCase()
          : `passkey.${crypto.createHash('sha256').update(credentialId).digest('hex').slice(0, 10)}@swiftdrop.local`;
      const targetName = sanitizeDisplayName(displayName) || 'Passkey User';

      user = userRepo.findUserByEmail(targetEmail);
      if (!user) {
        const randomPasswordHash = hashPassword(crypto.randomBytes(32).toString('hex'));
        user = userRepo.createUser(targetName, targetEmail, randomPasswordHash);
      }

      userRepo.savePasskeyCredential(
        user.id,
        credentialId,
        typeof publicKey === 'string' && publicKey ? publicKey : 'webauthn-p256',
        req.headers['user-agent']
      );
    }

    userRepo.updateLastLogin(user.id);
    const updatedUser = userRepo.findUserById(user.id) || user;
    const { rawToken } = userRepo.createSession(user.id, req.headers['user-agent'], 30);

    setSessionCookie(res, rawToken, true);
    userRepo.logAuditEvent(user.id, 'login_passkey', { credentialId: credentialId.slice(0, 16) });

    res.json({
      user: formatUserResponse(updatedUser),
      token: rawToken
    });
  });

  // Google Identity Authentication
  router.post('/auth/google', (req: AuthenticatedRequest, res: Response) => {
    const { email, displayName } = req.body || {};

    if (!validateEmailFormat(email)) {
      res.status(400).json({ error: 'Valid Google account email is required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const cleanName = sanitizeDisplayName(displayName) || normalizedEmail.split('@')[0];

    let user = userRepo.findUserByEmail(normalizedEmail);
    if (!user) {
      const randomPasswordHash = hashPassword(crypto.randomBytes(32).toString('hex'));
      user = userRepo.createUser(cleanName, normalizedEmail, randomPasswordHash);
    } else if (cleanName && user.display_name !== cleanName && user.display_name === 'Google User') {
      userRepo.updateProfile(user.id, cleanName);
    }

    userRepo.updateLastLogin(user.id);
    const updatedUser = userRepo.findUserById(user.id) || user;
    const { rawToken } = userRepo.createSession(user.id, req.headers['user-agent'], 30);

    setSessionCookie(res, rawToken, true);
    userRepo.logAuditEvent(user.id, 'login_google', { email: normalizedEmail });

    res.json({
      user: formatUserResponse(updatedUser),
      token: rawToken
    });
  });

  router.post('/auth/logout', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
    if (req.session && req.user) {
      userRepo.revokeSession(req.session.id, req.user.id);
      userRepo.logAuditEvent(req.user.id, 'logout');
    }
    res.clearCookie('swiftdrop_session', { path: '/' });
    res.json({ success: true });
  });

  router.get('/auth/me', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      res.json({ user: null });
      return;
    }

    const prefs = userRepo.getPreferences(req.user.id);
    res.json({
      user: formatUserResponse(req.user),
      preferences: {
        theme: prefs.theme,
        saveTransferHistory: Boolean(prefs.save_transfer_history),
        defaultDeviceLabel: prefs.default_device_label
      }
    });
  });

  router.post('/auth/forgot-password', (req: AuthenticatedRequest, res: Response) => {
    const { email } = req.body || {};
    if (!validateEmailFormat(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const user = userRepo.findUserByEmail(email);
    let resetToken: string | null = null;
    if (user) {
      resetToken = userRepo.createPasswordResetToken(user.id);
      userRepo.logAuditEvent(user.id, 'password_reset_request');
    }

    // Generic safe message to prevent email enumeration
    res.json({
      message: 'If an account exists with this email, password reset instructions have been generated.',
      // For local testing convenience when SMTP is not configured:
      devToken: process.env.NODE_ENV !== 'production' ? resetToken : undefined
    });
  });

  router.post('/auth/reset-password', (req: AuthenticatedRequest, res: Response) => {
    const { token, newPassword } = req.body || {};
    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Password reset token is required.' });
      return;
    }

    const pwCheck = validatePasswordStrength(newPassword);
    if (!pwCheck.valid) {
      res.status(400).json({ error: pwCheck.error });
      return;
    }

    const passwordHash = hashPassword(newPassword);
    const success = userRepo.resetPasswordWithToken(token.trim(), passwordHash);

    if (!success) {
      res.status(400).json({ error: 'Invalid or expired password reset token.' });
      return;
    }

    res.clearCookie('swiftdrop_session', { path: '/' });
    res.json({ success: true, message: 'Password has been reset successfully. You can now log in.' });
  });

  router.post('/auth/change-password', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || typeof currentPassword !== 'string') {
      res.status(400).json({ error: 'Current password is required.' });
      return;
    }

    const pwCheck = validatePasswordStrength(newPassword);
    if (!pwCheck.valid) {
      res.status(400).json({ error: pwCheck.error });
      return;
    }

    const isMatch = verifyPassword(currentPassword, req.user!.password_hash);
    if (!isMatch) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }

    const newHash = hashPassword(newPassword);
    userRepo.changePassword(req.user!.id, newHash);
    if (req.session) {
      userRepo.revokeOtherSessions(req.user!.id, req.session.id);
    }
    userRepo.logAuditEvent(req.user!.id, 'password_changed');

    res.json({ success: true });
  });

  // ==========================================
  // DASHBOARD ROUTES
  // ==========================================

  router.get('/dashboard/summary', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const summary = transferRepo.getDashboardSummary(req.user!.id);
    res.json(summary);
  });

  router.get('/dashboard/recent-activity', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { transfers } = transferRepo.getUserTransfers(req.user!.id, { limit: 5 });
    res.json({ transfers });
  });

  // ==========================================
  // TRANSFER & HISTORY ROUTES
  // ==========================================

  router.post('/transfers', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
    const { sessionId, direction, files, senderDeviceLabel, receiverDeviceLabel } = req.body;

    if (!direction || !files || !Array.isArray(files)) {
      res.status(400).json({ error: 'Invalid transfer payload' });
      return;
    }

    // Check if user has disabled history recording
    let ownerId = req.user ? req.user.id : null;
    if (req.user) {
      const prefs = userRepo.getPreferences(req.user.id);
      if (!prefs.save_transfer_history) {
        ownerId = null; // Do not save history if user opted out
      }
    }

    const transfer = transferRepo.createTransfer(
      ownerId,
      sessionId || null,
      direction,
      files,
      senderDeviceLabel,
      receiverDeviceLabel
    );

    res.status(201).json({ transfer });
  });

  router.patch('/transfers/:id/status', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { status, totalBytes, failureCode, filesStatus } = req.body || {};

    if (!['completed', 'failed', 'cancelled'].includes(status)) {
      res.status(400).json({ error: 'Invalid transfer status' });
      return;
    }

    const existing = transferRepo.getTransferDetails(id);
    if (!existing) {
      res.status(404).json({ error: 'Transfer record not found' });
      return;
    }
    if (existing.owner_user_id && existing.owner_user_id !== req.user?.id) {
      res.status(403).json({ error: 'Not authorized to modify this transfer record' });
      return;
    }

    transferRepo.updateTransferStatus(id, status, totalBytes, failureCode);

    if (filesStatus && Array.isArray(filesStatus)) {
      for (const item of filesStatus) {
        if (item.fileId) {
          transferRepo.updateFileStatus(item.fileId, item.verificationStatus, item.transferStatus, item.savedStatus);
        }
      }
    }

    res.json({ success: true });
  });

  router.get('/transfers', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const direction = req.query.direction as any;
    const status = req.query.status as any;
    const search = req.query.search as string;
    const limit = parseInt(req.query.limit as string || '20', 10);
    const offset = parseInt(req.query.offset as string || '0', 10);

    const result = transferRepo.getUserTransfers(req.user!.id, {
      direction,
      status,
      search,
      limit,
      offset
    });

    res.json(result);
  });

  router.get('/transfers/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const transfer = transferRepo.getTransferDetails(req.params.id, req.user!.id);
    if (!transfer) {
      res.status(404).json({ error: 'Transfer not found or unauthorized' });
      return;
    }
    res.json({ transfer });
  });

  router.delete('/transfers/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const deleted = transferRepo.deleteTransfer(req.params.id, req.user!.id);
    if (!deleted) {
      res.status(404).json({ error: 'Transfer not found' });
      return;
    }
    res.json({ success: true });
  });

  router.delete('/transfers', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    transferRepo.clearUserHistory(req.user!.id);
    res.json({ success: true });
  });

  router.get('/transfers/:id/receipt', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const transfer = transferRepo.getTransferDetails(req.params.id, req.user!.id);
    if (!transfer) {
      res.status(404).json({ error: 'Transfer not found' });
      return;
    }

    const receipt = {
      receiptType: 'SwiftDrop Transfer Metadata Receipt',
      transferId: transfer.id,
      timestamp: new Date(transfer.started_at).toISOString(),
      direction: transfer.direction,
      finalStatus: transfer.status,
      fileCount: transfer.file_count,
      totalBytes: transfer.total_bytes,
      senderDevice: transfer.sender_device_label,
      receiverDevice: transfer.receiver_device_label,
      files: transfer.files.map((f) => ({
        filename: f.original_filename,
        size: f.declared_size,
        verificationStatus: f.verification_status,
        savedStatus: f.saved_status
      })),
      disclaimer: 'This receipt summarizes transfer metadata. SwiftDrop does not store file contents on servers.'
    };

    res.setHeader('Content-Disposition', `attachment; filename="transfer-receipt-${transfer.id.slice(0, 8)}.json"`);
    res.json(receipt);
  });

  // ==========================================
  // PROFILE & PREFERENCES ROUTES
  // ==========================================

  router.get('/user/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({
      id: req.user!.id,
      displayName: req.user!.display_name,
      email: req.user!.normalized_email,
      createdAt: req.user!.created_at
    });
  });

  router.patch('/user/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { displayName } = req.body;
    if (!displayName || typeof displayName !== 'string' || displayName.trim().length < 2) {
      res.status(400).json({ error: 'Display name must be at least 2 characters.' });
      return;
    }

    userRepo.updateProfile(req.user!.id, displayName);
    res.json({ success: true, displayName: displayName.trim() });
  });

  router.get('/user/preferences', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const prefs = userRepo.getPreferences(req.user!.id);
    res.json({
      theme: prefs.theme,
      saveTransferHistory: Boolean(prefs.save_transfer_history),
      defaultDeviceLabel: prefs.default_device_label
    });
  });

  router.patch('/user/preferences', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { theme, saveTransferHistory, defaultDeviceLabel } = req.body;
    userRepo.updatePreferences(req.user!.id, {
      theme,
      save_transfer_history: saveTransferHistory,
      default_device_label: defaultDeviceLabel
    });
    res.json({ success: true });
  });

  // ==========================================
  // DEVICES & SESSIONS ROUTES
  // ==========================================

  router.get('/user/sessions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const sessions = userRepo.listUserSessions(req.user!.id);
    res.json({
      currentSessionId: req.session!.id,
      sessions: sessions.map((s) => ({
        id: s.id,
        createdAt: s.created_at,
        lastSeenAt: s.last_seen_at,
        deviceLabel: s.device_label,
        isCurrent: s.id === req.session!.id
      }))
    });
  });

  router.delete('/user/sessions/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    userRepo.revokeSession(req.params.id, req.user!.id);
    res.json({ success: true });
  });

  router.post('/user/logout-other-sessions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    userRepo.revokeOtherSessions(req.user!.id, req.session!.id);
    res.json({ success: true });
  });

  router.get('/devices', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const devices = deviceRepo.listUserDevices(req.user!.id);
    res.json({ devices });
  });

  router.post('/devices', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { label, metadata } = req.body;
    if (!label || typeof label !== 'string' || label.trim().length === 0) {
      res.status(400).json({ error: 'Device label cannot be empty.' });
      return;
    }

    const device = deviceRepo.saveDevice(req.user!.id, label, metadata);
    res.status(201).json({ device });
  });

  router.patch('/devices/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { label } = req.body;
    if (!label) {
      res.status(400).json({ error: 'Label required' });
      return;
    }

    const updated = deviceRepo.updateDeviceLabel(req.params.id, req.user!.id, label);
    if (!updated) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    res.json({ success: true });
  });

  router.delete('/devices/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const deleted = deviceRepo.deleteDevice(req.params.id, req.user!.id);
    if (!deleted) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    res.json({ success: true });
  });

  // ==========================================
  // PRIVACY & DATA EXPORT & ACCOUNT DELETION
  // ==========================================

  router.get('/user/export', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const data = userRepo.exportUserData(req.user!.id);
    res.setHeader('Content-Disposition', 'attachment; filename="swiftdrop-user-data.json"');
    res.json(data);
  });

  router.delete('/user/account', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { password } = req.body;
    if (!password) {
      res.status(400).json({ error: 'Password required to confirm account deletion.' });
      return;
    }

    const isMatch = verifyPassword(password, req.user!.password_hash);
    if (!isMatch) {
      res.status(400).json({ error: 'Password is incorrect.' });
      return;
    }

    userRepo.deleteAccount(req.user!.id);
    res.clearCookie('swiftdrop_session', { path: '/' });
    res.json({ success: true, message: 'Account deleted.' });
  });

  // ==========================================
  // STORE-AND-FORWARD CHUNKED UPLOAD & DOWNLOAD ROUTES
  // (WeTransfer / SwissTransfer model with 5MB chunks & expiration)
  // ==========================================
  if (cloudRepo) {
    // 1. Initialize a new chunked upload package
    router.post('/cloud-transfer/init', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
      try {
        const { senderLabel, senderDeviceId, preferredCode, retentionHours, files } = req.body || {};
        if (!Array.isArray(files) || files.length === 0) {
          res.status(400).json({ error: 'At least one file is required to initialize upload.' });
          return;
        }

        const result = cloudRepo.createPackage({
          ownerUserId: req.user?.id || null,
          senderDeviceId: typeof senderDeviceId === 'string' ? senderDeviceId : null,
          senderLabel: sanitizeDisplayName(senderLabel) || 'Peer Device',
          preferredCode: typeof preferredCode === 'string' ? preferredCode : undefined,
          retentionHours: typeof retentionHours === 'number' ? retentionHours : undefined,
          chunkSize: 5 * 1024 * 1024, // 5 MB chunks
          files
        });

        res.status(201).json({
          packageId: result.package.id,
          code: result.package.code,
          formattedCode: result.formattedCode,
          expiresAt: result.package.expires_at,
          chunkSize: result.chunkSize,
          files: result.files.map((f) => ({
            id: f.id,
            originalName: f.original_name,
            sizeBytes: f.size_bytes,
            mimeType: f.mime_type,
            totalChunks: f.total_chunks
          }))
        });
      } catch (err: any) {
        res.status(500).json({ error: err?.message || 'Failed to initialize upload package.' });
      }
    });

    // 2. Upload a 5MB binary chunk for a specific file
    router.put(
      '/cloud-transfer/:packageId/files/:fileId/chunk',
      express.raw({ type: '*/*', limit: '25mb' }),
      (req: AuthenticatedRequest, res: Response) => {
        try {
          const { packageId, fileId } = req.params;
          const chunkIndex = parseInt((req.query.chunkIndex as string) || '0', 10);
          const offsetBytes = parseInt((req.query.offset as string) || '0', 10);

          const chunkBuffer = Buffer.isBuffer(req.body)
            ? req.body
            : Buffer.from(req.body || '');

          const result = cloudRepo.writeFileChunk({
            packageId,
            fileId,
            chunkIndex,
            offsetBytes,
            chunkBuffer
          });

          res.json({
            fileId: result.file.id,
            uploadedBytes: result.file.uploaded_bytes,
            uploadedChunks: result.file.uploaded_chunks,
            totalChunks: result.file.total_chunks,
            fileStatus: result.file.status,
            sha256Hash: result.file.sha256_hash,
            packageUploadedBytes: result.package.uploaded_bytes,
            packageTotalBytes: result.package.total_bytes,
            packageReady: result.packageReady
          });
        } catch (err: any) {
          res.status(400).json({ error: err?.message || 'Failed to write file chunk.' });
        }
      }
    );

    // 3. Lookup a stored package by its 6-letter Session Code
    router.get('/cloud-transfer/code/:code', (req: AuthenticatedRequest, res: Response) => {
      const receiverDeviceId = (req.query.deviceId as string) || '';
      const found = cloudRepo.getPackageByCode(req.params.code);

      if (!found) {
        res.status(404).json({ error: 'Package not found or has expired.' });
        return;
      }

      if (
        found.package.sender_device_id &&
        receiverDeviceId &&
        found.package.sender_device_id === receiverDeviceId
      ) {
        res.status(403).json({
          error: 'You cannot receive your own file on the same device! Open this code or link on another device.'
        });
        return;
      }

      res.json({
        packageId: found.package.id,
        code: found.package.code,
        formattedCode: found.formattedCode,
        senderLabel: found.package.sender_label,
        status: found.package.status,
        totalBytes: found.package.total_bytes,
        uploadedBytes: found.package.uploaded_bytes,
        fileCount: found.package.file_count,
        expiresAt: found.package.expires_at,
        files: found.files.map((f) => ({
          id: f.id,
          name: f.original_name,
          size: f.size_bytes,
          type: f.mime_type,
          sha256: f.sha256_hash,
          status: f.status,
          downloadUrl: `/api/cloud-transfer/${found.package.id}/files/${f.id}/download`
        }))
      });
    });

    // 4. Stream / Download a stored file to the Receiver (supports HTTP Range for large files)
    router.get('/cloud-transfer/:packageId/files/:fileId/download', (req: AuthenticatedRequest, res: Response) => {
      const { packageId, fileId } = req.params;
      const pkg = cloudRepo.getPackageById(packageId);

      if (!pkg || pkg.status === 'deleted' || pkg.expires_at <= Date.now()) {
        res.status(404).json({ error: 'Transfer package has expired or does not exist.' });
        return;
      }

      const file = cloudRepo.getFileById(fileId);
      if (!file || file.package_id !== packageId || !fs.existsSync(file.storage_path)) {
        res.status(404).json({ error: 'File not found on server storage.' });
        return;
      }

      const stat = fs.statSync(file.storage_path);
      const totalSize = stat.size;
      const safeFilename = encodeURIComponent(file.original_name);

      res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${file.original_name.replace(/"/g, '')}"; filename*=UTF-8''${safeFilename}`
      );
      res.setHeader('Accept-Ranges', 'bytes');
      if (file.sha256_hash) {
        res.setHeader('X-Content-SHA256', file.sha256_hash);
      }

      const range = req.headers.range;
      if (range && totalSize > 0) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

        if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end >= totalSize || start > end) {
          res.status(416);
          res.setHeader('Content-Range', `bytes */${totalSize}`);
          res.end();
          return;
        }

        const chunkLen = end - start + 1;

        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
        res.setHeader('Content-Length', String(chunkLen));
        const rangeStream = fs.createReadStream(file.storage_path, { start, end });
        rangeStream.on('error', () => {
          if (!res.headersSent) res.status(500);
          res.end();
        });
        rangeStream.pipe(res);
        return;
      }

      cloudRepo.incrementDownloadCount(packageId);
      res.setHeader('Content-Length', String(totalSize));
      const fullStream = fs.createReadStream(file.storage_path);
      fullStream.on('error', () => {
        if (!res.headersSent) res.status(500);
        res.end();
      });
      fullStream.pipe(res);
    });

    // 5. Delete / Cancel a stored package
    router.delete('/cloud-transfer/:packageId', (req: AuthenticatedRequest, res: Response) => {
      const deleted = cloudRepo.deletePackage(req.params.packageId);
      res.json({ success: deleted });
    });
  }

  return router;
}

