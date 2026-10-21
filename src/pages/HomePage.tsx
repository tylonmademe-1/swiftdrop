import React, { useState, useEffect, useRef } from 'react';
import { QRScanner } from '../components/QRScanner';
import { formatBytes, formatSpeed, getDeviceLabel, getDeviceInstanceId } from '../utils/format';
import { copyTextToClipboard, readTextFromClipboard, formatAlphaSessionCode } from '../utils/clipboard';
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
import { Plus, ArrowRight, FileText, X, Key, QrCode } from 'lucide-react';

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
    maxFilesCount: 50,
    maxTotalSizeBytes: 10 * 1024 * 1024 * 1024,
    maxFileSizeBytes: 5 * 1024 * 1024 * 1024
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
          setSessionCode(formatAlphaSessionCode(codeParam));
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

    const formatted = formatAlphaSessionCode(text);
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
    <div className="w-full flex-1 flex flex-col items-center px-3 sm:px-6 md:px-8 py-4 sm:py-8 md:py-12 sm:my-auto">
      {/* Minimalist Editorial Hero Header */}
      <div className="text-center max-w-xl mx-auto mb-5 sm:mb-8 space-y-2 sm:space-y-2.5 px-1">
        <h1 className="font-display text-2xl sm:text-4xl md:text-[46px] font-normal tracking-tight text-[#141413] leading-tight">
          SwiftDrop. <span className="italic font-normal text-[#cc785c]">Direct &amp; Instant.</span>
        </h1>
        <p className="text-xs sm:text-[15px] text-[#6c6a64] tracking-normal font-normal">
          © tylonmademe
        </p>
      </div>

      {/* Unified Tabbed Console Card */}
      <div className="w-full max-w-[42.5rem] min-h-[26rem] sm:min-h-[30rem] bg-white rounded-2xl border border-[#e6dfd8] shadow-[0_16px_48px_-16px_rgba(20,20,19,0.06)] overflow-hidden transition-all duration-300 flex flex-col">
        {/* Segmented Control Bar Embedded Flush in Header */}
        <div className="p-2.5 sm:p-3.5 border-b border-[#e6dfd8]/80 bg-[#f4f4f0]/60">
          <div className="grid grid-cols-2 p-1 sm:p-1.5 rounded-xl bg-[#f4f4f0] border border-[#e6dfd8] relative">
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
              className={`console-tab-btn relative z-10 py-2 sm:py-2.5 px-2.5 sm:px-4 rounded-lg text-[13px] sm:text-[14px] flex items-center justify-center gap-1.5 sm:gap-2 transition-all duration-200 cursor-pointer ${
                activeTab === 'send'
                  ? 'bg-white text-[#141413] shadow-xs font-semibold'
                  : 'text-[#6c6a64] hover:text-[#141413] font-medium'
              }`}
            >
              <svg
                className={`w-4 h-4 shrink-0 ${activeTab === 'send' ? 'text-[#cc785c]' : 'text-[#6c6a64]'}`}
                fill="none"
                height="18"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="18"
              >
                <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                <path d="M12 12v9" />
                <path d="m16 16-4-4-4 4" />
              </svg>
              <span className="truncate">Send Files</span>
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
              className={`console-tab-btn relative z-10 py-2 sm:py-2.5 px-2.5 sm:px-4 rounded-lg text-[13px] sm:text-[14px] flex items-center justify-center gap-1.5 sm:gap-2 transition-all duration-200 cursor-pointer ${
                activeTab === 'receive'
                  ? 'bg-white text-[#141413] shadow-xs font-semibold'
                  : 'text-[#6c6a64] hover:text-[#141413] font-medium'
              }`}
            >
              <svg
                className={`w-4 h-4 shrink-0 ${activeTab === 'receive' ? 'text-[#cc785c]' : 'text-[#6c6a64]'}`}
                fill="none"
                height="18"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="18"
              >
                <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                <path d="M12 12v9" />
                <path d="m8 17 4 4 4-4" />
              </svg>
              <span className="truncate">Receive Files</span>
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* CONSOLE BODY: SEND TAB PANE                                  */}
        {/* ============================================================ */}
        {activeTab === 'send' && (
          <div className="p-4 sm:p-7 md:p-9 flex flex-col justify-between flex-1 min-h-[20rem] sm:min-h-[23.75rem]">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileInputChange}
              className="hidden"
            />

            {/* STATE 1: SELECT FILES */}
            {senderStatus === 'created' && (
              <>
                {selectedFiles.length === 0 ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleFileDrop}
                    className={`group border border-dashed rounded-xl p-6 sm:p-8 md:p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 flex-1 ${
                      isDragging
                        ? 'border-[#cc785c] bg-[#f5f0e8]'
                        : 'border-[#e6dfd8] bg-[#f4f4f0]/40 hover:bg-[#f5f0e8] hover:border-[#cc785c]/40'
                    }`}
                  >
                    <div className="w-13 h-13 p-3 rounded-full bg-white flex items-center justify-center text-[#cc785c] shadow-xs border border-[#e6dfd8] mb-3 group-hover:scale-105 transition-transform">
                      <Plus className="w-6 h-6 stroke-[2.5]" />
                    </div>
                    <p className="font-semibold text-[#141413] text-[16px]">
                      Drop files or browse
                    </p>
                    <p className="text-xs text-[#6c6a64] mt-1.5 font-medium">
                      WebRTC direct peer channel • Zero cloud staging
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col justify-between space-y-4">
                    <div className="p-4 bg-[#f4f4f0]/60 rounded-xl border border-[#e6dfd8]">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-[#6c6a64]">
                          Selected Files ({selectedFiles.length})
                        </span>
                        <span className="text-xs font-code text-[#cc785c]">
                          {formatBytes(totalBytes)}
                        </span>
                      </div>

                      <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                        {selectedFiles.map((file, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 rounded-lg bg-white border border-[#e6dfd8]/70 text-xs"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <FileText className="w-4 h-4 text-[#cc785c] shrink-0" />
                              <span className="truncate text-[#141413] font-medium">
                                {file.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 ml-2">
                              <span className="text-[#6c6a64] font-code">
                                {formatBytes(file.size)}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeFile(idx)}
                                className="text-[#6c6a64] hover:text-[#c64545] cursor-pointer"
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
                        className="mt-3 text-xs text-[#cc785c] hover:underline flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add more files
                      </button>
                    </div>
                  </div>
                )}

                <div className="pt-5">
                  {selectedFiles.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => handleCreateSenderSession('code')}
                        className="flex items-center justify-center gap-2 bg-white hover:bg-[#f4f4f0] text-[#141413] border border-[#e6dfd8] font-semibold text-[14px] h-12 rounded-xl shadow-xs transition-all duration-200 active:scale-[0.99] cursor-pointer"
                      >
                        <Key className="w-4 h-4 text-[#cc785c]" />
                        <span>Create Session Code</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCreateSenderSession('qr')}
                        className="flex items-center justify-center gap-2 bg-[#cc785c] hover:bg-[#b8654a] text-white font-semibold text-[14px] h-12 rounded-xl shadow-xs transition-all duration-200 active:scale-[0.99] cursor-pointer"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>Connect with QR Code</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 bg-[#cc785c] hover:bg-[#b8654a] text-white font-semibold text-[15px] h-12 rounded-xl shadow-xs transition-all duration-200 active:scale-[0.99] cursor-pointer"
                    >
                      <span>Send Files</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </>
            )}

            {/* STATE 2: WAITING FOR RECEIVER / PAIRING */}
            {(senderStatus === 'waiting_for_receiver' ||
              senderStatus === 'receiver_pending' ||
              senderStatus === 'negotiating' ||
              senderStatus === 'awaiting_acceptance') &&
              (() => {
                const cleanCode = (pairingCode || '').replace(/[^A-Za-z0-9]/g, '');
                const codePart1 = cleanCode.slice(0, 3) || '•••';
                const codePart2 = cleanCode.slice(3, 6) || (cleanCode.length > 3 ? cleanCode.slice(3) : '•••');
                const mascotPercent = cloudPackageReady
                  ? 100
                  : (!cloudPackageReady && cloudUploadPercent > 0
                    ? cloudUploadPercent
                    : 18);

                return (
                  <div className="flex-1 flex flex-col justify-between space-y-4 sm:space-y-5">
                    <div className="editorial-card rounded-2xl p-4 sm:p-6 flex flex-col items-center text-center space-y-4">
                      {/* Status Header */}
                      <div className="w-full flex items-center justify-between gap-2 border-b border-[#e4ded5] pb-3">
                        <div className="flex items-center gap-2 text-xs font-medium text-[#141413] text-left">
                          <span className="relative flex h-2.5 w-2.5 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#cc785c] opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#cc785c]" />
                          </span>
                          <span>
                            {senderStatus === 'waiting_for_receiver' &&
                              (!cloudPackageReady && cloudUploadPercent > 0
                                ? `Uploading 5MB chunks (${cloudUploadPercent}% • ${formatSpeed(cloudUploadSpeed)})...`
                                : cloudPackageReady
                                  ? 'Link & Code Ready • Stored for 3 days + Live P2P'
                                  : 'Waiting for receiver to connect...')}
                            {senderStatus === 'receiver_pending' && `${receiverLabel} joined • Connecting...`}
                            {senderStatus === 'negotiating' && `Negotiating WebRTC with ${receiverLabel}...`}
                            {senderStatus === 'awaiting_acceptance' && `Waiting for ${receiverLabel} to accept...`}
                          </span>
                        </div>
                      </div>

                      {/* Main Pairing Box */}
                      <div className="code-inner-box p-4 sm:p-6 relative overflow-hidden group w-full">
                        {/* Corner accent glow */}
                        <div className="absolute -top-12 -right-12 w-28 h-28 bg-[#cc785c]/10 rounded-full blur-2xl pointer-events-none" />

                        {/* Pairing Content: Side-by-side on sm:, stacked on mobile */}
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 w-full">
                          {/* Left: Session Access Code & Action Buttons */}
                          <div className="flex-1 flex flex-col items-center sm:items-start text-center sm:text-left w-full">
                            <div className="flex items-center gap-1.5 mb-1.5 text-[#6c6a64]">
                              <span className="material-symbols-outlined text-[15px]">pin</span>
                              <span className="text-[11px] font-semibold uppercase tracking-widest">
                                Session Access Code
                              </span>
                            </div>

                            {/* Split code display */}
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={handleCopyCode}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleCopyCode();
                                }
                              }}
                              className="my-2 sm:my-3 flex items-center justify-center sm:justify-start gap-2 sm:gap-3 cursor-pointer select-all group transition-transform active:scale-[0.98]"
                              title="Click to copy code"
                            >
                              <div className="code-segment font-code text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-widest text-[#141413] bg-[#faf8f4] border border-[#e4ded5] px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl shadow-xs group-hover:border-[#cc785c]/40 transition-colors">
                                {codePart1}
                              </div>
                              <span className="font-code text-2xl sm:text-3xl font-bold text-[#cc785c] select-none">-</span>
                              <div className="code-segment font-code text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-widest text-[#141413] bg-[#faf8f4] border border-[#e4ded5] px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl shadow-xs group-hover:border-[#cc785c]/40 transition-colors">
                                {codePart2}
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 mt-2 w-full max-w-xs justify-center sm:justify-start">
                              <button
                                type="button"
                                onClick={handleCopyCode}
                                disabled={!pairingCode}
                                className="flex-1 py-2 px-3 rounded-xl bg-white hover:bg-[#faf8f4] border border-[#e4ded5] text-xs font-semibold text-[#141413] flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                              >
                                <span className="material-symbols-outlined text-[15px] text-[#cc785c]">
                                  {copiedCode ? 'check' : 'content_copy'}
                                </span>
                                <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleCopyLink}
                                disabled={!qrUrl}
                                className="flex-1 py-2 px-3 rounded-xl bg-[#cc785c] hover:bg-[#b8654a] text-xs font-semibold text-white flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                              >
                                <span className="material-symbols-outlined text-[15px]">
                                  {copiedLink ? 'check' : 'link'}
                                </span>
                                <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
                              </button>
                            </div>
                          </div>

                          {/* Right: QR Code Display */}
                          <div className="flex flex-col items-center shrink-0">
                            {/* Mode selector pills (Pairing QR vs Optical Stream) */}
                            <div className="inline-flex p-0.5 rounded-lg bg-[#faf8f4] border border-[#e4ded5] mb-2.5">
                              <button
                                type="button"
                                onClick={() => setQrMode('pairing')}
                                className={`px-2.5 py-0.5 rounded-md text-[10px] font-semibold transition-all cursor-pointer ${
                                  qrMode === 'pairing' ? 'bg-white text-[#141413] shadow-2xs border border-[#e4ded5]' : 'text-[#6c6a64] hover:text-[#141413]'
                                }`}
                              >
                                Pairing QR
                              </button>
                              <button
                                type="button"
                                onClick={() => setQrMode('optical')}
                                className={`px-2.5 py-0.5 rounded-md text-[10px] font-semibold transition-all cursor-pointer ${
                                  qrMode === 'optical' ? 'bg-white text-[#141413] shadow-2xs border border-[#e4ded5]' : 'text-[#6c6a64] hover:text-[#141413]'
                                }`}
                              >
                                Optical Stream
                              </button>
                            </div>

                            {/* QR Frame */}
                            <div className="p-2.5 bg-white border border-[#e4ded5] rounded-xl shadow-xs relative group qr-preserve-white">
                              <div className="w-32 h-32 sm:w-36 sm:h-36 bg-white rounded-lg flex items-center justify-center border border-[#e4ded5]/60 overflow-hidden">
                                {qrMode === 'optical' ? (
                                  opticalFrameUrl ? (
                                    <img src={opticalFrameUrl} alt="QRFerry Optical Stream" className="w-full h-full object-contain" />
                                  ) : (
                                    <div className="flex flex-col items-center gap-1.5 p-2 text-center">
                                      <span className="material-symbols-outlined text-xl text-[#cc785c] animate-spin">sync</span>
                                      <span className="text-[11px] text-[#6c6a64] font-medium">Encoding stream...</span>
                                    </div>
                                  )
                                ) : qrDataUrl ? (
                                  <img src={qrDataUrl} alt="Session QR Code" className="w-full h-full object-contain" />
                                ) : (
                                  <div className="flex flex-col items-center gap-1.5 p-2 text-center">
                                    <span className="material-symbols-outlined text-xl text-[#cc785c] animate-spin">sync</span>
                                    <span className="text-[11px] text-[#6c6a64] font-medium">Generating QR...</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="mt-1.5 flex flex-col items-center">
                              <span className="text-[10px] font-mono uppercase tracking-widest text-[#cc785c] font-bold">
                                {qrMode === 'optical' ? `Frame ${opticalFrameIndex}/${opticalTotalFrames || 1}` : 'Scan with camera'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Mascot Running Track */}
                        <div className="w-full mt-5 pt-3 border-t border-[#e4ded5]/70">
                          <div className="relative w-full h-10 flex items-end">
                            {/* Animated Dog Mascot galloping along the bar */}
                            <div
                              className="dog-gallop absolute bottom-1.5 z-10 transition-all duration-300 pointer-events-none"
                              style={{ left: `${Math.min(94, Math.max(6, mascotPercent))}%`, transform: 'translateX(-50%)' }}
                            >
                              <svg width="40" height="26" viewBox="0 0 52 34" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path className="dog-tail-wag" d="M10 14 C6 11, 3 8, 2 5" stroke="#cc785c" strokeWidth="3" strokeLinecap="round" />
                                <line className="leg-ba" x1="14" y1="22" x2="11" y2="31" stroke="#a05238" strokeWidth="3" strokeLinecap="round" />
                                <line className="leg-bb" x1="18" y1="22" x2="22" y2="31" stroke="#cc785c" strokeWidth="3" strokeLinecap="round" />
                                <ellipse cx="23" cy="18" rx="13" ry="7" fill="#cc785c" />
                                <circle cx="36" cy="11" r="6" fill="#cc785c" />
                                <path className="dog-ear" d="M34 9 C32 13, 31 18, 33 20" stroke="#7e3f2b" strokeWidth="2.5" strokeLinecap="round" />
                                <ellipse cx="41" cy="12" rx="4" ry="2.5" fill="#cc785c" />
                                <circle cx="44.5" cy="11.5" r="1.2" fill="#141413" />
                                <circle cx="37" cy="9.5" r="1" fill="#141413" />
                                <rect x="31" y="12" width="2" height="6" rx="1" fill="#faf8f4" />
                                <line className="leg-fa" x1="30" y1="22" x2="35" y2="31" stroke="#cc785c" strokeWidth="3" strokeLinecap="round" />
                                <line className="leg-fb" x1="26" y1="22" x2="21" y2="31" stroke="#a05238" strokeWidth="3" strokeLinecap="round" />
                              </svg>
                            </div>

                            {/* Progress Track Bar */}
                            <div className="w-full bg-[#e4ded5] h-2 rounded-full overflow-hidden relative">
                              <div
                                className="progress-shimmer bg-[#cc785c] h-full rounded-full transition-all duration-300"
                                style={{ width: `${mascotPercent}%` }}
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-start gap-1 text-[11px] text-[#6c6a64] mt-2 font-mono">
                            <span className="flex items-center gap-1.5">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#cc785c]" />
                              <span>{selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'} • {formatBytes(totalBytes)}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Cancel Session Button & Confirmation Drawer */}
                    <div>
                      {!showCancelConfirm ? (
                        <button
                          type="button"
                          onClick={() => setShowCancelConfirm(true)}
                          className="w-full flex items-center justify-center gap-2 bg-[#faf8f4] hover:bg-[#ede7dd] text-[#c64545] border border-[#e4ded5] font-semibold text-[13px] h-10 rounded-xl transition-all cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[17px]">delete_sweep</span>
                          <span>Cancel Session</span>
                        </button>
                      ) : (
                        <div className="cancel-confirm-box p-3 rounded-xl border border-[#c64545]/20 bg-[#c64545]/5 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 text-[#c64545]">
                            <span className="material-symbols-outlined text-[16px]">warning</span>
                            <span className="font-medium">Cancel and discard session?</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setShowCancelConfirm(false)}
                              className="px-2.5 py-1 rounded-lg bg-white border border-[#e4ded5] hover:bg-[#faf8f4] text-[#141413] text-[11px] font-semibold cursor-pointer"
                            >
                              Keep
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelSenderSession}
                              className="px-2.5 py-1 rounded-lg bg-[#c64545] hover:bg-[#b03a3a] text-white text-[11px] font-semibold shadow-2xs cursor-pointer"
                            >
                              Yes, cancel
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
              <div className="flex-1 flex flex-col justify-between space-y-5">
                <div className="bg-[#f4f4f0]/60 border border-[#e6dfd8] rounded-xl p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#6c6a64]">
                        Sending to {receiverLabel || 'Receiver'}
                      </p>
                      <p className="text-lg font-bold text-[#141413] mt-0.5 font-code">
                        {formatSpeed(senderProgress.speedBytesPerSec)}
                      </p>
                    </div>
                    <span className="text-2xl font-bold font-code text-[#cc785c]">
                      {Math.round(senderProgress.percent)}%
                    </span>
                  </div>

                  <div className="w-full bg-[#e6dfd8] h-2.5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#cc785c] transition-all duration-200 rounded-full"
                      style={{ width: `${Math.min(100, Math.round(senderProgress.percent))}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#6c6a64] font-code">
                    <span>{formatBytes(senderProgress.transferredBytes)} sent</span>
                    <span>Total: {formatBytes(senderProgress.totalBytes)}</span>
                  </div>

                  <div className="max-h-32 overflow-y-auto space-y-1.5 pt-2 border-t border-[#e6dfd8]">
                    {senderFilesProgress.map((fp) => (
                      <div key={fp.fileId} className="flex items-center justify-between text-xs">
                        <span className="truncate text-[#141413] font-medium max-w-[65%]">{fp.name}</span>
                        <span className="font-code text-[#6c6a64]">
                          {fp.status === 'completed' ? '✓ Sent' : `${Math.round(fp.progressPercent)}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCancelSenderSession}
                  className="w-full flex items-center justify-center gap-2 bg-[#f4f4f0] hover:bg-[#efe9de] text-[#c64545] border border-[#e6dfd8] font-semibold text-[14px] h-11 rounded-xl transition-colors cursor-pointer"
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
              <div className="flex-1 flex flex-col justify-between space-y-5">
                <div className="bg-[#f4f4f0]/50 border border-[#e6dfd8] rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center text-center flex-1 space-y-3">
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
                  <h3 className="text-lg font-bold text-[#141413]">
                    {senderStatus === 'completed'
                      ? 'Transfer Completed'
                      : senderStatus === 'expired'
                      ? 'Session Code Expired'
                      : senderStatus === 'rejected'
                      ? 'Transfer Declined'
                      : 'Transfer Interrupted'}
                  </h3>
                  <p className="text-xs text-[#6c6a64] max-w-sm">
                    {senderStatus === 'completed'
                      ? `All ${selectedFiles.length} file(s) (${formatBytes(totalBytes)}) were verified and saved by ${receiverLabel || 'the receiving device'}.`
                      : 'The session ended before files were transferred. You can start a new session immediately.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={senderStatus === 'completed' ? handleResetSender : () => setSenderStatus('created')}
                  className="w-full flex items-center justify-center gap-2 bg-[#cc785c] hover:bg-[#b8654a] text-white font-semibold text-[15px] h-12 rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <span>{senderStatus === 'completed' ? 'Send More Files' : 'Try Again'}</span>
                  <span className="material-symbols-outlined text-[18px]">refresh</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* CONSOLE BODY: RECEIVE TAB PANE                               */}
        {/* ============================================================ */}
        {activeTab === 'receive' && (
          <div className="p-4 sm:p-7 md:p-9 flex flex-col justify-between flex-1 min-h-[20rem] sm:min-h-[23.75rem]">
            {/* STATE 1: ENTER CODE OR SCAN QR */}
            {receiverStatus === 'created' && (
              <>
                <div className="bg-[#f4f4f0]/40 border border-[#e6dfd8] rounded-xl p-4 sm:p-6 md:p-7 flex flex-col justify-center flex-1 space-y-4 text-left">
                  <div className="space-y-1">
                    <p className="text-[13px] sm:text-[14px] font-medium text-[#141413]">
                      Enter session identifier or scan peer QR code to receive direct stream
                    </p>
                    <p className="text-xs text-[#6c6a64]">
                      Secured via end-to-end WebRTC channels.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#6c6a64] mb-2">
                      Session Code
                    </label>
                    <div className="bg-white border border-[#e6dfd8] rounded-lg px-3.5 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between shadow-xs">
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
                          setSessionCode((prev) => formatAlphaSessionCode(raw, prev));
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
                        placeholder="e.g. KWM-XQP"
                        maxLength={7}
                        className="font-code text-[18px] sm:text-[20px] font-semibold text-[#141413] tracking-wider uppercase bg-transparent border-none outline-none p-0 w-full focus:ring-0 placeholder:normal-case placeholder:font-normal placeholder:text-[14px] sm:placeholder:text-[15px] placeholder:tracking-normal placeholder:text-[#8e8b82]"
                      />
                      <button
                        type="button"
                        onClick={handlePasteCode}
                        title="Paste session code"
                        className="text-xs px-2.5 py-1 rounded bg-[#f4f4f0] hover:bg-[#e8e0d2] text-[#141413] border border-[#e6dfd8] flex items-center gap-1 transition-colors cursor-pointer shrink-0 ml-2"
                      >
                        <span className="material-symbols-outlined text-[14px] text-[#cc785c]">content_paste</span>
                        <span>Paste</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setIsQRScannerOpen(true)}
                      className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-[#efe9de] hover:bg-[#e8e0d2] border border-[#e6dfd8] rounded-lg text-[#141413] text-[13px] font-semibold transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
                      <span>Scan QR</span>
                    </button>
                  </div>
                </div>

                <div className="pt-4 sm:pt-5">
                  <button
                    type="button"
                    onClick={handleReceiveAction}
                    className="w-full flex items-center justify-center gap-2 bg-[#cc785c] hover:bg-[#b8654a] text-white font-semibold text-[15px] h-12 rounded-xl shadow-xs transition-all duration-200 active:scale-[0.99] cursor-pointer"
                  >
                    <span>Connect &amp; Receive</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}

            {/* STATE 2: CONNECTING / NEGOTIATING */}
            {(receiverStatus === 'receiver_pending' || receiverStatus === 'negotiating') && (
              <div className="flex-1 flex flex-col justify-between space-y-5">
                <div className="bg-[#f4f4f0]/50 border border-[#e6dfd8] rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center text-center flex-1 space-y-3">
                  <div className="w-10 h-10 border-3 border-[#cc785c] border-t-transparent rounded-full animate-spin" />
                  <p className="font-semibold text-[#141413] text-sm">
                    {receiverStatus === 'receiver_pending'
                      ? 'Validating session code...'
                      : `Connected to ${senderDeviceLabel || 'Sender'} • Opening direct channel...`}
                  </p>
                  <p className="text-xs text-[#6c6a64]">
                    Exchanging encrypted WebRTC session descriptions.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleResetReceiver}
                  className="w-full flex items-center justify-center gap-2 bg-[#f4f4f0] hover:bg-[#efe9de] text-[#6c6a64] border border-[#e6dfd8] font-semibold text-[14px] h-11 rounded-xl transition-colors cursor-pointer"
                >
                  <span>Cancel</span>
                </button>
              </div>
            )}

            {/* STATE 3: INCOMING TRANSFER APPROVAL */}
            {receiverStatus === 'awaiting_acceptance' && incomingManifest && (
              <div className="flex-1 flex flex-col justify-between space-y-5">
                <div className="bg-[#f4f4f0]/60 border border-[#e6dfd8] rounded-xl p-4 sm:p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e6dfd8] pb-3">
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#cc785c]">
                        Incoming Transfer Request
                      </span>
                      <h4 className="text-sm font-bold text-[#141413]">
                        From {incomingManifest.senderLabel || senderDeviceLabel || 'Peer Device'}
                      </h4>
                    </div>
                    <span className="text-xs font-code font-semibold text-[#141413] bg-white px-2.5 py-1 rounded-lg border border-[#e6dfd8]">
                      {incomingManifest.totalFiles} file(s) • {formatBytes(incomingManifest.totalBytes)}
                    </span>
                  </div>

                  <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                    {incomingManifest.files.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-[#e6dfd8] text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="material-symbols-outlined text-[16px] text-[#cc785c]">draft</span>
                          <span className="truncate font-medium text-[#141413]">{file.name}</span>
                        </div>
                        <span className="font-code text-[#6c6a64] shrink-0 ml-2">{formatBytes(file.size)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleDeclineIncomingTransfer}
                    className="flex items-center justify-center gap-1.5 bg-[#f4f4f0] hover:bg-[#efe9de] text-[#c64545] border border-[#e6dfd8] font-semibold text-[14px] h-12 rounded-xl transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                    <span>Decline</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAcceptIncomingTransfer}
                    className="flex items-center justify-center gap-1.5 bg-[#cc785c] hover:bg-[#b8654a] text-white font-semibold text-[14px] h-12 rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">download</span>
                    <span>Accept &amp; Save</span>
                  </button>
                </div>
              </div>
            )}

            {/* STATE 4: RECEIVING PROGRESS */}
            {receiverStatus === 'transferring' && (
              <div className="flex-1 flex flex-col justify-between space-y-5">
                <div className="bg-[#f4f4f0]/60 border border-[#e6dfd8] rounded-xl p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#6c6a64]">
                        Receiving from {senderDeviceLabel || 'Sender'}
                      </p>
                      <p className="text-lg font-bold text-[#141413] mt-0.5 font-code">
                        {formatSpeed(receiverProgress.speedBytesPerSec)}
                      </p>
                    </div>
                    <span className="text-2xl font-bold font-code text-[#cc785c]">
                      {Math.round(receiverProgress.percent)}%
                    </span>
                  </div>

                  <div className="w-full bg-[#e6dfd8] h-2.5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#cc785c] transition-all duration-200 rounded-full"
                      style={{ width: `${Math.min(100, Math.round(receiverProgress.percent))}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#6c6a64] font-code">
                    <span>{formatBytes(receiverProgress.transferredBytes)} received</span>
                    <span>Total: {formatBytes(receiverProgress.totalBytes)}</span>
                  </div>

                  <div className="max-h-32 overflow-y-auto space-y-1.5 pt-2 border-t border-[#e6dfd8]">
                    {receivedFiles.map((rf) => (
                      <div key={rf.fileId} className="flex items-center justify-between text-xs">
                        <span className="truncate text-[#141413] font-medium max-w-[65%]">{rf.name}</span>
                        <span className="font-code text-[#6c6a64]">
                          {rf.status === 'completed' ? '✓ Verified' : `${Math.round(rf.progressPercent)}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleResetReceiver}
                  className="w-full flex items-center justify-center gap-2 bg-[#f4f4f0] hover:bg-[#efe9de] text-[#c64545] border border-[#e6dfd8] font-semibold text-[14px] h-11 rounded-xl transition-colors cursor-pointer"
                >
                  <span>Cancel Transfer</span>
                </button>
              </div>
            )}

            {/* STATE 5: COMPLETED / SAVE FILES */}
            {receiverStatus === 'completed' && (
              <div className="flex-1 flex flex-col justify-between space-y-5">
                <div className="bg-[#f4f4f0]/60 border border-[#e6dfd8] rounded-xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#e6dfd8] pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#5db872] text-[20px]">verified</span>
                      <span className="text-sm font-bold text-[#141413]">
                        Files Received &amp; Verified
                      </span>
                    </div>
                    <span className="text-xs font-code text-[#5db872] font-semibold">SHA-256 OK</span>
                  </div>

                  <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
                    {receivedFiles.map((rf) => (
                      <div
                        key={rf.fileId}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-[#e6dfd8] text-xs"
                      >
                        <div className="truncate pr-2">
                          <p className="font-medium text-[#141413] truncate">{rf.name}</p>
                          <p className="text-[11px] font-code text-[#6c6a64]">{formatBytes(rf.size)}</p>
                        </div>
                        {rf.blob && (
                          <button
                            type="button"
                            onClick={() => triggerBrowserDownload(rf.blob!, rf.name)}
                            className="px-3 py-1.5 rounded-lg bg-[#cc785c] hover:bg-[#b8654a] text-white font-semibold text-xs flex items-center gap-1 shrink-0 cursor-pointer"
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
                  className="w-full flex items-center justify-center gap-2 bg-[#cc785c] hover:bg-[#b8654a] text-white font-semibold text-[15px] h-12 rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <span>Receive More Files</span>
                  <span className="material-symbols-outlined text-[18px]">refresh</span>
                </button>
              </div>
            )}

            {/* STATE 6: FAILED / CANCELLED / REJECTED */}
            {(receiverStatus === 'failed' || receiverStatus === 'cancelled' || receiverStatus === 'rejected') && (
              <div className="flex-1 flex flex-col justify-between space-y-5">
                <div className="bg-[#f4f4f0]/50 border border-[#e6dfd8] rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center text-center flex-1 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-[#c64545]/10 text-[#c64545] border border-[#c64545]/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[26px]">error</span>
                  </div>
                  <h3 className="text-lg font-bold text-[#141413]">
                    {receiverStatus === 'cancelled' ? 'Transfer Cancelled' : 'Connection Failed'}
                  </h3>
                  <p className="text-xs text-[#6c6a64] max-w-sm">
                    Could not connect to the session. Please check that the 6-letter session code is active and try again.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleResetReceiver}
                  className="w-full flex items-center justify-center gap-2 bg-[#cc785c] hover:bg-[#b8654a] text-white font-semibold text-[15px] h-12 rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <span>Try Another Code</span>
                  <span className="material-symbols-outlined text-[18px]">refresh</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Refined Telemetry Dock */}
        <div className="border-t border-[#e6dfd8] bg-[#f4f4f0] text-[#141413] px-3.5 sm:px-6 py-3 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="relative flex items-center justify-center shrink-0">
              {isPeerConnected && (
                <span className="absolute inline-flex h-3 w-3 rounded-full bg-[#5db872]/20 animate-ping" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isPeerConnected
                    ? 'bg-[#5db872] shadow-[0_0_8px_rgba(93,184,114,0.6)]'
                    : 'bg-[#cc785c]'
                }`}
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0 truncate">
              <div className="flex items-center gap-1.5 font-sans text-[11px] sm:text-[12px] tracking-tight shrink-0">
                <span className="text-[#6c6a64] font-medium">{telemetryDeviceSource}</span>
                <span className="text-[#8e8b82] text-[11px] font-mono">→</span>
                <span
                  className={`font-semibold transition-colors truncate max-w-[110px] sm:max-w-none ${
                    isPeerConnected ? 'text-[#141413]' : 'text-[#8e8b82]'
                  }`}
                >
                  {telemetryDeviceTarget}
                </span>
              </div>
              <span className="text-[#8e8b82]/50 text-xs">•</span>
              <span className="inline-flex items-center gap-1 font-code text-[11px] text-[#6c6a64] truncate max-w-[150px] sm:max-w-[240px]">
                <FileText className="w-3 h-3 text-[#cc785c] shrink-0" />
                <span className="truncate">{telemetryFileName}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 w-full sm:w-auto">
            <div className="flex-1 sm:flex-none sm:w-28 bg-[#e6dfd8] h-1.5 rounded-full overflow-hidden p-[0.5px]">
              <div
                className="h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(204,120,92,0.4)]"
                style={{
                  width: `${telemetryPercent}%`,
                  background: 'linear-gradient(90deg, #b2583e 0%, #cc785c 100%)'
                }}
              />
            </div>

            <div className="flex items-center gap-2 font-code text-[11px] sm:text-[12px] shrink-0">
              <span className="font-medium text-[#00685a] tracking-tight tabular-nums">
                {telemetryRate}
              </span>
              <span className="text-[#8e8b82]/60 text-[10px]">/</span>
              <span className="font-semibold text-[#141413] tabular-nums tracking-tight">
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
