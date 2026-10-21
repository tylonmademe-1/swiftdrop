import React, { useState } from 'react';
import { FileTransferProgress } from '../types/transfer';
import { formatBytes } from '../utils/format';
import { saveFileToDevice, saveAllFiles } from '../services/fileSaveService';
import { Download, CheckCircle2, ShieldCheck, HardDrive, AlertCircle } from 'lucide-react';
import { useToast } from './Toast';

interface SaveFilesPanelProps {
  files: FileTransferProgress[];
  onFinish: () => void;
}

export const SaveFilesPanel: React.FC<SaveFilesPanelProps> = ({ files, onFinish }) => {
  const [fileStates, setFileStates] = useState<Record<string, { saved: boolean; saving: boolean; error?: string }>>({});
  const [isSavingAll, setIsSavingAll] = useState(false);
  const { showToast } = useToast();

  const handleSaveSingle = async (file: FileTransferProgress) => {
    if (!file.blob) return;

    setFileStates((prev) => ({
      ...prev,
      [file.fileId]: { saved: false, saving: true }
    }));

    const res = await saveFileToDevice(file.blob, file.name);

    if (res.success) {
      setFileStates((prev) => ({
        ...prev,
        [file.fileId]: { saved: true, saving: false }
      }));
      showToast(`Saved ${file.name} successfully`, 'success');
    } else {
      setFileStates((prev) => ({
        ...prev,
        [file.fileId]: { saved: false, saving: false, error: res.error }
      }));
      if (res.error && res.error !== 'Save was cancelled.') {
        showToast(`Could not save ${file.name}: ${res.error}`, 'error');
      }
    }
  };

  const handleSaveAll = async () => {
    const eligible = files
      .filter((f) => f.blob && !fileStates[f.fileId]?.saved)
      .map((f) => ({ blob: f.blob!, fileName: f.name, fileId: f.fileId }));

    if (eligible.length === 0) {
      showToast('All files have already been saved.', 'info');
      return;
    }

    setIsSavingAll(true);
    const result = await saveAllFiles(eligible);
    setIsSavingAll(false);

    // Mark saved
    setFileStates((prev) => {
      const next = { ...prev };
      eligible.forEach((item) => {
        next[item.fileId] = { saved: true, saving: false };
      });
      return next;
    });

    if (result.errors.length === 0) {
      showToast(`All ${result.savedCount} files saved to your device!`, 'success');
    } else {
      showToast(`Saved ${result.savedCount} files with ${result.errors.length} warnings.`, 'info');
    }
  };

  const allSaved = files.length > 0 && files.every((f) => fileStates[f.fileId]?.saved);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8 max-w-2xl w-full mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center mb-3">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <h3 className="text-2xl font-bold text-slate-900 mb-1">Transfer Complete!</h3>
        <p className="text-sm text-slate-600">
          All file bytes have arrived and passed SHA-256 cryptographic verification.
        </p>

        {/* Explicit distinction disclaimer */}
        <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <HardDrive className="w-3.5 h-3.5" />
          <span>Files are currently in browser memory. Save them to store on your device storage.</span>
        </div>
      </div>

      {/* Save All Action */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
        <div>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Files Available ({files.length})
          </span>
        </div>

        <button
          type="button"
          onClick={handleSaveAll}
          disabled={isSavingAll || allSaved}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isSavingAll ? 'Saving all...' : allSaved ? 'All files saved' : 'Save all files'}</span>
        </button>
      </div>

      {/* File List */}
      <div className="space-y-2.5 max-h-72 overflow-y-auto mb-6">
        {files.map((file) => {
          const state = fileStates[file.fileId];
          const isSaved = state?.saved;
          const isSaving = state?.saving;

          return (
            <div
              key={file.fileId}
              className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3 text-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800 truncate max-w-[200px] sm:max-w-[320px]" title={file.name}>
                    {file.name}
                  </span>
                  {file.hashMatched && (
                    <span className="text-[11px] text-emerald-600 flex items-center gap-0.5" title="SHA-256 Verified">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Verified</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                  <span>{formatBytes(file.size)}</span>
                  <span>·</span>
                  <span className={isSaved ? 'text-emerald-600 font-semibold' : 'text-slate-500'}>
                    {isSaved ? 'Saved to device' : 'Ready to save'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleSaveSingle(file)}
                disabled={isSaving || isSaved}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl transition-colors shrink-0 ${
                  isSaved
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {isSaved ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Saved</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'Saving...' : 'Save file'}</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Done Button */}
      <div className="pt-2">
        <button
          type="button"
          onClick={onFinish}
          className="w-full py-3 bg-[#cc785c] hover:bg-[#b8674d] text-white font-medium text-sm rounded-xl shadow-xs transition-colors cursor-pointer text-center"
        >
          Done & Close Session
        </button>
      </div>
    </div>
  );
};
