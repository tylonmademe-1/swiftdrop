import React from 'react';
import { OverallTransferProgress, FileTransferProgress } from '../types/transfer';
import { formatBytes, formatSpeed, formatDuration } from '../utils/format';
import { X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface TransferProgressProps {
  overall: OverallTransferProgress;
  fileList: FileTransferProgress[];
  onCancel: () => void;
  role: 'sender' | 'receiver';
}

export const TransferProgress: React.FC<TransferProgressProps> = ({
  overall,
  fileList,
  onCancel,
  role
}) => {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-md p-6 max-w-2xl w-full mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            {role === 'sender' ? 'Sending files...' : 'Receiving files...'}
          </h3>
          <p className="text-xs text-slate-500">
            Keep this browser tab open until the transfer completes.
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 rounded-xl text-xs font-medium text-slate-600 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          <span>Cancel transfer</span>
        </button>
      </div>

      {/* Main Overall Progress Bar */}
      <div className="space-y-2 mb-6">
        <div className="flex justify-between items-baseline text-sm">
          <span className="font-semibold text-slate-800 font-mono tabular-nums">
            {overall.percent}%
          </span>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {formatBytes(overall.transferredBytes)} / {formatBytes(overall.totalBytes)}
          </span>
        </div>

        <div className="w-full bg-[#f4f4f0] rounded-full h-3 overflow-hidden">
          <div
            className="bg-[#cc785c] h-full rounded-full transition-all duration-200 ease-out"
            style={{ width: `${overall.percent}%` }}
          />
        </div>

        {/* Real-time telemetry: Speed & ETA */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1 font-mono tabular-nums">
          <div className="flex items-center gap-2">
            <span>Speed: </span>
            <span className="font-semibold text-slate-800">
              {overall.speedBytesPerSec > 0 ? formatSpeed(overall.speedBytesPerSec) : 'Calculating...'}
            </span>
            {overall.effectiveSpeedBytesPerSec && overall.effectiveSpeedBytesPerSec > overall.speedBytesPerSec * 1.05 ? (
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                Effective: {formatSpeed(overall.effectiveSpeedBytesPerSec)} (Compressed)
              </span>
            ) : null}
          </div>

          <div>
            <span>Remaining: </span>
            <span className="font-semibold text-slate-800">
              {overall.etaSeconds !== null ? formatDuration(overall.etaSeconds) : 'Calculating...'}
            </span>
          </div>
        </div>
      </div>

      {/* Per-File Progress List */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Individual File Progress ({fileList.length})
        </h4>

        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-2xl bg-slate-50/50 p-2">
          {fileList.map((file) => (
            <div key={file.fileId} className="p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 truncate max-w-[240px] sm:max-w-[320px]">
                  <span className="font-medium text-slate-800 truncate" title={file.name}>
                    {file.name}
                  </span>
                  {file.isCompressed && (
                    <span className="text-[9px] font-bold px-1.5 py-0.2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded shrink-0">
                      Gzip
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 font-mono tabular-nums">
                  <span className="text-slate-500">
                    {formatBytes(file.bytesTransferred)} / {formatBytes(file.size)}
                  </span>

                  {file.status === 'completed' && (
                    <span className="text-emerald-600 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Done</span>
                    </span>
                  )}
                  {file.status === 'compressing' && (
                    <span className="text-amber-600 flex items-center gap-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Compressing</span>
                    </span>
                  )}
                  {file.status === 'verifying' && (
                    <span className="text-indigo-600 flex items-center gap-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying SHA-256</span>
                    </span>
                  )}
                  {file.status === 'transferring' && (
                    <span className="text-[#cc785c] font-medium">
                      {file.progressPercent}%
                    </span>
                  )}
                  {file.status === 'pending' && (
                    <span className="text-slate-400">Waiting</span>
                  )}
                  {file.status === 'failed' && (
                    <span className="text-rose-600 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Failed</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Progress bar per file */}
              <div className="w-full bg-[#f4f4f0] rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-150 ${
                    file.status === 'completed'
                      ? 'bg-emerald-500'
                      : file.status === 'failed'
                      ? 'bg-rose-500'
                      : file.status === 'verifying'
                      ? 'bg-amber-500'
                      : 'bg-[#cc785c]'
                  }`}
                  style={{ width: `${file.progressPercent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
