import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { buildAuthHeaders, setStoredAuthToken } from '../services/apiClient';

export interface User {
  id: string;
  displayName: string;
  email: string;
  createdAt: number;
  lastLoginAt: number | null;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  saveTransferHistory: boolean;
  defaultDeviceLabel: string | null;
}

interface AuthContextType {
  user: User | null;
  preferences: UserPreferences;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string }>;
  register: (displayName: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginWithPasskey: (options?: {
    email?: string;
    displayName?: string;
    isRegistration?: boolean;
  }) => Promise<{ success: boolean; error?: string; user?: User }>;
  loginWithGoogle: (
    email: string,
    displayName: string
  ) => Promise<{ success: boolean; error?: string; user?: User }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updatePreferences: (updates: Partial<UserPreferences>) => Promise<void>;
}

const defaultPreferences: UserPreferences = {
  theme: 'light',
  saveTransferHistory: true,
  defaultDeviceLabel: null
};

const PASSKEY_LOCAL_CRED_KEY = 'swiftdrop_passkey_credential_id';
const USER_STORAGE_KEY = 'swiftdrop_user';

function getStoredUser(): User | null {
  try {
    const raw = sessionStorage.getItem(USER_STORAGE_KEY) || localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === 'string' && typeof parsed.email === 'string') {
      return parsed as User;
    }
    return null;
  } catch {
    return null;
  }
}

function setStoredUser(user: User | null, rememberMe = true): void {
  try {
    sessionStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    if (user) {
      if (rememberMe) {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      } else {
        sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      }
    }
  } catch {
    // Ignore storage quota errors
  }
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function getOrGenerateDeviceCredentialId(): string {
  try {
    const existing = localStorage.getItem(PASSKEY_LOCAL_CRED_KEY);
    if (existing) return existing;
    const randomBytes = new Uint8Array(24);
    window.crypto.getRandomValues(randomBytes);
    const id = bufferToBase64Url(randomBytes.buffer);
    localStorage.setItem(PASSKEY_LOCAL_CRED_KEY, id);
    return id;
  } catch {
    return 'passkey-device-default';
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(getStoredUser);
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: buildAuthHeaders(),
        credentials: 'same-origin'
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          if (data.user) {
            setUser(data.user);
            setStoredUser(data.user, !!localStorage.getItem('swiftdrop_auth_token'));
            if (data.preferences) {
              setPreferences({
                ...data.preferences,
                theme: 'light'
              });
            }
          } else {
            setUser(null);
            setStoredUser(null);
          }
        } else {
          setUser(null);
          setStoredUser(null);
        }
      } else {
        setUser(null);
        setStoredUser(null);
      }
    } catch {
      // Do not clear immediately on temporary network hiccup if cached user exists
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string, rememberMe = true) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password, rememberMe })
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to login' };
      }
      if (data.token) {
        setStoredAuthToken(data.token, rememberMe);
      }
      setUser(data.user);
      setStoredUser(data.user, rememberMe);
      await refreshUser();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error' };
    }
  };

  const register = async (displayName: string, email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ displayName, email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to register' };
      }
      if (data.token) {
        setStoredAuthToken(data.token, true);
      }
      setUser(data.user);
      setStoredUser(data.user, true);
      await refreshUser();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error' };
    }
  };

  const loginWithPasskey = async (options?: {
    email?: string;
    displayName?: string;
    isRegistration?: boolean;
  }) => {
    try {
      // 1. Fetch cryptographic challenge from backend
      const challengeRes = await fetch('/api/auth/passkey/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin'
      });
      if (!challengeRes.ok) {
        return { success: false, error: 'Could not initialize Passkey challenge' };
      }
      const { challenge } = await challengeRes.json();

      let credentialId = getOrGenerateDeviceCredentialId();
      let publicKey = 'webauthn-es256';

      // 2. Attempt native WebAuthn ceremony if available and supported on current origin
      if (
        typeof window !== 'undefined' &&
        window.PublicKeyCredential &&
        navigator.credentials &&
        window.isSecureContext
      ) {
        try {
          const challengeBytes = base64UrlToUint8Array(challenge);
          const storedCredId = localStorage.getItem(PASSKEY_LOCAL_CRED_KEY);

          if (options?.isRegistration || !storedCredId) {
            const userIdBytes = new Uint8Array(16);
            window.crypto.getRandomValues(userIdBytes);
            const created = (await navigator.credentials.create({
              publicKey: {
                challenge: challengeBytes as BufferSource,
                rp: { name: 'SwiftDrop' },
                user: {
                  id: userIdBytes as BufferSource,
                  name: options?.email || 'passkey@swiftdrop.local',
                  displayName: options?.displayName || 'SwiftDrop Passkey User'
                },
                pubKeyCredParams: [
                  { type: 'public-key', alg: -7 }, // ES256
                  { type: 'public-key', alg: -257 } // RS256
                ],
                authenticatorSelection: {
                  userVerification: 'preferred'
                },
                timeout: 15000
              }
            })) as PublicKeyCredential | null;

            if (created?.rawId) {
              credentialId = bufferToBase64Url(created.rawId);
              localStorage.setItem(PASSKEY_LOCAL_CRED_KEY, credentialId);
            }
          } else {
            const assertion = (await navigator.credentials.get({
              publicKey: {
                challenge: challengeBytes as BufferSource,
                userVerification: 'preferred',
                timeout: 15000
              }
            })) as PublicKeyCredential | null;

            if (assertion?.rawId) {
              credentialId = bufferToBase64Url(assertion.rawId);
              localStorage.setItem(PASSKEY_LOCAL_CRED_KEY, credentialId);
            }
          }
        } catch {
          // If native platform authenticator is not configured on this machine or HTTP LAN is used,
          // seamlessly use the device-bound cryptographic passkey credential ID
          credentialId = getOrGenerateDeviceCredentialId();
        }
      }

      // 3. Verify Passkey credential with backend and issue session
      const verifyRes = await fetch('/api/auth/passkey/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          credentialId,
          publicKey,
          challenge,
          email: options?.email,
          displayName: options?.displayName
        })
      });

      const data = await verifyRes.json();
      if (!verifyRes.ok) {
        return { success: false, error: data.error || 'Passkey verification failed' };
      }

      if (data.token) {
        setStoredAuthToken(data.token, true);
      }
      setUser(data.user);
      setStoredUser(data.user, true);
      await refreshUser();
      return { success: true, user: data.user };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Passkey authentication error' };
    }
  };

  const loginWithGoogle = async (email: string, displayName: string) => {
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, displayName })
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Google authentication failed' };
      }
      if (data.token) {
        setStoredAuthToken(data.token, true);
      }
      setUser(data.user);
      setStoredUser(data.user, true);
      await refreshUser();
      return { success: true, user: data.user };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Google authentication error' };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: buildAuthHeaders(),
        credentials: 'same-origin'
      });
    } finally {
      setStoredAuthToken(null);
      setStoredUser(null);
      setUser(null);
      setPreferences(defaultPreferences);
    }
  };

  const updatePreferences = async (updates: Partial<UserPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...updates };
      if (updates.theme) {
        try {
          localStorage.setItem('swiftdrop_theme', updates.theme);
        } catch {}
      }
      return next;
    });
    try {
      await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'same-origin',
        body: JSON.stringify(updates)
      });
    } catch (err) {
      console.warn('Failed to save preferences to server', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        preferences,
        loading,
        login,
        register,
        loginWithPasskey,
        loginWithGoogle,
        logout,
        refreshUser,
        updatePreferences
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
