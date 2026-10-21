import React from 'react';
import { X, Shield, Wifi, RefreshCw, Smartphone, Laptop, Check, Zap } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141413]/40 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-[#e6dfd8]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#e6dfd8] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#f5f0e8] text-[#cc785c] flex items-center justify-center">
              <Shield className="w-4.5 h-4.5" />
            </div>
            <h3 className="font-bold text-[#141413] text-lg">About SwiftDrop</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#6c6a64] hover:text-[#141413] rounded-xl hover:bg-[#f5f0e8] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-[#6c6a64]">
          <div>
            <h4 className="font-semibold text-[#141413] mb-2 flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#cc785c]" />
              <span>Zero-Cloud, Peer-to-Peer Privacy</span>
            </h4>
            <p className="leading-relaxed">
              SwiftDrop sends files directly device-to-device through encrypted WebRTC data channels.
              Your files never touch any cloud storage, database, or intermediary server.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span>High-Speed Protocol Accelerators</span>
            </h4>
            <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
              <p>
                <strong>IBM Aspera (FASP UDP Concept):</strong> SwiftDrop uses SCTP over UDP datagrams without TCP slow-start or distance-related window collapse, sustaining wire line rate across high-latency internet connections.
              </p>
              <p>
                <strong>Parallel Streams (bbcp & lftp):</strong> Files are split into 128 KiB frames and multiplexed concurrently across 1x to 8x parallel data channels to saturate high-bandwidth links.
              </p>
              <p>
                <strong>Channel Bonding & Resilient Multi-Path:</strong> Supports simultaneous Wi-Fi and Ethernet ICE candidate negotiation for fast failover.
              </p>
              <p>
                <strong>Stream Compression:</strong> In-browser Gzip compression automatically reduces text, source code, JSON, logs, and CSV files before transfer.
              </p>
              <p>
                <strong>Local Network Optimization:</strong> For maximum speed, connect both devices to Gigabit wired Ethernet or 5 GHz Wi-Fi 6 to achieve 800+ Mbps local throughput.
              </p>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
              <Wifi className="w-4 h-4 text-indigo-600" />
              <span>How Connection Works</span>
            </h4>
            <ol className="space-y-2 list-decimal list-inside pl-1 text-slate-600 leading-relaxed text-xs">
              <li>
                <strong className="text-slate-800">Sender generates a session:</strong> Receives a short-lived pairing code and QR code.
              </li>
              <li>
                <strong className="text-slate-800">Receiver joins:</strong> Scans QR code or enters the 6-character code.
              </li>
              <li>
                <strong className="text-slate-800">Signaling exchange:</strong> A minimal WebSocket server relays cryptographic ICE connection parameters.
              </li>
              <li>
                <strong className="text-slate-800">Explicit approval:</strong> The receiver sees the exact file manifest and must click "Accept" before any file bytes are transmitted.
              </li>
              <li>
                <strong className="text-slate-800">Integrity verification:</strong> Both sides calculate SHA-256 hashes to guarantee data integrity.
              </li>
            </ol>
          </div>

          <div>
            <h4 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
              <Laptop className="w-4 h-4 text-emerald-600" />
              <Smartphone className="w-4 h-4 text-emerald-600" />
              <span>Cross-Device Compatibility</span>
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Windows & macOS</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>iPhone & iPad (Safari)</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Android Phones & Tablets</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Linux & Chromebooks</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-amber-600" />
              <span>Troubleshooting Tips</span>
            </h4>
            <ul className="space-y-1.5 list-disc list-inside pl-1 text-slate-600 text-xs leading-relaxed">
              <li>Keep both browser tabs open and in the foreground while transfer is running.</li>
              <li>If scanning fails, type the 6-character code manually.</li>
              <li>On strict corporate networks with symmetric NAT, an encrypted TURN relay fallback is used.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#f4f4f0] border-t border-[#e6dfd8] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-[#cc785c] hover:bg-[#b8654a] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
