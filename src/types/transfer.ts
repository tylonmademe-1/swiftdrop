export type SessionStatus =
  | 'created'
  | 'waiting_for_receiver'
  | 'receiver_pending'
  | 'negotiating'
  | 'connected'
  | 'awaiting_acceptance'
  | 'transferring'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'rejected'
  | 'failed';

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified?: number;
  hash?: string; // SHA-256
  isCompressed?: boolean;
  compressedSize?: number;
}

export interface TransferManifest {
  sessionId: string;
  files: FileMetadata[];
  totalBytes: number;
  totalFiles: number;
  senderLabel: string;
  acceleration?: {
    parallelStreams: number;
    compressionEnabled: boolean;
  };
}

export type ConnectionMode = 'direct-lan' | 'direct-p2p' | 'relayed-turn' | 'connecting' | 'unknown';

export interface PeerDevice {
  id: string;
  label: string;
  browser?: string;
  os?: string;
}

export interface SignalingMessage {
  type:
    | 'session:create'
    | 'session:created'
    | 'session:join'
    | 'session:joined'
    | 'session:join_failed'
    | 'session:receiver_pending'
    | 'session:receiver_ready'
    | 'session:expired'
    | 'session:cancelled'
    | 'session:completed'
    | 'signal:offer'
    | 'signal:answer'
    | 'signal:ice_candidate'
    | 'transfer:manifest'
    | 'transfer:accept'
    | 'transfer:reject'
    | 'transfer:cancel'
    | 'transfer:control'
    | 'transfer:chunk'
    | 'peer:disconnected';
  sessionId?: string;
  token?: string;
  code?: string;
  payload?: any;
  senderId?: string;
  senderLabel?: string;
  receiverLabel?: string;
  expiresAt?: number;
  reason?: string;
  error?: string;
}

export interface FileTransferProgress {
  fileId: string;
  name: string;
  size: number;
  bytesTransferred: number;
  progressPercent: number;
  status: 'pending' | 'compressing' | 'transferring' | 'verifying' | 'completed' | 'failed' | 'saved';
  hashMatched?: boolean;
  error?: string;
  savedToDisk?: boolean;
  blobUrl?: string;
  blob?: Blob;
  isCompressed?: boolean;
  compressedSize?: number;
  compressionRatio?: number;
}

export interface OverallTransferProgress {
  totalBytes: number;
  transferredBytes: number;
  percent: number;
  speedBytesPerSec: number;
  etaSeconds: number | null;
  currentFileIndex: number;
  totalFiles: number;
  status: 'idle' | 'transferring' | 'completed' | 'cancelled' | 'failed';
  effectiveSpeedBytesPerSec?: number;
  compressedBytesSaved?: number;
}

export interface ServerPublicConfig {
  appUrl: string;
  lanAppUrl?: string;
  lanIp?: string | null;
  maxFilesCount: number;
  maxTotalSizeBytes: number;
  maxFileSizeBytes: number;
  sessionExpirySeconds: number;
  turnConfigured: boolean;
  stunServers: string[];
}

export interface AccelerationSettings {
  parallelStreams: 1 | 2 | 4 | 8;
  enableCompression: boolean;
  chunkSize: 65536 | 131072 | 262144; // 64 KiB, 128 KiB, 256 KiB
}

export interface NetworkTelemetry {
  mode: ConnectionMode;
  rttMs: number | null;
  candidateType: string | null;
  localAddress: string | null;
  remoteAddress: string | null;
  isLocalLan: boolean;
  activeChannelsCount: number;
}
