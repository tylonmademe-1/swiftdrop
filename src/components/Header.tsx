import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  History,
  Laptop,
  Settings,
  LogOut,
  ArrowLeftRight,
  LogIn,
  Globe,
  ChevronDown,
  Check,
  X,
  Sparkles,
  Zap,
  ShieldCheck,
  Cloud
} from 'lucide-react';
import { getStoredAuthToken } from '../services/apiClient';

interface HeaderProps {
  currentTab: string;
  onNavigate: (tab: string) => void;
  onOpenHelp?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, onNavigate }) => {
  const { user, loading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState('English');

  const menuRef = useRef<HTMLDivElement>(null);
  const productRef = useRef<HTMLDivElement>(null);

  const languages = [
    { code: 'en', name: 'English', native: 'English' },
    { code: 'ko', name: 'Korean', native: '한국어' },
    { code: 'ja', name: 'Japanese', native: '日本語' },
    { code: 'es', name: 'Spanish', native: 'Español' },
    { code: 'fr', name: 'French', native: 'Français' },
    { code: 'de', name: 'German', native: 'Deutsch' },
    { code: 'zh', name: 'Chinese', native: '简体中文' },
    { code: 'pt', name: 'Portuguese', native: 'Português' }
  ];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (productRef.current && !productRef.current.contains(e.target as Node)) {
        setProductOpen(false);
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
    <>
      <header
        className="fixed top-0 w-full z-50 border-b border-[#ebebeb] bg-white/95 backdrop-blur-xl shadow-[0_1px_4px_0_rgba(0,0,0,0.04)]"
      >
        <div className="h-16 max-w-[1140px] mx-auto px-4 md:px-8 flex items-center justify-between gap-4">
          {/* Brand & Left Navigation Links */}
          <div className="flex items-center gap-8 min-w-0">
            <button
              onClick={() => onNavigate('home')}
              className="flex items-center gap-2.5 group cursor-pointer text-left focus:outline-none shrink-0"
            >
              <div className="w-8 h-8 rounded-lg bg-[#fe4543] flex items-center justify-center text-white shadow-xs shrink-0 transition-transform group-hover:scale-105">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M12 12v9m4-5-4-4-4 4" />
                </svg>
              </div>
              <span className="font-sans font-extrabold text-[19px] tracking-tight text-[#212529] shrink-0 select-none">
                SwiftDrop
              </span>
            </button>

            {/* Desktop Left Menu (Send Anywhere standard: Transfer, Product, Pricing, Download) */}
            <nav className="hidden md:flex items-center gap-6">
              <button
                type="button"
                onClick={() => onNavigate('home')}
                className={`text-[15px] font-bold transition-colors cursor-pointer ${
                  currentTab === 'home' || currentTab === 'send' || currentTab === 'receive'
                    ? 'text-[#fe4543]'
                    : 'text-[#666666] hover:text-[#212529]'
                }`}
              >
                Transfer
              </button>

              {/* Product Flyout */}
              <div className="relative" ref={productRef}>
                <button
                  type="button"
                  onClick={() => setProductOpen(!productOpen)}
                  className={`text-[15px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                    productOpen ? 'text-[#fe4543]' : 'text-[#666666] hover:text-[#212529]'
                  }`}
                >
                  <span>Product</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${productOpen ? 'rotate-180 text-[#fe4543]' : ''}`} />
                </button>

                {productOpen && (
                  <div className="absolute left-0 mt-3 w-56 bg-white rounded-lg border border-[#ebebeb] shadow-lg py-2 z-50 text-xs">
                    <button
                      onClick={() => {
                        setProductOpen(false);
                        onNavigate('home');
                      }}
                      className="w-full px-4 py-2.5 text-left hover:bg-[#fafafa] flex items-center gap-2.5 text-[#212529] transition-colors cursor-pointer"
                    >
                      <Zap className="w-4 h-4 text-[#fe4543]" />
                      <div>
                        <p className="font-bold">SwiftDrop Basic</p>
                        <p className="text-[11px] text-[#9b9b9b]">Direct 6-digit key P2P transfer</p>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setProductOpen(false);
                        onNavigate('file-transfer');
                      }}
                      className="w-full px-4 py-2.5 text-left hover:bg-[#fafafa] flex items-center gap-2.5 text-[#212529] transition-colors cursor-pointer"
                    >
                      <Cloud className="w-4 h-4 text-[#fe4543]" />
                      <div>
                        <p className="font-bold">SwiftDrop for Email</p>
                        <p className="text-[11px] text-[#9b9b9b]">Outlook &amp; Gmail unlimited attachments</p>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setProductOpen(false);
                        onNavigate('devices');
                      }}
                      className="w-full px-4 py-2.5 text-left hover:bg-[#fafafa] flex items-center gap-2.5 text-[#212529] transition-colors cursor-pointer"
                    >
                      <Laptop className="w-4 h-4 text-[#fe4543]" />
                      <div>
                        <p className="font-bold">Paired Devices</p>
                        <p className="text-[11px] text-[#9b9b9b]">Transfer across your signed-in devices</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => onNavigate('pricing')}
                className={`text-[15px] font-bold transition-colors cursor-pointer ${
                  currentTab === 'pricing' ? 'text-[#fe4543]' : 'text-[#666666] hover:text-[#212529]'
                }`}
              >
                Pricing
              </button>

              <button
                type="button"
                onClick={() => onNavigate('file-transfer')}
                className={`text-[15px] font-bold transition-colors cursor-pointer ${
                  currentTab === 'file-transfer' || currentTab === 'download' ? 'text-[#fe4543]' : 'text-[#666666] hover:text-[#212529]'
                }`}
              >
                Download
              </button>

              {user && (
                <button
                  type="button"
                  onClick={() => onNavigate('my-link')}
                  className={`text-[15px] font-bold transition-colors cursor-pointer ${
                    currentTab === 'my-link' ? 'text-[#fe4543]' : 'text-[#666666] hover:text-[#212529]'
                  }`}
                >
                  My Link
                </button>
              )}
            </nav>
          </div>

          {/* Right side: Auth & Language */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            {user ? (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2 px-2.5 py-1 rounded-full border border-[#ebebeb] bg-white hover:bg-[#fafafa] transition-colors cursor-pointer shadow-2xs"
                >
                  <div className="w-6 h-6 rounded-full bg-[#fe4543] text-white font-bold text-[11px] flex items-center justify-center shrink-0">
                    {getInitials(user.displayName)}
                  </div>
                  <span className="text-xs font-bold text-[#212529] max-w-[90px] truncate hidden sm:inline">
                    {user.displayName}
                  </span>
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg border border-[#ebebeb] shadow-lg py-1.5 z-50 text-xs text-[#333333] divide-y divide-[#efeeea]">
                    <div className="px-4 py-2.5">
                      <p className="font-bold text-[#212529] truncate">{user.displayName}</p>
                      <p className="text-[11px] text-[#666666] truncate font-code">{user.email}</p>
                    </div>

                    <div className="py-1">
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          onNavigate('my-link');
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-[#fafafa] flex items-center gap-2 text-[#212529] transition-colors cursor-pointer"
                      >
                        <Zap className="w-3.5 h-3.5 text-[#666666]" />
                        <span>My Link</span>
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
                        <span>Settings</span>
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
              <div className="h-7 w-20 rounded-full bg-[#f1f1f1] animate-pulse border border-[#ebebeb]" />
            ) : (
              <button
                type="button"
                onClick={() => onNavigate('login')}
                className="text-[14px] font-bold text-[#212529] hover:text-[#fe4543] transition-colors cursor-pointer px-1 py-1"
              >
                Sign in
              </button>
            )}

            {/* Language Selector Button */}
            <button
              type="button"
              onClick={() => setLangOpen(true)}
              className="flex items-center gap-1.5 text-[13px] font-semibold text-[#666666] hover:text-[#212529] px-2.5 py-1.5 rounded-md border border-[#e0e4e6] hover:bg-[#fafafa] transition-colors cursor-pointer"
              title="Select Language"
            >
              <Globe className="w-4 h-4 text-[#9b9b9b]" />
              <span className="hidden sm:inline">{currentLang}</span>
              <span className="sm:hidden">EN</span>
            </button>
          </div>
        </div>

        {/* Mobile Sub-Header Navigation Bar */}
        <div className="md:hidden border-t border-[#ebebeb] px-3 py-2 flex items-center justify-between overflow-x-auto no-scrollbar bg-white">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap transition-colors ${
                currentTab === 'home' || currentTab === 'send' || currentTab === 'receive'
                  ? 'bg-[#fe4543] text-white'
                  : 'text-[#666666] hover:text-[#212529]'
              }`}
            >
              Transfer
            </button>
            <button
              type="button"
              onClick={() => onNavigate('converter')}
              className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap transition-colors ${
                currentTab === 'converter' ? 'bg-[#fe4543] text-white' : 'text-[#666666] hover:text-[#212529]'
              }`}
            >
              Converter
            </button>
            <button
              type="button"
              onClick={() => setPricingOpen(true)}
              className="text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap text-[#666666] hover:text-[#212529]"
            >
              Pricing
            </button>
            <button
              type="button"
              onClick={() => onNavigate('devices')}
              className="text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap text-[#666666] hover:text-[#212529]"
            >
              Download
            </button>
          </div>
        </div>
      </header>

      {/* Pricing Modal (Send Anywhere Pro / Plus Showcase) */}
      {pricingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-2xl border border-[#ebebeb] shadow-2xl p-6 sm:p-8 relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setPricingOpen(false)}
              className="absolute top-5 right-5 text-[#9b9b9b] hover:text-[#212529] cursor-pointer p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#fff0f2] text-[#fe4543] text-xs font-bold mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>SwiftDrop Plus</span>
              </span>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-[#212529]">
                Choose Your Transfer Power
              </h3>
              <p className="text-xs sm:text-sm text-[#666666] mt-1">
                Direct peer-to-peer transfers are always free and unlimited.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Free Plan */}
              <div className="p-5 rounded-xl border border-[#ebebeb] bg-[#fafafa] flex flex-col justify-between">
                <div>
                  <h4 className="text-lg font-bold text-[#212529]">Basic Free</h4>
                  <p className="text-2xl font-black text-[#212529] mt-2">$0</p>
                  <p className="text-xs text-[#9b9b9b] mb-4">Forever free for all devices</p>

                  <ul className="space-y-2.5 text-xs text-[#666666]">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-[#5db872] shrink-0" />
                      <span>Unlimited P2P WebRTC transfers</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-[#5db872] shrink-0" />
                      <span>Up to 50 GB per transfer</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-[#5db872] shrink-0" />
                      <span>6-digit key exchange & QR Ferry</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-[#5db872] shrink-0" />
                      <span>Zero cloud storage / direct encryption</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => setPricingOpen(false)}
                  className="mt-6 w-full h-11 bg-white hover:bg-[#f1f1f1] border border-[#e0e4e6] text-[#212529] font-bold text-xs rounded-lg transition-colors cursor-pointer"
                >
                  Current Plan
                </button>
              </div>

              {/* Plus Plan */}
              <div className="p-5 rounded-xl border-2 border-[#fe4543] bg-white shadow-md flex flex-col justify-between relative">
                <span className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full bg-[#fe4543] text-white text-[10px] font-bold uppercase tracking-wider">
                  Popular
                </span>

                <div>
                  <h4 className="text-lg font-bold text-[#fe4543]">SwiftDrop Plus</h4>
                  <p className="text-2xl font-black text-[#212529] mt-2">
                    $5.99 <span className="text-xs font-normal text-[#9b9b9b]">/ month</span>
                  </p>
                  <p className="text-xs text-[#9b9b9b] mb-4">Maximum speed & 1 TB cloud storage</p>

                  <ul className="space-y-2.5 text-xs text-[#212529]">
                    <li className="flex items-center gap-2 font-medium">
                      <Check className="w-4 h-4 text-[#fe4543] shrink-0" />
                      <span>1 TB persistent cloud storage</span>
                    </li>
                    <li className="flex items-center gap-2 font-medium">
                      <Check className="w-4 h-4 text-[#fe4543] shrink-0" />
                      <span>Custom download link expiration</span>
                    </li>
                    <li className="flex items-center gap-2 font-medium">
                      <Check className="w-4 h-4 text-[#fe4543] shrink-0" />
                      <span>100% Ad-Free experience</span>
                    </li>
                    <li className="flex items-center gap-2 font-medium">
                      <Check className="w-4 h-4 text-[#fe4543] shrink-0" />
                      <span>Priority TURN server acceleration</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setPricingOpen(false);
                    onNavigate('register');
                  }}
                  className="mt-6 w-full h-11 bg-[#fe4543] hover:bg-[#d83f53] text-white font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer"
                >
                  Upgrade to Plus
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Language Selector Modal */}
      {langOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl border border-[#ebebeb] shadow-2xl p-6 relative">
            <div className="flex items-center justify-between pb-4 border-b border-[#ebebeb] mb-4">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-[#fe4543]" />
                <h3 className="text-lg font-bold text-[#212529]">Select Language</h3>
              </div>
              <button
                type="button"
                onClick={() => setLangOpen(false)}
                className="text-[#9b9b9b] hover:text-[#212529] cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => {
                    setCurrentLang(lang.name);
                    setLangOpen(false);
                  }}
                  className={`flex items-center justify-between p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    currentLang === lang.name
                      ? 'border-[#fe4543] bg-[#fff0f2] text-[#fe4543] font-bold'
                      : 'border-[#ebebeb] hover:bg-[#fafafa] text-[#212529] font-medium'
                  }`}
                >
                  <div>
                    <p className="text-xs">{lang.native}</p>
                    <p className="text-[10px] text-[#9b9b9b]">{lang.name}</p>
                  </div>
                  {currentLang === lang.name && (
                    <Check className="w-4 h-4 text-[#fe4543]" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
