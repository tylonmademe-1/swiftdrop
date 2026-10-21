import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useToast } from './Toast';
import { copyTextToClipboard } from '../utils/clipboard';

interface PairingCodeProps {
  code: string;
}

export const PairingCode: React.FC<PairingCodeProps> = ({ code }) => {
  const [copied, setCopied] = useState(false);
  const { showToast } = useToast();

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(code);
    if (ok) {
      setCopied(true);
      showToast('Pairing code copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } else {
      showToast('Could not copy code. Please copy manually.', 'error');
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 text-center">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
        Pairing Code
      </p>
      <div className="flex items-center justify-center gap-3">
        <span className="font-mono text-3xl sm:text-4xl font-bold tracking-widest text-slate-900 tabular-nums select-all">
          {code}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition-colors shadow-xs"
          title="Copy code"
          aria-label="Copy pairing code"
        >
          {copied ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5" />}
        </button>
      </div>
      <p className="text-xs text-slate-400 mt-2">
        Enter this 6-character code on the receiving device
      </p>
    </div>
  );
};
