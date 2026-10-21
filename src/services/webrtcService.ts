import { ConnectionMode, NetworkTelemetry } from '../types/transfer';

export interface WebRTCServiceOptions {
  iceServers: RTCIceServer[];
  parallelStreams?: number;
  onIceCandidate: (candidate: RTCIceCandidate) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState, mode: ConnectionMode) => void;
  onDataChannelOpen: (channelCount: number) => void;
  onDataChannelClose: () => void;
  onDataChannelMessage: (event: MessageEvent, channelIndex: number) => void;
  onDataChannelReceived?: (channel: RTCDataChannel) => void;
  onTelemetryUpdate?: (telemetry: NetworkTelemetry) => void;
}

export class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private dataChannels: RTCDataChannel[] = [];
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private options: WebRTCServiceOptions;
  private connectionMode: ConnectionMode = 'connecting';
  private statsInterval: any = null;
  private targetStreamCount = 4;

  constructor(options: WebRTCServiceOptions) {
    this.options = options;
    this.targetStreamCount = options.parallelStreams || 4;
  }

  public initPeerConnection(): RTCPeerConnection {
    this.close();

    this.pc = new RTCPeerConnection({
      iceServers: this.options.iceServers,
      iceCandidatePoolSize: 4
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.options.onIceCandidate(event.candidate);
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      const state = this.pc.connectionState;
      this.updateConnectionMode().then((mode) => {
        this.options.onConnectionStateChange(state, mode);
      });
    };

    // Receiver catches each incoming parallel data channel
    this.pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel);
    };

    this.startStatsMonitor();

    return this.pc;
  }

  public createParallelDataChannels(count = 4): RTCDataChannel[] {
    if (!this.pc) throw new Error('Peer connection not initialized');
    this.targetStreamCount = count;
    this.dataChannels = [];

    for (let i = 0; i < count; i++) {
      const label = `swiftdrop-channel-${i}`;
      const channel = this.pc.createDataChannel(label, {
        ordered: true
      });
      this.setupDataChannel(channel);
    }

    return this.dataChannels;
  }

  private setupDataChannel(channel: RTCDataChannel) {
    const channelIndex = this.dataChannels.length;
    this.dataChannels.push(channel);

    channel.binaryType = 'arraybuffer';
    try {
      // 512 KB per-channel low water threshold for smooth multi-stream striping
      channel.bufferedAmountLowThreshold = 512 * 1024;
    } catch {
      // Ignored
    }

    channel.onopen = () => {
      const openCount = this.dataChannels.filter((c) => c.readyState === 'open').length;
      this.options.onDataChannelOpen(openCount);
    };

    channel.onclose = () => {
      this.options.onDataChannelClose();
    };

    channel.onerror = (err) => {
      console.warn(`[WebRTC] Channel ${channel.label} error:`, err);
    };

    channel.onmessage = (event) => {
      this.options.onDataChannelMessage(event, channelIndex);
    };

    if (this.options.onDataChannelReceived) {
      this.options.onDataChannelReceived(channel);
    }
  }

  public getDataChannels(): RTCDataChannel[] {
    return this.dataChannels.filter((c) => c.readyState === 'open');
  }

  public getAllChannels(): RTCDataChannel[] {
    return this.dataChannels;
  }

  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('Peer connection not initialized');
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  public async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) this.initPeerConnection();
    await this.pc!.setRemoteDescription(new RTCSessionDescription(offer));
    await this.flushPendingCandidates();
    const answer = await this.pc!.createAnswer();
    await this.pc!.setLocalDescription(answer);
    return answer;
  }

  public async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) throw new Error('Peer connection not initialized');
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    await this.flushPendingCandidates();
  }

  public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc || !this.pc.remoteDescription || !this.pc.remoteDescription.type) {
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('[WebRTC] Error adding ICE candidate:', err);
    }
  }

  private async flushPendingCandidates(): Promise<void> {
    if (!this.pc || !this.pc.remoteDescription) return;
    while (this.pendingCandidates.length > 0) {
      const candidate = this.pendingCandidates.shift();
      if (candidate) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn('[WebRTC] Error flushing ICE candidate:', err);
        }
      }
    }
  }

  private isPrivateIp(ip?: string): boolean {
    if (!ip) return false;
    // Check RFC1918 IPv4 and link-local IPv6
    return (
      ip.startsWith('192.168.') ||
      ip.startsWith('10.') ||
      ip.startsWith('172.16.') ||
      ip.startsWith('172.17.') ||
      ip.startsWith('172.18.') ||
      ip.startsWith('172.19.') ||
      ip.startsWith('172.2') ||
      ip.startsWith('172.30.') ||
      ip.startsWith('172.31.') ||
      ip.startsWith('127.0.0.1') ||
      ip.startsWith('localhost') ||
      ip.startsWith('fe80:') ||
      ip.startsWith('::1')
    );
  }

  public async updateConnectionMode(): Promise<ConnectionMode> {
    if (!this.pc) return 'unknown';
    if (this.pc.connectionState !== 'connected') {
      return this.pc.connectionState === 'connecting' ? 'connecting' : 'unknown';
    }

    try {
      const stats = await this.pc.getStats();
      let selectedPairId = '';

      stats.forEach((report) => {
        if (report.type === 'transport' && report.selectedCandidatePairId) {
          selectedPairId = report.selectedCandidatePairId;
        }
      });

      if (selectedPairId) {
        const pair = stats.get(selectedPairId);
        if (pair) {
          const local = stats.get(pair.localCandidateId);
          const remote = stats.get(pair.remoteCandidateId);

          const rttSeconds = pair.currentRoundTripTime;
          const rttMs = rttSeconds ? Math.round(rttSeconds * 1000) : null;

          if (local?.candidateType === 'relay' || remote?.candidateType === 'relay') {
            this.connectionMode = 'relayed-turn';
          } else if (
            (local?.candidateType === 'host' && remote?.candidateType === 'host') ||
            this.isPrivateIp(local?.ip || local?.address) ||
            this.isPrivateIp(remote?.ip || remote?.address)
          ) {
            // Direct Local Network / LAN / High-Speed 5GHz WiFi
            this.connectionMode = 'direct-lan';
          } else {
            this.connectionMode = 'direct-p2p';
          }

          if (this.options.onTelemetryUpdate) {
            this.options.onTelemetryUpdate({
              mode: this.connectionMode,
              rttMs,
              candidateType: local?.candidateType || null,
              localAddress: local?.ip || local?.address || null,
              remoteAddress: remote?.ip || remote?.address || null,
              isLocalLan: this.connectionMode === 'direct-lan',
              activeChannelsCount: this.getDataChannels().length
            });
          }

          return this.connectionMode;
        }
      }
    } catch {
      // Fallback
    }

    this.connectionMode = 'direct-p2p';
    return 'direct-p2p';
  }

  private startStatsMonitor() {
    if (this.statsInterval) clearInterval(this.statsInterval);
    this.statsInterval = setInterval(() => {
      if (this.pc && this.pc.connectionState === 'connected') {
        this.updateConnectionMode();
      }
    }, 2000);
  }

  public close(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    this.dataChannels.forEach((dc) => {
      try {
        dc.close();
      } catch {}
    });
    this.dataChannels = [];
    if (this.pc) {
      try {
        this.pc.close();
      } catch {}
      this.pc = null;
    }
  }
}
