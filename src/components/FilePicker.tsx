import React, { useRef, useState } from 'react';
import { UploadCloud, FolderPlus, FilePlus } from 'lucide-react';
import { formatBytes } from '../utils/format';

interface FilePickerProps {
  onFilesSelected: (files: File[]) => void;
  maxFilesCount: number;
  maxTotalSizeBytes: number;
  maxFileSizeBytes: number;
}

export const FilePicker: React.FC<FilePickerProps> = ({
  onFilesSelected,
  maxFilesCount,
  maxTotalSizeBytes,
  maxFileSizeBytes
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      onFilesSelected(droppedFiles);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
      e.target.value = ''; // reset so same files can be re-selected if removed
    }
  };

  return (
    <div className="w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all ${
          isDragOver
            ? 'border-[#cc785c] bg-[#f5f0e8] scale-[0.99]'
            : 'border-[#e6dfd8] hover:border-[#cc785c]/40 bg-white'
        }`}
      >
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#f5f0e8] text-[#cc785c] flex items-center justify-center">
          <UploadCloud className="w-8 h-8" />
        </div>

        <h3 className="text-lg font-semibold text-[#141413] mb-1">
          Drop your files here to start transfer
        </h3>
        <p className="text-sm text-[#6c6a64] mb-6 max-w-md mx-auto">
          Share photos, videos, documents, or archives directly between devices.
          Zero cloud upload.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#cc785c] hover:bg-[#b8654a] text-white font-medium text-sm rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <FilePlus className="w-4 h-4" />
            <span>Choose files</span>
          </button>

          <input
            ref={folderInputRef}
            type="file"
            // @ts-ignore
            webkitdirectory="true"
            directory=""
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm rounded-xl transition-colors cursor-pointer"
          >
            <FolderPlus className="w-4 h-4 text-slate-500" />
            <span>Choose folder</span>
          </button>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
          <span>Max {maxFilesCount} files</span>
          <span aria-hidden="true">·</span>
          <span>Up to {formatBytes(maxFileSizeBytes)} per file</span>
          <span aria-hidden="true">·</span>
          <span>Total batch limit {formatBytes(maxTotalSizeBytes)}</span>
        </div>
      </div>
    </div>
  );
};
