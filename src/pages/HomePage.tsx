import React, { useState, useEffect, useRef } from 'react';
import { QRScanner } from '../components/QRScanner';
import { formatBytes, formatSpeed, getDeviceLabel, getDeviceInstanceId } from '../utils/format';
import { copyTextToClipboard, readTextFromClipboard, formatAlphaSessionCode, formatUniversalSessionCode } from '../utils/clipboard';
import { useToast } from '../components/Toast';
import { fetchServerConfig, fetchIceServers } from '../services/configService';
import { generateQRCode } from '../services/qrService';
import { createQRFerryStream, renderQRFerryFrame } from '../services/qrFerryService';
import { SignalingClient, createWebSocketChannelAdapter } from '../services/signalingClient';
import { WebRTCService } from '../services/webrtcService';
import { FileTransferService } from '../services/fileTransferService';
import { apiClient } from '../services/apiClient';
import {
  uploadFilesInChunks,
  fetchCloudPackageByCode,
  downloadCloudPackageFile,
  CloudPackageManifest
} from '../services/cloudTransferService';
import {
  FileMetadata,
  TransferManifest,
  SessionStatus,
  OverallTransferProgress,
  FileTransferProgress
} from '../types/transfer';
import { Plus, ArrowRight, ArrowLeft, FileText, X, Key, QrCode } from 'lucide-react';

