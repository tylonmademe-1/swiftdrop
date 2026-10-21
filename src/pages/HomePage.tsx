import React, { useState, useEffect, useRef } from 'react';
import { QRScanner } from '../components/QRScanner';
import { formatBytes, formatSpeed, getDeviceLabel, getDeviceInstanceId } from '../utils/format';
import { copyTextToClipboard, readTextFromClipboard, formatAlphaSessionCode, formatUniversalSessionCode } from '../utils/clipboard';
import { useToast } from '../components/Toast';
import { fetchServerConfig, fetchIceServers } from '../services/configService';
import { generateQRCode } from '../services/qrService';
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
import { formatSpeedRate, formatEta } from '../services/speedEngine';
import { Plus, ArrowRight, ArrowLeft, FileText, X, Key, QrCode, Zap, Link, Mail, Globe, Check } from 'lucide-react';

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
  const [senderSessionId, setSenderSessionId] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(300);
  const [receiverLabel, setReceiverLabel] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Store-and-Forward 5MB Chunked Upload State (WeTransfer / SwissTransfer model)
  const [cloudUploadPercent, setCloudUploadPercent] = useState<number>(0);
  const [cloudUploadSpeed, setCloudUploadSpeed] = useState<number>(0);
  const [cloudPackageReady, setCloudPackageReady] = useState<boolean>(false);
  const cloudPackageReadyRef = useRef<boolean>(false);
  cloudPackageReadyRef.current = cloudPackageReady;
  const cloudUploadingRef = useRef<boolean>(false);
  const cloudUploadAbortRef = useRef<AbortController | null>(null);
  const cloudPackageIdRef = useRef<string | null>(null);
  const [sendTransferType, setSendTransferType] = useState<'direct' | 'link' | 'email'>('direct');
  const [isBottomLangModalOpen, setIsBottomLangModalOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('English');

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
      <div className="text-center max-w-2xl mx-auto mb-6 sm:mb-9 space-y-1.5 px-1">
        <h1 className="text-2xl sm:text-4xl md:text-[38px] font-extrabold tracking-tight text-[#212529] leading-tight font-sans">
          Send whatever you want, <span className="text-[#fe4543]">wherever you want</span>
        </h1>
        <p className="text-xs sm:text-[15px] text-[#666666] font-medium">
          Easy, quick, and unlimited file sharing
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
          <div className="pb-3 border-b border-[#ebebeb]">
            {selectedFiles.length === 0 || senderStatus !== 'created' ? (
              <div className="flex items-center justify-between">
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
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[17px] font-bold text-[#212529] hover:text-[#fe4543] flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Plus className="w-4.5 h-4.5 stroke-[2.5] text-[#fe4543]" />
                    <span>Add more</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetSender}
                    className="reset-button text-xs text-[#9b9b9b] hover:text-[#fe4543] font-medium cursor-pointer transition-colors"
                  >
                    Reset
                  </button>
                </div>
                <div className="desc3 text-xs text-[#9b9b9b] font-medium mt-1">
                  Total {selectedFiles.length} files • {formatBytes(totalBytes)}
                </div>
              </div>
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
                <div className="flex-1 flex flex-col justify-between my-2">
                  {/* File List */}
                  <div className="max-h-48 overflow-y-auto pr-1 my-2 divide-y divide-[#f1f1f1]">
                    {selectedFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="FileItem flex items-center justify-between py-2 px-1 text-xs group hover:bg-[#fafafa] rounded transition-colors"
                      >
                        <div className="file-name font-medium text-[#212529] truncate max-w-[65%]" title={file.name}>
                          {file.name}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="file-size text-[#9b9b9b] font-code group-hover:hidden">
                            {formatBytes(file.size)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFile(idx)}
                            className="file-remove hidden group-hover:flex items-center justify-center text-[#9b9b9b] hover:text-[#fe4543] cursor-pointer p-0.5"
                            title="Remove file"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* SendSwitch: Direct | Link | Email */}
                  <div className="SendSwitch flex h-10 mt-3 bg-[#f8f9fa] border border-[#e0e4e6] rounded p-0.5">
                    <button
                      type="button"
                      onClick={() => setSendTransferType('direct')}
                      className={`w-1/3 h-full flex items-center justify-center gap-1.5 text-xs font-bold rounded transition-all cursor-pointer ${
                        sendTransferType === 'direct'
                          ? 'bg-white text-[#212529] shadow-xs'
                          : 'text-[#9b9b9b] hover:text-[#212529]'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Direct</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSendTransferType('link')}
                      className={`w-1/3 h-full flex items-center justify-center gap-1.5 text-xs font-bold rounded transition-all cursor-pointer ${
                        sendTransferType === 'link'
                          ? 'bg-white text-[#212529] shadow-xs'
                          : 'text-[#9b9b9b] hover:text-[#212529]'
                      }`}
                    >
                      <Link className="w-3.5 h-3.5" />
                      <span>Link</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSendTransferType('email')}
                      className={`w-1/3 h-full flex items-center justify-center gap-1.5 text-xs font-bold rounded transition-all cursor-pointer ${
                        sendTransferType === 'email'
                          ? 'bg-white text-[#212529] shadow-xs'
                          : 'text-[#9b9b9b] hover:text-[#212529]'
                      }`}
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Email</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-3">
                {selectedFiles.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => handleCreateSenderSession('code')}
                    className="sa-btn-primary w-full h-12 bg-[#fe4543] hover:bg-[#d83f53] text-white font-bold text-[16px] rounded-lg shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99]"
                  >
                    <span>Send</span>
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

          {/* STATE 2: WAITING FOR RECEIVER (SEND ANYWHERE AUTHENTIC 6-DIGIT KEY SCREEN) */}
          {(senderStatus === 'waiting_for_receiver' ||
            senderStatus === 'receiver_pending' ||
            senderStatus === 'negotiating' ||
            senderStatus === 'awaiting_acceptance') &&
            (() => {
              const cleanCode = (pairingCode || '').replace(/[^A-Za-z0-9]/g, '');
              const digits = (cleanCode.padEnd(6, '•')).slice(0, 6).split('');

              return (
                <div className="Waiting widget-container flex-1 flex flex-col justify-between my-2">
                  <div className="transfer-box-inner">
                    {/* Send Wait Header */}
                    <div className="send-wait-header border-box mb-3">
                      <button
                        type="button"
                        onClick={handleCancelSenderSession}
                        className="back-button text-[#9b9b9b] hover:text-[#fe4543] p-1 cursor-pointer transition-colors"
                        title="Cancel transfer"
                      >
                        <ArrowLeft className="w-5 h-5" />
                      </button>
                      <h3 className="title3 bold text-[17px] font-bold text-[#212529]">
                        Waiting for receiver...
                      </h3>
                      <div className="desc3 text-xs text-[#9b9b9b]">
                        The key expires in {formatCountdown(secondsLeft)}
                      </div>
                    </div>

                    {/* Authentic Send Anywhere 6-digit key box with click-to-copy */}
                    <div className="center text-center my-2">
                      <div
                        className="key-box pointer"
                        onClick={handleCopyCode}
                        title="Click to copy 6-digit key"
                      >
                        {digits.map((d, i) => (
                          <span key={i}>{d}</span>
                        ))}
                      </div>

                      {/* Authentic Send Anywhere QRInner */}
                      <div className="QRInner">
                        {qrDataUrl && (
                          <figure className="qr-wrapper">
                            <div className="p-2 bg-white border border-[#ebebeb] rounded-xl shadow-xs">
                              <img
                                src={qrDataUrl}
                                alt="Send Anywhere QR Code"
                                className="w-28 h-28 sm:w-32 sm:h-32 object-contain"
                              />
                            </div>
                          </figure>
                        )}

                        <div
                          className="copy-box pointer"
                          onClick={handleCopyLink}
                          title="Click to copy link"
                        >
                          <div className="flex items-center justify-center gap-1.5">
                            <Link className="w-3.5 h-3.5 text-[#fe4543]" />
                            <p className="link desc2 text-xs">
                              swiftdrop.io/<span>{cleanCode}</span>
                            </p>
                          </div>
                          <p className="exp desc3 text-[11px] mt-0.5">
                            {copiedLink ? 'Link Copied!' : 'Click to copy shareable link'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Cancel Button */}
                  <div className="pt-3 border-t border-[#f1f1f1]">
                    <button
                      type="button"
                      onClick={handleCancelSenderSession}
                      className="text-button gray w-full py-2 text-xs text-[#9b9b9b] hover:text-[#fe4543] font-medium transition-colors cursor-pointer text-center"
                    >
                      Cancel Transfer
                    </button>
                  </div>
                </div>
              );
            })()}

          {/* STATE 3: TRANSFERRING (SEND ANYWHERE AUTHENTIC LAYOUT) */}
          {senderStatus === 'transferring' && (
            <div className="transfer-box-inner flex-1 flex flex-col justify-between my-2">
              <div>
                <div className="send-transfer-header flex items-center justify-between mb-3">
                  <h3 className="title3 bold text-[17px] font-bold text-[#212529]">
                    Sending Files
                  </h3>
                  <button
                    type="button"
                    onClick={handleCancelSenderSession}
                    className="text-button gray text-xs text-[#9b9b9b] hover:text-[#fe4543] font-medium cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                </div>

                {/* File summary item */}
                <div className="FileItem flex items-center justify-between py-2.5 px-3 bg-[#fafafa] border border-[#ebebeb] rounded-lg mb-4 text-xs">
                  <div className="flex items-center gap-2 truncate max-w-[70%]">
                    <FileText className="w-4 h-4 text-[#fe4543] shrink-0" />
                    <span className="file-name font-bold text-[#212529] truncate" title={selectedFiles[0]?.name}>
                      {selectedFiles.length === 1 ? selectedFiles[0]?.name : `${selectedFiles.length} files`}
                    </span>
                  </div>
                  <span className="file-size text-[#9b9b9b] font-code shrink-0">
                    {formatBytes(senderProgress.totalBytes)}
                  </span>
                </div>

                {/* Send Anywhere Signature BarProgress */}
                <div className="BarProgress my-3">
                  <div className="progress-container">
                    <div
                      className="progress"
                      style={{ width: `${Math.min(100, Math.round(senderProgress.percent))}%` }}
                    >
                      <div className={`progress-text ${Math.round(senderProgress.percent) > 18 ? 'fr' : ''}`}>
                        {Math.round(senderProgress.percent)}%
                      </div>
                    </div>
                    <div className="progress-text shadow" aria-hidden="true">
                      {Math.round(senderProgress.percent)}%
                    </div>
                  </div>
                </div>

                {/* FooterProgressV2 with live speed rate, ETA, and TransferSize */}
                <div className="FooterProgressV2 flex items-center justify-between text-xs mt-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[#212529]">
                      {formatSpeedRate(senderProgress.speedBytesPerSec)}
                    </span>
                    <span className="text-[#9b9b9b]">
                      • {formatEta(senderProgress.etaSeconds)}
                    </span>
                  </div>
                  <div className="TransferSize text-xs font-code">
                    <span className="loaded-bytes highlight text-[#fe4543] font-bold">
                      {formatBytes(senderProgress.transferredBytes)}
                    </span>
                    <span className="text-[#9b9b9b]"> / {formatBytes(senderProgress.totalBytes)}</span>
                  </div>
                </div>

                {/* Multi-file list if more than 1 file */}
                {senderFilesProgress.length > 1 && (
                  <div className="max-h-36 overflow-y-auto mt-4 divide-y divide-[#f1f1f1] border-t border-[#ebebeb] pt-2">
                    {senderFilesProgress.map((fp) => (
                      <div key={fp.fileId} className="flex items-center justify-between py-1.5 text-xs">
                        <span className="truncate text-[#666666] max-w-[65%]" title={fp.name}>{fp.name}</span>
                        <span className="font-code text-[#9b9b9b]">
                          {fp.status === 'completed' ? '✓ Sent' : `${Math.round(fp.progressPercent)}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3">
                <button
                  type="button"
                  onClick={handleCancelSenderSession}
                  className="w-full h-11 bg-[#fafafa] hover:bg-[#fff0f2] text-[#9b9b9b] hover:text-[#fe4543] border border-[#e0e4e6] font-bold text-xs rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
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

          {/* STATE 4: RECEIVING PROGRESS (SEND ANYWHERE AUTHENTIC LAYOUT) */}
          {receiverStatus === 'transferring' && (
            <div className="transfer-box-inner flex-1 flex flex-col justify-between my-2">
              <div>
                <div className="receive-transfer-header flex items-center justify-between mb-3">
                  <h3 className="title3 bold text-[17px] font-bold text-[#212529]">
                    Receiving Files
                  </h3>
                  <button
                    type="button"
                    onClick={handleResetReceiver}
                    className="text-button gray text-xs text-[#9b9b9b] hover:text-[#fe4543] font-medium cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                </div>

                {/* File summary item */}
                <div className="FileItem flex items-center justify-between py-2.5 px-3 bg-[#fafafa] border border-[#ebebeb] rounded-lg mb-4 text-xs">
                  <div className="flex items-center gap-2 truncate max-w-[70%]">
                    <FileText className="w-4 h-4 text-[#fe4543] shrink-0" />
                    <span className="file-name font-bold text-[#212529] truncate" title={receivedFiles[0]?.name}>
                      {receivedFiles.length === 1 ? receivedFiles[0]?.name : `${receivedFiles.length} files`}
                    </span>
                  </div>
                  <span className="file-size text-[#9b9b9b] font-code shrink-0">
                    {formatBytes(receiverProgress.totalBytes)}
                  </span>
                </div>

                {/* Send Anywhere Signature BarProgress */}
                <div className="BarProgress my-3">
                  <div className="progress-container">
                    <div
                      className="progress"
                      style={{ width: `${Math.min(100, Math.round(receiverProgress.percent))}%` }}
                    >
                      <div className={`progress-text ${Math.round(receiverProgress.percent) > 18 ? 'fr' : ''}`}>
                        {Math.round(receiverProgress.percent)}%
                      </div>
                    </div>
                    <div className="progress-text shadow" aria-hidden="true">
                      {Math.round(receiverProgress.percent)}%
                    </div>
                  </div>
                </div>

                {/* FooterProgressV2 with live speed rate, ETA, and TransferSize */}
                <div className="FooterProgressV2 flex items-center justify-between text-xs mt-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[#212529]">
                      {formatSpeedRate(receiverProgress.speedBytesPerSec)}
                    </span>
                    <span className="text-[#9b9b9b]">
                      • {formatEta(receiverProgress.etaSeconds)}
                    </span>
                  </div>
                  <div className="TransferSize text-xs font-code">
                    <span className="loaded-bytes highlight text-[#fe4543] font-bold">
                      {formatBytes(receiverProgress.transferredBytes)}
                    </span>
                    <span className="text-[#9b9b9b]"> / {formatBytes(receiverProgress.totalBytes)}</span>
                  </div>
                </div>

                {/* Multi-file list if more than 1 file */}
                {receivedFiles.length > 1 && (
                  <div className="max-h-36 overflow-y-auto mt-4 divide-y divide-[#f1f1f1] border-t border-[#ebebeb] pt-2">
                    {receivedFiles.map((rf) => (
                      <div key={rf.fileId} className="flex items-center justify-between py-1.5 text-xs">
                        <span className="truncate text-[#666666] max-w-[65%]" title={rf.name}>{rf.name}</span>
                        <span className="font-code text-[#9b9b9b]">
                          {rf.status === 'completed' ? '✓ Verified' : `${Math.round(rf.progressPercent)}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3">
                <button
                  type="button"
                  onClick={handleResetReceiver}
                  className="w-full h-11 bg-[#fafafa] hover:bg-[#fff0f2] text-[#9b9b9b] hover:text-[#fe4543] border border-[#e0e4e6] font-bold text-xs rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
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

      {/* QR Scanner Modal */}
      <QRScanner
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        onScanResult={handleQRScanResult}
        onOpticalFileReceived={handleOpticalFileReceived}
      />

      {/* Floating Language Button (Send Anywhere bottom selector) */}
      <div className="fixed bottom-4 right-4 sm:right-8 z-40">
        <button
          type="button"
          onClick={() => setIsBottomLangModalOpen(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-white border border-[#ebebeb] shadow-md hover:shadow-lg text-xs font-bold text-[#212529] hover:text-[#fe4543] transition-all cursor-pointer"
        >
          <Globe className="w-4 h-4 text-[#fe4543]" />
          <span>Language</span>
        </button>
      </div>

      {/* Language Selector Modal */}
      {isBottomLangModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl border border-[#ebebeb] shadow-2xl p-6 relative">
            <div className="flex items-center justify-between pb-4 border-b border-[#ebebeb] mb-4">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-[#fe4543]" />
                <h3 className="text-lg font-bold text-[#212529]">Select Language</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBottomLangModalOpen(false)}
                className="text-[#9b9b9b] hover:text-[#212529] cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
              {[
                { code: 'en', name: 'English', native: 'English' },
                { code: 'ko', name: 'Korean', native: '한국어' },
                { code: 'ja', name: 'Japanese', native: '日本語' },
                { code: 'es', name: 'Spanish', native: 'Español' },
                { code: 'fr', name: 'French', native: 'Français' },
                { code: 'de', name: 'German', native: 'Deutsch' },
                { code: 'zh', name: 'Chinese', native: '简体中文' },
                { code: 'pt', name: 'Portuguese', native: 'Português' }
              ].map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => {
                    setSelectedLanguage(lang.name);
                    setIsBottomLangModalOpen(false);
                  }}
                  className={`flex items-center justify-between p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    selectedLanguage === lang.name
                      ? 'border-[#fe4543] bg-[#fff0f2] text-[#fe4543] font-bold'
                      : 'border-[#ebebeb] hover:bg-[#fafafa] text-[#212529] font-medium'
                  }`}
                >
                  <div>
                    <p className="text-xs">{lang.native}</p>
                    <p className="text-[10px] text-[#9b9b9b]">{lang.name}</p>
                  </div>
                  {selectedLanguage === lang.name && (
                    <Check className="w-4 h-4 text-[#fe4543]" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
