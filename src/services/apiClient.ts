const AUTH_TOKEN_STORAGE_KEY = 'swiftdrop_auth_token';

export function getStoredAuthToken(): string | null {
  try {
    return (
      sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ||
      localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ||
      null
    );
  } catch {
    return null;
  }
}

export function setStoredAuthToken(token: string | null, rememberMe = true): void {
  try {
    sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    if (token) {
      if (rememberMe) {
        localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
      } else {
        sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
      }
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function buildAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extraHeaders };
  const token = getStoredAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export const apiClient = {
  async fetchDashboardSummary() {
    const res = await fetch('/api/dashboard/summary', {
      headers: buildAuthHeaders(),
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('Failed to load dashboard metrics');
    return res.json();
  },

  async fetchRecentActivity() {
    const res = await fetch('/api/dashboard/recent-activity', {
      headers: buildAuthHeaders(),
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('Failed to load recent activity');
    return res.json();
  },

  async fetchTransfers(params: { direction?: string; status?: string; search?: string; limit?: number; offset?: number } = {}) {
    const query = new URLSearchParams();
    if (params.direction) query.set('direction', params.direction);
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    if (params.limit) query.set('limit', String(params.limit));
    if (params.offset) query.set('offset', String(params.offset));

    const res = await fetch(`/api/transfers?${query.toString()}`, {
      headers: buildAuthHeaders(),
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('Failed to fetch transfers');
    return res.json();
  },

  async fetchTransferDetails(transferId: string) {
    const res = await fetch(`/api/transfers/${transferId}`, {
      headers: buildAuthHeaders(),
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('Failed to fetch transfer details');
    return res.json();
  },

  async downloadTransferReceipt(transferId: string) {
    const res = await fetch(`/api/transfers/${transferId}/receipt`, {
      headers: buildAuthHeaders(),
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('Failed to download transfer receipt');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transfer-receipt-${transferId.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  },

  async deleteTransfer(transferId: string) {
    const res = await fetch(`/api/transfers/${transferId}`, {
      method: 'DELETE',
      headers: buildAuthHeaders(),
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('Failed to delete transfer record');
    return res.json();
  },

  async clearAllTransfers() {
    const res = await fetch('/api/transfers', {
      method: 'DELETE',
      headers: buildAuthHeaders(),
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('Failed to clear transfer history');
    return res.json();
  },

  async recordTransfer(payload: {
    sessionId?: string;
    direction: 'sent' | 'received';
    files: Array<{ name: string; size: number; mimeType?: string }>;
    senderDeviceLabel?: string;
    receiverDeviceLabel?: string;
  }) {
    const res = await fetch('/api/transfers', {
      method: 'POST',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });
    if (!res.ok) return null;
    return res.json();
  },

  async updateTransferStatus(transferId: string, payload: {
    status: 'completed' | 'failed' | 'cancelled';
    totalBytes?: number;
    failureCode?: string;
    filesStatus?: Array<{
      fileId: string;
      verificationStatus?: 'verified' | 'failed' | 'skipped';
      transferStatus?: 'completed' | 'failed' | 'cancelled';
      savedStatus?: 'saved' | 'download_initiated' | 'unknown';
    }>;
  }) {
    const res = await fetch(`/api/transfers/${transferId}/status`, {
      method: 'PATCH',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });
    if (!res.ok) return null;
    return res.json();
  },

  async fetchDevices() {
    const res = await fetch('/api/devices', {
      headers: buildAuthHeaders(),
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('Failed to fetch devices');
    return res.json();
  },

  async saveDevice(label: string, metadata?: string) {
    const res = await fetch('/api/devices', {
      method: 'POST',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
      body: JSON.stringify({ label, metadata })
    });
    if (!res.ok) throw new Error('Failed to save device label');
    return res.json();
  },

  async updateDevice(id: string, label: string) {
    const res = await fetch(`/api/devices/${id}`, {
      method: 'PATCH',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
      body: JSON.stringify({ label })
    });
    if (!res.ok) throw new Error('Failed to update device label');
    return res.json();
  },

  async deleteDevice(id: string) {
    const res = await fetch(`/api/devices/${id}`, {
      method: 'DELETE',
      headers: buildAuthHeaders(),
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('Failed to delete device');
    return res.json();
  },

  async fetchSessions() {
    const res = await fetch('/api/user/sessions', {
      headers: buildAuthHeaders(),
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('Failed to fetch sessions');
    return res.json();
  },

  async revokeSession(id: string) {
    const res = await fetch(`/api/user/sessions/${id}`, {
      method: 'DELETE',
      headers: buildAuthHeaders(),
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('Failed to revoke session');
    return res.json();
  },

  async logoutOtherSessions() {
    const res = await fetch('/api/user/logout-other-sessions', {
      method: 'POST',
      headers: buildAuthHeaders(),
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('Failed to logout other sessions');
    return res.json();
  },

  async updateProfile(displayName: string) {
    const res = await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
      body: JSON.stringify({ displayName })
    });
    if (!res.ok) throw new Error('Failed to update profile');
    return res.json();
  },

  async changePassword(currentPassword: string, newPassword: string) {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to change password');
    return data;
  },

  async exportUserData() {
    const res = await fetch('/api/user/export', {
      headers: buildAuthHeaders(),
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('Failed to export data');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `swiftdrop-data-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  },

  async deleteAccount(password: string) {
    const res = await fetch('/api/user/account', {
      method: 'DELETE',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete account');
    return data;
  }
};
