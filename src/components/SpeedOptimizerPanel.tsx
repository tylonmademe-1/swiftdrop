import React from 'react';
import { AccelerationSettings, NetworkTelemetry } from '../types/transfer';
import { Zap, Wifi, Shield, Cpu, Gauge, Check, Info } from 'lucide-react';

interface SpeedOptimizerPanelProps {
  settings: AccelerationSettings;
  onChangeSettings: (settings: AccelerationSettings) => void;
  telemetry?: NetworkTelemetry | null;
  disabled?: boolean;
}

export const SpeedOptimizerPanel: React.FC<SpeedOptimizerPanelProps> = ({
  settings,
  onChangeSettings,
  telemetry,
  disabled = false
}) => {
  return (
    <div className="bg-white rounded-3xl border border-[#e6dfd8] shadow-2xs p-5 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Zap className="w-4.5 h-4.5" />
          </div>
          <div>
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <span>Transfer Acceleration Engine</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                P2P Turbo
              </span>
            </h4>
            <p className="text-[11px] text-slate-500">
              Parallel UDP multiplexing, stream compression, and direct LAN optimization
            </p>
          </div>
        </div>
      </div>

      {/* Network & Local WiFi Diagnostic Strip */}
      {telemetry && (
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${telemetry.isLocalLan ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500'}`} />
            <span className="font-semibold text-slate-800">
              {telemetry.mode === 'direct-lan'
                ? 'Direct Local Network (Gigabit LAN / 5GHz WiFi)'
                : telemetry.mode === 'direct-p2p'
                ? 'Direct Internet P2P (UDP NAT Traversal)'
                : telemetry.mode === 'relayed-turn'
                ? 'Encrypted TURN Relay'
                : 'Negotiating Route...'}
            </span>
          </div>

          <div className="flex items-center gap-4 text-slate-500 font-mono tabular-nums text-[11px]">
            {telemetry.rttMs !== null && (
              <div>
                <span>Latency (RTT): </span>
                <span className="font-bold text-slate-800">{telemetry.rttMs} ms</span>
              </div>
            )}
            <div>
              <span>Active Streams: </span>
              <span className="font-bold text-slate-800">{telemetry.activeChannelsCount || settings.parallelStreams}x</span>
            </div>
          </div>
        </div>
      )}

      {/* Control 1: Parallel Streams (bbcp / lftp style) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-[#cc785c]" />
            <span>Parallel Data Streams (Multiplexing)</span>
          </label>
          <span className="text-[11px] text-slate-400">
            Saturates high-bandwidth WiFi and bypasses single-channel bottlenecks
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {([1, 2, 4, 8] as const).map((count) => (
            <button
              key={count}
              type="button"
              disabled={disabled}
              onClick={() => onChangeSettings({ ...settings, parallelStreams: count })}
              className={`py-2 px-3 rounded-xl border text-center transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                settings.parallelStreams === count
                  ? 'border-[#cc785c] bg-[#f5f0e8] text-[#cc785c] font-bold shadow-2xs ring-1 ring-[#cc785c]'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <div className="text-xs font-mono font-bold">{count}x Stream{count > 1 ? 's' : ''}</div>
              <div className="text-[10px] text-slate-400">
                {count === 1 ? 'Standard' : count === 4 ? 'Turbo' : count === 8 ? 'Extreme' : 'Enhanced'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Control 2: On-the-fly Compression (Gzip) & Chunk Size */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
        {/* Compression Toggle */}
        <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-indigo-600" />
              <span>On-the-Fly Stream Compression</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Compresses code, documents & text via Gzip
            </p>
          </div>

          <input
            type="checkbox"
            disabled={disabled}
            checked={settings.enableCompression}
            onChange={(e) => onChangeSettings({ ...settings, enableCompression: e.target.checked })}
            className="w-5 h-5 accent-[#cc785c] rounded cursor-pointer disabled:opacity-50"
          />
        </div>

        {/* Chunk Size Selector */}
        <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-800">Packet Buffer Chunk Size</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Packet payload framing size</p>
          </div>

          <select
            disabled={disabled}
            value={settings.chunkSize}
            onChange={(e) => onChangeSettings({ ...settings, chunkSize: parseInt(e.target.value, 10) as any })}
            className="px-2.5 py-1.5 text-xs font-mono font-semibold bg-white text-slate-800 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#cc785c] cursor-pointer disabled:opacity-50"
          >
            <option value={65536}>64 KiB</option>
            <option value={131072}>128 KiB</option>
            <option value={262144}>256 KiB</option>
          </select>
        </div>
      </div>

      {/* Speed Tip Footer */}
      <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
        <Info className="w-3.5 h-3.5 text-[#cc785c] shrink-0" />
        <span>
          <strong>WiFi / LAN Advice:</strong> For fastest transfers, ensure both devices are connected to the same 5 GHz WiFi or wired Gigabit switch.
        </span>
      </div>
    </div>
  );
};
