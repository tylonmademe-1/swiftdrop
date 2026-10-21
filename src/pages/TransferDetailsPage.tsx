import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/apiClient';
import { formatBytes } from '../utils/format';
import { useToast } from '../components/Toast';
import {
  ArrowLeft,
  Download,
  Trash2,
  ShieldCheck,
  Calendar,
  Laptop,
  CheckCircle2,
  AlertCircle,
  FileText
} from 'lucide-react';

interface TransferDetailsProps {
  transferId: string;
  onNavigate: (route: string) => void;
}

export const TransferDetailsPage: React.FC<TransferDetailsProps> = ({ transferId, onNavigate }) => {
  const { showToast } = useToast();
  const [transfer, setTransfer] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .fetchTransferDetails(transferId)
      .then((data) => setTransfer(data.transfer))
      .catch(() => showToast('Failed to load transfer details', 'error'))
      .finally(() => setLoading(false));
  }, [transferId]);

  const handleDownloadReceipt = async () => {
    try {
      showToast('Downloading transfer metadata receipt...', 'info');
      await apiClient.downloadTransferReceipt(transferId);
      showToast('Transfer receipt downloaded.', 'success');
    } catch {
      showToast('Failed to download transfer receipt', 'error');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this transfer record from your history?')) return;
    try {
      await apiClient.deleteTransfer(transferId);
      showToast('Record deleted.', 'success');
      onNavigate('history');
    } catch {
      showToast('Failed to delete record', 'error');
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-xs text-slate-400">
        Loading transfer record...
      </div>
    );
  }

  if (!transfer) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center space-y-4">
        <h3 className="font-bold text-slate-800">Transfer Record Not Found</h3>
        <p className="text-xs text-slate-500">This transfer may have been deleted or does not exist.</p>
        <button
          onClick={() => onNavigate('history')}
          className="px-4 py-2 bg-[#cc785c] hover:bg-[#b8674d] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
        >
          Back to history
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Top back action */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => onNavigate('history')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6c6a64] hover:text-[#141413] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to transfer history</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadReceipt}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#cc785c] hover:bg-[#b8674d] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Receipt</span>
          </button>
          <button
            onClick={handleDelete}
            className="p-2 text-[#8d8a82] hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
            title="Delete record"
            aria-label="Delete transfer record"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Details Card */}
      <div className="bg-white rounded-3xl border border-[#e6dfd8] shadow-xs overflow-hidden mb-6">
        <div className="p-6 border-b border-[#e6dfd8] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-slate-400">ID: {transfer.id}</span>
              <span
                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                  transfer.status === 'completed'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                {transfer.status}
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              {transfer.direction === 'sent' ? 'Outgoing File Transfer' : 'Incoming File Transfer'}
            </h2>
          </div>

          <div className="text-left sm:text-right text-xs text-slate-500 font-mono tabular-nums">
            <p className="font-semibold text-slate-900 text-base">{formatBytes(transfer.total_bytes)}</p>
            <p>{transfer.file_count} {transfer.file_count === 1 ? 'file' : 'files'}</p>
          </div>
        </div>

        {/* Telemetry Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#e6dfd8] bg-[#faf9f5]/50 p-6 text-xs text-[#6c6a64]">
          <div className="space-y-1 pb-3 sm:pb-0 sm:pr-4">
            <span className="text-[11px] font-semibold text-[#8d8a82] uppercase tracking-wider block">
              Sender Device
            </span>
            <p className="font-medium text-[#141413]">{transfer.sender_device_label || 'Web Client'}</p>
          </div>

          <div className="space-y-1 py-3 sm:py-0 sm:px-4">
            <span className="text-[11px] font-semibold text-[#8d8a82] uppercase tracking-wider block">
              Receiver Device
            </span>
            <p className="font-medium text-[#141413]">{transfer.receiver_device_label || 'Web Client'}</p>
          </div>

          <div className="space-y-1 pt-3 sm:pt-0 sm:pl-4">
            <span className="text-[11px] font-semibold text-[#8d8a82] uppercase tracking-wider block">
              Timestamp
            </span>
            <p className="font-mono tabular-nums text-[#141413]">
              {new Date(transfer.started_at).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Files Manifest Table */}
      <div className="bg-white rounded-3xl border border-[#e6dfd8] shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-[#e6dfd8] flex items-center justify-between">
          <h3 className="font-bold text-[#141413] text-sm">Transferred Files ({transfer.files?.length || 0})</h3>
          <span className="text-xs text-[#8d8a82]">SHA-256 Integrity Audit</span>
        </div>

        <div className="divide-y divide-[#e6dfd8]">
          {transfer.files?.map((file: any) => (
            <div key={file.id} className="px-6 py-3.5 flex items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 truncate" title={file.original_filename}>
                    {file.original_filename}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono tabular-nums">
                    {formatBytes(file.declared_size)} {file.mime_type && `· ${file.mime_type}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1 ${
                    file.verification_status === 'verified'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <ShieldCheck className="w-3 h-3" />
                  <span>{file.verification_status === 'verified' ? 'SHA-256 Verified' : file.verification_status}</span>
                </span>

                <span className="text-[11px] text-slate-400 font-mono">
                  {file.saved_status === 'saved' ? 'Saved to disk' : 'In memory/cache'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
