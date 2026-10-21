import React from 'react';
import { Download, Monitor, Smartphone, Globe, Laptop, ArrowRight, ShieldCheck, Check } from 'lucide-react';

interface DownloadPageProps {
  onNavigate: (route: string) => void;
}

export const DownloadPage: React.FC<DownloadPageProps> = ({ onNavigate }) => {
  const desktopApps = [
    {
      os: 'Windows',
      version: 'v24.5.1',
      desc: 'Windows 10, 11 (64-bit / 32-bit)',
      icon: 'desktop',
      downloadUrl: 'https://update.send-anywhere.com/downloads/SendAnywhereSetup.exe',
      buttonText: 'Download for Windows (.exe)'
    },
    {
      os: 'macOS',
      version: 'v24.5.1',
      desc: 'macOS 11.0 Big Sur or later (Apple Silicon & Intel)',
      icon: 'apple',
      downloadUrl: 'https://update.send-anywhere.com/osx_downloads/Send%20Anywhere.dmg',
      buttonText: 'Download for macOS (.dmg)'
    },
    {
      os: 'Linux',
      version: 'v24.4.0',
      desc: 'Ubuntu, Debian 64-bit',
      icon: 'linux',
      downloadUrl: 'https://update.send-anywhere.com/linux_downloads/sendanywhere_latest_amd64.deb',
      buttonText: 'Download for Linux (.deb)'
    }
  ];

  const mobileApps = [
    {
      os: 'Android',
      desc: 'Android 7.0 and up',
      storeUrl: 'https://play.google.com/store/apps/details?id=com.estmob.android.sendanywhere',
      storeBadge: 'Google Play'
    },
    {
      os: 'iOS / iPadOS',
      desc: 'iOS 14.0 or later',
      storeUrl: 'https://itunes.apple.com/app/apple-store/id596642855',
      storeBadge: 'App Store'
    }
  ];

  const extensions = [
    {
      name: 'Chrome Extension',
      desc: 'SwiftDrop for Gmail & Web',
      storeUrl: 'https://chrome.google.com/webstore/detail/amjmjholfoknokffkiolahocokcaecnc',
      badge: 'Chrome Web Store'
    },
    {
      name: 'Outlook Add-in',
      desc: 'Attach files without size limits in Outlook 365',
      storeUrl: 'https://appsource.microsoft.com/en-us/product/office/WA104380391',
      badge: 'Microsoft AppSource'
    }
  ];

  return (
    <div className="w-full bg-white text-[#212529] py-8 sm:py-12 px-4 sm:px-6 md:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Hero */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-wider text-[#fe4543] bg-[#fff0f2] px-3 py-1 rounded-full">
            Available on all platforms
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#212529] mt-3 tracking-tight">
            Download <span className="text-[#fe4543]">SwiftDrop</span>
          </h1>
          <p className="text-sm text-[#666666] mt-2">
            Send and receive files seamlessly across all your devices without cables or logins.
          </p>
        </div>

        {/* Desktop Applications */}
        <div className="mb-14">
          <div className="flex items-center gap-2 mb-6">
            <Laptop className="w-5 h-5 text-[#fe4543]" />
            <h2 className="text-xl font-bold text-[#212529]">Desktop Applications</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {desktopApps.map((app) => (
              <div
                key={app.os}
                className="p-6 rounded-2xl border border-[#ebebeb] bg-white shadow-xs hover:shadow-md hover:border-[#fe4543]/40 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="w-12 h-12 rounded-xl bg-[#fff0f2] text-[#fe4543] flex items-center justify-center mb-4">
                    <Monitor className="w-6 h-6" />
                  </div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-[#212529]">{app.os}</h3>
                    <span className="text-[11px] font-mono text-[#9b9b9b]">{app.version}</span>
                  </div>
                  <p className="text-xs text-[#666666] mt-1.5 mb-6">{app.desc}</p>
                </div>

                <a
                  href={app.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-11 bg-[#fe4543] hover:bg-[#d83f53] text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2 transition-all active:scale-[0.99] shadow-xs"
                >
                  <Download className="w-4 h-4" />
                  <span>{app.buttonText}</span>
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile Applications */}
        <div className="mb-14">
          <div className="flex items-center gap-2 mb-6">
            <Smartphone className="w-5 h-5 text-[#fe4543]" />
            <h2 className="text-xl font-bold text-[#212529]">Mobile Applications</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {mobileApps.map((app) => (
              <div
                key={app.os}
                className="p-6 rounded-2xl border border-[#ebebeb] bg-white shadow-xs hover:shadow-md transition-all flex items-center justify-between"
              >
                <div>
                  <h3 className="text-lg font-bold text-[#212529]">{app.os}</h3>
                  <p className="text-xs text-[#666666] mt-1">{app.desc}</p>
                </div>
                <a
                  href={app.storeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 rounded-lg border border-[#e0e4e6] hover:border-[#fe4543] text-xs font-bold text-[#212529] hover:text-[#fe4543] transition-colors flex items-center gap-1.5"
                >
                  <span>{app.storeBadge}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Browser & Office Extensions */}
        <div className="mb-14">
          <div className="flex items-center gap-2 mb-6">
            <Globe className="w-5 h-5 text-[#fe4543]" />
            <h2 className="text-xl font-bold text-[#212529]">Extensions & Add-ins</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {extensions.map((ext) => (
              <div
                key={ext.name}
                className="p-6 rounded-2xl border border-[#ebebeb] bg-white shadow-xs hover:shadow-md transition-all flex items-center justify-between"
              >
                <div>
                  <h3 className="text-base font-bold text-[#212529]">{ext.name}</h3>
                  <p className="text-xs text-[#666666] mt-1">{ext.desc}</p>
                </div>
                <a
                  href={ext.storeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 rounded-lg border border-[#e0e4e6] hover:border-[#fe4543] text-xs font-bold text-[#212529] hover:text-[#fe4543] transition-colors flex items-center gap-1.5 shrink-0 ml-3"
                >
                  <span>{ext.badge}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Direct Web Transfer banner */}
        <div className="p-8 rounded-2xl bg-[#fafafa] border border-[#ebebeb] flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div>
            <h3 className="text-lg font-bold text-[#212529]">Want to transfer files without installing?</h3>
            <p className="text-xs text-[#666666] mt-1">
              Use SwiftDrop directly in your browser with zero installation required.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="px-6 py-3 rounded-lg bg-[#fe4543] hover:bg-[#d83f53] text-white font-bold text-xs shrink-0 cursor-pointer transition-all shadow-xs"
          >
            Go to Web Transfer
          </button>
        </div>
      </div>
    </div>
  );
};
