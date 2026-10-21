import React from 'react';
import {
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
  Code2,
  File,
  X,
  Trash2
} from 'lucide-react';
import { formatBytes, getFileCategory, FileCategory } from '../utils/format';

interface SelectedFileListProps {
  files: File[];
  onRemoveFile: (index: number) => void;
  onClearAll: () => void;
  onAddMore: () => void;
}

const CategoryIcon: React.FC<{ category: FileCategory }> = ({ category }) => {
  const iconProps = { className: 'w-5 h-5 shrink-0' };
  switch (category) {
    case 'image':
      return <ImageIcon {...iconProps} className="w-5 h-5 text-indigo-500" />;
    case 'video':
      return <Film {...iconProps} className="w-5 h-5 text-amber-500" />;
    case 'audio':
      return <Music {...iconProps} className="w-5 h-5 text-purple-500" />;
    case 'pdf':
    case 'doc':
      return <FileText {...iconProps} className="w-5 h-5 text-blue-500" />;
    case 'archive':
      return <Archive {...iconProps} className="w-5 h-5 text-emerald-500" />;
    case 'code':
      return <Code2 {...iconProps} className="w-5 h-5 text-cyan-500" />;
    default:
      return <File {...iconProps} className="w-5 h-5 text-slate-400" />;
  }
};

export const SelectedFileList: React.FC<SelectedFileListProps> = ({
  files,
  onRemoveFile,
  onClearAll,
  onAddMore
}) => {
  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Header bar */}
      <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-800">
            Selected Files ({files.length})
          </span>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            Total {formatBytes(totalBytes)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAddMore}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2.5 py-1 rounded-md hover:bg-blue-50 transition-colors"
          >
            + Add more
          </button>
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-rose-600 hover:text-rose-700 font-medium px-2 py-1 rounded-md hover:bg-rose-50 transition-colors flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* File Items */}
      <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
        {files.map((file, idx) => {
          const category = getFileCategory(file.name, file.type);
          return (
            <div
              key={`${file.name}-${file.size}-${idx}`}
              className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <CategoryIcon category={category} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-400 font-mono tabular-nums">
                    {formatBytes(file.size)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onRemoveFile(idx)}
                className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-colors shrink-0"
                aria-label={`Remove ${file.name}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
