import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

interface AuthPageProps {
  onNavigate: (route: string) => void;
}

interface GoogleIdentityModalProps {
  isOpen: boolean;
  initialEmail?: string;
  initialName?: string;
  onClose: () => void;
  onSelectAccount: (email: string, displayName: string) => Promise<void>;
}

const GoogleIdentityModal: React.FC<GoogleIdentityModalProps> = ({
  isOpen,
  initialEmail = '',
  initialName = '',
  onClose,
  onSelectAccount
}) => {
  const [customMode, setCustomMode] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [name, setName] = useState(initialName);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setEmail(initialEmail);
      setName(initialName);
      setCustomMode(Boolean(initialEmail));
    }
  }, [isOpen, initialEmail, initialName]);

  if (!isOpen) return null;

  const savedAccounts = [
    { name: 'Alex Miller', email: 'alex.miller@gmail.com' },
    { name: 'Taylor SwiftDrop', email: 'taylor@workspace.dev' }
  ];

  const handleQuickSelect = async (accEmail: string, accName: string) => {
    setIsLoading(true);
    try {
      await onSelectAccount(accEmail, accName);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) return;
    setIsLoading(true);
    try {
      const displayName = name.trim() || email.trim().split('@')[0];
      await onSelectAccount(email.trim(), displayName);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141413]/40 backdrop-blur-xs"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[23rem] bg-white rounded-2xl p-6 border border-[#e6dfd8] shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between border-b border-[#ebe6df] pb-3">
          <div className="flex items-center gap-2.5">
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" fill="#4285F4" />
              <path d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" fill="#34A853" />
              <path d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z" fill="#FBBC05" />
              <path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" fill="#EA4335" />
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-[#141413]">Sign in with Google</h3>
              <p className="text-[11px] text-[#6c6a64]">Choose an account to continue to SwiftDrop</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#6c6a64] hover:text-[#141413] p-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {!customMode ? (
          <div className="space-y-2">
            {savedAccounts.map((acc) => (
              <button
                key={acc.email}
                type="button"
                disabled={isLoading}
                onClick={() => handleQuickSelect(acc.email, acc.name)}
                className="w-full p-3 rounded-xl bg-[#faf9f5] hover:bg-[#f5f0e8] border border-[#e6dfd8] flex items-center gap-3 text-left transition-colors cursor-pointer disabled:opacity-50"
              >
                <div className="w-9 h-9 rounded-full bg-[#cc785c] text-white font-semibold text-xs flex items-center justify-center shrink-0">
                  {acc.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[#141413] truncate">{acc.name}</p>
                  <p className="text-[11px] text-[#6c6a64] truncate">{acc.email}</p>
                </div>
              </button>
            ))}

            <button
              type="button"
              onClick={() => setCustomMode(true)}
              className="w-full p-2.5 rounded-xl bg-white hover:bg-[#faf9f5] border border-[#e6dfd8] flex items-center justify-center gap-2 text-xs font-medium text-[#141413] transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px] text-[#cc785c]">person_add</span>
              <span>Use another Google account</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleCustomSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#3d3d3a] mb-1">Your Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Miller"
                className="w-full h-10 px-3 rounded-lg bg-[#faf9f5] text-[#141413] text-sm border border-[#e6dfd8] focus:outline-none focus:border-[#cc785c]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#3d3d3a] mb-1">Google Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@gmail.com"
                className="w-full h-10 px-3 rounded-lg bg-[#faf9f5] text-[#141413] text-sm border border-[#e6dfd8] focus:outline-none focus:border-[#cc785c]"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCustomMode(false)}
                className="px-3 py-2 text-xs text-[#6c6a64] hover:text-[#141413] cursor-pointer"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 rounded-lg text-white text-xs font-medium bg-[#cc785c] hover:bg-[#b8654a] transition-colors cursor-pointer disabled:opacity-50"
              >
                {isLoading ? 'Signing in...' : 'Continue'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export const LoginPage: React.FC<AuthPageProps> = ({ onNavigate }) => {
  const { login, loginWithPasskey, loginWithGoogle } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const res = await login(email, password, rememberMe);
    setIsSubmitting(false);

    if (res.success) {
      showToast('Welcome back to SwiftDrop!', 'success');
      onNavigate('home');
    } else {
      showToast(res.error || 'Invalid credentials', 'error');
    }
  };

  const handlePasskeyClick = async () => {
    setIsPasskeyLoading(true);
    const res = await loginWithPasskey({
      email: email.trim() || undefined
    });
    setIsPasskeyLoading(false);

    if (res.success) {
      showToast('Authenticated securely via Passkey', 'success');
      onNavigate('home');
    } else {
      showToast(res.error || 'Passkey verification failed', 'error');
    }
  };

  const handleGoogleAccountSelect = async (selectedEmail: string, selectedName: string) => {
    const res = await loginWithGoogle(selectedEmail, selectedName);
    if (res.success) {
      setIsGoogleModalOpen(false);
      showToast(`Signed in as ${selectedName}`, 'success');
      onNavigate('home');
    } else {
      showToast(res.error || 'Google sign-in failed', 'error');
    }
  };

  return (
    <div className="relative w-full flex-1 flex flex-col justify-start sm:justify-center items-center py-6 sm:py-12 px-3 sm:px-6 overflow-x-hidden">
      {/* Subtle ambient glow matching SCREEN_2 */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-full max-w-[33.75rem] h-[22.5rem] rounded-full bg-gradient-to-b from-[#cc785c]/8 via-[#e8a55a]/6 to-transparent blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-[26.25rem] mx-auto z-10 flex flex-col items-center">
        {/* Editorial Header */}
        <div className="relative z-10 text-center mb-5 sm:mb-7 max-w-sm">
          <h1 className="font-display text-[30px] sm:text-[38px] tracking-tight text-[#141413] font-normal leading-tight">
            Sign in to SwiftDrop
          </h1>
          <p className="mt-1.5 text-xs text-[#6c6a64] font-sans">
            @ tylonmademe "auth"
          </p>
        </div>

        {/* Authentication Card matching RegisterPage */}
        <div className="relative z-10 w-full bg-white rounded-2xl p-5 sm:p-8 shadow-[0_2px_16px_rgba(20,20,19,0.04)] border border-[#e6dfd8]">
          {/* Fast Auth Options */}
          <div className="grid grid-cols-2 gap-3">
            {/* Passkey button */}
            <button
              type="button"
              onClick={handlePasskeyClick}
              disabled={isPasskeyLoading}
              className="h-11 px-3 rounded-lg bg-[#f5f0e8] hover:bg-[#e8e0d2]/70 border border-[#ebe6df] transition-all flex items-center justify-center gap-2 text-[#141413] group cursor-pointer active:scale-[0.98]"
            >
              {isPasskeyLoading ? (
                <>
                  <span className="material-symbols-outlined text-[#cc785c] text-[19px] animate-spin">sync</span>
                  <span className="text-xs font-medium">Verifying...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[#cc785c] text-[19px]">fingerprint</span>
                  <span className="text-xs font-medium">Passkey</span>
                </>
              )}
            </button>

            {/* Google button */}
            <button
              type="button"
              onClick={() => setIsGoogleModalOpen(true)}
              className="h-11 px-3 rounded-lg bg-[#f5f0e8] hover:bg-[#e8e0d2]/70 border border-[#ebe6df] transition-all flex items-center justify-center gap-2 text-[#141413] group cursor-pointer active:scale-[0.98]"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" fill="#4285F4" />
                <path d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" fill="#34A853" />
                <path d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z" fill="#FBBC05" />
                <path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" fill="#EA4335" />
              </svg>
              <span className="text-xs font-medium">Google</span>
            </button>
          </div>

          {/* Divider */}
          <div className="relative my-5 flex items-center justify-center">
            <div className="w-full h-px bg-[#ebe6df]" />
            <span className="absolute bg-white px-2.5 text-[11px] font-semibold text-[#8e8b82] tracking-wider uppercase">
              OR
            </span>
          </div>

          {/* Credentials Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            {/* Email field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#3d3d3a]" htmlFor="email-field">
                Email
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3 text-[17px] text-[#8e8b82] pointer-events-none">
                  mail
                </span>
                <input
                  id="email-field"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full h-11 pl-9 pr-3 rounded-lg bg-[#faf9f5] text-[#141413] placeholder:text-[#8e8b82] text-sm border border-[#e6dfd8] focus:outline-none focus:border-[#cc785c] focus:ring-1 focus:ring-[#cc785c]/30 transition-colors"
                />
              </div>
            </div>

            {/* Password field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#3d3d3a]" htmlFor="password-field">
                Password
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3 text-[17px] text-[#8e8b82] pointer-events-none">
                  lock
                </span>
                <input
                  id="password-field"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-11 pl-9 pr-9 rounded-lg bg-[#faf9f5] text-[#141413] placeholder:text-[#8e8b82] text-sm border border-[#e6dfd8] focus:outline-none focus:border-[#cc785c] focus:ring-1 focus:ring-[#cc785c]/30 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                  className="absolute right-2.5 text-[#6c6a64] hover:text-[#141413] transition-colors cursor-pointer flex items-center justify-center p-1"
                >
                  <span className="material-symbols-outlined text-[17px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {/* Remember me & Forgot Password */}
            <div className="flex items-center justify-between pt-0.5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-[#cc785c] focus:ring-[#cc785c]/20 accent-[#cc785c] border-[#e6dfd8] cursor-pointer"
                />
                <span className="text-xs text-[#6c6a64] hover:text-[#3d3d3a]">Remember me</span>
              </label>
              <button
                type="button"
                onClick={() => onNavigate('forgot-password')}
                className="text-xs text-[#cc785c] hover:text-[#b8654a] transition-colors font-medium cursor-pointer"
              >
                Forgot password?
              </button>
            </div>

            {/* Primary Action CTA */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full h-11 rounded-lg text-white font-medium text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-[0.99] hover:opacity-95 disabled:opacity-50"
              style={{ backgroundColor: 'rgb(204, 120, 92)' }}
            >
              {isSubmitting ? (
                <>
                  <span className="material-symbols-outlined text-[17px] animate-spin">sync</span>
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>
        </div>

        {/* Simplified Bottom Link */}
        <div className="relative z-10 mt-6 text-center">
          <p className="text-xs text-[#6c6a64]">
            Don't have an account?{' '}
            <button
              type="button"
              onClick={() => onNavigate('register')}
              className="font-medium text-[#cc785c] hover:text-[#b8654a] transition-colors ml-0.5 cursor-pointer"
            >
              Create one
            </button>
          </p>
        </div>
      </div>

      <GoogleIdentityModal
        isOpen={isGoogleModalOpen}
        initialEmail={email}
        onClose={() => setIsGoogleModalOpen(false)}
        onSelectAccount={handleGoogleAccountSelect}
      />
    </div>
  );
};

export const RegisterPage: React.FC<AuthPageProps> = ({ onNavigate }) => {
  const { register, loginWithPasskey, loginWithGoogle } = useAuth();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [policyModal, setPolicyModal] = useState<'terms' | 'privacy' | null>(null);

  // Password score calculation
  const getPasswordScore = () => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  };

  const pwScore = getPasswordScore();

  const getStrengthLabel = () => {
    if (password.length === 0) return '8+ characters';
    if (pwScore <= 1) return 'Weak';
    if (pwScore <= 3) return 'Moderate';
    return 'Strong';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreeTerms) {
      showToast('Please accept the Terms & Privacy Policy to continue', 'error');
      return;
    }
    setIsSubmitting(true);
    const res = await register(name, email, password);
    setIsSubmitting(false);

    if (res.success) {
      showToast('Account created successfully! Welcome to SwiftDrop', 'success');
      onNavigate('home');
    } else {
      showToast(res.error || 'Failed to create account', 'error');
    }
  };

  const handlePasskeyClick = async () => {
    if (!agreeTerms) {
      showToast('Please accept the Terms & Privacy Policy to continue', 'error');
      return;
    }
    setIsPasskeyLoading(true);
    const res = await loginWithPasskey({
      email: email.trim() || undefined,
      displayName: name.trim() || undefined,
      isRegistration: true
    });
    setIsPasskeyLoading(false);

    if (res.success) {
      showToast('Account enrolled with Passkey biometric credentials', 'success');
      onNavigate('home');
    } else {
      showToast(res.error || 'Passkey enrollment failed', 'error');
    }
  };

  const handleGoogleAccountSelect = async (selectedEmail: string, selectedName: string) => {
    const res = await loginWithGoogle(selectedEmail, selectedName);
    if (res.success) {
      setIsGoogleModalOpen(false);
      showToast(`Account ready via Google Identity (${selectedName})`, 'success');
      onNavigate('home');
    } else {
      showToast(res.error || 'Google registration failed', 'error');
    }
  };

  return (
    <div className="relative w-full flex-1 flex flex-col justify-start sm:justify-center items-center py-6 sm:py-12 px-3 sm:px-6 overflow-x-hidden">
      {/* Subtle ambient glow matching SCREEN_2 */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-full max-w-[33.75rem] h-[22.5rem] rounded-full bg-gradient-to-b from-[#cc785c]/8 via-[#e8a55a]/6 to-transparent blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-[26.25rem] mx-auto z-10 flex flex-col items-center">
        {/* Editorial Header */}
        <div className="relative z-10 text-center mb-5 sm:mb-7 max-w-sm">
          <h1 className="font-display text-[30px] sm:text-[38px] tracking-tight text-[#141413] font-normal leading-tight">
            Create your account
          </h1>
          <p className="mt-1.5 text-xs text-[#6c6a64] font-sans">
            @ tylonmademe "auth"
          </p>
        </div>

        {/* Authentication Card matching SCREEN_2 */}
        <div className="relative z-10 w-full bg-white rounded-2xl p-5 sm:p-8 shadow-[0_2px_16px_rgba(20,20,19,0.04)] border border-[#e6dfd8]">
          {/* Fast Auth Options */}
          <div className="grid grid-cols-2 gap-3">
            {/* Passkey button */}
            <button
              type="button"
              onClick={handlePasskeyClick}
              disabled={isPasskeyLoading}
              className="h-11 px-3 rounded-lg bg-[#f5f0e8] hover:bg-[#e8e0d2]/70 border border-[#ebe6df] transition-all flex items-center justify-center gap-2 text-[#141413] group cursor-pointer active:scale-[0.98]"
            >
              {isPasskeyLoading ? (
                <>
                  <span className="material-symbols-outlined text-[#cc785c] text-[19px] animate-spin">sync</span>
                  <span className="text-xs font-medium">Enrolling...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[#cc785c] text-[19px]">fingerprint</span>
                  <span className="text-xs font-medium">Passkey</span>
                </>
              )}
            </button>

            {/* Google button */}
            <button
              type="button"
              onClick={() => {
                if (!agreeTerms) {
                  showToast('Please accept the Terms & Privacy Policy to continue', 'error');
                  return;
                }
                setIsGoogleModalOpen(true);
              }}
              className="h-11 px-3 rounded-lg bg-[#f5f0e8] hover:bg-[#e8e0d2]/70 border border-[#ebe6df] transition-all flex items-center justify-center gap-2 text-[#141413] group cursor-pointer active:scale-[0.98]"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" fill="#4285F4" />
                <path d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" fill="#34A853" />
                <path d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z" fill="#FBBC05" />
                <path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" fill="#EA4335" />
              </svg>
              <span className="text-xs font-medium">Google</span>
            </button>
          </div>

          {/* Divider */}
          <div className="relative my-5 flex items-center justify-center">
            <div className="w-full h-px bg-[#ebe6df]" />
            <span className="absolute bg-white px-2.5 text-[11px] font-semibold text-[#8e8b82] tracking-wider uppercase">
              OR
            </span>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            {/* Full Name field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#3d3d3a]" htmlFor="name-field">
                Full Name
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3 text-[17px] text-[#8e8b82] pointer-events-none">
                  person
                </span>
                <input
                  id="name-field"
                  type="text"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Miller"
                  className="w-full h-11 pl-9 pr-3 rounded-lg bg-[#faf9f5] text-[#141413] placeholder:text-[#8e8b82] text-sm border border-[#e6dfd8] focus:outline-none focus:border-[#cc785c] focus:ring-1 focus:ring-[#cc785c]/30 transition-colors"
                />
              </div>
            </div>

            {/* Email field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#3d3d3a]" htmlFor="reg-email-field">
                Email
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3 text-[17px] text-[#8e8b82] pointer-events-none">
                  mail
                </span>
                <input
                  id="reg-email-field"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full h-11 pl-9 pr-3 rounded-lg bg-[#faf9f5] text-[#141413] placeholder:text-[#8e8b82] text-sm border border-[#e6dfd8] focus:outline-none focus:border-[#cc785c] focus:ring-1 focus:ring-[#cc785c]/30 transition-colors"
                />
              </div>
            </div>

            {/* Password field */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[#3d3d3a]" htmlFor="reg-password-field">
                  Password
                </label>
                <span
                  className={`text-[11px] ${
                    pwScore <= 1 ? 'text-[#c64545]' : pwScore <= 3 ? 'text-[#d4a017]' : 'text-[#5db872]'
                  }`}
                >
                  {getStrengthLabel()}
                </span>
              </div>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3 text-[17px] text-[#8e8b82] pointer-events-none">
                  lock
                </span>
                <input
                  id="reg-password-field"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-11 pl-9 pr-9 rounded-lg bg-[#faf9f5] text-[#141413] placeholder:text-[#8e8b82] text-sm border border-[#e6dfd8] focus:outline-none focus:border-[#cc785c] focus:ring-1 focus:ring-[#cc785c]/30 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                  className="absolute right-2.5 text-[#6c6a64] hover:text-[#141413] transition-colors cursor-pointer flex items-center justify-center p-1"
                >
                  <span className="material-symbols-outlined text-[17px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>

              {/* Password strength meter bars */}
              <div className="flex gap-1.5 pt-1">
                {[0, 1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className={`h-1 flex-1 rounded-full transition-all ${
                      idx < pwScore
                        ? pwScore <= 2
                          ? 'bg-[#e8a55a]'
                          : 'bg-[#5db872]'
                        : 'bg-[#efeeea]'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Terms Checkbox */}
            <div className="flex items-center gap-2 pt-0.5">
              <input
                id="agree-terms"
                type="checkbox"
                required
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-[#cc785c] focus:ring-[#cc785c]/20 accent-[#cc785c] border-[#e6dfd8] cursor-pointer"
              />
              <label htmlFor="agree-terms" className="text-xs text-[#6c6a64] hover:text-[#3d3d3a] cursor-pointer select-none">
                I agree to the{' '}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setPolicyModal('terms');
                  }}
                  className="text-[#141413] hover:text-[#cc785c] underline underline-offset-2 transition-colors cursor-pointer"
                >
                  Terms
                </button>{' '}
                &amp;{' '}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setPolicyModal('privacy');
                  }}
                  className="text-[#141413] hover:text-[#cc785c] underline underline-offset-2 transition-colors cursor-pointer"
                >
                  Privacy Policy
                </button>
              </label>
            </div>

            {/* Primary CTA Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full h-11 rounded-lg text-white font-medium text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-[0.99] hover:opacity-95 disabled:opacity-50"
              style={{ backgroundColor: 'rgb(204, 120, 92)' }}
            >
              {isSubmitting ? (
                <>
                  <span className="material-symbols-outlined text-[17px] animate-spin">sync</span>
                  <span>Creating Account...</span>
                </>
              ) : (
                <span>Create Account</span>
              )}
            </button>
          </form>
        </div>

        {/* Simplified Bottom Link matching SCREEN_2 */}
        <div className="relative z-10 mt-6 text-center">
          <p className="text-xs text-[#6c6a64]">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="font-medium text-[#cc785c] hover:text-[#b8654a] transition-colors ml-0.5 cursor-pointer"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>

      <GoogleIdentityModal
        isOpen={isGoogleModalOpen}
        initialEmail={email}
        initialName={name}
        onClose={() => setIsGoogleModalOpen(false)}
        onSelectAccount={handleGoogleAccountSelect}
      />

      {policyModal && (
        <div
          onClick={() => setPolicyModal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141413]/40 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl p-6 border border-[#e6dfd8] shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between border-b border-[#ebe6df] pb-2.5">
              <h3 className="text-sm font-semibold text-[#141413]">
                {policyModal === 'terms' ? 'SwiftDrop Terms of Service' : 'SwiftDrop Privacy Policy'}
              </h3>
              <button
                type="button"
                onClick={() => setPolicyModal(null)}
                className="text-[#6c6a64] hover:text-[#141413] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <p className="text-xs text-[#6c6a64] leading-relaxed">
              {policyModal === 'terms'
                ? 'SwiftDrop provides direct peer-to-peer file transfers over encrypted WebRTC DataChannels and local browser-based file conversion. Files are streamed directly between connected peers and are never stored on cloud servers.'
                : 'Your passwords are hashed with cryptographic scrypt + random salt, and session tokens are hashed with SHA-256. You can export all account metadata or permanently delete your account at any time from Settings.'}
            </p>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setPolicyModal(null)}
                className="px-4 py-1.5 rounded-lg bg-[#cc785c] text-white text-xs font-medium cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const ForgotPasswordPage: React.FC<AuthPageProps> = ({ onNavigate }) => {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sentToken, setSentToken] = useState<string | null>(null);
  const [submittedWithoutDevToken, setSubmittedWithoutDevToken] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      setIsSubmitting(false);

      if (res.ok) {
        showToast('Reset instructions generated', 'success');
        if (data.devToken) {
          setSentToken(data.devToken);
        } else {
          setSubmittedWithoutDevToken(true);
        }
      } else {
        showToast(data.error || 'Failed to send reset link', 'error');
      }
    } catch {
      setIsSubmitting(false);
      showToast('Network error while requesting password reset', 'error');
    }
  };

  return (
    <div className="relative w-full flex-1 flex flex-col justify-start sm:justify-center items-center py-6 sm:py-12 px-3 sm:px-6 overflow-x-hidden">
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-full max-w-[33.75rem] h-[22.5rem] rounded-full bg-gradient-to-b from-[#cc785c]/8 via-[#e8a55a]/6 to-transparent blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-[26.25rem] mx-auto z-10 flex flex-col items-center">
        <div className="relative z-10 text-center mb-5 sm:mb-7 max-w-sm">
          <h1 className="font-display text-[30px] sm:text-[38px] tracking-tight text-[#141413] font-normal leading-tight">
            Reset Password
          </h1>
          <p className="mt-1.5 text-xs text-[#6c6a64] font-sans">
            @ tylonmademe "auth"
          </p>
        </div>

        <div className="relative z-10 w-full bg-white rounded-2xl p-5 sm:p-8 shadow-[0_2px_16px_rgba(20,20,19,0.04)] border border-[#e6dfd8]">
          {sentToken ? (
            <div className="space-y-4 text-center">
              <div className="w-12 h-12 rounded-full bg-[#5db872]/15 text-[#5db872] mx-auto flex items-center justify-center">
                <span className="material-symbols-outlined text-[24px]">mark_email_read</span>
              </div>
              <p className="text-xs text-[#3d3d3a]">
                A single-use cryptographic verification token has been issued:
              </p>
              <div className="p-3 bg-[#faf9f5] rounded-lg font-code text-xs text-[#cc785c] break-all border border-[#e6dfd8] select-all">
                {sentToken}
              </div>
              <button
                type="button"
                onClick={() => onNavigate(`reset-password?token=${encodeURIComponent(sentToken)}`)}
                className="w-full h-11 rounded-lg text-white font-medium text-xs shadow-xs cursor-pointer"
                style={{ backgroundColor: 'rgb(204, 120, 92)' }}
              >
                Continue to Reset Password
              </button>
            </div>
          ) : submittedWithoutDevToken ? (
            <div className="space-y-4 text-center">
              <div className="w-12 h-12 rounded-full bg-[#cc785c]/15 text-[#cc785c] mx-auto flex items-center justify-center">
                <span className="material-symbols-outlined text-[24px]">mail</span>
              </div>
              <p className="text-xs text-[#3d3d3a] leading-relaxed">
                If an account exists for <strong>{email}</strong>, password reset instructions have been generated.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('reset-password')}
                className="w-full h-11 rounded-lg text-white font-medium text-xs shadow-xs cursor-pointer"
                style={{ backgroundColor: 'rgb(204, 120, 92)' }}
              >
                Enter Reset Token
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[#3d3d3a]">Email</label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3 text-[17px] text-[#8e8b82] pointer-events-none">
                    mail
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full h-11 pl-9 pr-3 rounded-lg bg-[#faf9f5] text-[#141413] text-sm border border-[#e6dfd8] focus:outline-none focus:border-[#cc785c]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 w-full h-11 rounded-lg text-white font-medium text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-[0.99] hover:opacity-95 disabled:opacity-50"
                style={{ backgroundColor: 'rgb(204, 120, 92)' }}
              >
                {isSubmitting ? 'Generating...' : 'Send Reset Instructions'}
              </button>
            </form>
          )}
        </div>

        <div className="relative z-10 mt-6 text-center">
          <button
            type="button"
            onClick={() => onNavigate('login')}
            className="text-xs text-[#6c6a64] hover:text-[#141413] transition-colors cursor-pointer"
          >
            ← Back to Sign In
          </button>
        </div>
      </div>
    </div>
  );
};

export const ResetPasswordPage: React.FC<AuthPageProps> = ({ onNavigate }) => {
  const { showToast } = useToast();
  const [token, setToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || '';
  });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      setToken(urlToken);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      showToast('Password must be at least 8 characters long.', 'error');
      return;
    }
    if (confirmPassword && newPassword !== confirmPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token: token.trim(), newPassword })
      });
      const data = await res.json();
      setIsSubmitting(false);

      if (res.ok) {
        showToast('Password updated and old sessions revoked. Please sign in.', 'success');
        onNavigate('login');
      } else {
        showToast(data.error || 'Failed to reset password', 'error');
      }
    } catch {
      setIsSubmitting(false);
      showToast('Network error while resetting password', 'error');
    }
  };

  return (
    <div className="relative w-full flex-1 flex flex-col justify-start sm:justify-center items-center py-6 sm:py-12 px-3 sm:px-6 overflow-x-hidden">
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-full max-w-[33.75rem] h-[22.5rem] rounded-full bg-gradient-to-b from-[#cc785c]/8 via-[#e8a55a]/6 to-transparent blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-[26.25rem] mx-auto z-10 flex flex-col items-center">
        <div className="relative z-10 text-center mb-5 sm:mb-7 max-w-sm">
          <h1 className="font-display text-[30px] sm:text-[38px] tracking-tight text-[#141413] font-normal leading-tight">
            Set New Password
          </h1>
          <p className="mt-1.5 text-xs text-[#6c6a64] font-sans">
            @ tylonmademe "auth"
          </p>
        </div>

        <div className="relative z-10 w-full bg-white rounded-2xl p-5 sm:p-8 shadow-[0_2px_16px_rgba(20,20,19,0.04)] border border-[#e6dfd8]">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#3d3d3a]">Reset Token</label>
              <input
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste cryptographic reset token"
                className="w-full h-11 px-3 rounded-lg bg-[#faf9f5] text-[#141413] text-xs font-code border border-[#e6dfd8] focus:outline-none focus:border-[#cc785c]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#3d3d3a]">New Password (8+ chars)</label>
              <div className="relative flex items-center">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-11 pl-3 pr-9 rounded-lg bg-[#faf9f5] text-[#141413] text-sm border border-[#e6dfd8] focus:outline-none focus:border-[#cc785c]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 text-[#6c6a64] hover:text-[#141413] cursor-pointer flex items-center justify-center p-1"
                >
                  <span className="material-symbols-outlined text-[17px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#3d3d3a]">Confirm New Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-11 px-3 rounded-lg bg-[#faf9f5] text-[#141413] text-sm border border-[#e6dfd8] focus:outline-none focus:border-[#cc785c]"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full h-11 rounded-lg text-white font-medium text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-[0.99] hover:opacity-95 disabled:opacity-50"
              style={{ backgroundColor: 'rgb(204, 120, 92)' }}
            >
              {isSubmitting ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>

        <div className="relative z-10 mt-6 text-center">
          <button
            type="button"
            onClick={() => onNavigate('login')}
            className="text-xs text-[#6c6a64] hover:text-[#141413] transition-colors cursor-pointer"
          >
            ← Back to Sign In
          </button>
        </div>
      </div>
    </div>
  );
};
