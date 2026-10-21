import { ServerPublicConfig } from '../types/transfer';

let cachedConfig: ServerPublicConfig | null = null;
let cachedIceServers: RTCIceServer[] | null = null;

export async function fetchServerConfig(): Promise<ServerPublicConfig> {
  if (cachedConfig) return cachedConfig;

  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error(`Config API returned status ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) throw new Error('Config API returned non-JSON response');
    const data = await res.json();
    cachedConfig = data;
    return data;
  } catch (err) {
    console.warn('[SwiftDrop] Using fallback config:', err);
    const fallback: ServerPublicConfig = {
      appUrl: window.location.origin,
      maxFilesCount: 50,
      maxTotalSizeBytes: 10 * 1024 * 1024 * 1024,
      maxFileSizeBytes: 5 * 1024 * 1024 * 1024,
      sessionExpirySeconds: 300,
      turnConfigured: false,
      stunServers: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']
    };
    cachedConfig = fallback;
    return fallback;
  }
}

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  if (cachedIceServers) return cachedIceServers;

  try {
    const res = await fetch('/api/turn-credentials');
    if (!res.ok) throw new Error(`Turn credentials returned status ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) throw new Error('Turn credentials returned non-JSON response');
    const data = await res.json();
    cachedIceServers = data.iceServers;
    return data.iceServers;
  } catch (err) {
    console.warn('[SwiftDrop] Using default STUN servers:', err);
    const fallback: RTCIceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];
    cachedIceServers = fallback;
    return fallback;
  }
}
