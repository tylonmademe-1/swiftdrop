import React from 'react';
import { ShieldCheck, Zap, Globe, Users, ArrowRight } from 'lucide-react';

interface AboutPageProps {
  onNavigate: (route: string) => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ onNavigate }) => {
  return (
    <div className="w-full bg-white text-[#212529] py-8 sm:py-12 px-4 sm:px-6 md:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Intro */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-wider text-[#fe4543] bg-[#fff0f2] px-3 py-1 rounded-full">
            Our Mission
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#212529] mt-3 tracking-tight">
            Send whatever you want, <br />
            <span className="text-[#fe4543]">wherever you want.</span>
          </h1>
          <p className="text-sm text-[#666666] mt-3 leading-relaxed">
            Send Anywhere was born from a simple belief: file sharing should be direct, fast, and completely unrestricted by platform, device, or file size.
          </p>
        </div>

        {/* Philosophy grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <div className="p-6 rounded-2xl border border-[#ebebeb] bg-white shadow-xs">
            <div className="w-12 h-12 rounded-xl bg-[#fff0f2] text-[#fe4543] flex items-center justify-center mb-4">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[#212529]">Direct &amp; Fast</h3>
            <p className="text-xs text-[#666666] mt-2 leading-relaxed">
              We connect sender and receiver directly via P2P streaming. Files travel the shortest, fastest path without detour.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-[#ebebeb] bg-white shadow-xs">
            <div className="w-12 h-12 rounded-xl bg-[#fff0f2] text-[#fe4543] flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[#212529]">Private by Default</h3>
            <p className="text-xs text-[#666666] mt-2 leading-relaxed">
              Real-time transfers are end-to-end encrypted. We never inspect your files, and temporary keys vanish as soon as files are received.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-[#ebebeb] bg-white shadow-xs">
            <div className="w-12 h-12 rounded-xl bg-[#fff0f2] text-[#fe4543] flex items-center justify-center mb-4">
              <Globe className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[#212529]">Universal</h3>
            <p className="text-xs text-[#666666] mt-2 leading-relaxed">
              Whether you are on Windows, Mac, Linux, Android, iOS, or inside a web browser, transfers work without installing complex drivers.
            </p>
          </div>
        </div>

        {/* Story */}
        <div className="p-8 rounded-2xl bg-[#fafafa] border border-[#ebebeb] mb-12">
          <h2 className="text-xl font-bold text-[#212529] mb-3">The Send Anywhere Story</h2>
          <p className="text-xs sm:text-sm text-[#666666] leading-relaxed mb-4">
            Founded by Estmob Inc., Send Anywhere has transferred billions of files across 140+ countries. In an age where files were trapped inside isolated cloud silos and restricted by email attachments, Send Anywhere pioneered the universal 6-digit real-time key exchange.
          </p>
          <p className="text-xs sm:text-sm text-[#666666] leading-relaxed">
            Today, our technology powers direct file transfer for millions of creators, developers, designers, and businesses worldwide.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#fe4543] hover:bg-[#d83f53] text-white font-bold text-xs shadow-xs cursor-pointer transition-all active:scale-[0.99]"
          >
            <span>Start Transferring Now</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
