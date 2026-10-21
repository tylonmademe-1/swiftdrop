import React from 'react';
import { TransferManifest } from '../types/transfer';
import { formatBytes, getFileCategory } from '../utils/format';
import { ShieldAlert, Check, X, FileText, Image as ImageIcon, Film, Music, Archive, File } from 'lucide-react';

interface IncomingTransferDialogProps {
  manifest: TransferManifest;
  onAccept: () => void;
  onDecline: () => void;
}

export const IncomingTransferDialog: React.FC<IncomingTransferDialogProps> = ({
  manifest,
  onAccept,
  onDecline
}) => {
  const isLargeTransfer = manifest.totalBytes > 1024 * 1024 * 1024; // > 1 GB

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden max-w-lg w-full mx-auto">
      {/* Header */}
      <div className="p-6 bg-slate-50 border-b border-slate-200 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#f5f0e8] text-[#cc785c] mx-auto flex items-center justify-center mb-3">
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-[#141413] mb-1">Incoming Transfer Request</h3>
        <p className="text-sm text-[#6c6a64]">
          <span className="font-semibold text-[#141413]">{manifest.senderLabel}</span> wants to share{' '}
          <span className="font-semibold text-[#141413]">{manifest.totalFiles} {manifest.totalFiles === 1 ? 'file' : 'files'}</span> (
          <span className="font-code tabular-nums font-semibold">{formatBytes(manifest.totalBytes)}</span>)
        </p>
      </div>

      {/* Warning for large batches */}
      {isLargeTransfer && (
        <div className="mx-6 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2.5 text-xs text-amber-800">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          <span>This transfer exceeds 1 GB. Ensure your device has enough memory and storage space.</span>
        </div>
      )}

      {/* File List */}
      <div className="p-6">
        <p className="text-xs font-semibold text-[#8e8b82] uppercase tracking-wider mb-2">
          Files proposed for transfer ({manifest.files.length})
        </p>
        <div className="max-h-56 overflow-y-auto divide-y divide-[#ebe6df] border border-[#e6dfd8] rounded-2xl bg-[#faf9f5]">
          {manifest.files.map((file, idx) => {
            const category = getFileCategory(file.name, file.type);
            return (
              <div
                key={`${file.name}-${idx}`}
                className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="text-slate-400 shrink-0">
                    {category === 'image' && <ImageIcon className="w-4 h-4 text-[#cc785c]" />}
                    {category === 'video' && <Film className="w-4 h-4 text-amber-500" />}
                    {category === 'audio' && <Music className="w-4 h-4 text-purple-500" />}
                    {category === 'pdf' && <FileText className="w-4 h-4 text-[#cc785c]" />}
                    {category === 'archive' && <Archive className="w-4 h-4 text-emerald-500" />}
                    {category !== 'image' && category !== 'video' && category !== 'audio' && category !== 'pdf' && category !== 'archive' && (
                      <File className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <span className="font-medium text-[#141413] truncate" title={file.name}>
                    {file.name}
                  </span>
                </div>
                <span className="text-xs text-[#6c6a64] font-code tabular-nums shrink-0">
                  {formatBytes(file.size)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Decision Buttons */}
      <div className="px-6 pb-6 pt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={onDecline}
          className="flex-1 py-3 px-4 border border-[#e6dfd8] hover:bg-[#f5f0e8] text-[#6c6a64] font-medium text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <X className="w-4 h-4" />
          <span>Decline</span>
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="flex-1 py-3 px-4 bg-[#cc785c] hover:bg-[#b8654a] text-white font-semibold text-sm rounded-xl transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
        >
          <Check className="w-4 h-4" />
          <span>Accept files</span>
        </button>
      </div>
    </div>
  );
};
