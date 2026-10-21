import React from 'react';
import { SessionStatus, ConnectionMode } from '../types/transfer';
import { Wifi, ShieldCheck, Smartphone, Laptop, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

interface ConnectionStatusProps {
  status: SessionStatus;
  connectionMode: ConnectionMode;
  peerLabel?: string | null;
  role: 'sender' | 'receiver';
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  status,
  connectionMode,
  peerLabel,
  role
}) => {
  const getStatusDetails = () => {
    switch (status) {
      case 'waiting_for_receiver':
        return {
          title: 'Waiting for receiving device',
          desc: 'Scan the QR code or enter the pairing code on the target device.',
          icon: <Loader2 className="w-5 h-5 text-[#cc785c] animate-spin" />,
          badgeClass: 'bg-[#f5f0e8] text-[#cc785c] border-[#e6dfd8]'
        };
      case 'receiver_pending':
        return {
          title: 'Device detected',
          desc: `${peerLabel || 'Receiver'} joined. Initializing secure WebRTC tunnel...`,
          icon: <Loader2 className="w-5 h-5 text-[#cc785c] animate-spin" />,
          badgeClass: 'bg-[#f5f0e8] text-[#cc785c] border-[#e6dfd8]'
        };
      case 'negotiating':
        return {
          title: 'Negotiating connection',
          desc: 'Exchanging cryptographic ICE parameters and establishing peer-to-peer route.',
          icon: <Wifi className="w-5 h-5 text-[#cc785c] animate-pulse" />,
          badgeClass: 'bg-[#f5f0e8] text-[#cc785c] border-[#e6dfd8]'
        };
      case 'connected':
      case 'awaiting_acceptance':
        return {
          title: 'Securely connected',
          desc: role === 'sender'
            ? 'Waiting for receiver to review and approve transfer...'
            : 'Review files and choose whether to accept or decline.',
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
          badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200'
        };
      case 'transferring':
        return {
          title: 'Transferring data',
          desc: 'Direct encrypted RTCDataChannel streaming active.',
          icon: <Wifi className="w-5 h-5 text-[#cc785c]" />,
          badgeClass: 'bg-[#f5f0e8] text-[#cc785c] border-[#e6dfd8]'
        };
      case 'completed':
        return {
          title: 'Transfer complete',
          desc: 'All file bytes received and verified.',
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
          badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200'
        };
      case 'rejected':
        return {
          title: 'Transfer declined',
          desc: 'Receiver declined the transfer request.',
          icon: <AlertCircle className="w-5 h-5 text-amber-600" />,
          badgeClass: 'bg-amber-50 text-amber-700 border-amber-200'
        };
      case 'expired':
        return {
          title: 'Session expired',
          desc: 'The temporary pairing code has timed out. Please generate a new session.',
          icon: <AlertCircle className="w-5 h-5 text-rose-600" />,
          badgeClass: 'bg-rose-50 text-rose-700 border-rose-200'
        };
      case 'cancelled':
        return {
          title: 'Transfer cancelled',
          desc: 'Session was cancelled by user.',
          icon: <AlertCircle className="w-5 h-5 text-slate-600" />,
          badgeClass: 'bg-slate-50 text-slate-700 border-slate-200'
        };
      case 'failed':
      default:
        return {
          title: 'Connection error',
          desc: 'Could not establish connection. Check your network or firewall.',
          icon: <AlertCircle className="w-5 h-5 text-rose-600" />,
          badgeClass: 'bg-rose-50 text-rose-700 border-rose-200'
        };
    }
  };

  const details = getStatusDetails();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 shrink-0">
            {details.icon}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h4 className="text-sm font-semibold text-slate-900">{details.title}</h4>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${details.badgeClass}`}>
                {status.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-xs text-slate-500">{details.desc}</p>
          </div>
        </div>

        {peerLabel && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100 text-xs font-medium text-slate-700 shrink-0">
            {peerLabel.toLowerCase().includes('phone') ? (
              <Smartphone className="w-3.5 h-3.5 text-slate-500" />
            ) : (
              <Laptop className="w-3.5 h-3.5 text-slate-500" />
            )}
            <span className="truncate max-w-[140px]">{peerLabel}</span>
          </div>
        )}
      </div>

      {/* Network path mode telemetry */}
      {(status === 'connected' || status === 'transferring' || status === 'completed') && (
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-700">Transport:</span>
            {connectionMode === 'direct-p2p' ? (
              <span className="text-emerald-600 font-medium flex items-center gap-1">
                <span>Direct P2P (Local / STUN)</span>
              </span>
            ) : connectionMode === 'relayed-turn' ? (
              <span className="text-[#cc785c] font-medium flex items-center gap-1">
                <span>Encrypted TURN Relay</span>
              </span>
            ) : (
              <span>Establishing tunnel...</span>
            )}
          </div>

          <div className="flex items-center gap-1 text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>DTLS/SRTP WebRTC Encryption</span>
          </div>
        </div>
      )}
    </div>
  );
};
