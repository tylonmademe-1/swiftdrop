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
      className="fixed top-0 w-full z-50 border-b border-[#ebebeb] bg-white/95 backdrop-blur-xl shadow-[0_2px_12px_0_rgba(0,0,0,0.03)]"
    >
      <div className="h-14 sm:h-16 max-w-[1140px] mx-auto px-3 sm:px-4 md:px-8 flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3 md:gap-6 min-w-0">
          <button
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2.5 group cursor-pointer text-left focus:outline-none shrink-0"
          >
            <div className="w-8 h-8 rounded-lg bg-[#fe4543] flex items-center justify-center text-white shadow-xs shrink-0 transition-transform group-hover:scale-105">
              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M12 12v9m4-5-4-4-4 4" />
              </svg>
            </div>
            <span className="font-sans font-extrabold text-[18px] sm:text-[20px] tracking-tight text-[#212529] shrink-0 select-none">
              SwiftDrop
            </span>
          </button>

          {/* Editorial Central Navigation Pill (Desktop & Tablet) */}
          <nav
            className="hidden md:flex items-center p-1 rounded-full border border-[#ebebeb] bg-[#f8f9fa] shadow-2xs"
          >
            <button
              type="button"
              onClick={() => onNavigate('send')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1 text-[13px] rounded-full transition-colors cursor-pointer ${
                currentTab === 'send' || currentTab === 'home'
                  ? 'bg-white text-[#212529] font-bold shadow-xs'
                  : 'text-[#666666] font-medium hover:text-[#212529]'
              }`}
            >
              <svg className={`w-4 h-4 ${currentTab === 'send' || currentTab === 'home' ? 'text-[#fe4543]' : 'text-[#666666]'}`} fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
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
                  ? 'bg-white text-[#212529] font-bold shadow-xs'
                  : 'text-[#666666] font-medium hover:text-[#212529]'
              }`}
            >
              <svg className={`w-4 h-4 ${currentTab.startsWith('receive') ? 'text-[#fe4543]' : 'text-[#666666]'}`} fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
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
                  ? 'bg-white text-[#212529] font-bold shadow-xs'
                  : 'text-[#666666] font-medium hover:text-[#212529]'
              }`}
            >
              <ArrowLeftRight className={`w-4 h-4 shrink-0 ${currentTab === 'converter' ? 'text-[#fe4543]' : 'text-[#666666]'}`} />
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
                <div className="w-6 h-6 rounded-full bg-[#fe4543] text-white font-bold text-[11px] flex items-center justify-center shrink-0">
                  {getInitials(user.displayName)}
                </div>
                <span className="text-xs font-semibold text-[#212529] max-w-[90px] truncate hidden sm:inline">
                  {user.displayName}
                </span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-[#ebebeb] shadow-lg py-1.5 z-50 text-xs text-[#333333] divide-y divide-[#efeeea]">
                  <div className="px-4 py-2.5">
                    <p className="font-bold text-[#212529] truncate">{user.displayName}</p>
                    <p className="text-[11px] text-[#666666] truncate font-code">{user.email}</p>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onNavigate('dashboard');
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-[#fafafa] flex items-center gap-2 text-[#212529] transition-colors cursor-pointer"
                    >
                      <LayoutDashboard className="w-3.5 h-3.5 text-[#666666]" />
                      <span>Console Dashboard</span>
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onNavigate('history');
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-[#fafafa] flex items-center gap-2 text-[#212529] transition-colors cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5 text-[#666666]" />
                      <span>Transfer Ledger</span>
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onNavigate('devices');
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-[#fafafa] flex items-center gap-2 text-[#212529] transition-colors cursor-pointer"
                    >
                      <Laptop className="w-3.5 h-3.5 text-[#666666]" />
                      <span>Paired Devices</span>
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onNavigate('settings');
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-[#fafafa] flex items-center gap-2 text-[#212529] transition-colors cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5 text-[#666666]" />
                      <span>Security & Settings</span>
                    </button>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={handleLogout}
                      className="w-full px-4 py-2 text-left hover:bg-[#fff0f2] flex items-center gap-2 text-[#fe4543] font-semibold transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : loading && getStoredAuthToken() ? (
            <div className="h-7 sm:h-8 w-20 sm:w-24 rounded-full bg-[#f0ece4]/70 animate-pulse border border-[#ebebeb]" />
          ) : (
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onNavigate('login')}
                className="inline-flex items-center gap-1 text-[11px] sm:text-[13px] font-medium text-[#666666] hover:text-[#212529] px-2 sm:px-3 py-1 sm:py-1.5 rounded-full transition-colors cursor-pointer whitespace-nowrap border border-[#ebebeb] bg-white hover:bg-[#fafafa] shadow-2xs"
              >
                <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-[#9b9b9b]" />
                <span>Sign In</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('register')}
                className="inline-flex items-center justify-center text-[11px] sm:text-[13px] font-bold px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-white bg-[#fe4543] hover:bg-[#d83f53] transition-all shadow-xs active:scale-95 cursor-pointer whitespace-nowrap"
              >
                Create Account
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Navigation Bar (visible on phone screens < 768px) */}
      <div className="md:hidden border-t border-[#ebebeb] px-2 py-1.5 flex items-center justify-center overflow-x-auto no-scrollbar bg-white/95">
        <div
          className="inline-flex items-center p-0.5 rounded-full border border-[#ebebeb] bg-[#f8f9fa] max-w-[calc(100vw-1rem)] overflow-x-auto no-scrollbar shadow-2xs shrink-0"
        >
          <button
            type="button"
            onClick={() => onNavigate('send')}
            className={`inline-flex items-center gap-1 px-3 py-1 text-[12px] rounded-full transition-colors whitespace-nowrap cursor-pointer ${
              currentTab === 'send' || currentTab === 'home'
                ? 'bg-white text-[#212529] font-bold shadow-2xs'
                : 'text-[#666666] font-medium'
            }`}
          >
            <svg className={`w-3.5 h-3.5 ${currentTab === 'send' || currentTab === 'home' ? 'text-[#fe4543]' : 'text-[#666666]'}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
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
                ? 'bg-white text-[#212529] font-bold shadow-2xs'
                : 'text-[#666666] font-medium'
            }`}
          >
            <svg className={`w-3.5 h-3.5 ${currentTab.startsWith('receive') ? 'text-[#fe4543]' : 'text-[#666666]'}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
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
            <ArrowLeftRight className={`w-3.5 h-3.5 shrink-0 ${currentTab === 'converter' ? 'text-[#fe4543]' : 'text-[#666666]'}`} />
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
