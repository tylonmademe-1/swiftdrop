import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, RefreshCw, AlertTriangle, Upload, CheckCircle2 } from 'lucide-react';
import { createQRScanner, decodeQRFromImageFile, QRScannerController } from '../services/qrService';
import { isQRFerryFrame, QRFerryReceiver, QRFerryReceiveProgress } from '../services/qrFerryService';
import { formatBytes } from '../utils/format';

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScanResult: (result: { code?: string; sessionId?: string; token?: string }) => void;
  onOpticalFileReceived?: (file: { blob: Blob; name: string; size: number; verified: boolean }) => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({
  isOpen,
  onClose,
  onScanResult,
  onOpticalFileReceived
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const ferryReceiverRef = useRef<QRFerryReceiver>(new QRFerryReceiver());

  const [scanner, setScanner] = useState<QRScannerController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const [opticalProgress, setOpticalProgress] = useState<QRFerryReceiveProgress | null>(null);

  const handleDecodedQRData = async (data: string, scannerInstance?: QRScannerController | null) => {
    // 1. Check if this is a QRFerry live optical data transfer frame (deedy/qr-data-transfer protocol)
    if (isQRFerryFrame(data)) {
      const progress = await ferryReceiverRef.current.processFrame(data);
      if (progress) {
        setOpticalProgress({ ...progress });
        if (progress.isComplete && progress.blob) {
          scannerInstance?.stop();
          if (onOpticalFileReceived) {
            onOpticalFileReceived({
              blob: progress.blob,
              name: progress.fileName,
              size: progress.originalSize,
              verified: Boolean(progress.verified)
            });
          }
          onClose();
        }
      }
      return;
    }

    // 2. Otherwise, check if it's a SwiftDrop network session QR (URL or 6-character code)
    try {
      let urlObj: URL;
      if (data.startsWith('http://') || data.startsWith('https://')) {
        urlObj = new URL(data);
      } else {
        urlObj = new URL(data, window.location.origin);
      }

      const sessionId = urlObj.searchParams.get('session');
      const token = urlObj.searchParams.get('token');
      const code = urlObj.searchParams.get('code');

      if (sessionId && token) {
        scannerInstance?.stop();
        onScanResult({ sessionId, token, code: code || undefined });
        onClose();
        return;
      }
      if (code) {
        scannerInstance?.stop();
        onScanResult({ code });
        onClose();
        return;
      }
    } catch {
      // Not a URL, check raw 6-character session code
    }

    const cleanCode = data.trim().replace(/[^A-Za-z]/g, '');
    if (cleanCode.length === 6) {
      scannerInstance?.stop();
      const formatted = `${cleanCode.slice(0, 3)}-${cleanCode.slice(3)}`.toUpperCase();
      onScanResult({ code: formatted });
      onClose();
      return;
    }

    setError('Scanned QR code does not contain a valid SwiftDrop session or QRFerry stream.');
  };

  useEffect(() => {
    if (!isOpen) {
      if (scanner) {
        scanner.stop();
        setScanner(null);
      }
      ferryReceiverRef.current.reset();
      setOpticalProgress(null);
      setError(null);
      return;
    }

    ferryReceiverRef.current.reset();
    setOpticalProgress(null);
    const scannerInstance = createQRScanner();
    setScanner(scannerInstance);
    setIsStarting(true);
    setError(null);

    const timer = setTimeout(() => {
      if (videoRef.current) {
        scannerInstance
          .start(videoRef.current, (data: string) => {
            handleDecodedQRData(data, scannerInstance);
          })
          .then(() => {
            setIsStarting(false);
          })
          .catch((err: any) => {
            setIsStarting(false);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
              setError(
                'Camera permission was denied. You can snap a QR photo below or enter the 6-digit Session Code manually.'
              );
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
              setError('No camera was found on this device. Please use "Scan QR Photo" or enter the Session Code.');
            } else if (err.name === 'NotReadableError') {
              setError('Camera is currently in use by another app or browser tab.');
            } else {
              setError(
                err.message ||
                  'Live camera requires HTTPS on mobile browsers. Tap "Snap / Upload QR Photo" below or enter the Session Code.'
              );
            }
          });
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      scannerInstance.stop();
    };
  }, [isOpen]);

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const decoded = await decodeQRFromImageFile(file);
    if (decoded) {
      setError(null);
      await handleDecodedQRData(decoded, scanner);
    } else {
      setError('Could not detect a clear QR code in that photo. Please try again or enter the 6-digit code.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141413]/50 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-[#e6dfd8]">
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoFileChange}
          className="hidden"
        />

        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[#e6dfd8] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-[#cc785c]" />
            <h3 className="font-semibold text-[#141413] text-base">
              {opticalProgress ? 'Receiving QRFerry Optical Stream' : 'Scan Sender QR'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#6c6a64] hover:text-[#141413] rounded-xl hover:bg-[#f5f0e8] transition-colors cursor-pointer"
            aria-label="Close camera scanner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport Area */}
        <div className="relative bg-[#141413] aspect-square flex items-center justify-center overflow-hidden">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />

          {/* Viewfinder Target Graphic */}
          {!error && !isStarting && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-10">
              <div className="w-56 h-56 border-2 border-white/80 rounded-2xl relative shadow-lg">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-[#cc785c] rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-[#cc785c] rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-[#cc785c] rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-[#cc785c] rounded-br-lg" />
                <div className="w-full h-0.5 bg-[#cc785c] absolute top-1/2 -translate-y-1/2 shadow-sm animate-pulse" />
              </div>
            </div>
          )}

          {/* QRFerry Live Optical Stream Progress HUD */}
          {opticalProgress && (
            <div className="absolute bottom-3 left-3 right-3 bg-[#141413]/90 backdrop-blur-md border border-white/15 rounded-2xl p-3.5 text-white space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold truncate max-w-[65%] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#5db872] shrink-0" />
                  {opticalProgress.fileName} ({formatBytes(opticalProgress.originalSize)})
                </span>
                <span className="font-code text-[#cc785c] font-bold">{opticalProgress.percent}%</span>
              </div>
              <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#cc785c] transition-all duration-150 rounded-full"
                  style={{ width: `${opticalProgress.percent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#a09d96] font-code">
                <span>
                  Frames: {opticalProgress.receivedSourceFrames}/{opticalProgress.totalSourceFrames}
                  {opticalProgress.repairFramesCollected > 0
                    ? ` (+${opticalProgress.repairFramesCollected} repair)`
                    : ''}
                </span>
                <span>Keep camera steady on animated QR</span>
              </div>
            </div>
          )}

          {isStarting && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#141413] text-white gap-3 p-6 text-center">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              <p className="text-sm text-[#a09d96]">Accessing camera...</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#141413]/95 text-white gap-3 p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-[#cc785c]/20 text-[#cc785c] flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <p className="text-xs font-medium text-[#e6dfd8] leading-relaxed max-w-xs">{error}</p>
              <div className="flex flex-col sm:flex-row items-center gap-2 mt-2 w-full justify-center">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="px-4 py-2.5 bg-[#cc785c] text-white text-xs font-semibold rounded-xl hover:bg-[#b8654a] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Snap / Upload QR Photo</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 bg-white text-[#141413] text-xs font-semibold rounded-xl hover:bg-[#f4f4f0] transition-colors cursor-pointer"
                >
                  Enter Code Manually
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-[#faf9f5] border-t border-[#e6dfd8] flex items-center justify-between gap-2 text-xs text-[#6c6a64]">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#e6dfd8] rounded-lg text-[#141413] hover:bg-[#f4f4f0] transition-colors font-medium cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-[#cc785c]" />
            <span>Scan Photo</span>
          </button>

          {scanner?.switchCamera && !error ? (
            <button
              type="button"
              onClick={() => scanner.switchCamera?.()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#e6dfd8] rounded-lg text-[#141413] hover:bg-[#f4f4f0] transition-colors font-medium cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#cc785c]" />
              <span>Flip Camera</span>
            </button>
          ) : (
            <span className="truncate">Supports Pairing QR &amp; QRFerry Stream</span>
          )}
        </div>
      </div>
    </div>
  );
};
