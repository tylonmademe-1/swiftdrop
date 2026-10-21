export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  if (bytes < 0 || isNaN(bytes)) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);

  return `${parseFloat(val.toFixed(dm))} ${sizes[i] || 'TB'}`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0 || isNaN(bytesPerSec)) return '0 B/s';
  return `${formatBytes(bytesPerSec, 1)}/s`;
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0 || isNaN(seconds) || !isFinite(seconds)) return '0s';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return `${mins}m ${secs}s`;
}

export function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Web Browser';

  try {
    const customLabel = typeof localStorage !== 'undefined' ? localStorage.getItem('swiftdrop_device_name') : null;
    if (customLabel && customLabel.trim()) {
      return customLabel.trim();
    }
  } catch {}

  const ua = navigator.userAgent || '';
  let os = 'Device';
  let browser = 'Browser';

  if (/iPhone/i.test(ua)) {
    os = 'iPhone';
  } else if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
    os = 'iPad';
  } else if (/Android/i.test(ua)) {
    const modelMatch = ua.match(/;\s*([^;)]+?)\s+Build\//i);
    const model = modelMatch?.[1]?.trim();
    os = model && model.length <= 20 && !/^wv$/i.test(model) ? `Android (${model})` : 'Android';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'MacBook';
  } else if (/Windows/i.test(ua)) {
    os = 'Windows PC';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux PC';
  }

  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua) && !/Chromium\//i.test(ua)) browser = 'Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';

  return `${browser} • ${os}`;
}

export function getDeviceInstanceId(): string {
  const key = 'swiftdrop_device_instance_id';
  try {
    if (typeof localStorage !== 'undefined') {
      let existing = localStorage.getItem(key);
      if (!existing) {
        existing = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(key, existing);
      }
      return existing;
    }
  } catch {}
  return 'dev-local';
}

export type FileCategory = 'image' | 'video' | 'audio' | 'pdf' | 'doc' | 'archive' | 'code' | 'file';

export function getFileCategory(name: string, type: string): FileCategory {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return 'pdf';

  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) return 'archive';
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'pages'].includes(ext)) return 'doc';
  if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'py', 'java', 'c', 'cpp', 'rs', 'go'].includes(ext)) return 'code';

  return 'file';
}
