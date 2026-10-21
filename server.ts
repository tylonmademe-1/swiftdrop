import express from 'express';
import http from 'http';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { SessionManager } from './server/sessions';
import { setupSignaling } from './server/signaling';
import { initDatabase } from './server/db/index';
import { UserRepository } from './server/db/users';
import { TransferRepository } from './server/db/transfers';
import { DeviceRepository } from './server/db/devices';
import { CloudPackageRepository } from './server/db/cloudPackages';
import { createApiRouter } from './server/routes/api';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT || '3000', 10);

function getLocalLanIp(): string | null {
  if (process.env.LAN_IP) return process.env.LAN_IP;

  const interfaces = os.networkInterfaces();
  const candidates: { ip: string; priority: number }[] = [];

  for (const name of Object.keys(interfaces)) {
    const addresses = interfaces[name];
    if (!addresses) continue;
    const lowerName = name.toLowerCase();
    const isVirtual =
      lowerName.includes('vgate') ||
      lowerName.includes('vethernet') ||
      lowerName.includes('virtual') ||
      lowerName.includes('wsl') ||
      lowerName.includes('docker');

    for (const addr of addresses) {
      if (addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('127.')) {
        let priority = 1;
        // Priority boost for physical Ethernet/Wi-Fi
        if (lowerName.includes('ethernet') || lowerName.includes('wi-fi') || lowerName.includes('wlan')) {
          priority += 10;
        }
        // Deprioritize virtual adapters or point-to-point /32 masks
        if (isVirtual || addr.netmask === '255.255.255.255') {
          priority -= 5;
        }
        // Prioritize common local subnet
        if (addr.address.startsWith('192.168.')) {
          priority += 5;
        } else if (addr.address.startsWith('10.')) {
          priority += 3;
        }
        candidates.push({ ip: addr.address, priority });
      }
    }
  }

  candidates.sort((a, b) => b.priority - a.priority);
  return candidates.length > 0 ? candidates[0].ip : null;
}

const app = express();
app.use(express.json());
app.use(cookieParser());

// Initialize SQLite Database and Repositories
const db = initDatabase();
const userRepo = new UserRepository(db);
const transferRepo = new TransferRepository(db);
const deviceRepo = new DeviceRepository(db);
const cloudRepo = new CloudPackageRepository(db);

// Automatically clean up expired store-and-forward packages on startup and every 15 minutes
cloudRepo.cleanupExpiredPackages();
setInterval(() => {
  try {
    cloudRepo.cleanupExpiredPackages();
  } catch {
    // Ignore background cleanup errors
  }
}, 15 * 60 * 1000).unref();

// Session Manager for live WebRTC signaling sessions
const sessionExpirySeconds = parseInt(process.env.SESSION_EXPIRY_SECONDS || '300', 10);
const sessionManager = new SessionManager(sessionExpirySeconds);

// Public limits (50GB default for high-speed P2P & store-and-forward)
const maxFilesCount = parseInt(process.env.MAX_FILES_COUNT || '100', 10);
const maxTotalSizeBytes = parseInt(process.env.MAX_TOTAL_SIZE_BYTES || '53687091200', 10); // 50 GB
const maxFileSizeBytes = parseInt(process.env.MAX_FILE_SIZE_BYTES || '53687091200', 10); // 50 GB

const stunServers = (process.env.STUN_SERVERS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const turnServerUrl = process.env.TURN_SERVER_URL || '';
const turnUsername = process.env.TURN_USERNAME || '';
const turnCredential = process.env.TURN_CREDENTIAL || '';

// System & Public Config APIs
app.get('/api/config', (req, res) => {
  const rawProto = String(req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http'))
    .split(',')[0]
    .trim()
    .toLowerCase();
  const proto = rawProto === 'https' ? 'https' : 'http';

  const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`)
    .split(',')[0]
    .trim();
  const host = /^[a-zA-Z0-9.\-[\]]+(:\d{1,5})?$/.test(rawHost) ? rawHost : `localhost:${PORT}`;

  const detectedOrigin = `${proto}://${host}`;
  const lanIp = getLocalLanIp();
  const lanAppUrl = lanIp ? `${proto}://${lanIp}:${PORT}` : null;

  // If host is localhost/127.0.0.1 and not custom configured, provide lanAppUrl for cross-device QR scanning
  const configuredAppUrl = (process.env.APP_URL && process.env.APP_URL !== 'https://example.com')
    ? process.env.APP_URL.replace(/\/$/, '')
    : null;

  const appUrl = configuredAppUrl || (host.includes('localhost') || host.includes('127.0.0.1') ? (lanAppUrl || detectedOrigin) : detectedOrigin);

  res.json({
    appUrl,
    lanAppUrl: lanAppUrl || appUrl,
    lanIp,
    maxFilesCount,
    maxTotalSizeBytes,
    maxFileSizeBytes,
    sessionExpirySeconds,
    turnConfigured: Boolean(turnServerUrl && turnUsername && turnCredential),
    stunServers
  });
});

app.get('/api/turn-credentials', (_req, res) => {
  const iceServers: RTCIceServer[] = stunServers.map((url) => ({ urls: url }));

  if (turnServerUrl && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnServerUrl,
      username: turnUsername,
      credential: turnCredential
    });
  }

  res.json({ iceServers });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), database: 'sqlite-connected' });
});

// Mount full-featured API router for auth, dashboard, transfers, devices, privacy, and chunked cloud storage
app.use('/api', createApiRouter(userRepo, transferRepo, deviceRepo, cloudRepo));

const server = http.createServer(app);

// Mount WebSocket Signaling Server on /ws/signaling
const wss = new WebSocketServer({ server, path: '/ws/signaling' });
setupSignaling(wss, sessionManager);

async function startServer() {
  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch:
          process.env.DISABLE_HMR === 'true'
            ? null
            : {
                ignored: ['**/data/**', '**/uploads/**', '**/*.sqlite', '**/*.sqlite-*']
              }
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    const lanIp = getLocalLanIp();
    console.log(`[SwiftDrop] Server listening on:`);
    console.log(`  - Local:   http://localhost:${PORT}`);
    if (lanIp) {
      console.log(`  - Network: http://${lanIp}:${PORT}`);
    }
  });
}

startServer().catch((err) => {
  console.error('[SwiftDrop] Failed to start server:', err);
  process.exit(1);
});
