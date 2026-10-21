import React, { useEffect, useState } from 'react';
import { generateQRCode } from '../services/qrService';
import { copyTextToClipboard } from '../utils/clipboard';
import { Link2, Check, Clock } from 'lucide-react';
import { useToast } from './Toast';

interface PairingQRCodeProps {
  qrUrl: string;
  expiresAt: number;
  onExpired: () => void;
}

export const PairingQRCode: React.FC<PairingQRCodeProps> = ({ qrUrl, expiresAt, onExpired }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  });
  const { showToast } = useToast();

  useEffect(() => {
    let mounted = true;
    generateQRCode(qrUrl).then((url) => {
      if (mounted) setQrDataUrl(url);
    });
    return () => {
      mounted = false;
    };
  }, [qrUrl]);

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        onExpired();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt, onExpired]);

  const handleCopyLink = async () => {
    const ok = await copyTextToClipboard(qrUrl);
    if (ok) {
      setCopiedLink(true);
      showToast('Direct pairing link copied!', 'success');
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      showToast('Could not copy link.', 'error');
    }
  };

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <div className="flex flex-col items-center">
      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm mb-3">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="Scan this QR code with receiving device"
            className="w-56 h-56 sm:w-64 sm:h-64 object-contain"
          />
        ) : (
          <div className="w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center bg-slate-50 text-slate-400 text-sm">
            Generating QR...
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mb-4 text-xs font-medium text-slate-500 font-mono tabular-nums">
        <Clock className="w-3.5 h-3.5 text-amber-500" />
        <span>Expires in {timeFormatted}</span>
      </div>

      <button
        type="button"
        onClick={handleCopyLink}
        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl transition-colors cursor-pointer"
      >
        {copiedLink ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span>Link copied!</span>
          </>
        ) : (
          <>
            <Link2 className="w-3.5 h-3.5" />
            <span>Copy direct link</span>
          </>
        )}
      </button>
    </div>
  );
};
