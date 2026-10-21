import React from 'react';

interface FooterProps {
  onNavigate: (route: string) => void;
  onOpenHelp: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="footer DesktopFooter w-full bg-white border-t border-[#ebebeb] mt-auto text-xs text-[#666666]">
      <div className="max-w-[1140px] mx-auto px-4 md:px-8 py-6">
        <div className="footer-menu flex flex-wrap items-center gap-6 mb-4">
          <a
            href="https://send-anywhere.com/about"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#212529] font-medium transition-colors"
          >
            About
          </a>
          <a
            href="https://support.send-anywhere.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#212529] font-medium transition-colors"
          >
            Help Center
          </a>
          <button
            type="button"
            onClick={() => onNavigate('pricing')}
            className="hover:text-[#212529] font-medium transition-colors cursor-pointer"
          >
            Pricing
          </button>
          <a
            href="https://send-anywhere.com/file-transfer"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#212529] font-medium transition-colors"
          >
            Download Apps
          </a>
          <button
            type="button"
            onClick={() => onNavigate('converter')}
            className="hover:text-[#212529] font-medium transition-colors cursor-pointer"
          >
            File Converter
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-[#f1f1f1] text-[11px] text-[#9b9b9b]">
          <div>
            <span>© 2026 Send Anywhere (Estmob Inc.) All rights reserved.</span>
          </div>
          <ul className="flex items-center gap-4 flex-wrap">
            <li>
              <a
                href="https://send-anywhere.com/terms#privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#212529] transition-colors"
              >
                Privacy Policy
              </a>
            </li>
            <li>•</li>
            <li>
              <a
                href="https://send-anywhere.com/cookie_policy"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#212529] transition-colors"
              >
                Cookie Policy
              </a>
            </li>
            <li>•</li>
            <li>
              <a
                href="https://send-anywhere.com/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#212529] transition-colors"
              >
                Terms of Service
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
};
