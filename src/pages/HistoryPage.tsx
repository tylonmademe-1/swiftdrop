import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/apiClient';
import { formatBytes } from '../utils/format';
import { useToast } from '../components/Toast';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  Trash2,
  Filter,
  ArrowRight,
  Calendar,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface TransferItem {
  id: string;
  direction: 'sent' | 'received';
  status: 'completed' | 'failed' | 'cancelled' | 'in_progress';
  started_at: number;
  completed_at: number | null;
  total_bytes: number;
  file_count: number;
  sender_device_label: string | null;
  receiver_device_label: string | null;
}

export const HistoryPage: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const { showToast } = useToast();
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [directionFilter, setDirectionFilter] = useState<'all' | 'sent' | 'received'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'failed' | 'cancelled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 15;

  const loadTransfers = async () => {
    setLoading(true);
    try {
      const data = await apiClient.fetchTransfers({
        direction: directionFilter === 'all' ? undefined : directionFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: searchQuery.trim() || undefined,
        limit: pageSize,
        offset: page * pageSize
      });
      setTransfers(data.transfers || []);
      setTotalCount(data.totalCount || 0);
    } catch {
      showToast('Failed to load transfer history', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransfers();
  }, [directionFilter, statusFilter, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    loadTransfers();
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Are you sure you want to clear your entire transfer history? Files saved on devices will not be affected.')) {
      return;
    }
    try {
      await apiClient.clearAllTransfers();
      showToast('Transfer history cleared.', 'success');
      loadTransfers();
    } catch {
      showToast('Failed to clear history', 'error');
    }
  };

  const handleDeleteItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await apiClient.deleteTransfer(id);
      showToast('Record deleted.', 'success');
      setTransfers((prev) => prev.filter((t) => t.id !== id));
      setTotalCount((c) => Math.max(0, c - 1));
    } catch {
      showToast('Could not delete record', 'error');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Transfer History
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Browse and inspect your previous device file exchanges.
          </p>
        </div>

        {transfers.length > 0 && (
          <button
            onClick={handleClearHistory}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear history</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs mb-6 space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by device label or filename..."
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#cc785c]"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-[#cc785c] hover:bg-[#b8674d] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          {/* Direction filters */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['all', 'sent', 'received'] as const).map((dir) => (
              <button
                key={dir}
                onClick={() => { setDirectionFilter(dir); setPage(0); }}
                className={`px-3 py-1 font-medium rounded-md transition-colors ${
                  directionFilter === dir
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {dir === 'all' ? 'All Direction' : dir === 'sent' ? 'Sent' : 'Received'}
              </button>
            ))}
          </div>

          {/* Status filters */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['all', 'completed', 'failed', 'cancelled'] as const).map((st) => (
              <button
                key={st}
                onClick={() => { setStatusFilter(st); setPage(0); }}
                className={`px-3 py-1 font-medium rounded-md transition-colors ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'all' ? 'All Status' : st === 'completed' ? 'Completed' : st === 'failed' ? 'Failed' : 'Cancelled'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Transfer List */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading history records...</div>
        ) : transfers.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {transfers.map((item) => (
              <div
                key={item.id}
                onClick={() => onNavigate(`history/${item.id}`)}
                className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      item.direction === 'sent'
                        ? 'bg-[#f5f0e8] text-[#cc785c]'
                        : 'bg-[#f5f0e8] text-[#00685a]'
                    }`}
                  >
                    {item.direction === 'sent' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {item.direction === 'sent' ? 'Sent to' : 'Received from'}{' '}
                        {item.direction === 'sent'
                          ? item.receiver_device_label || 'Receiver'
                          : item.sender_device_label || 'Sender'}
                      </p>
                      <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                        ({item.file_count} {item.file_count === 1 ? 'file' : 'files'})
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5 font-mono tabular-nums">
                      <span>{new Date(item.started_at).toLocaleDateString()}</span>
                      <span>·</span>
                      <span>{new Date(item.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span>·</span>
                      <span>{formatBytes(item.total_bytes)}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
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

                  <button
                    onClick={(e) => handleDeleteItem(e, item.id)}
                    className="p-1.5 text-slate-300 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                    title="Delete record"
                    aria-label="Delete transfer record"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center text-xs text-slate-400">
            No matching transfer records found.
          </div>
        )}

        {/* Pagination controls */}
        {totalCount > pageSize && (
          <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg"
              >
                Previous
              </button>
              <button
                disabled={(page + 1) * pageSize >= totalCount}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