interface HomePageProps {
  onNavigate: (tab: string) => void;
  onOpenHelp: () => void;
  initialTab?: 'send' | 'receive';
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate, initialTab = 'send' }) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'send' | 'receive'>(initialTab);

  // Server Config
  const [config, setConfig] = useState<{
    appUrl: string;
    lanAppUrl?: string;
    maxFilesCount: number;
    maxTotalSizeBytes: number;
    maxFileSizeBytes: number;
  }>({
    appUrl: window.location.origin,
    lanAppUrl: undefined,
    maxFilesCount: 100,
    maxTotalSizeBytes: 50 * 1024 * 1024 * 1024,
    maxFileSizeBytes: 50 * 1024 * 1024 * 1024
  });

  // ==========================================
  // SENDER STATE
  // ==========================================
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [senderStatus, setSenderStatus] = useState<SessionStatus>('created');
  const [pairingMode, setPairingMode] = useState<'code' | 'qr'>('code');
  const [qrMode, setQrMode] = useState<'pairing' | 'optical'>('pairing');
  const [opticalFrameUrl, setOpticalFrameUrl] = useState<string>('');
  const [opticalFrameIndex, setOpticalFrameIndex] = useState<number>(0);
  const [opticalTotalFrames, setOpticalTotalFrames] = useState<number>(0);
  const [senderSessionId, setSenderSessionId] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(300);
  const [receiverLabel, setReceiverLabel] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Store-and-Forward 5MB Chunked Upload State (WeTransfer / SwissTransfer model)
  const [cloudUploadPercent, setCloudUploadPercent] = useState<number>(0);
  const [cloudUploadSpeed, setCloudUploadSpeed] = useState<number>(0);
  const [cloudPackageReady, setCloudPackageReady] = useState<boolean>(false);
  const cloudPackageReadyRef = useRef<boolean>(false);
  cloudPackageReadyRef.current = cloudPackageReady;
  const cloudUploadingRef = useRef<boolean>(false);
  const cloudUploadAbortRef = useRef<AbortController | null>(null);
  const cloudPackageIdRef = useRef<string | null>(null);

  const [senderProgress, setSenderProgress] = useState<OverallTransferProgress>({
    totalBytes: 0,
    transferredBytes: 0,
    percent: 0,
    speedBytesPerSec: 0,
    etaSeconds: null,
    currentFileIndex: 0,
    totalFiles: 0,
    status: 'idle'
  });
  const [senderFilesProgress, setSenderFilesProgress] = useState<FileTransferProgress[]>([]);

  const senderSignalingRef = useRef<SignalingClient | null>(null);
  const senderWebrtcRef = useRef<WebRTCService | null>(null);
  const senderTransferRef = useRef<FileTransferService | null>(null);
  const senderWsChannelRef = useRef<RTCDataChannel | null>(null);
  const senderDbTransferIdRef = useRef<string | null>(null);
  const senderSessionIdRef = useRef<string | null>(null);
  const pairingCodeRef = useRef<string | null>(null);
  pairingCodeRef.current = pairingCode;
  const selectedFilesRef = useRef<File[]>([]);
  selectedFilesRef.current = selectedFiles;

  // ==========================================
  // RECEIVER STATE
  // ==========================================
  const [sessionCode, setSessionCode] = useState('');
  const sessionCodeInputRef = useRef<HTMLInputElement>(null);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [receiverStatus, setReceiverStatus] = useState<SessionStatus>('created');
  const [receiverSessionId, setReceiverSessionId] = useState<string | null>(null);
  const [senderDeviceLabel, setSenderDeviceLabel] = useState<string | null>(null);
  const [incomingManifest, setIncomingManifest] = useState<TransferManifest | null>(null);
  const incomingManifestRef = useRef<TransferManifest | null>(null);
  incomingManifestRef.current = incomingManifest;
  const acceptingTransferRef = useRef<boolean>(false);
  const cloudManifestRef = useRef<CloudPackageManifest | null>(null);
  const cloudDownloadAbortRef = useRef<AbortController | null>(null);

  const [receiverProgress, setReceiverProgress] = useState<OverallTransferProgress>({
    totalBytes: 0,
    transferredBytes: 0,
    percent: 0,
    speedBytesPerSec: 0,
    etaSeconds: null,
    currentFileIndex: 0,
    totalFiles: 0,
    status: 'idle'
  });
  const [receivedFiles, setReceivedFiles] = useState<FileTransferProgress[]>([]);

  const receiverSignalingRef = useRef<SignalingClient | null>(null);
  const receiverWebrtcRef = useRef<WebRTCService | null>(null);
  const receiverTransferRef = useRef<FileTransferService | null>(null);
  const receiverDbTransferIdRef = useRef<string | null>(null);

  const isSenderActive =
    senderStatus === 'waiting_for_receiver' ||
    senderStatus === 'receiver_pending' ||
    senderStatus === 'negotiating' ||
    senderStatus === 'connected' ||
    senderStatus === 'awaiting_acceptance' ||
    senderStatus === 'transferring';

  const isReceiverActive =
    receiverStatus === 'receiver_pending' ||
    receiverStatus === 'negotiating' ||
    receiverStatus === 'connected' ||
    receiverStatus === 'awaiting_acceptance' ||
    receiverStatus === 'transferring';

  // Sync activeTab when top navbar switches between send and receive, unless a transfer/session is active
  useEffect(() => {
    if (initialTab === 'receive' && isSenderActive) {
      showToast('Active Send session in progress! Cancel or finish sending before receiving.', 'error');
      return;
    }
    if (initialTab === 'send' && isReceiverActive) {
      showToast('Active Receive session in progress! Complete or cancel receiving first.', 'error');
      return;
    }
    setActiveTab(initialTab);
  }, [initialTab]);

  // ==========================================
  // REAL-TIME TELEMETRY DOCK COMPUTATION
  // ==========================================
  const isSendView =
    senderStatus === 'transferring' ||
    (activeTab === 'send' && receiverStatus !== 'transferring');

  // For Sender: show "Receiving Device → <Receiver's Real Device Name>"
  // For Receiver: show "Sender Device → <Sender's Real Device Name>"
  const telemetryDeviceSource = isSendView ? 'Receiving Device' : 'Sender Device';

  const telemetryDeviceTarget = isSendView
    ? receiverLabel ||
      (senderStatus === 'waiting_for_receiver'
        ? cloudPackageReady
          ? 'Ready on Server (Share Link/Code)'
          : cloudUploadPercent > 0
          ? 'Uploading to Server...'
          : 'Waiting for peer...'
        : 'Not connected')
    : senderDeviceLabel ||
      incomingManifest?.senderLabel ||
      (receiverStatus === 'receiver_pending' || receiverStatus === 'negotiating'
        ? 'Connecting...'
        : 'Not connected');

  const isPeerConnected = isSendView
    ? Boolean(receiverLabel) ||
      cloudPackageReady ||
      senderStatus === 'transferring' ||
      senderStatus === 'completed'
    : Boolean(senderDeviceLabel || incomingManifest?.senderLabel) ||
      receiverStatus === 'transferring' ||
      receiverStatus === 'completed';

  const telemetryFileName = (() => {
    if (isSendView) {
      if (senderStatus === 'transferring') {
        const activeSenderFile =
          senderFilesProgress.find((f) => f.status === 'transferring' || f.status === 'compressing') ||
          selectedFiles[senderProgress.currentFileIndex] ||
          selectedFiles[0];
        if (activeSenderFile) {
          return selectedFiles.length > 1
            ? `${activeSenderFile.name} (${Math.min(selectedFiles.length, senderProgress.currentFileIndex + 1)}/${selectedFiles.length})`
            : activeSenderFile.name;
        }
      }
      if (selectedFiles.length === 1) return selectedFiles[0].name;
      if (selectedFiles.length > 1) return `${selectedFiles[0].name} (+${selectedFiles.length - 1} more)`;
      return 'No file selected';
    } else {
      if (receiverStatus === 'transferring') {
        const activeReceiverFile =
          receivedFiles.find((f) => f.status === 'transferring' || f.status === 'verifying') ||
          receivedFiles[receiverProgress.currentFileIndex] ||
          receivedFiles[0];
        if (activeReceiverFile) {
          return receivedFiles.length > 1
            ? `${activeReceiverFile.name} (${Math.min(receivedFiles.length, receiverProgress.currentFileIndex + 1)}/${receivedFiles.length})`
            : activeReceiverFile.name;
        }
      }
      if (receivedFiles.length === 1) return receivedFiles[0].name;
      if (receivedFiles.length > 1) return `${receivedFiles[0].name} (+${receivedFiles.length - 1} more)`;
      if (incomingManifest && incomingManifest.files.length === 1) return incomingManifest.files[0].name;
      if (incomingManifest && incomingManifest.files.length > 1) {
        return `${incomingManifest.files[0].name} (+${incomingManifest.files.length - 1} more)`;
      }
      return 'Waiting for file...';
    }
  })();

  const telemetryPercent = (() => {
    if (isSendView) {
      if (senderStatus === 'transferring') {
        return Math.min(100, Math.max(0, Math.round(senderProgress.percent)));
      }
      if (senderStatus === 'completed') return 100;
      if (
        pairingMode === 'qr' &&
        qrMode === 'optical' &&
        opticalTotalFrames > 0 &&
        senderStatus === 'waiting_for_receiver'
      ) {
        return Math.min(100, Math.round((opticalFrameIndex / opticalTotalFrames) * 100));
      }
      if (senderStatus === 'waiting_for_receiver' && (cloudUploadPercent > 0 || cloudPackageReady)) {
        return cloudPackageReady ? 100 : cloudUploadPercent;
      }
      return 0;
    } else {
      if (receiverStatus === 'transferring') {
        return Math.min(100, Math.max(0, Math.round(receiverProgress.percent)));
      }
      if (receiverStatus === 'completed') return 100;
      return 0;
    }
  })();

  const telemetryRate = (() => {
    if (isSendView) {
      if (senderStatus === 'transferring') {
        return formatSpeed(senderProgress.effectiveSpeedBytesPerSec || senderProgress.speedBytesPerSec);
      }
      if (senderStatus === 'completed') {
        const finalSpeed = senderProgress.effectiveSpeedBytesPerSec || senderProgress.speedBytesPerSec;
        return finalSpeed > 0 ? formatSpeed(finalSpeed) : 'Completed';
      }
      if (
        pairingMode === 'qr' &&
        qrMode === 'optical' &&
        selectedFiles.length > 0 &&
        senderStatus === 'waiting_for_receiver'
      ) {
        return 'Optical 10 FPS';
      }
      if (senderStatus === 'waiting_for_receiver') {
        if (cloudPackageReady) {
          return cloudUploadSpeed > 0 ? formatSpeed(cloudUploadSpeed) : 'Stored';
        }
        if (cloudUploadSpeed > 0) {
          return formatSpeed(cloudUploadSpeed);
        }
      }
      return '0 B/s';
    } else {
      if (receiverStatus === 'transferring') {
        return formatSpeed(receiverProgress.effectiveSpeedBytesPerSec || receiverProgress.speedBytesPerSec);
      }
      if (receiverStatus === 'completed') {
        const finalSpeed = receiverProgress.effectiveSpeedBytesPerSec || receiverProgress.speedBytesPerSec;
        return finalSpeed > 0 ? formatSpeed(finalSpeed) : 'Completed';
      }
      return '0 B/s';
    }
  })();

  // Load Server Config & Check URL Params on Mount
  useEffect(() => {
    fetchServerConfig().then((cfg) => {
      setConfig({
        appUrl: cfg.appUrl,
        lanAppUrl: cfg.lanAppUrl,
        maxFilesCount: cfg.maxFilesCount,
        maxTotalSizeBytes: cfg.maxTotalSizeBytes,
        maxFileSizeBytes: cfg.maxFileSizeBytes
      });
    });

    const params = new URLSearchParams(window.location.search);
    const sessionParam = params.get('session');
    const tokenParam = params.get('token');
    const codeParam = params.get('code');

    if (sessionParam && tokenParam) {
      setActiveTab('receive');
      if (codeParam) setSessionCode(codeParam);
      window.history.replaceState({}, '', '/receive');
      connectToSenderSession({ sessionId: sessionParam, token: tokenParam, code: codeParam || undefined });
    } else if (codeParam) {
      setActiveTab('receive');
      setSessionCode(codeParam);
      window.history.replaceState({}, '', '/receive');
      connectToSenderSession({ code: codeParam });
    }

    return () => {
      cleanupSender();
      cleanupReceiver();
    };
  }, []);

  // Generate QR code image whenever sender session or store-and-forward code is created
  const qrBaseUrl = config.lanAppUrl || config.appUrl;
  const qrUrl =
    senderSessionId && sessionToken
      ? `${qrBaseUrl}/receive?session=${senderSessionId}&token=${sessionToken}&code=${pairingCode || ''}`
      : pairingCode
      ? `${qrBaseUrl}/receive?code=${pairingCode}`
      : '';

  useEffect(() => {
    if (!qrUrl) {
      setQrDataUrl('');
      return;
    }
    let mounted = true;
    generateQRCode(qrUrl).then((url) => {
      if (mounted) setQrDataUrl(url);
    });
    return () => {
      mounted = false;
    };
  }, [qrUrl]);

  // QRFerry Live Optical QR Stream (deedy/qr-data-transfer animated frame loop)
  useEffect(() => {
    if (
      pairingMode !== 'qr' ||
      qrMode !== 'optical' ||
      selectedFiles.length === 0 ||
      (senderStatus !== 'waiting_for_receiver' &&
        senderStatus !== 'receiver_pending' &&
        senderStatus !== 'negotiating' &&
        senderStatus !== 'awaiting_acceptance')
    ) {
      setOpticalFrameUrl('');
      return;
    }

    // Guard against encoding multi-MB/GB files into in-memory optical QR frames
    if (selectedFiles[0].size > 2 * 1024 * 1024) {
      setQrMode('pairing');
      showToast('Optical QR stream is for small files (< 2 MB). Using Pairing QR for large files.', 'info');
      return;
    }

    let cancelled = false;
    let intervalId: any = null;

    createQRFerryStream(selectedFiles[0]).then(async (stream) => {
      if (cancelled || stream.frames.length === 0) return;
      setOpticalTotalFrames(stream.frames.length);

      // Pre-render frames or render on tick at 10 FPS (100ms per frame for crisp phone camera lock)
      const renderedUrls: string[] = [];
      for (let i = 0; i < Math.min(stream.frames.length, 120); i++) {
        if (cancelled) return;
        renderedUrls.push(await renderQRFerryFrame(stream.frames[i]));
      }

      let idx = 0;
      const tick = async () => {
        if (cancelled) return;
        const frameIdx = idx % stream.frames.length;
        setOpticalFrameIndex(frameIdx + 1);
        if (renderedUrls[frameIdx]) {
          setOpticalFrameUrl(renderedUrls[frameIdx]);
        } else {
          const url = await renderQRFerryFrame(stream.frames[frameIdx]);
          if (!cancelled) setOpticalFrameUrl(url);
        }
        idx++;
      };

      tick();
      intervalId = setInterval(tick, 100);
    });

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [pairingMode, qrMode, selectedFiles, senderStatus]);

  // Countdown timer for active waiting session
  useEffect(() => {
    if (!expiresAt || (senderStatus !== 'waiting_for_receiver' && senderStatus !== 'receiver_pending')) {
      return;
    }
    const updateTimer = () => {
      const rem = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsLeft(rem);
      if (
        rem <= 0 &&
        senderStatus === 'waiting_for_receiver' &&
        !cloudPackageReady &&
        !cloudPackageReadyRef.current &&
        !cloudUploadingRef.current
      ) {
        setSenderStatus('expired');
        showToast('Session code expired. Please create a new code.', 'error');
        cleanupSender();
      }
    };
    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, senderStatus, cloudPackageReady]);

  // ==========================================
  // SENDER WORKFLOW METHODS
  // ==========================================
  const cleanupSender = () => {
    try {
      localStorage.removeItem('swiftdrop_active_sender_code');
      localStorage.removeItem('swiftdrop_active_sender_session_id');
    } catch {}
    if (cloudUploadAbortRef.current) {
      cloudUploadAbortRef.current.abort();
      cloudUploadAbortRef.current = null;
    }
    if (senderTransferRef.current) {
      try {
        senderTransferRef.current.cancel('Session closed');
      } catch {}
      senderTransferRef.current = null;
    }
    if (senderWebrtcRef.current) {
      senderWebrtcRef.current.close();
      senderWebrtcRef.current = null;
    }
    if (senderSignalingRef.current) {
      senderSignalingRef.current.disconnect();
      senderSignalingRef.current = null;
    }
    senderWsChannelRef.current = null;
    cloudUploadingRef.current = false;
    cloudPackageReadyRef.current = false;
    setCloudUploadPercent(0);
    setCloudUploadSpeed(0);
    setCloudPackageReady(false);
    setExpiresAt(null);
    setSecondsLeft(300);
    setShowCancelConfirm(false);
    cloudPackageIdRef.current = null;
  };

  const startStoreAndForwardUpload = async (preferredCode?: string) => {
    const filesNow = selectedFilesRef.current;
    if (filesNow.length === 0) return;

    if (cloudUploadAbortRef.current) {
      cloudUploadAbortRef.current.abort();
    }
    const abortController = new AbortController();
    cloudUploadAbortRef.current = abortController;
    cloudUploadingRef.current = true;

    setCloudUploadPercent(1);
    setCloudPackageReady(false);
    cloudPackageReadyRef.current = false;

    try {
      await uploadFilesInChunks({
        files: filesNow,
        senderLabel: getDeviceLabel(),
        senderDeviceId: getDeviceInstanceId(),
        preferredCode,
        retentionHours: 72, // 3 days automatic expiration rule
        signal: abortController.signal,
        onInit: (initData) => {
          cloudPackageIdRef.current = initData.packageId;
          if (!pairingCodeRef.current && initData.formattedCode) {
            setPairingCode(initData.formattedCode);
            setExpiresAt(initData.expiresAt);
            try {
              localStorage.setItem('swiftdrop_active_sender_code', initData.code);
            } catch {}
          }
        },
        onProgress: (prog) => {
          setCloudUploadPercent(prog.percent);
          setCloudUploadSpeed(prog.speedBytesPerSec);
          if (prog.packageReady) {
            cloudPackageReadyRef.current = true;
            setCloudPackageReady(true);
          }
        }
      });
      cloudPackageReadyRef.current = true;
      setCloudPackageReady(true);
      setCloudUploadPercent(100);
    } catch (err: any) {
      if (abortController.signal.aborted) return;
      console.warn('[CloudTransfer] Chunked upload warning:', err);
    } finally {
      cloudUploadingRef.current = false;
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const addFiles = (incoming: File[]) => {
    const combined = [...selectedFiles, ...incoming];
    if (combined.length > config.maxFilesCount) {
      showToast(`Maximum ${config.maxFilesCount} files allowed per batch.`, 'error');
      return;
    }
    const total = combined.reduce((acc, f) => acc + f.size, 0);
    if (total > config.maxTotalSizeBytes) {
      showToast(`Total size exceeds limit of ${formatBytes(config.maxTotalSizeBytes)}.`, 'error');
      return;
    }
    setSelectedFiles(combined);
    showToast(`${incoming.length} file(s) added`, 'info');
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const totalBytes = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  const buildManifestForSession = (sessionId: string): TransferManifest => {
    const filesNow = selectedFilesRef.current;
    return {
      sessionId,
      files: filesNow.map((f, i) => ({
        id: `file-${i}-${f.lastModified || Date.now()}`,
        name: f.name,
        size: f.size,
        type: f.type || 'application/octet-stream',
        lastModified: f.lastModified
      })),
      totalBytes: filesNow.reduce((acc, f) => acc + f.size, 0),
      totalFiles: filesNow.length,
      senderLabel: getDeviceLabel(),
      acceleration: {
        parallelStreams: 4,
        compressionEnabled: true
      }
    };
  };

  const handleCreateSenderSession = async (mode: 'code' | 'qr') => {
    if (isReceiverActive) {
      showToast('You are currently receiving a file! Finish or cancel receiving before sending.', 'error');
      return;
    }
    if (selectedFiles.length === 0) {
      fileInputRef.current?.click();
      return;
    }

    cleanupSender();
    setPairingMode(mode);
    setQrMode('pairing');
    setSenderStatus('waiting_for_receiver');
    setPairingCode(null);
    setSenderSessionId(null);
    setSessionToken(null);
    setReceiverLabel(null);
    setExpiresAt(Date.now() + 300000);
    setSecondsLeft(300);

    const manifestMetadata: FileMetadata[] = selectedFiles.map((f, i) => ({
      id: `file-${i}-${f.lastModified || Date.now()}`,
      name: f.name,
      size: f.size,
      type: f.type || 'application/octet-stream',
      lastModified: f.lastModified
    }));

    setSenderFilesProgress(
      manifestMetadata.map((m) => ({
        fileId: m.id,
        name: m.name,
        size: m.size,
        bytesTransferred: 0,
        progressPercent: 0,
        status: 'pending'
      }))
    );

    const client = new SignalingClient();
    senderSignalingRef.current = client;
    let uploadStarted = false;

    const triggerUploadOnce = (preferredCode?: string) => {
      if (uploadStarted) return;
      uploadStarted = true;
      startStoreAndForwardUpload(preferredCode);
    };

    const fallbackUploadTimer = setTimeout(() => {
      triggerUploadOnce(pairingCodeRef.current || undefined);
    }, 1500);

    try {
      await client.connect();

      client.onMessage(async (msg) => {
        switch (msg.type) {
          case 'session:created': {
            clearTimeout(fallbackUploadTimer);
            const sid = msg.sessionId || msg.payload?.sessionId || null;
            const code = msg.code || msg.payload?.code || null;
            const token = msg.token || msg.payload?.token || null;
            const exp = msg.expiresAt || msg.payload?.expiresAt || Date.now() + 300000;
            senderSessionIdRef.current = sid;
            if (sid) {
              senderWsChannelRef.current = createWebSocketChannelAdapter(client, sid);
            }
            try {
              if (code) {
                localStorage.setItem('swiftdrop_active_sender_code', code.replace(/[^A-Za-z]/g, '').toUpperCase());
              }
              if (sid) {
                localStorage.setItem('swiftdrop_active_sender_session_id', sid);
              }
            } catch {}
            setSenderSessionId(sid);
            setPairingCode(code);
            setSessionToken(token);
            setExpiresAt(exp);
            setSenderStatus('waiting_for_receiver');
            // Start 5MB chunked store-and-forward upload to server using the same session code
            triggerUploadOnce(code || undefined);
            break;
          }

          case 'session:receiver_ready': {
            const label = msg.receiverLabel || msg.payload?.receiverLabel || 'Receiving Device';
            const sid = msg.sessionId || senderSessionIdRef.current;
            setReceiverLabel(label);
            setSenderStatus('awaiting_acceptance');
            showToast(`${label} connected! Waiting for receiver approval...`, 'info');
            if (sid) {
              // Immediately send manifest over WebSocket so receiver never hangs waiting for WebRTC UDP!
              const manifest = buildManifestForSession(sid);
              client.send({
                type: 'transfer:manifest',
                sessionId: sid,
                payload: manifest
              });
              // Negotiate direct WebRTC channels in the background
              initSenderWebRTC(sid).catch(() => {});
            }
            break;
          }

          case 'signal:answer':
            if (senderWebrtcRef.current) {
              await senderWebrtcRef.current.handleAnswer(msg.payload);
            }
            break;

          case 'signal:ice_candidate':
            if (senderWebrtcRef.current) {
              await senderWebrtcRef.current.addIceCandidate(msg.payload);
            }
            break;

          case 'transfer:accept':
            showToast('Receiver accepted! Streaming files...', 'success');
            setSenderStatus('transferring');
            apiClient
              .recordTransfer({
                sessionId: senderSessionIdRef.current || undefined,
                direction: 'sent',
                files: selectedFilesRef.current.map((f) => ({
                  name: f.name,
                  size: f.size,
                  mimeType: f.type
                })),
                senderDeviceLabel: getDeviceLabel(),
                receiverDeviceLabel: labelOrDefault(receiverLabel)
              })
              .then((rec) => {
                if (rec?.transfer) {
                  senderDbTransferIdRef.current = rec.transfer.id;
                }
              })
              .catch(() => {});
            startSenderStream();
            break;

          case 'transfer:reject':
            setSenderStatus('rejected');
            if (senderDbTransferIdRef.current) {
              apiClient.updateTransferStatus(senderDbTransferIdRef.current, {
                status: 'cancelled',
                failureCode: 'REJECTED_BY_RECEIVER'
              });
            }
            showToast('Receiver declined the file transfer.', 'error');
            break;

          case 'transfer:cancel':
            setSenderStatus('cancelled');
            if (senderDbTransferIdRef.current) {
              apiClient.updateTransferStatus(senderDbTransferIdRef.current, {
                status: 'cancelled',
                failureCode: 'CANCELLED_BY_PEER'
              });
            }
            showToast('Transfer cancelled by receiver.', 'info');
            break;

          case 'session:completed':
            setSenderStatus('completed');
            if (senderDbTransferIdRef.current) {
              apiClient.updateTransferStatus(senderDbTransferIdRef.current, { status: 'completed' });
            }
            showToast('Transfer completed and verified by receiver!', 'success');
            break;

          case 'peer:disconnected':
            setSenderStatus((prev) => {
              if (prev !== 'completed' && !cloudPackageReadyRef.current && !cloudUploadingRef.current) {
                showToast('Receiver disconnected.', 'error');
                return 'failed';
              }
              return prev;
            });
            break;
        }
      });

      client.send({
        type: 'session:create',
        payload: {
          senderLabel: getDeviceLabel(),
          deviceId: getDeviceInstanceId(),
          manifest: {
            files: manifestMetadata,
            totalBytes,
            totalFiles: selectedFiles.length,
            senderLabel: getDeviceLabel()
          }
        }
      });
    } catch {
      clearTimeout(fallbackUploadTimer);
      // Even if WebSocket signaling is blocked, upload files via 5MB chunked HTTP Store-and-Forward!
      triggerUploadOnce();
    }
  };

  const labelOrDefault = (lbl: string | null) => lbl || 'Peer Device';

  const initSenderWebRTC = async (currentSessionId: string) => {
    const iceServers = await fetchIceServers();

    const webrtc = new WebRTCService({
      iceServers,
      parallelStreams: 4,
      onIceCandidate: (candidate) => {
        senderSignalingRef.current?.send({
          type: 'signal:ice_candidate',
          sessionId: currentSessionId,
          payload: candidate.toJSON()
        });
      },
      onConnectionStateChange: () => {
        // Note: if direct WebRTC UDP is blocked by firewall, we seamlessly use senderWsChannelRef!
      },
      onDataChannelOpen: () => {
        if (senderTransferRef.current && senderWebrtcRef.current) {
          const openCh = senderWebrtcRef.current.getDataChannels();
          openCh.forEach((ch) => senderTransferRef.current?.addChannel(ch));
        }
      },
      onDataChannelClose: () => {},
      onDataChannelMessage: () => {}
    });

    senderWebrtcRef.current = webrtc;
    webrtc.initPeerConnection();
    webrtc.createParallelDataChannels(4);

    const offer = await webrtc.createOffer();
    senderSignalingRef.current?.send({
      type: 'signal:offer',
      sessionId: currentSessionId,
      payload: offer
    });
  };

  const startSenderStream = () => {
    const webrtcChannels = senderWebrtcRef.current?.getDataChannels() || [];
    const wsFallbackChannel =
      senderWsChannelRef.current ||
      (senderSignalingRef.current && senderSessionIdRef.current
        ? createWebSocketChannelAdapter(senderSignalingRef.current, senderSessionIdRef.current)
        : null);

    const channels: RTCDataChannel[] = [...webrtcChannels];
    if (wsFallbackChannel) {
      channels.push(wsFallbackChannel);
    }

    if (channels.length === 0) {
      showToast('Connection channel not open yet.', 'error');
      return;
    }

    const filesNow = selectedFilesRef.current;
    const transferService = new FileTransferService(
      channels,
      {
        onOverallProgress: (overall) => {
          setSenderProgress(overall);
        },
        onFileProgress: (fileProg) => {
          setSenderFilesProgress((prev) =>
            prev.map((item) =>
              item.fileId === fileProg.fileId || item.name === fileProg.name ? { ...item, ...fileProg } : item
            )
          );
        },
        onFileCompleted: (fileId) => {
          setSenderFilesProgress((prev) =>
            prev.map((item) => (item.fileId === fileId ? { ...item, status: 'completed', progressPercent: 100 } : item))
          );
        },
        onBatchCompleted: () => {
          setSenderStatus('completed');
          if (senderDbTransferIdRef.current) {
            apiClient.updateTransferStatus(senderDbTransferIdRef.current, {
              status: 'completed',
              totalBytes: filesNow.reduce((acc, f) => acc + f.size, 0)
            });
          }
        },
        onError: (err) => {
          setSenderStatus('failed');
          if (senderDbTransferIdRef.current) {
            apiClient.updateTransferStatus(senderDbTransferIdRef.current, { status: 'failed', failureCode: err });
          }
          showToast(`Transfer error: ${err}`, 'error');
        },
        onCancelled: (reason) => {
          setSenderStatus('cancelled');
          showToast(reason, 'info');
        }
      },
      { parallelStreams: 4, enableCompression: true, chunkSize: 65536 }
    );

    senderTransferRef.current = transferService;
    transferService.startSending(filesNow);
  };

  const handleCancelSenderSession = () => {
    if (senderTransferRef.current) {
      senderTransferRef.current.cancel('Cancelled by sender');
    }
    if (senderSignalingRef.current && senderSessionId) {
      senderSignalingRef.current.send({
        type: 'transfer:cancel',
        sessionId: senderSessionId,
        payload: { reason: 'Cancelled by sender' }
      });
    }
    cleanupSender();
    setSenderStatus('created');
    setSenderSessionId(null);
    setPairingCode(null);
    setSessionToken(null);
  };

  const handleResetSender = () => {
    cleanupSender();
    setSelectedFiles([]);
    setSenderStatus('created');
    setSenderSessionId(null);
    setPairingCode(null);
    setSessionToken(null);
    setReceiverLabel(null);
    setSenderProgress({
      totalBytes: 0,
      transferredBytes: 0,
      percent: 0,
      speedBytesPerSec: 0,
      etaSeconds: null,
      currentFileIndex: 0,
      totalFiles: 0,
      status: 'idle'
    });
  };

  const handleCopyCode = async () => {
    if (!pairingCode) return;
    const ok = await copyTextToClipboard(pairingCode);
    if (ok) {
      setCopiedCode(true);
      showToast('Session code copied!', 'success');
      setTimeout(() => setCopiedCode(false), 2000);
    } else {
      showToast('Could not copy code', 'error');
    }
  };

  const handleCopyLink = async () => {
    if (!qrUrl) return;
    const ok = await copyTextToClipboard(qrUrl);
    if (ok) {
      setCopiedLink(true);
      showToast('Pairing link copied!', 'success');
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      showToast('Could not copy link', 'error');
    }
  };

  // ==========================================
  // RECEIVER WORKFLOW METHODS
  // ==========================================
  const cleanupReceiver = () => {
    if (cloudDownloadAbortRef.current) {
      cloudDownloadAbortRef.current.abort();
      cloudDownloadAbortRef.current = null;
    }
    if (receiverTransferRef.current) {
      try {
        receiverTransferRef.current.cancel('Session closed');
      } catch {}
      receiverTransferRef.current = null;
    }
    if (receiverWebrtcRef.current) {
      receiverWebrtcRef.current.close();
      receiverWebrtcRef.current = null;
    }
    if (receiverSignalingRef.current) {
      receiverSignalingRef.current.disconnect();
      receiverSignalingRef.current = null;
    }
  };

  const applyPastedText = (text: string) => {
    // Support pasting either a direct pairing link or a 6-letter session code
    try {
      if (text.startsWith('http://') || text.startsWith('https://')) {
        const url = new URL(text);
        const codeParam = url.searchParams.get('code');
        const sessionParam = url.searchParams.get('session');
        const tokenParam = url.searchParams.get('token');
        if (codeParam) {
          setSessionCode(formatUniversalSessionCode(codeParam));
        }
        if (sessionParam && tokenParam) {
          connectToSenderSession({ sessionId: sessionParam, token: tokenParam, code: codeParam || undefined });
          return true;
        }
        if (codeParam) {
          connectToSenderSession({ code: codeParam });
          return true;
        }
      }
    } catch {
      // Not a URL
    }

    const formatted = formatUniversalSessionCode(text);
    if (formatted) {
      setSessionCode(formatted);
      return true;
    }
    return false;
  };

  const handlePasteCode = async () => {
    const text = await readTextFromClipboard(sessionCodeInputRef.current);
    if (text && applyPastedText(text)) {
      showToast('Pasted session code!', 'info');
      return;
    }
    sessionCodeInputRef.current?.focus();
    showToast('Input focused — press Ctrl+V (or long-press Paste) to paste code', 'info');
  };

  const handleReceiveAction = () => {
    const cleanCode = sessionCode.trim().replace(/[^A-Za-z]/g, '').toUpperCase();
    if (!cleanCode || cleanCode.length < 6) {
      showToast('Please enter a valid 6-letter session code (A-Z only)', 'error');
      return;
    }
    connectToSenderSession({ code: cleanCode });
  };

  const handleQRScanResult = (result: { code?: string; sessionId?: string; token?: string }) => {
    setIsQRScannerOpen(false);
    if (result.sessionId && result.token) {
      if (result.code) setSessionCode(result.code);
      connectToSenderSession({ sessionId: result.sessionId, token: result.token, code: result.code });
    } else if (result.code) {
      setSessionCode(result.code);
      connectToSenderSession({ code: result.code });
    }
  };

  const handleOpticalFileReceived = (file: { blob: Blob; name: string; size: number; verified: boolean }) => {
    setIsQRScannerOpen(false);
    triggerBrowserDownload(file.blob, file.name);
    const blobUrl = URL.createObjectURL(file.blob);
    setSenderDeviceLabel('Optical QR Stream');
    setReceivedFiles([
      {
        fileId: `optical-${Date.now()}`,
        name: file.name,
        size: file.size,
        bytesTransferred: file.size,
        progressPercent: 100,
        status: 'completed',
        hashMatched: file.verified,
        savedToDisk: true,
        blob: file.blob,
        blobUrl
      }
    ]);
    setReceiverStatus('completed');
    showToast(`Received "${file.name}" via QRFerry optical stream!`, 'success');
  };

  const initReceiverTransferService = (sessionId: string, initialChannel: RTCDataChannel) => {
    if (receiverTransferRef.current) {
      receiverTransferRef.current.addChannel(initialChannel);
      return receiverTransferRef.current;
    }

    const transferService = new FileTransferService([initialChannel], {
      onOverallProgress: (overall) => {
        setReceiverProgress(overall);
      },
      onFileProgress: (fileProg) => {
        setReceivedFiles((prev) =>
          prev.map((item) =>
            item.fileId === fileProg.fileId || item.name === fileProg.name ? { ...item, ...fileProg } : item
          )
        );
      },
      onFileCompleted: (fileId, blob, verified) => {
        const blobUrl = URL.createObjectURL(blob);
        setReceivedFiles((prev) => {
          let matched = false;
          const next = prev.map((item) => {
            if (!matched && (item.fileId === fileId || item.status !== 'completed')) {
              matched = true;
              if (verified) {
                triggerBrowserDownload(blob, item.name);
              }
              return {
                ...item,
                blob,
                blobUrl,
                hashMatched: verified,
                savedToDisk: verified,
                progressPercent: 100,
                status: verified ? ('completed' as const) : ('failed' as const)
              };
            }
            return item;
          });
          return next;
        });
      },
      onBatchCompleted: () => {
        setReceiverStatus('completed');
        receiverSignalingRef.current?.send({
          type: 'session:completed',
          sessionId
        });
        if (receiverDbTransferIdRef.current) {
          apiClient.updateTransferStatus(receiverDbTransferIdRef.current, {
            status: 'completed'
          });
        }
        showToast('All files received, verified, and downloaded!', 'success');
      },
      onError: (err) => {
        setReceiverStatus('failed');
        showToast(`Receive error: ${err}`, 'error');
      },
      onCancelled: (reason) => {
        setReceiverStatus('cancelled');
        showToast(reason, 'info');
      }
    });

    if (incomingManifestRef.current) {
      transferService.setIncomingManifest(incomingManifestRef.current.files);
    }

    receiverTransferRef.current = transferService;
    return transferService;
  };

  const applyIncomingManifest = (manifest: TransferManifest, fallbackSenderLabel?: string) => {
    const normalized: TransferManifest = {
      ...manifest,
      senderLabel: manifest.senderLabel || fallbackSenderLabel || 'Sender'
    };
    setIncomingManifest(normalized);
    incomingManifestRef.current = normalized;
    if (receiverTransferRef.current) {
      receiverTransferRef.current.setIncomingManifest(normalized.files);
    }
    setReceiverStatus('awaiting_acceptance');
    setReceivedFiles(
      normalized.files.map((f) => ({
        fileId: f.id,
        name: f.name,
        size: f.size,
        bytesTransferred: 0,
        progressPercent: 0,
        status: 'pending'
      }))
    );
  };

  const connectToSenderSession = async (params: { code?: string; sessionId?: string; token?: string }) => {
    // 1. Block receiving while a Send session is active on this device
    if (isSenderActive) {
      showToast('You have an active Send session! Cancel your Send session before receiving files.', 'error');
      return;
    }

    // 2. Block self-receiving your own active session code or sessionId
    const incomingCodeClean = (params.code || '').replace(/[^A-Za-z]/g, '').toUpperCase();
    const ownActiveCodeClean = (pairingCodeRef.current || '').replace(/[^A-Za-z]/g, '').toUpperCase();
    let storedOwnCode = '';
    let storedOwnSessionId = '';
    try {
      storedOwnCode = (localStorage.getItem('swiftdrop_active_sender_code') || '').toUpperCase();
      storedOwnSessionId = localStorage.getItem('swiftdrop_active_sender_session_id') || '';
    } catch {}

    if (
      (incomingCodeClean && (incomingCodeClean === ownActiveCodeClean || incomingCodeClean === storedOwnCode)) ||
      (params.sessionId && (params.sessionId === senderSessionIdRef.current || params.sessionId === storedOwnSessionId))
    ) {
      showToast('You cannot receive your own file! Enter this Session Code on another device.', 'error');
      return;
    }

    cleanupReceiver();
    acceptingTransferRef.current = false;
    setReceiverStatus('receiver_pending');
    setIncomingManifest(null);
    setReceivedFiles([]);
    cloudManifestRef.current = null;

    // 3. First check if the package is stored on the server (Store-and-Forward link/code)
    let foundCloudPackage: CloudPackageManifest | null = null;
    if (incomingCodeClean && incomingCodeClean.length === 6) {
      try {
        const cloudLookup = await fetchCloudPackageByCode(incomingCodeClean, getDeviceInstanceId());
        if (cloudLookup.selfReceiveBlocked) {
          setReceiverStatus('created');
          showToast(cloudLookup.error || 'You cannot receive your own file!', 'error');
          return;
        }
        if (cloudLookup.found && cloudLookup.manifest && cloudLookup.manifest.files.length > 0) {
          foundCloudPackage = cloudLookup.manifest;
          cloudManifestRef.current = cloudLookup.manifest;
        }
      } catch {}
    }

    const applyCloudPackageAsManifest = (pkg: CloudPackageManifest) => {
      cloudManifestRef.current = pkg;
      setReceiverSessionId(pkg.packageId);
      setSenderDeviceLabel(pkg.senderLabel || 'Sender');
      applyIncomingManifest(
        {
          sessionId: pkg.packageId,
          files: pkg.files.map((f) => ({
            id: f.id,
            name: f.name,
            size: f.size,
            type: f.type || 'application/octet-stream'
          })),
          totalBytes: pkg.totalBytes,
          totalFiles: pkg.fileCount || pkg.files.length,
          senderLabel: pkg.senderLabel || 'Sender'
        },
        pkg.senderLabel || 'Sender'
      );
      showToast(`Found stored transfer from ${pkg.senderLabel || 'Sender'}! Click Accept & Save to download.`, 'info');
    };

    const client = new SignalingClient();
    receiverSignalingRef.current = client;

    try {
      await client.connect();

      client.onMessage(async (msg) => {
        switch (msg.type) {
          case 'session:joined': {
            const sid = msg.sessionId || msg.payload?.sessionId || null;
            const sLabel = msg.senderLabel || msg.payload?.senderLabel || 'Sender';
            const initialManifest = (msg as any).manifest || msg.payload?.manifest;
            setReceiverSessionId(sid);
            setSenderDeviceLabel(sLabel);

            if (sid) {
              const wsChannel = createWebSocketChannelAdapter(client, sid);
              initReceiverTransferService(sid, wsChannel);
            }

            if (initialManifest && Array.isArray(initialManifest.files) && initialManifest.files.length > 0) {
              applyIncomingManifest(
                {
                  sessionId: sid || '',
                  files: initialManifest.files,
                  totalBytes: initialManifest.totalBytes,
                  totalFiles: initialManifest.totalFiles,
                  senderLabel: sLabel
                },
                sLabel
              );
              showToast(`Connected to ${sLabel}! Ready to receive.`, 'info');
            } else {
              setReceiverStatus('negotiating');
              showToast(`Connected to ${sLabel}!`, 'info');
            }
            break;
          }

          case 'session:join_failed':
            // Fallback to Store-and-Forward server storage if the live P2P session closed/expired
            if (foundCloudPackage && foundCloudPackage.files.length > 0) {
              applyCloudPackageAsManifest(foundCloudPackage);
              break;
            }
            if (incomingCodeClean && incomingCodeClean.length === 6) {
              try {
                const retryLookup = await fetchCloudPackageByCode(incomingCodeClean, getDeviceInstanceId());
                if (retryLookup.found && retryLookup.manifest && retryLookup.manifest.files.length > 0) {
                  applyCloudPackageAsManifest(retryLookup.manifest);
                  break;
                }
              } catch {}
            }
            setReceiverStatus('failed');
            showToast(msg.error || 'Invalid or expired session code.', 'error');
            break;

          case 'signal:offer':
            if (msg.sessionId) {
              handleReceiverWebRTCOffer(msg.sessionId, msg.payload).catch(() => {});
            }
            break;

          case 'signal:ice_candidate':
            if (receiverWebrtcRef.current) {
              await receiverWebrtcRef.current.addIceCandidate(msg.payload);
            }
            break;

          case 'transfer:manifest': {
            const manifest: TransferManifest = msg.payload;
            if (manifest && Array.isArray(manifest.files)) {
              applyIncomingManifest(manifest, senderDeviceLabel || 'Sender');
            }
            break;
          }

          case 'transfer:cancel':
            setReceiverStatus('cancelled');
            showToast('Sender cancelled the transfer.', 'info');
            break;

          case 'peer:disconnected':
            setReceiverStatus((prev) => {
              if (prev !== 'completed') {
                showToast('Sender disconnected.', 'error');
                return 'failed';
              }
              return prev;
            });
            break;
        }
      });

      client.send({
        type: 'session:join',
        code: params.code,
        sessionId: params.sessionId,
        token: params.token,
        payload: {
          receiverLabel: getDeviceLabel(),
          deviceId: getDeviceInstanceId()
        }
      });
    } catch (err: any) {
      if (foundCloudPackage && foundCloudPackage.files.length > 0) {
        applyCloudPackageAsManifest(foundCloudPackage);
        return;
      }
      setReceiverStatus('failed');
      showToast(`Connection failed: ${err?.message || 'Unable to connect'}`, 'error');
    }
  };

  const triggerBrowserDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const handleReceiverWebRTCOffer = async (sessionId: string, offer: RTCSessionDescriptionInit) => {
    const iceServers = await fetchIceServers();

    const webrtc = new WebRTCService({
      iceServers,
      onIceCandidate: (candidate) => {
        receiverSignalingRef.current?.send({
          type: 'signal:ice_candidate',
          sessionId,
          payload: candidate.toJSON()
        });
      },
      onConnectionStateChange: () => {
        // Fallback WebSocket channel is already attached and active if WebRTC UDP is blocked
      },
      onDataChannelOpen: () => {},
      onDataChannelClose: () => {},
      onDataChannelReceived: (channel) => {
        initReceiverTransferService(sessionId, channel);
      },
      onDataChannelMessage: () => {}
    });

    receiverWebrtcRef.current = webrtc;
    webrtc.initPeerConnection();

    const answer = await webrtc.handleOffer(offer);
    receiverSignalingRef.current?.send({
      type: 'signal:answer',
      sessionId,
      payload: answer
    });
  };

  const handleAcceptIncomingTransfer = async () => {
    if (!receiverSessionId || !incomingManifest) return;
    if (acceptingTransferRef.current || receiverStatus !== 'awaiting_acceptance') return;
    acceptingTransferRef.current = true;

    setReceiverStatus('transferring');

    apiClient
      .recordTransfer({
        sessionId: receiverSessionId,
        direction: 'received',
        files: incomingManifest.files.map((f) => ({
          name: f.name,
          size: f.size,
          mimeType: f.type
        })),
        senderDeviceLabel: senderDeviceLabel || incomingManifest.senderLabel,
        receiverDeviceLabel: getDeviceLabel()
      })
      .then((rec) => {
        if (rec?.transfer) {
          receiverDbTransferIdRef.current = rec.transfer.id;
        }
      })
      .catch(() => {});

    // If this is a Store-and-Forward cloud package, stream/download directly from the server!
    const cloudPkg = cloudManifestRef.current;
    if (cloudPkg && cloudPkg.packageId === receiverSessionId) {
      const abortCtrl = new AbortController();
      cloudDownloadAbortRef.current = abortCtrl;
      const totalBytesAll = cloudPkg.totalBytes || 1;
      let completedBytesBeforeCurrentFile = 0;

      try {
        for (let i = 0; i < cloudPkg.files.length; i++) {
          const fileEntry = cloudPkg.files[i];
          setReceivedFiles((prev) =>
            prev.map((item) => (item.fileId === fileEntry.id ? { ...item, status: 'transferring' } : item))
          );

          const blob = await downloadCloudPackageFile({
            downloadUrl: fileEntry.downloadUrl,
            expectedSize: fileEntry.size,
            signal: abortCtrl.signal,
            onProgress: (receivedBytes, speedBytesPerSec) => {
              const overallTransferred = completedBytesBeforeCurrentFile + receivedBytes;
              const overallPercent = Math.min(100, Math.round((overallTransferred / totalBytesAll) * 100));
              const filePercent = fileEntry.size > 0 ? Math.min(100, Math.round((receivedBytes / fileEntry.size) * 100)) : 100;

              setReceiverProgress({
                totalBytes: totalBytesAll,
                transferredBytes: overallTransferred,
                percent: overallPercent,
                speedBytesPerSec,
                etaSeconds:
                  speedBytesPerSec > 0
                    ? Math.max(0, Math.round((totalBytesAll - overallTransferred) / speedBytesPerSec))
                    : null,
                currentFileIndex: i,
                totalFiles: cloudPkg.files.length,
                status: 'transferring'
              });
              setReceivedFiles((prev) =>
                prev.map((item) =>
                  item.fileId === fileEntry.id
                    ? {
                        ...item,
                        bytesTransferred: receivedBytes,
                        progressPercent: filePercent,
                        status: 'transferring'
                      }
                    : item
                )
              );
            }
          });

          completedBytesBeforeCurrentFile += fileEntry.size;
          triggerBrowserDownload(blob, fileEntry.name);
          const blobUrl = URL.createObjectURL(blob);

          setReceivedFiles((prev) =>
            prev.map((item) =>
              item.fileId === fileEntry.id
                ? {
                    ...item,
                    bytesTransferred: fileEntry.size,
                    progressPercent: 100,
                    status: 'completed',
                    hashMatched: true,
                    savedToDisk: true,
                    blob,
                    blobUrl
                  }
                : item
            )
          );
        }

        setReceiverProgress((prev) => ({
          ...prev,
          transferredBytes: totalBytesAll,
          percent: 100,
          status: 'completed'
        }));
        setReceiverStatus('completed');
        if (receiverDbTransferIdRef.current) {
          apiClient.updateTransferStatus(receiverDbTransferIdRef.current, {
            status: 'completed'
          });
        }
        showToast('All files downloaded from server and saved!', 'success');
      } catch (err: any) {
        if (!abortCtrl.signal.aborted) {
          setReceiverStatus('failed');
          showToast(err?.message || 'Download failed', 'error');
        }
      }
      return;
    }

    if (receiverTransferRef.current) {
      receiverTransferRef.current.setIncomingManifest(incomingManifest.files);
    }

    receiverSignalingRef.current?.send({
      type: 'transfer:accept',
      sessionId: receiverSessionId
    });
  };

  const handleDeclineIncomingTransfer = () => {
    if (!receiverSessionId) return;
    receiverSignalingRef.current?.send({
      type: 'transfer:reject',
      sessionId: receiverSessionId,
      payload: { reason: 'Declined by receiver' }
    });
    cleanupReceiver();
    acceptingTransferRef.current = false;
    setReceiverStatus('created');
    setIncomingManifest(null);
    cloudManifestRef.current = null;
    showToast('Incoming transfer declined.', 'info');
  };

  const handleResetReceiver = () => {
    cleanupReceiver();
    acceptingTransferRef.current = false;
    setReceiverStatus('created');
    setReceiverSessionId(null);
    setSenderDeviceLabel(null);
    setIncomingManifest(null);
    cloudManifestRef.current = null;
    setReceivedFiles([]);
    setReceiverProgress({
      totalBytes: 0,
      transferredBytes: 0,
      percent: 0,
      speedBytesPerSec: 0,
      etaSeconds: null,
      currentFileIndex: 0,
      totalFiles: 0,
      status: 'idle'
    });
  };

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="w-full flex-1 flex flex-col items-center px-3 sm:px-6 md:px-8 py-5 sm:py-8 md:py-12 sm:my-auto">
      {/* Send Anywhere Style Hero Header */}
      <div className="text-center max-w-2xl mx-auto mb-6 sm:mb-9 space-y-1 sm:space-y-2 px-1">
        <h1 className="text-2xl sm:text-4xl md:text-[40px] font-extrabold tracking-tight text-[#212529] leading-tight font-sans">
          Easy, fast and unlimited <span className="text-[#fe4543]">file transfer</span>
        </h1>
        <p className="text-xs sm:text-[14px] text-[#666666] font-normal">
          Direct device-to-device streaming up to 50 GB with temporary 6-digit key.
        </p>
      </div>

      {/* Mobile Tab Toggle (visible only on mobile screens < 768px) */}
      <div className="md:hidden w-full max-w-sm mx-auto mb-4">
        <div className="grid grid-cols-2 p-1 rounded-lg bg-[#f1f1f1] border border-[#e0e4e6]">
          <button
            type="button"
            onClick={() => {
              if (isReceiverActive) {
                showToast('Complete or cancel your active Receive session before switching to Send.', 'error');
                return;
              }
              setActiveTab('send');
              onNavigate('send');
            }}
            className={`py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${
              activeTab === 'send'
                ? 'bg-white text-[#212529] shadow-xs'
                : 'text-[#666666]'
            }`}
          >
            Send
          </button>
          <button
            type="button"
            onClick={() => {
              if (isSenderActive) {
                showToast('Cancel or complete your active Send session before switching to Receive.', 'error');
                return;
              }
              setActiveTab('receive');
              onNavigate('receive');
            }}
            className={`py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${
              activeTab === 'receive'
                ? 'bg-white text-[#212529] shadow-xs'
                : 'text-[#666666]'
            }`}
          >
            Receive
          </button>
        </div>
      </div>

      {/* Dual Cards Grid (Desktop: Side-by-Side Dual Cards | Mobile: Selected Tab Card) */}
      <div className="w-full max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {/* ============================================================ */}
        {/* LEFT CARD: SEND                                             */}
        {/* ============================================================ */}
        <div
          className={`sa-card bg-white rounded-xl border border-[#ebebeb] shadow-[0_4px_20px_rgba(0,0,0,0.06)] overflow-hidden transition-all duration-300 flex flex-col justify-between p-5 sm:p-7 min-h-[26rem] sm:min-h-[29rem] ${
            activeTab !== 'send' ? 'hidden md:flex' : 'flex'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
          />

          {/* CARD HEADER */}
          <div className="flex items-center justify-between pb-3.5 border-b border-[#ebebeb]">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#fe4543]" />
              <h2 className="text-[18px] sm:text-[20px] font-bold text-[#212529]">
                {senderStatus === 'waiting_for_receiver' ||
                senderStatus === 'receiver_pending' ||
                senderStatus === 'negotiating' ||
                senderStatus === 'awaiting_acceptance'
                  ? '6-digit Key'
                  : senderStatus === 'transferring'
                  ? 'Sending Files'
                  : 'Send'}
              </h2>
            </div>
            {selectedFiles.length > 0 && senderStatus === 'created' && (
              <button
                type="button"
                onClick={handleResetSender}
                className="text-xs text-[#666666] hover:text-[#fe4543] font-medium transition-colors cursor-pointer"
              >
                Clear ({selectedFiles.length})
              </button>
            )}
          </div>

          {/* STATE 1: SELECT FILES */}
          {senderStatus === 'created' && (
            <div className="flex-1 flex flex-col justify-between my-2">
              {selectedFiles.length === 0 ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleFileDrop}
                  className={`group border-2 border-dashed rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 flex-1 my-3 ${
                    isDragging
                      ? 'border-[#fe4543] bg-[#fff0f2]'
                      : 'border-[#e0e4e6] bg-[#fafafa] hover:bg-[#fff0f2]/40 hover:border-[#fe4543]/60'
                  }`}
                >
                  <div className="sa-plus-btn w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#fff0f2] text-[#fe4543] flex items-center justify-center mb-3 group-hover:scale-105 group-hover:bg-[#fe4543] group-hover:text-white transition-all shadow-2xs border border-[#fe4543]/20">
                    <Plus className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.5]" />
                  </div>
                  <p className="font-bold text-[#212529] text-[15px] sm:text-[16px]">
                    Click or drag files here
                  </p>
                  <p className="text-xs text-[#9b9b9b] mt-1 font-normal">
                    Up to 50 GB • Direct device-to-device
                  </p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-between space-y-3 my-3">
                  <div className="p-3.5 bg-[#fafafa] rounded-xl border border-[#ebebeb]">
                    <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[#ebebeb]">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#666666]">
                        Selected Files ({selectedFiles.length})
                      </span>
                      <span className="text-xs font-code font-bold text-[#fe4543]">
                        {formatBytes(totalBytes)}
                      </span>
                    </div>

                    <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                      {selectedFiles.map((file, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded-lg bg-white border border-[#ebebeb] text-xs hover:border-[#fe4543]/40 transition-colors"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileText className="w-4 h-4 text-[#fe4543] shrink-0" />
                            <span className="truncate text-[#212529] font-medium">
                              {file.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0 ml-2">
                            <span className="text-[#666666] font-code">
                              {formatBytes(file.size)}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeFile(idx)}
                              className="text-[#9b9b9b] hover:text-[#c64545] cursor-pointer p-0.5"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-2.5 text-xs text-[#fe4543] hover:underline flex items-center gap-1 cursor-pointer font-bold"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      Add more files
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-3">
                {selectedFiles.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => handleCreateSenderSession('code')}
                    className="sa-btn-primary w-full h-12 bg-[#fe4543] hover:bg-[#d83f53] text-white font-bold text-[15px] rounded-lg shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99]"
                  >
                    <span>Send ({selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'})</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="sa-btn-primary w-full h-12 bg-[#fe4543] hover:bg-[#d83f53] text-white font-bold text-[15px] rounded-lg shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99]"
                  >
                    <span>Select Files</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* STATE 2: WAITING FOR RECEIVER (SEND ANYWHERE 6-DIGIT KEY SCREEN) */}
          {(senderStatus === 'waiting_for_receiver' ||
            senderStatus === 'receiver_pending' ||
            senderStatus === 'negotiating' ||
            senderStatus === 'awaiting_acceptance') &&
            (() => {
              const cleanCode = (pairingCode || '').replace(/[^A-Za-z0-9]/g, '');
              const digits = (cleanCode.padEnd(6, '•')).slice(0, 6).split('');
              const mascotPercent = cloudPackageReady
                ? 100
                : (!cloudPackageReady && cloudUploadPercent > 0
                  ? cloudUploadPercent
                  : 18);

              return (
                <div className="flex-1 flex flex-col justify-between space-y-4 my-2">
                  <div className="flex flex-col items-center text-center space-y-3.5">
                    {/* Status Subtitle */}
                    <div className="flex items-center gap-2 text-xs font-medium text-[#212529]">
                      <span className="relative flex h-2.5 w-2.5 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#fe4543] opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#fe4543]" />
                      </span>
                      <span>
                        {senderStatus === 'waiting_for_receiver' &&
                          (!cloudPackageReady && cloudUploadPercent > 0
                            ? `Uploading chunks (${cloudUploadPercent}% • ${formatSpeed(cloudUploadSpeed)})...`
                            : cloudPackageReady
                              ? 'Key & Link Ready • Stored for 3 days + Live P2P'
                              : 'Waiting for receiver to connect...')}
                        {senderStatus === 'receiver_pending' && `${receiverLabel} joined • Connecting...`}
                        {senderStatus === 'negotiating' && `Negotiating WebRTC with ${receiverLabel}...`}
                        {senderStatus === 'awaiting_acceptance' && `Waiting for ${receiverLabel} to accept...`}
                      </span>
                    </div>

                    {/* Authentic Send Anywhere 6-digit key box */}
                    <div className="w-full bg-[#fafafa] border border-[#e0e4e6] rounded-xl p-4 sm:p-5 flex flex-col items-center">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={handleCopyCode}
                        className="my-2 flex items-center justify-center gap-1.5 select-all cursor-pointer group"
                        title="Click to copy key"
                      >
                        <div className="flex items-center gap-1 sm:gap-1.5">
                          {digits.slice(0, 3).map((d, i) => (
                            <span
                              key={i}
                              className="sa-key-digit w-9 h-13 sm:w-11 sm:h-15 text-2xl sm:text-3xl font-bold bg-white border border-[#e0e4e6] rounded text-[#212529] font-code flex items-center justify-center shadow-2xs group-hover:border-[#fe4543]/40 transition-colors"
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                        <div className="w-2 sm:w-3" />
                        <div className="flex items-center gap-1 sm:gap-1.5">
                          {digits.slice(3, 6).map((d, i) => (
                            <span
                              key={i + 3}
                              className="sa-key-digit w-9 h-13 sm:w-11 sm:h-15 text-2xl sm:text-3xl font-bold bg-white border border-[#e0e4e6] rounded text-[#212529] font-code flex items-center justify-center shadow-2xs group-hover:border-[#fe4543]/40 transition-colors"
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Expiration Countdown */}
                      <div className="flex items-center gap-1 text-xs text-[#9b9b9b] font-medium mt-1">
                        <span className="material-symbols-outlined text-[15px] text-[#fe4543]">timer</span>
                        <span>Expires in {formatCountdown(secondsLeft)}</span>
                      </div>

                      {/* Action Buttons: Copy Key & Copy Link */}
                      <div className="flex items-center gap-2 mt-3.5 w-full max-w-xs justify-center">
                        <button
                          type="button"
                          onClick={handleCopyCode}
                          disabled={!pairingCode}
                          className="flex-1 py-2 px-3 rounded-lg bg-white hover:bg-[#f1f1f1] border border-[#e0e4e6] text-xs font-bold text-[#212529] flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[15px] text-[#fe4543]">
                            {copiedCode ? 'check' : 'content_copy'}
                          </span>
                          <span>{copiedCode ? 'Copied!' : 'Copy Key'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleCopyLink}
                          disabled={!qrUrl}
                          className="flex-1 py-2 px-3 rounded-lg bg-[#fe4543] hover:bg-[#d83f53] text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[15px]">
                            {copiedLink ? 'check' : 'link'}
                          </span>
                          <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
                        </button>
                      </div>

                      {/* QR Section */}
                      <div className="mt-4 pt-3 border-t border-[#ebebeb] w-full flex flex-col items-center">
                        <div className="inline-flex p-0.5 rounded-lg bg-[#f1f1f1] border border-[#e0e4e6] mb-2">
                          <button
                            type="button"
                            onClick={() => setQrMode('pairing')}
                            className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                              qrMode === 'pairing' ? 'bg-white text-[#212529] shadow-2xs' : 'text-[#666666]'
                            }`}
                          >
                            Pairing QR
                          </button>
                          <button
                            type="button"
                            onClick={() => setQrMode('optical')}
                            className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                              qrMode === 'optical' ? 'bg-white text-[#212529] shadow-2xs' : 'text-[#666666]'
                            }`}
                          >
                            Optical Stream
                          </button>
                        </div>

                        <div className="p-2 bg-white border border-[#e0e4e6] rounded-lg shadow-2xs">
                          <div className="w-28 h-28 sm:w-32 sm:h-32 bg-white flex items-center justify-center overflow-hidden">
                            {qrMode === 'optical' ? (
                              opticalFrameUrl ? (
                                <img src={opticalFrameUrl} alt="Optical Stream" className="w-full h-full object-contain" />
                              ) : (
                                <div className="flex flex-col items-center gap-1 p-2 text-center">
                                  <span className="material-symbols-outlined text-lg text-[#fe4543] animate-spin">sync</span>
                                  <span className="text-[10px] text-[#666666]">Encoding...</span>
                                </div>
                              )
                            ) : qrDataUrl ? (
                              <img src={qrDataUrl} alt="Session QR" className="w-full h-full object-contain" />
                            ) : (
                              <div className="flex flex-col items-center gap-1 p-2 text-center">
                                <span className="material-symbols-outlined text-lg text-[#fe4543] animate-spin">sync</span>
                                <span className="text-[10px] text-[#666666]">Generating...</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Mascot Track Bar */}
                      <div className="w-full mt-3 pt-2 border-t border-[#ebebeb]">
                        <div className="relative w-full h-8 flex items-end">
                          <div
                            className="dog-gallop absolute bottom-1 z-10 transition-all duration-300 pointer-events-none"
                            style={{ left: `${Math.min(94, Math.max(6, mascotPercent))}%`, transform: 'translateX(-50%)' }}
                          >
                            <svg width="34" height="22" viewBox="0 0 52 34" fill="none">
                              <path className="dog-tail-wag" d="M10 14 C6 11, 3 8, 2 5" stroke="#fe4543" strokeWidth="3" strokeLinecap="round" />
                              <line className="leg-ba" x1="14" y1="22" x2="11" y2="31" stroke="#d83f53" strokeWidth="3" strokeLinecap="round" />
                              <line className="leg-bb" x1="18" y1="22" x2="22" y2="31" stroke="#fe4543" strokeWidth="3" strokeLinecap="round" />
                              <ellipse cx="23" cy="18" rx="13" ry="7" fill="#fe4543" />
                              <circle cx="36" cy="11" r="6" fill="#fe4543" />
                              <path className="dog-ear" d="M34 9 C32 13, 31 18, 33 20" stroke="#b02638" strokeWidth="2.5" strokeLinecap="round" />
                              <ellipse cx="41" cy="12" rx="4" ry="2.5" fill="#fe4543" />
                              <circle cx="44.5" cy="11.5" r="1.2" fill="#212529" />
                              <circle cx="37" cy="9.5" r="1" fill="#212529" />
                              <rect x="31" y="12" width="2" height="6" rx="1" fill="#ffffff" />
                              <line className="leg-fa" x1="30" y1="22" x2="35" y2="31" stroke="#fe4543" strokeWidth="3" strokeLinecap="round" />
                              <line className="leg-fb" x1="26" y1="22" x2="21" y2="31" stroke="#d83f53" strokeWidth="3" strokeLinecap="round" />
                            </svg>
                          </div>
                          <div className="w-full bg-[#e0e4e6] h-1.5 rounded-full overflow-hidden">
                            <div className="progress-shimmer h-full rounded-full transition-all duration-300" style={{ width: `${mascotPercent}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Cancel Button */}
                  <div>
                    {!showCancelConfirm ? (
                      <button
                        type="button"
                        onClick={() => setShowCancelConfirm(true)}
                        className="w-full h-10 bg-[#fafafa] hover:bg-[#fff0f2] text-[#c64545] border border-[#e0e4e6] font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[16px]">close</span>
                        <span>Cancel Session</span>
                      </button>
                    ) : (
                      <div className="p-2.5 rounded-lg border border-[#c64545]/20 bg-[#c64545]/5 flex items-center justify-between gap-2 text-xs">
                        <span className="text-[#c64545] font-semibold">Discard active session?</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setShowCancelConfirm(false)}
                            className="px-2.5 py-1 rounded bg-white border border-[#e0e4e6] font-semibold cursor-pointer"
                          >
                            Keep
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelSenderSession}
                            className="px-2.5 py-1 rounded bg-[#c64545] text-white font-bold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

          {/* STATE 3: TRANSFERRING */}
          {senderStatus === 'transferring' && (
            <div className="flex-1 flex flex-col justify-between space-y-4 my-2">
              <div className="bg-[#fafafa] border border-[#ebebeb] rounded-xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#666666]">
                      Sending to {receiverLabel || 'Receiver'}
                    </p>
                    <p className="text-lg font-bold text-[#212529] mt-0.5 font-code">
                      {formatSpeed(senderProgress.speedBytesPerSec)}
                    </p>
                  </div>
                  <span className="text-2xl font-bold font-code text-[#fe4543]">
                    {Math.round(senderProgress.percent)}%
                  </span>
                </div>

                <div className="w-full bg-[#e0e4e6] h-2.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#fe4543] transition-all duration-200 rounded-full"
                    style={{ width: `${Math.min(100, Math.round(senderProgress.percent))}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-[#666666] font-code">
                  <span>{formatBytes(senderProgress.transferredBytes)} sent</span>
                  <span>Total: {formatBytes(senderProgress.totalBytes)}</span>
                </div>

                <div className="max-h-36 overflow-y-auto space-y-1.5 pt-2 border-t border-[#ebebeb]">
                  {senderFilesProgress.map((fp) => (
                    <div key={fp.fileId} className="flex items-center justify-between text-xs">
                      <span className="truncate text-[#212529] font-medium max-w-[65%]">{fp.name}</span>
                      <span className="font-code text-[#666666]">
                        {fp.status === 'completed' ? '✓ Sent' : `${Math.round(fp.progressPercent)}%`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleCancelSenderSession}
                className="w-full h-11 bg-[#fafafa] hover:bg-[#fff0f2] text-[#c64545] border border-[#e0e4e6] font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                <span>Cancel Transfer</span>
              </button>
            </div>
          )}

          {/* STATE 4: COMPLETED / FAILED / EXPIRED */}
          {(senderStatus === 'completed' ||
            senderStatus === 'failed' ||
            senderStatus === 'rejected' ||
            senderStatus === 'expired' ||
            senderStatus === 'cancelled') && (
            <div className="flex-1 flex flex-col justify-between space-y-4 my-2">
              <div className="bg-[#fafafa] border border-[#ebebeb] rounded-xl p-6 flex flex-col items-center justify-center text-center flex-1 space-y-3">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center border ${
                    senderStatus === 'completed'
                      ? 'bg-[#5db872]/15 text-[#5db872] border-[#5db872]/30'
                      : 'bg-[#c64545]/10 text-[#c64545] border-[#c64545]/30'
                  }`}
                >
                  <span className="material-symbols-outlined text-[26px]">
                    {senderStatus === 'completed' ? 'check_circle' : 'error'}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-[#212529]">
                  {senderStatus === 'completed'
                    ? 'Transfer Completed'
                    : senderStatus === 'expired'
                    ? 'Session Code Expired'
                    : senderStatus === 'rejected'
                    ? 'Transfer Declined'
                    : 'Transfer Interrupted'}
                </h3>
                <p className="text-xs text-[#666666] max-w-sm">
                  {senderStatus === 'completed'
                    ? `All ${selectedFiles.length} file(s) (${formatBytes(totalBytes)}) were verified and saved by ${receiverLabel || 'the receiving device'}.`
                    : 'The session ended before files were transferred. You can start a new session immediately.'}
                </p>
              </div>

              <button
                type="button"
                onClick={senderStatus === 'completed' ? handleResetSender : () => setSenderStatus('created')}
                className="sa-btn-primary w-full h-12 bg-[#fe4543] hover:bg-[#d83f53] text-white font-bold text-[15px] rounded-lg shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <span>{senderStatus === 'completed' ? 'Send More Files' : 'Try Again'}</span>
                <span className="material-symbols-outlined text-[18px]">refresh</span>
              </button>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* RIGHT CARD: RECEIVE                                           */}
        {/* ============================================================ */}
        <div
          className={`sa-card bg-white rounded-xl border border-[#ebebeb] shadow-[0_4px_20px_rgba(0,0,0,0.06)] overflow-hidden transition-all duration-300 flex flex-col justify-between p-5 sm:p-7 min-h-[26rem] sm:min-h-[29rem] ${
            activeTab !== 'receive' ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* CARD HEADER */}
          <div className="flex items-center justify-between pb-3.5 border-b border-[#ebebeb]">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#212529]" />
              <h2 className="text-[18px] sm:text-[20px] font-bold text-[#212529]">
                {receiverStatus === 'transferring'
                  ? 'Receiving Files'
                  : receiverStatus === 'completed'
                  ? 'Files Received'
                  : 'Receive'}
              </h2>
            </div>
          </div>

          {/* STATE 1: ENTER KEY OR SCAN QR */}
          {receiverStatus === 'created' && (
            <div className="flex-1 flex flex-col justify-between my-2">
              <div className="space-y-4 my-3">
                <p className="text-sm text-[#666666]">
                  Enter the 6-digit key or scan QR to receive files directly.
                </p>

                {/* Input Form matching Send Anywhere */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#666666]">
                    Key
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 relative flex items-center">
                      <input
                        ref={sessionCodeInputRef}
                        type="text"
                        inputMode="text"
                        autoCapitalize="characters"
                        autoComplete="off"
                        spellCheck={false}
                        value={sessionCode}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setSessionCode((prev) => formatUniversalSessionCode(raw, prev));
                        }}
                        onPaste={(e) => {
                          e.preventDefault();
                          const pasted = e.clipboardData?.getData('text') || '';
                          if (pasted && applyPastedText(pasted)) {
                            showToast('Pasted session code!', 'info');
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleReceiveAction();
                        }}
                        placeholder="Input Key"
                        maxLength={7}
                        className="w-full h-12 bg-[#f1f1f1] focus:bg-white border border-[#e0e4e6] focus:border-[#fe4543] rounded-lg px-4 font-code text-[18px] sm:text-[20px] font-bold tracking-wider text-[#212529] placeholder:font-normal placeholder:tracking-normal placeholder:text-[14px] placeholder:text-[#9b9b9b] outline-none transition-all"
                      />
                      {sessionCode && (
                        <button
                          type="button"
                          onClick={() => setSessionCode('')}
                          className="absolute right-3 text-[#9b9b9b] hover:text-[#212529] cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handlePasteCode}
                      title="Paste code from clipboard"
                      className="h-12 px-3 bg-[#fafafa] hover:bg-[#f1f1f1] border border-[#e0e4e6] text-[#212529] rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                    >
                      <span className="material-symbols-outlined text-[15px] text-[#fe4543]">content_paste</span>
                      <span className="hidden sm:inline">Paste</span>
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setIsQRScannerOpen(true)}
                    className="w-full h-11 bg-[#fafafa] hover:bg-[#f1f1f1] border border-[#e0e4e6] text-[#212529] text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px] text-[#fe4543]">qr_code_scanner</span>
                    <span>Scan QR Code</span>
                  </button>
                </div>
              </div>

              <div className="pt-3">
                <button
                  type="button"
                  onClick={handleReceiveAction}
                  disabled={!sessionCode.trim()}
                  className="sa-btn-primary w-full h-12 bg-[#fe4543] hover:bg-[#d83f53] disabled:bg-[#f1f1f1] disabled:text-[#9b9b9b] disabled:cursor-not-allowed text-white font-bold text-[15px] rounded-lg shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99]"
                >
                  <span>Receive</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STATE 2: CONNECTING / NEGOTIATING */}
          {(receiverStatus === 'receiver_pending' || receiverStatus === 'negotiating') && (
            <div className="flex-1 flex flex-col justify-between space-y-4 my-2">
              <div className="bg-[#fafafa] border border-[#ebebeb] rounded-xl p-6 flex flex-col items-center justify-center text-center flex-1 space-y-3">
                <div className="w-10 h-10 border-3 border-[#fe4543] border-t-transparent rounded-full animate-spin" />
                <p className="font-bold text-[#212529] text-sm">
                  {receiverStatus === 'receiver_pending'
                    ? 'Validating session code...'
                    : `Connected to ${senderDeviceLabel || 'Sender'} • Opening channel...`}
                </p>
                <p className="text-xs text-[#666666]">
                  Exchanging encrypted WebRTC session descriptions.
                </p>
              </div>

              <button
                type="button"
                onClick={handleResetReceiver}
                className="w-full h-11 bg-[#fafafa] hover:bg-[#f1f1f1] text-[#666666] border border-[#e0e4e6] font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                <span>Cancel</span>
              </button>
            </div>
          )}

          {/* STATE 3: INCOMING TRANSFER APPROVAL */}
          {receiverStatus === 'awaiting_acceptance' && incomingManifest && (
            <div className="flex-1 flex flex-col justify-between space-y-4 my-2">
              <div className="bg-[#fafafa] border border-[#ebebeb] rounded-xl p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ebebeb] pb-2.5">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#fe4543]">
                      Incoming Transfer
                    </span>
                    <h4 className="text-sm font-bold text-[#212529]">
                      From {incomingManifest.senderLabel || senderDeviceLabel || 'Peer Device'}
                    </h4>
                  </div>
                  <span className="text-xs font-code font-bold text-[#212529] bg-white px-2.5 py-1 rounded-md border border-[#ebebeb]">
                    {incomingManifest.totalFiles} file(s) • {formatBytes(incomingManifest.totalBytes)}
                  </span>
                </div>

                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {incomingManifest.files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-white border border-[#ebebeb] text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="material-symbols-outlined text-[16px] text-[#fe4543]">draft</span>
                        <span className="truncate font-medium text-[#212529]">{file.name}</span>
                      </div>
                      <span className="font-code text-[#666666] shrink-0 ml-2">{formatBytes(file.size)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleDeclineIncomingTransfer}
                  className="h-12 bg-[#fafafa] hover:bg-[#f1f1f1] text-[#c64545] border border-[#e0e4e6] font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                  <span>Decline</span>
                </button>
                <button
                  type="button"
                  onClick={handleAcceptIncomingTransfer}
                  className="sa-btn-primary h-12 bg-[#fe4543] hover:bg-[#d83f53] text-white font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  <span>Accept &amp; Save</span>
                </button>
              </div>
            </div>
          )}

          {/* STATE 4: RECEIVING PROGRESS */}
          {receiverStatus === 'transferring' && (
            <div className="flex-1 flex flex-col justify-between space-y-4 my-2">
              <div className="bg-[#fafafa] border border-[#ebebeb] rounded-xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#666666]">
                      Receiving from {senderDeviceLabel || 'Sender'}
                    </p>
                    <p className="text-lg font-bold text-[#212529] mt-0.5 font-code">
                      {formatSpeed(receiverProgress.speedBytesPerSec)}
                    </p>
                  </div>
                  <span className="text-2xl font-bold font-code text-[#fe4543]">
                    {Math.round(receiverProgress.percent)}%
                  </span>
                </div>

                <div className="w-full bg-[#e0e4e6] h-2.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#fe4543] transition-all duration-200 rounded-full"
                    style={{ width: `${Math.min(100, Math.round(receiverProgress.percent))}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-[#666666] font-code">
                  <span>{formatBytes(receiverProgress.transferredBytes)} received</span>
                  <span>Total: {formatBytes(receiverProgress.totalBytes)}</span>
                </div>

                <div className="max-h-36 overflow-y-auto space-y-1.5 pt-2 border-t border-[#ebebeb]">
                  {receivedFiles.map((rf) => (
                    <div key={rf.fileId} className="flex items-center justify-between text-xs">
                      <span className="truncate text-[#212529] font-medium max-w-[65%]">{rf.name}</span>
                      <span className="font-code text-[#666666]">
                        {rf.status === 'completed' ? '✓ Verified' : `${Math.round(rf.progressPercent)}%`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleResetReceiver}
                className="w-full h-11 bg-[#fafafa] hover:bg-[#fff0f2] text-[#c64545] border border-[#e0e4e6] font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                <span>Cancel Transfer</span>
              </button>
            </div>
          )}

          {/* STATE 5: COMPLETED / SAVE FILES */}
          {receiverStatus === 'completed' && (
            <div className="flex-1 flex flex-col justify-between space-y-4 my-2">
              <div className="bg-[#fafafa] border border-[#ebebeb] rounded-xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-[#ebebeb] pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#5db872] text-[20px]">verified</span>
                    <span className="text-sm font-bold text-[#212529]">
                      Files Received &amp; Verified
                    </span>
                  </div>
                  <span className="text-xs font-code text-[#5db872] font-bold">SHA-256 OK</span>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {receivedFiles.map((rf) => (
                    <div
                      key={rf.fileId}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-[#ebebeb] text-xs"
                    >
                      <div className="truncate pr-2">
                        <p className="font-medium text-[#212529] truncate">{rf.name}</p>
                        <p className="text-[11px] font-code text-[#666666]">{formatBytes(rf.size)}</p>
                      </div>
                      {rf.blob && (
                        <button
                          type="button"
                          onClick={() => triggerBrowserDownload(rf.blob!, rf.name)}
                          className="px-3 py-1.5 rounded-lg bg-[#fe4543] hover:bg-[#d83f53] text-white font-bold text-xs flex items-center gap-1 shrink-0 cursor-pointer transition-colors shadow-2xs"
                        >
                          <span className="material-symbols-outlined text-[15px]">download</span>
                          <span>Save</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleResetReceiver}
                className="sa-btn-primary w-full h-12 bg-[#fe4543] hover:bg-[#d83f53] text-white font-bold text-[15px] rounded-lg shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <span>Receive More Files</span>
                <span className="material-symbols-outlined text-[18px]">refresh</span>
              </button>
            </div>
          )}

          {/* STATE 6: FAILED / CANCELLED / REJECTED */}
          {(receiverStatus === 'failed' || receiverStatus === 'cancelled' || receiverStatus === 'rejected') && (
            <div className="flex-1 flex flex-col justify-between space-y-4 my-2">
              <div className="bg-[#fafafa] border border-[#ebebeb] rounded-xl p-6 flex flex-col items-center justify-center text-center flex-1 space-y-3">
                <div className="w-12 h-12 rounded-full bg-[#c64545]/10 text-[#c64545] border border-[#c64545]/30 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[26px]">error</span>
                </div>
                <h3 className="text-lg font-bold text-[#212529]">
                  {receiverStatus === 'cancelled' ? 'Transfer Cancelled' : 'Connection Failed'}
                </h3>
                <p className="text-xs text-[#666666] max-w-sm">
                  Could not connect to the session. Please check that the 6-digit session key is active and try again.
                </p>
              </div>

              <button
                type="button"
                onClick={handleResetReceiver}
                className="sa-btn-primary w-full h-12 bg-[#fe4543] hover:bg-[#d83f53] text-white font-bold text-[15px] rounded-lg shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <span>Try Another Code</span>
                <span className="material-symbols-outlined text-[18px]">refresh</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Real-time Telemetry Dock (spanning bottom of cards) */}
      <div className="w-full max-w-5xl mx-auto mt-6">
        <div className="sa-card bg-white border border-[#ebebeb] rounded-xl text-[#212529] px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="relative flex items-center justify-center shrink-0">
              {isPeerConnected && (
                <span className="absolute inline-flex h-3 w-3 rounded-full bg-[#5db872]/20 animate-ping" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isPeerConnected
                    ? 'bg-[#5db872] shadow-[0_0_8px_rgba(93,184,114,0.6)]'
                    : 'bg-[#fe4543]'
                }`}
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0 truncate">
              <div className="flex items-center gap-1.5 font-sans text-[11px] sm:text-[12px] tracking-tight shrink-0">
                <span className="text-[#666666] font-medium">{telemetryDeviceSource}</span>
                <span className="text-[#9b9b9b] text-[11px] font-mono">→</span>
                <span
                  className={`font-bold transition-colors truncate max-w-[110px] sm:max-w-none ${
                    isPeerConnected ? 'text-[#212529]' : 'text-[#9b9b9b]'
                  }`}
                >
                  {telemetryDeviceTarget}
                </span>
              </div>
              <span className="text-[#9b9b9b]/50 text-xs">•</span>
              <span className="inline-flex items-center gap-1 font-code text-[11px] text-[#666666] truncate max-w-[150px] sm:max-w-[240px]">
                <FileText className="w-3 h-3 text-[#fe4543] shrink-0" />
                <span className="truncate">{telemetryFileName}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 w-full sm:w-auto">
            <div className="flex-1 sm:flex-none sm:w-28 bg-[#e0e4e6] h-1.5 rounded-full overflow-hidden p-[0.5px]">
              <div
                className="h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(254,69,67,0.4)]"
                style={{
                  width: `${telemetryPercent}%`,
                  background: 'linear-gradient(90deg, #ff6b69 0%, #fe4543 100%)'
                }}
              />
            </div>

            <div className="flex items-center gap-2 font-code text-[11px] sm:text-[12px] shrink-0">
              <span className="font-bold text-[#00685a] tracking-tight tabular-nums">
                {telemetryRate}
              </span>
              <span className="text-[#9b9b9b]/60 text-[10px]">/</span>
              <span className="font-bold text-[#212529] tabular-nums tracking-tight">
                {telemetryPercent}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* QR Scanner Modal */}
      <QRScanner
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        onScanResult={handleQRScanResult}
        onOpticalFileReceived={handleOpticalFileReceived}
      />
    </div>
  );
};
