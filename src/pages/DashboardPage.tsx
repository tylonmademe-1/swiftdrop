import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../services/apiClient';
import { formatBytes } from '../utils/format';
import {
  UploadCloud,
  DownloadCloud,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  ArrowRight,
  Laptop
} from 'lucide-react';

interface DashboardSummary {
  successfulTransfers: number;
  totalSentBytes: number;
  totalReceivedBytes: number;
  failedOrCancelledTransfers: number;
  recentActivity: any[];
}

export const DashboardPage: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .fetchDashboardSummary()
      .then((data) => setSummary(data))
      .catch((err) => console.warn('Failed to fetch dashboard', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Welcome back, {user?.displayName || 'User'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Overview of your device-to-device file transfer activities.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('send')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#cc785c] hover:bg-[#b8654a] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Send files</span>
          </button>
          <button
            onClick={() => onNavigate('receive')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#f4f4f0] hover:bg-[#e8e0d2] text-[#141413] text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer border border-[#e6dfd8]"
          >
            <DownloadCloud className="w-4 h-4" />
            <span>Receive files</span>
          </button>
        </div>
      </div>

      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Completed Transfers
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-slate-900 font-mono tabular-nums">
            {loading ? '—' : summary?.successfulTransfers ?? 0}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Verified cross-device transfers</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Sent
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#f5f0e8] text-[#cc785c] flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-slate-900 font-mono tabular-nums">
            {loading ? '—' : formatBytes(summary?.totalSentBytes ?? 0)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Streamed directly from your devices</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Received
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-slate-900 font-mono tabular-nums">
            {loading ? '—' : formatBytes(summary?.totalReceivedBytes ?? 0)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Downloaded and saved to your devices</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Cancelled / Incomplete
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-slate-900 font-mono tabular-nums">
            {loading ? '—' : summary?.failedOrCancelledTransfers ?? 0}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Declined or interrupted sessions</p>
        </div>
      </div>

      {/* Recent Activity Section */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <h3 className="font-bold text-slate-900 text-sm">Recent Transfer Activity</h3>
          </div>
          <button
            onClick={() => onNavigate('history')}
            className="text-xs font-semibold text-[#cc785c] hover:text-[#b8654a] flex items-center gap-1 cursor-pointer"
          >
            <span>View all history</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {summary?.recentActivity && summary.recentActivity.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {summary.recentActivity.map((item) => (
              <div
                key={item.id}
                onClick={() => onNavigate(`history/${item.id}`)}
                className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      item.direction === 'sent'
                        ? 'bg-[#f5f0e8] text-[#cc785c]'
                        : 'bg-[#f5f0e8] text-[#00685a]'
                    }`}
                  >
                    {item.direction === 'sent' ? (
                      <ArrowUpRight className="w-4 h-4" />
                    ) : (
                      <ArrowDownLeft className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 flex items-center gap-2">
                      <span>{item.direction === 'sent' ? 'Sent Files' : 'Received Files'}</span>
                      <span className="text-[11px] font-normal text-slate-400">·</span>
                      <span className="text-[11px] font-normal text-slate-500 font-mono tabular-nums">
                        {item.file_count} {item.file_count === 1 ? 'file' : 'files'}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                      <span>{new Date(item.started_at).toLocaleDateString()} {new Date(item.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {item.sender_device_label && (
                         <>
                          <span>·</span>
                          <span className="truncate max-w-[120px]">{item.sender_device_label}</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-xs font-semibold text-slate-800 font-mono tabular-nums">
                    {formatBytes(item.total_bytes)}
                  </span>
                  <span
                    className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${
                      item.status === 'completed'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : item.status === 'in_progress'
                        ? 'bg-[#f5f0e8] text-[#cc785c] border-[#e6dfd8]'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 mx-auto flex items-center justify-center mb-3">
              <Laptop className="w-6 h-6" />
            </div>
            <h4 className="font-semibold text-slate-900 text-sm mb-1">No transfers yet</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
              Your transfer history and real-time statistics will be recorded here when you transfer files.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => onNavigate('send')}
                className="px-4 py-2 bg-[#cc785c] hover:bg-[#b8654a] text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                Send files now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
