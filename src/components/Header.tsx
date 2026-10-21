import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, History, Laptop, Settings, LogOut, ArrowLeftRight, LogIn } from 'lucide-react';
import { getStoredAuthToken } from '../services/apiClient';

interface HeaderProps {
  currentTab: string;
  onNavigate: (tab: string) => void;
  onOpenHelp?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, onNavigate }) => {
  const { user, loading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    onNavigate('home');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <header
      className="fixed top-0 w-full z-50 border-b border-[#e6dfd8]/80 bg-[#faf9f5]/85 backdrop-blur-xl shadow-[0_4px_20px_0_rgba(0,0,0,0.03)]"
    >
      <div className="h-14 sm:h-16 max-w-[1140px] mx-auto px-3 sm:px-4 md:px-8 flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3 md:gap-6 min-w-0">
          <button
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2 group cursor-pointer text-left focus:outline-none shrink-0"
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-br from-[#d88367] to-[#ad5f45] flex items-center justify-center text-white shadow-sm shrink-0 transition-transform group-hover:scale-105">
              <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M12 12v9m4-5-4-4-4 4" />
              </svg>
            </div>
            <span className="font-sans font-bold text-[17px] sm:text-[19px] tracking-tight text-[#141413] shrink-0 select-none">
              SwiftDrop
            </span>
          </button>

          {/* Editorial Central Navigation Pill (Desktop & Tablet) */}
          <nav
            className="hidden md:flex items-center p-1 rounded-full border border-[#e6dfd8]/70 bg-white/70 backdrop-blur-md shadow-xs"
          >
            <button
              type="button"
              onClick={() => onNavigate('send')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1 text-[13px] rounded-full transition-colors cursor-pointer ${
                currentTab === 'send' || currentTab === 'home'
                  ? 'bg-white text-[#141413] font-semibold shadow-xs'
                  : 'text-[#6c6a64] font-medium hover:text-[#141413]'
              }`}
            >
              <svg className={`w-4 h-4 ${currentTab === 'send' || currentTab === 'home' ? 'text-[#cc785c]' : 'text-[#6c6a64]'}`} fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
                <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                <path d="M12 12v9" />
                <path d="m16 16-4-4-4 4" />
              </svg>
              <span>Send</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('receive')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1 text-[13px] rounded-full transition-colors cursor-pointer ${
                currentTab.startsWith('receive')
                  ? 'bg-white text-[#141413] font-semibold shadow-xs'
                  : 'text-[#6c6a64] font-medium hover:text-[#141413]'
              }`}
            >
              <svg className={`w-4 h-4 ${currentTab.startsWith('receive') ? 'text-[#cc785c]' : 'text-[#6c6a64]'}`} fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
                <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                <path d="M12 12v9" />
                <path d="m8 17 4 4 4-4" />
              </svg>
              <span>Receive</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('converter')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1 text-[13px] rounded-full transition-all cursor-pointer ${
                currentTab === 'converter'
                  ? 'bg-white text-[#141413] font-semibold shadow-xs'
                  : 'text-[#6c6a64] font-medium hover:text-[#141413]'
              }`}
            >
              <ArrowLeftRight className={`w-4 h-4 shrink-0 ${currentTab === 'converter' ? 'text-[#cc785c]' : 'text-[#6c6a64]'}`} />
              <span>File Converter</span>
            </button>

            {user && (
              <>
                <button
                  type="button"
                  onClick={() => onNavigate('dashboard')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-[13px] rounded-full transition-colors cursor-pointer ${
                    currentTab === 'dashboard'
                      ? 'bg-white text-[#141413] font-semibold shadow-xs'
                      : 'text-[#6c6a64] font-medium hover:text-[#141413]'
                  }`}
                >
                  <span>Dashboard</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('history')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-[13px] rounded-full transition-colors cursor-pointer ${
                    currentTab === 'history' || currentTab.startsWith('history/')
                      ? 'bg-white text-[#141413] font-semibold shadow-xs'
                      : 'text-[#6c6a64] font-medium hover:text-[#141413]'
                  }`}
                >
                  <span>History</span>
                </button>
              </>
            )}
          </nav>
        </div>

        {/* Right side: Auth & User menu */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 px-2.5 py-1 rounded-full border border-[#e6dfd8] bg-white/70 hover:bg-white transition-colors cursor-pointer shadow-xs"
              >
                <div className="w-6 h-6 rounded-full bg-[#cc785c] text-white font-semibold text-[11px] flex items-center justify-center shrink-0">
                  {getInitials(user.displayName)}
                </div>
                <span className="text-xs font-medium text-[#141413] max-w-[90px] truncate hidden sm:inline">
                  {user.displayName}
                </span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-[#e6dfd8] shadow-lg py-1.5 z-50 text-xs text-[#3d3d3a] divide-y divide-[#efeeea]">
                  <div className="px-4 py-2.5">
                    <p className="font-semibold text-[#141413] truncate">{user.displayName}</p>
                    <p className="text-[11px] text-[#6c6a64] truncate font-code">{user.email}</p>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onNavigate('dashboard');
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-[#f5f0e8] flex items-center gap-2 text-[#141413] transition-colors cursor-pointer"
                    >
                      <LayoutDashboard className="w-3.5 h-3.5 text-[#6c6a64]" />
                      <span>Console Dashboard</span>
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onNavigate('history');
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-[#f5f0e8] flex items-center gap-2 text-[#141413] transition-colors cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5 text-[#6c6a64]" />
                      <span>Transfer Ledger</span>
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onNavigate('devices');
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-[#f5f0e8] flex items-center gap-2 text-[#141413] transition-colors cursor-pointer"
                    >
                      <Laptop className="w-3.5 h-3.5 text-[#6c6a64]" />
                      <span>Paired Devices</span>
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onNavigate('settings');
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-[#f5f0e8] flex items-center gap-2 text-[#141413] transition-colors cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5 text-[#6c6a64]" />
                      <span>Security & Settings</span>
                    </button>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={handleLogout}
                      className="w-full px-4 py-2 text-left hover:bg-[#ffdad6]/40 flex items-center gap-2 text-[#c64545] font-medium transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : loading && getStoredAuthToken() ? (
            <div className="h-7 sm:h-8 w-20 sm:w-24 rounded-full bg-[#f0ece4]/70 animate-pulse border border-[#e6dfd8]/60" />
          ) : (
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onNavigate('login')}
                className="inline-flex items-center gap-1 text-[11px] sm:text-[13px] font-medium text-[#6c6a64] hover:text-[#141413] px-2 sm:px-3 py-1 sm:py-1.5 rounded-full transition-colors cursor-pointer whitespace-nowrap border border-[#e6dfd8] bg-white/60 hover:bg-white shadow-xs"
              >
                <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-[#8e8b82]" />
                <span>Sign In</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('register')}
                className="inline-flex items-center justify-center text-[11px] sm:text-[13px] font-semibold px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full text-white transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap"
                style={{
                  background: 'linear-gradient(135deg, rgba(216, 131, 103, 0.95) 0%, rgba(173, 95, 69, 0.95) 100%)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  boxShadow: 'rgba(255, 255, 255, 0.4) 0px 1px 0px 0px inset, rgba(173, 95, 69, 0.35) 0px 4px 14px 0px'
                }}
              >
                Create Account
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Navigation Bar (visible on phone screens < 768px) */}
      <div className="md:hidden border-t border-[#e6dfd8]/60 px-2 py-1.5 flex items-center justify-center overflow-x-auto no-scrollbar bg-[#faf9f5]/95">
        <div
          className="inline-flex items-center p-0.5 rounded-full border border-[#e6dfd8]/70 bg-white/80 max-w-[calc(100vw-1rem)] overflow-x-auto no-scrollbar shadow-xs shrink-0"
        >
          <button
            type="button"
            onClick={() => onNavigate('send')}
            className={`inline-flex items-center gap-1 px-3 py-1 text-[12px] rounded-full transition-colors whitespace-nowrap cursor-pointer ${
              currentTab === 'send' || currentTab === 'home'
                ? 'bg-white text-[#141413] font-semibold shadow-2xs'
                : 'text-[#6c6a64] font-medium'
            }`}
          >
            <svg className={`w-3.5 h-3.5 ${currentTab === 'send' || currentTab === 'home' ? 'text-[#cc785c]' : 'text-[#6c6a64]'}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
              <path d="M12 12v9" />
              <path d="m16 16-4-4-4 4" />
            </svg>
            <span>Send</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('receive')}
            className={`inline-flex items-center gap-1 px-3 py-1 text-[12px] rounded-full transition-colors whitespace-nowrap cursor-pointer ${
              currentTab.startsWith('receive')
                ? 'bg-white text-[#141413] font-semibold shadow-2xs'
                : 'text-[#6c6a64] font-medium'
            }`}
          >
            <svg className={`w-3.5 h-3.5 ${currentTab.startsWith('receive') ? 'text-[#cc785c]' : 'text-[#6c6a64]'}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
              <path d="M12 12v9" />
              <path d="m8 17 4 4 4-4" />
            </svg>
            <span>Receive</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('converter')}
            className={`inline-flex items-center gap-1 px-3 py-1 text-[12px] rounded-full transition-colors whitespace-nowrap cursor-pointer ${
              currentTab === 'converter'
                ? 'bg-white text-[#141413] font-semibold shadow-2xs'
                : 'text-[#6c6a64] font-medium'
            }`}
          >
            <ArrowLeftRight className={`w-3.5 h-3.5 shrink-0 ${currentTab === 'converter' ? 'text-[#cc785c]' : 'text-[#6c6a64]'}`} />
            <span>File Converter</span>
          </button>

          {user && (
            <>
              <button
                type="button"
                onClick={() => onNavigate('dashboard')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-[12px] rounded-full transition-colors whitespace-nowrap cursor-pointer ${
                  currentTab === 'dashboard'
                    ? 'bg-white text-[#141413] font-semibold shadow-2xs'
                    : 'text-[#6c6a64] font-medium'
                }`}
              >
                <span>Dashboard</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('history')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-[12px] rounded-full transition-colors whitespace-nowrap cursor-pointer ${
                  currentTab === 'history' || currentTab.startsWith('history/')
                    ? 'bg-white text-[#141413] font-semibold shadow-2xs'
                    : 'text-[#6c6a64] font-medium'
                }`}
              >
                <span>History</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
