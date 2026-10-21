import React from 'react';

interface FooterProps {
  onNavigate: (route: string) => void;
  onOpenHelp: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, onOpenHelp }) => {
  return (
    <footer className="w-full bg-[#faf9f5] text-[#6c6a64] border-t border-[#e6dfd8] mt-auto">
      <div className="max-w-[1140px] mx-auto px-4 md:px-8 py-5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-center sm:text-left">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className="font-semibold text-[#141413] text-sm tracking-tight">SwiftDrop</span>
            <span>•</span>
            <span>Direct device-to-device</span>
          </div>
          <div className="flex items-center justify-center gap-3 sm:gap-4 flex-wrap">
            <button
              onClick={() => onNavigate('converter')}
              className="hover:text-[#141413] transition-colors cursor-pointer"
            >
              File Converter
            </button>
            <button
              onClick={onOpenHelp}
              className="hover:text-[#141413] transition-colors cursor-pointer"
            >
              Privacy & Architecture
            </button>
            <button
              onClick={onOpenHelp}
              className="hover:text-[#141413] transition-colors cursor-pointer"
            >
              Docs
            </button>
            <span>© 2026</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
