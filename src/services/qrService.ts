import QRCode from 'qrcode';
import jsQR from 'jsqr';

export async function generateQRCode(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 320,
    margin: 2,
    color: {
      dark: '#141413',
      light: '#FFFFFF'
    },
    errorCorrectionLevel: 'M'
  });
}

/**
 * Decodes a QR code from a camera photo or uploaded image File (fallback for HTTP mobile origins)
 */
export async function decodeQRFromImageFile(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const maxDim = 1280;
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth'
      });
      resolve(code?.data || null);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}

export interface QRScannerController {
  start: (videoEl: HTMLVideoElement, onScan: (code: string) => void) => Promise<void>;
  stop: () => void;
  switchCamera?: () => Promise<void>;
}

export function createQRScanner(): QRScannerController {
  let stream: MediaStream | null = null;
  let animationFrameId: number | null = null;
  let currentFacingMode: 'environment' | 'user' = 'environment';
  let activeVideoEl: HTMLVideoElement | null = null;
  let activeOnScan: ((code: string) => void) | null = null;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });

  async function start(videoEl: HTMLVideoElement, onScan: (code: string) => void): Promise<void> {
    stop();
    activeVideoEl = videoEl;
    activeOnScan = onScan;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        'Live camera stream requires HTTPS on mobile browsers, or use the "Scan Photo" button below.'
      );
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: currentFacingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 60, min: 30 }
        },
        audio: false
      });

      videoEl.srcObject = stream;
      videoEl.setAttribute('playsinline', 'true');
      await videoEl.play();

      const scanTick = () => {
        if (!stream || !videoEl || videoEl.readyState !== videoEl.HAVE_ENOUGH_DATA) {
          animationFrameId = requestAnimationFrame(scanTick);
          return;
        }

        if (context) {
          canvas.width = videoEl.videoWidth;
          canvas.height = videoEl.videoHeight;
          context.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert'
          });

          if (qrCode && qrCode.data) {
            onScan(qrCode.data);
          }
        }

        if (stream) {
          animationFrameId = requestAnimationFrame(scanTick);
        }
      };

      animationFrameId = requestAnimationFrame(scanTick);
    } catch (err: any) {
      stop();
      throw err;
    }
  }

  function stop() {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    if (activeVideoEl) {
      activeVideoEl.srcObject = null;
    }
  }

  async function switchCamera() {
    if (!activeVideoEl || !activeOnScan) return;
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    await start(activeVideoEl, activeOnScan);
  }

  return { start, stop, switchCamera };
}
