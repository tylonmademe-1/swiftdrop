import React, { useState, useRef, useEffect } from 'react';
import { useToast } from '../components/Toast';
import { formatBytes } from '../utils/format';
import {
  TargetConvertFormat,
  EncodingQualityMode,
  convertImageFile,
  loadImageToCanvas
} from '../utils/fileConverter';

interface ConverterPageProps {
  onBackToHome?: () => void;
}

const FORMAT_OPTIONS: TargetConvertFormat[] = ['PDF', 'ZIP', 'PNG', 'JPG', 'GIF'];

export const ConverterPage: React.FC<ConverterPageProps> = () => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [targetFormat, setTargetFormat] = useState<TargetConvertFormat>('PDF');
  const [qualityMode, setQualityMode] = useState<EncodingQualityMode>('lossless');

  const [isConverting, setIsConverting] = useState(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('Ready for instant local transcode.');
  const [convertedResult, setConvertedResult] = useState<{
    url: string;
    filename: string;
    size: number;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (convertedResult?.url) {
        URL.revokeObjectURL(convertedResult.url);
      }
    };
  }, [convertedResult?.url]);

  const getFileExtensionBadge = (file: File): string => {
    const ext = file.name.split('.').pop()?.toUpperCase();
    if (ext && ext.length <= 5) return ext;
    if (file.type.includes('/')) {
      return file.type.split('/')[1].toUpperCase().slice(0, 4);
    }
    return 'IMG';
  };

  const processSelectedFile = async (file: File) => {
    if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|avif|bmp|gif)$/i.test(file.name)) {
      showToast('Please select a supported image file (PNG, JPG, JPEG, WEBP, AVIF, BMP, GIF)', 'error');
      return;
    }

    if (convertedResult?.url) {
      URL.revokeObjectURL(convertedResult.url);
    }

    setSelectedFile(file);
    setConvertedResult(null);
    setProgressPercent(0);
    setStatusMessage('Buffered in browser memory: ready for instant transcode.');

    try {
      const { width, height } = await loadImageToCanvas(file, false);
      setImageDimensions({ width, height });
    } catch {
      setImageDimensions(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processSelectedFile(file);
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const handleRemoveFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (convertedResult?.url) {
      URL.revokeObjectURL(convertedResult.url);
    }
    setSelectedFile(null);
    setImageDimensions(null);
    setConvertedResult(null);
    setProgressPercent(0);
    setStatusMessage('Ready for instant local transcode.');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleConvert = async () => {
    if (!selectedFile) {
      fileInputRef.current?.click();
      showToast('Select an image file first to convert', 'info');
      return;
    }

    setIsConverting(true);
    setProgressPercent(10);
    setStatusMessage('Compiling local buffer...');

    try {
      const result = await convertImageFile(
        selectedFile,
        targetFormat,
        qualityMode,
        (pct, statusText) => {
          setProgressPercent(pct);
          setStatusMessage(statusText);
        }
      );

      if (convertedResult?.url) {
        URL.revokeObjectURL(convertedResult.url);
      }

      const downloadUrl = URL.createObjectURL(result.blob);
      setConvertedResult({
        url: downloadUrl,
        filename: result.filename,
        size: result.size
      });
      setProgressPercent(100);
      setStatusMessage('Saved to Downloads.');

      triggerDownload(downloadUrl, result.filename);
      showToast(`Converted to ${result.filename} (${formatBytes(result.size)})!`, 'success');
    } catch (err: any) {
      console.error('[FileConverter] Conversion error:', err);
      setStatusMessage('Conversion failed. Try another image.');
      setProgressPercent(0);
      showToast(err?.message || 'Conversion failed. Please try another image.', 'error');
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="relative w-full flex-1 flex flex-col items-center px-3 sm:px-6 md:px-8 py-4 sm:py-8 md:py-12 sm:my-auto">
      {/* Ambient Radial Hue */}
      <div className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 w-full max-w-[45rem] h-[21.25rem] bg-gradient-to-b from-[#ffdbd0]/20 via-[#f5f0e8]/40 to-transparent blur-3xl rounded-full -z-10" />

      {/* Editorial Header — identical alignment and spacing to Send & Receive */}
      <div className="text-center max-w-xl mx-auto mb-5 sm:mb-8 space-y-2 sm:space-y-2.5 px-1">
        <h1 className="font-display text-3xl sm:text-4xl md:text-[46px] font-normal tracking-tight text-[#141413] leading-tight">
          File Converter. <span className="italic font-normal text-[#cc785c]">Local &amp; Lossless.</span>
        </h1>
        <p className="text-xs sm:text-[15px] text-[#6c6a64] tracking-normal font-normal">
          © tylonmademe
        </p>
      </div>

      {/* Main Converter Workspace Card — matched height & width with Send/Receive */}
      <div className="w-full max-w-[42.5rem] min-h-[26rem] sm:min-h-[30rem] bg-white rounded-2xl p-4 sm:p-7 border border-[#e6dfd8] shadow-[0_16px_48px_-16px_rgba(20,20,19,0.06)] flex flex-col justify-between relative">
        {/* Dropzone Interactive Area */}
        <div
          onClick={() => {
            if (!selectedFile) fileInputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`relative group cursor-pointer rounded-xl border transition-all duration-300 ease-out py-4 sm:py-5 px-4 sm:px-6 flex flex-col items-center justify-center text-center min-h-[9.5rem] sm:min-h-[10.5rem] ${
            isDragging
              ? 'bg-[#faf7f2] border-[#8f482f] shadow-md'
              : 'border-transparent bg-[#f4f4f0]/70 hover:bg-[#faf7f2] hover:border-[#8f482f]/60 hover:shadow-sm'
          }`}
        >
          {/* Hidden input for file trigger */}
          <input
            ref={fileInputRef}
            accept="image/png,image/jpeg,image/webp,image/avif,image/bmp,image/gif"
            onChange={handleFileChange}
            className="hidden"
            type="file"
          />

          {/* Aesthetic Accent Icon Enclosure */}
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#e8e0d2]/60 flex items-center justify-center text-[#8f482f] mb-2 sm:mb-2.5 shadow-xs animate-badge-pulse transition-transform duration-300 ease-out group-hover:-translate-y-1 group-hover:scale-105">
            <span className="material-symbols-outlined text-[24px] sm:text-[26px] transition-transform duration-300 ease-out group-hover:scale-110">
              upload_file
            </span>
          </div>

          {/* Typography Cue */}
          <h3 className="text-[14px] sm:text-[15px] font-semibold text-[#141413] mb-0.5 group-hover:text-[#8f482f] transition-colors">
            Select an image to convert
          </h3>
          <p className="text-[11px] sm:text-[12px] text-[#6c6a64] mb-2.5 sm:mb-3 max-w-xs leading-snug">
            Supports high-bitrate PNG, JPG, JPEG, WEBP, AVIF, BMP, GIF
          </p>

          {/* Interactive Browse CTA Pill */}
          <div className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-lg bg-white text-[#141413] text-[11px] sm:text-[12px] font-medium shadow-xs transition-all duration-200 hover:bg-[#8f482f] hover:text-white active:scale-95 group/btn">
            <span className="material-symbols-outlined text-[15px] text-[#8f482f] transition-colors duration-200 group-hover/btn:text-white">
              folder_open
            </span>
            <span>Drop file here or browse device</span>
          </div>

          {/* Active File Loaded Preview Panel */}
          {selectedFile && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-0 z-30 bg-white/95 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between backdrop-blur-xs border border-[#e6dfd8]"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 sm:gap-3 text-left min-w-0">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#ffdbd0]/50 flex items-center justify-center text-[#8f482f] font-code font-semibold text-xs shrink-0">
                    {getFileExtensionBadge(selectedFile)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] sm:text-[14px] font-semibold text-[#141413] truncate max-w-[160px] sm:max-w-[360px]">
                      {selectedFile.name}
                    </p>
                    <p className="text-[11px] sm:text-[12px] text-[#6c6a64] font-code truncate">
                      {formatBytes(selectedFile.size)}
                      {imageDimensions ? ` • ${imageDimensions.width}×${imageDimensions.height} px` : ''}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRemoveFile}
                  title="Remove file"
                  className="w-8 h-8 rounded-full bg-[#f5f0e8] hover:bg-[#e8e0d2] flex items-center justify-center text-[#6c6a64] hover:text-[#141413] transition-colors cursor-pointer shrink-0"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 sm:px-3 py-2 rounded-lg bg-[#f5f0e8] text-[#252523] font-code text-[11px] sm:text-[12px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="material-symbols-outlined text-[#5db872] text-[15px] sm:text-[16px] shrink-0">
                    check_circle
                  </span>
                  <span className="truncate">
                    {convertedResult
                      ? `Converted: ${convertedResult.filename} (${formatBytes(convertedResult.size)})`
                      : 'Buffered in browser memory: ready for instant transcode'}
                  </span>
                </div>

                {convertedResult && (
                  <button
                    type="button"
                    onClick={() => triggerDownload(convertedResult.url, convertedResult.filename)}
                    className="text-[#8f482f] hover:underline font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <span className="material-symbols-outlined text-[14px]">download</span>
                    <span>Save Again</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Configuration Module */}
        <div className="mt-4 flex flex-col gap-3.5">
          {/* Target Format Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[13px] font-medium text-[#141413]">Target Format</label>
            </div>
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              {FORMAT_OPTIONS.map((fmt) => {
                const isSelected = targetFormat === fmt;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setTargetFormat(fmt)}
                    className={`py-2 px-1.5 sm:px-3 rounded-lg text-center text-[12px] sm:text-[13px] font-medium transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#8f482f] text-white shadow-xs'
                        : 'bg-[#f5f0e8] text-[#252523] hover:bg-[#efeeea]'
                    }`}
                  >
                    {fmt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Compression Quality Settings */}
          <div className="bg-[#f5f0e8]/60 rounded-xl px-3.5 sm:px-4 py-2.5 sm:py-3 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12px] sm:text-[13px] text-[#141413] font-medium">Encoding Mode</span>
              <div className="inline-flex p-0.5 rounded-lg bg-[#e8e0d2] text-[11px] sm:text-[12px] font-medium">
                <button
                  type="button"
                  onClick={() => setQualityMode('lossless')}
                  className={`px-2 sm:px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    qualityMode === 'lossless'
                      ? 'bg-white text-[#141413] shadow-xs'
                      : 'text-[#6c6a64] hover:text-[#141413]'
                  }`}
                >
                  Lossless (100%)
                </button>
                <button
                  type="button"
                  onClick={() => setQualityMode('balanced')}
                  className={`px-2 sm:px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    qualityMode === 'balanced'
                      ? 'bg-white text-[#141413] shadow-xs'
                      : 'text-[#6c6a64] hover:text-[#141413]'
                  }`}
                >
                  Balanced (85%)
                </button>
              </div>
            </div>
          </div>

          {/* Progress Tracker Bar */}
          <div className="flex flex-col gap-1.5 pt-0.5">
            <div className="flex justify-between gap-2 text-[11px] sm:text-xs font-code text-[#6c6a64]">
              <span className="truncate">{statusMessage}</span>
              <span className="text-[#141413] font-medium tabular-nums shrink-0">{progressPercent}%</span>
            </div>
            <div className="w-full h-1.5 bg-[#f5f0e8] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#8f482f] rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Execution Action Button */}
          <button
            type="button"
            onClick={handleConvert}
            disabled={isConverting}
            className="w-full mt-1 h-11 bg-[#8f482f] hover:bg-[#a9583e] active:scale-[0.99] text-white font-medium text-[14px] rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[18px]">bolt</span>
            <span>{isConverting ? 'Converting...' : 'Convert'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
