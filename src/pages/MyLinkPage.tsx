import React, { useState } from 'react';
import { Link2, Copy, Trash2, Clock, Download, ExternalLink, HardDrive, Plus, Check } from 'lucide-react';
import { useToast } from '../components/Toast';
import { formatBytes } from '../utils/format';

interface MyLinkPageProps {
  onNavigate: (route: string) => void;
}

interface StoredLink {
  key: string;
  name: string;
  size: number;
  filesCount: number;
  createdAt: number;
  expiresAt: number;
  downloadCount: number;
  url: string;
}

export const MyLinkPage: React.FC<MyLinkPageProps> = ({ onNavigate }) => {
  const { showToast } = useToast();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Active links stored locally
  const [links, setLinks] = useState<StoredLink[]>([
    {
      key: '849201',
      name: 'Project_Assets_Final.zip',
      size: 48291000,
      filesCount: 6,
      createdAt: Date.now() - 3600000 * 2,
      expiresAt: Date.now() + 3600000 * 46,
      downloadCount: 3,
      url: `${window.location.origin}/#receive`
    }
  ]);

  const totalUsedBytes = links.reduce((acc, l) => acc + l.size, 0);
  const totalQuotaBytes = 1000 * 1024 * 1024 * 1024; // 1 TB (SwiftDrop Plus)

  const handleCopyLink = (link: StoredLink) => {
    navigator.clipboard.writeText(link.url);
    setCopiedKey(link.key);
    showToast('Link copied to clipboard', 'success');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDeleteLink = (key: string) => {
    setLinks(links.filter((l) => l.key !== key));
    showToast('Link deleted successfully', 'info');
  };

  const formatRemainingTime = (expiresAt: number) => {
    const diffMs = expiresAt - Date.now();
    if (diffMs <= 0) return 'Expired';
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m left`;
  };

  return (
    <div className="w-full bg-white text-[#212529] py-8 sm:py-12 px-4 sm:px-6 md:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-[#ebebeb] mb-8 gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#212529] tracking-tight">
              My Link
            </h1>
            <p className="text-xs sm:text-sm text-[#666666] mt-1">
              Manage your active shareable links, storage, and download access.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#fe4543] hover:bg-[#d83f53] text-white text-xs font-bold transition-all shadow-xs cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Link</span>
          </button>
        </div>

        {/* Storage Bar (Send Anywhere Storage Banner) */}
        <div className="p-5 rounded-2xl bg-[#fafafa] border border-[#ebebeb] mb-8">
          <div className="flex items-center justify-between text-xs font-bold mb-2">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-[#fe4543]" />
              <span className="text-[#212529]">Cloud Storage</span>
            </div>
            <div className="text-[#666666] font-code">
              <span className="text-[#fe4543] font-bold">{formatBytes(totalUsedBytes)}</span>
              <span> / 1 TB</span>
            </div>
          </div>

          <div className="w-full bg-[#e0e4e6] h-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#fe4543] rounded-full transition-all duration-300"
              style={{ width: `${Math.max(1, (totalUsedBytes / totalQuotaBytes) * 100)}%` }}
            />
          </div>
        </div>

        {/* Links List */}
        {links.length === 0 ? (
          <div className="text-center py-16 px-4 border border-dashed border-[#e0e4e6] rounded-2xl bg-[#fafafa]">
            <div className="w-16 h-16 rounded-full bg-[#fff0f2] text-[#fe4543] flex items-center justify-center mx-auto mb-4">
              <Link2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-[#212529]">No active links</h3>
            <p className="text-xs text-[#666666] max-w-sm mx-auto mt-1 mb-6">
              When you upload files using the Link option on the transfer card, your active links will appear here.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className="px-5 py-2.5 rounded-lg bg-[#fe4543] hover:bg-[#d83f53] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              Upload Files
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {links.map((link) => (
              <div
                key={link.key}
                className="p-4 sm:p-5 rounded-xl border border-[#ebebeb] bg-white shadow-xs hover:border-[#fe4543]/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#212529] truncate" title={link.name}>
                      {link.name}
                    </span>
                    <span className="text-[11px] font-mono text-[#9b9b9b] bg-[#f1f1f1] px-2 py-0.5 rounded">
                      Key: {link.key}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-[#666666] mt-1.5 flex-wrap">
                    <span className="font-code">{formatBytes(link.size)}</span>
                    <span>•</span>
                    <span>{link.filesCount} file(s)</span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-[#00685a] font-medium">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatRemainingTime(link.expiresAt)}</span>
                    </span>
                    <span>•</span>
                    <span>{link.downloadCount} downloads</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => handleCopyLink(link)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#f8f9fa] hover:bg-[#ebebeb] text-[#212529] text-xs font-bold border border-[#e0e4e6] transition-colors cursor-pointer"
                    title="Copy Link"
                  >
                    {copiedKey === link.key ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#5db872]" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteLink(link.key)}
                    className="p-2 rounded-lg bg-[#f8f9fa] hover:bg-[#fff0f2] text-[#9b9b9b] hover:text-[#fe4543] border border-[#e0e4e6] transition-colors cursor-pointer"
                    title="Delete Link"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
