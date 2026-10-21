import { WebSocket, WebSocketServer } from 'ws';
import crypto from 'crypto';
import { SessionManager, SessionRecord } from './sessions';

interface ClientConnection {
  id: string;
  ws: WebSocket;
  ip: string;
  sessionId?: string;
  role?: 'sender' | 'receiver';
}

export function setupSignaling(wss: WebSocketServer, sessionManager: SessionManager) {
  const clients = new Map<string, ClientConnection>();

  function sendToWs(ws: WebSocket, message: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  function getClient(wsId: string): ClientConnection | undefined {
    return clients.get(wsId);
  }

  wss.on('connection', (ws: WebSocket, req) => {
    const wsId = crypto.randomUUID();
    const forwarded = req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || 'unknown';

    const client: ClientConnection = {
      id: wsId,
      ws,
      ip
    };
    clients.set(wsId, client);

    ws.on('message', (data: any, isBinary: boolean) => {
      // Relay binary file chunks directly to the paired peer in the session
      if (isBinary) {
        if (!client.sessionId) {
          sendToWs(ws, {
            type: 'error',
            error: 'Binary data requires an active paired session.'
          });
          return;
        }
        const session = sessionManager.getSessionById(client.sessionId);
        if (!session) return;
        const targetWsId = client.role === 'sender' ? session.receiverWsId : session.senderWsId;
        if (targetWsId) {
          const target = getClient(targetWsId);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(data, { binary: true });
          }
        }
        return;
      }

      // Enforce JSON message length limit (max 2MB)
      const strData = data.toString();
      if (strData.length > 2 * 1024 * 1024) {
        sendToWs(ws, {
          type: 'error',
          error: 'Signaling message exceeds maximum permitted size.'
        });
        return;
      }

      let msg: any;
      try {
        msg = JSON.parse(strData);
      } catch (err) {
        sendToWs(ws, { type: 'error', error: 'Invalid JSON payload' });
        return;
      }

      const { type } = msg;

      switch (type) {
        case 'session:create': {
          const senderLabel = msg.senderLabel || msg.payload?.senderLabel || 'Sender';
          const senderDeviceId = msg.deviceId || msg.payload?.deviceId;
          const manifest = msg.manifest || msg.payload?.manifest;
          const codeType = msg.codeType || msg.payload?.codeType || 'numeric'; // Default to Send Anywhere 6-digit numeric key
          const session = sessionManager.createSession(wsId, senderLabel, manifest, senderDeviceId, codeType);
          client.sessionId = session.id;
          client.role = 'sender';

          sendToWs(ws, {
            type: 'session:created',
            sessionId: session.id,
            code: session.code,
            token: session.token,
            expiresAt: session.expiresAt,
            senderLabel: session.senderLabel,
            payload: {
              sessionId: session.id,
              code: session.code,
              token: session.token,
              expiresAt: session.expiresAt,
              senderLabel: session.senderLabel
            }
          });
          break;
        }

        case 'session:join': {
          // Can join via code or (sessionId + token), checking both root and payload
          const code = msg.code || msg.payload?.code;
          const sessionId = msg.sessionId || msg.payload?.sessionId;
          const token = msg.token || msg.payload?.token;
          const receiverLabel = msg.receiverLabel || msg.payload?.receiverLabel || 'Receiver';
          const receiverDeviceId = msg.deviceId || msg.payload?.deviceId;

          const rateCheck = sessionManager.checkRateLimit(client.ip);
          if (!rateCheck.allowed) {
            sendToWs(ws, {
              type: 'session:join_failed',
              error: `Too many attempts. Please try again in ${rateCheck.retryAfterSeconds} seconds.`
            });
            return;
          }

          let session: SessionRecord | undefined;

          if (sessionId && token) {
            if (sessionManager.validateToken(sessionId, token)) {
              session = sessionManager.getSessionById(sessionId);
            }
          } else if (code) {
            session = sessionManager.getSessionByCode(code);
          }

          if (!session) {
            sendToWs(ws, {
              type: 'session:join_failed',
              error: 'Invalid or expired pairing code.'
            });
            return;
          }

          // Block sender from joining their own session on the same device
          if (
            session.senderWsId === wsId ||
            (session.senderDeviceId && receiverDeviceId && session.senderDeviceId === receiverDeviceId)
          ) {
            sendToWs(ws, {
              type: 'session:join_failed',
              error: 'You cannot receive your own file on the same device. Enter this Session Code on another device.'
            });
            return;
          }

          if (session.status !== 'waiting_for_receiver' && session.status !== 'receiver_pending') {
            sendToWs(ws, {
              type: 'session:join_failed',
              error: `Session is no longer accepting receivers (current status: ${session.status}).`
            });
            return;
          }

          const assigned = sessionManager.assignReceiver(
            session.id,
            wsId,
            receiverLabel || 'Receiver',
            receiverDeviceId
          );
          if (!assigned) {
            sendToWs(ws, {
              type: 'session:join_failed',
              error: 'Another device is already connected to this transfer session.'
            });
            return;
          }

          client.sessionId = session.id;
          client.role = 'receiver';
          sessionManager.transitionStatus(session.id, 'receiver_pending');

          // Notify receiver that session is joined
          sendToWs(ws, {
            type: 'session:joined',
            sessionId: session.id,
            senderLabel: session.senderLabel,
            manifest: session.manifest,
            payload: {
              sessionId: session.id,
              senderLabel: session.senderLabel,
              manifest: session.manifest
            }
          });

          // Notify sender that receiver has arrived
          if (session.senderWsId) {
            const senderClient = getClient(session.senderWsId);
            if (senderClient) {
              sendToWs(senderClient.ws, {
                type: 'session:receiver_ready',
                sessionId: session.id,
                receiverLabel: session.receiverLabel,
                payload: {
                  sessionId: session.id,
                  receiverLabel: session.receiverLabel
                }
              });
            }
          }
          break;
        }

        case 'signal:offer': {
          // Sender sends WebRTC offer to receiver
          if (!client.sessionId || client.role !== 'sender') return;
          const session = sessionManager.getSessionById(client.sessionId);
          if (!session || !session.receiverWsId) return;

          sessionManager.transitionStatus(session.id, 'negotiating');

          const receiver = getClient(session.receiverWsId);
          if (receiver) {
            sendToWs(receiver.ws, {
              type: 'signal:offer',
              sessionId: session.id,
              payload: msg.payload
            });
          }
          break;
        }

        case 'signal:answer': {
          // Receiver sends WebRTC answer to sender
          if (!client.sessionId || client.role !== 'receiver') return;
          const session = sessionManager.getSessionById(client.sessionId);
          if (!session || !session.senderWsId) return;

          sessionManager.transitionStatus(session.id, 'connected');

          const sender = getClient(session.senderWsId);
          if (sender) {
            sendToWs(sender.ws, {
              type: 'signal:answer',
              sessionId: session.id,
              payload: msg.payload
            });
          }
          break;
        }

        case 'signal:ice_candidate': {
          // Forward ICE candidate to other peer
          if (!client.sessionId) return;
          const session = sessionManager.getSessionById(client.sessionId);
          if (!session) return;

          const targetWsId = client.role === 'sender' ? session.receiverWsId : session.senderWsId;
          if (targetWsId) {
            const target = getClient(targetWsId);
            if (target) {
              sendToWs(target.ws, {
                type: 'signal:ice_candidate',
                sessionId: session.id,
                payload: msg.payload
              });
            }
          }
          break;
        }

        case 'transfer:manifest': {
          // Sender updates/sends transfer manifest
          if (!client.sessionId || client.role !== 'sender') return;
          const session = sessionManager.getSessionById(client.sessionId);
          if (!session) return;

          session.manifest = msg.payload;
          sessionManager.transitionStatus(session.id, 'awaiting_acceptance');

          if (session.receiverWsId) {
            const receiver = getClient(session.receiverWsId);
            if (receiver) {
              sendToWs(receiver.ws, {
                type: 'transfer:manifest',
                sessionId: session.id,
                payload: msg.payload
              });
            }
          }
          break;
        }

        case 'transfer:accept': {
          // Receiver explicitly accepts transfer
          if (!client.sessionId || client.role !== 'receiver') return;
          const session = sessionManager.getSessionById(client.sessionId);
          if (!session || !session.senderWsId) return;

          sessionManager.transitionStatus(session.id, 'transferring');
          session.acceptedAt = Date.now();

          const sender = getClient(session.senderWsId);
          if (sender) {
            sendToWs(sender.ws, {
              type: 'transfer:accept',
              sessionId: session.id
            });
          }
          break;
        }

        case 'transfer:reject': {
          // Receiver explicitly declines transfer
          if (!client.sessionId || client.role !== 'receiver') return;
          const session = sessionManager.getSessionById(client.sessionId);
          if (!session || !session.senderWsId) return;

          sessionManager.transitionStatus(session.id, 'rejected');

          const sender = getClient(session.senderWsId);
          if (sender) {
            sendToWs(sender.ws, {
              type: 'transfer:reject',
              sessionId: session.id,
              reason: msg.reason || 'Transfer was declined by receiver.'
            });
          }
          break;
        }

        case 'transfer:cancel': {
          // Either party cancels transfer
          if (!client.sessionId) return;
          const session = sessionManager.getSessionById(client.sessionId);
          if (!session) return;

          sessionManager.transitionStatus(session.id, 'cancelled');

          const otherWsId = client.role === 'sender' ? session.receiverWsId : session.senderWsId;
          if (otherWsId) {
            const other = getClient(otherWsId);
            if (other) {
              sendToWs(other.ws, {
                type: 'transfer:cancel',
                sessionId: session.id,
                reason: msg.reason || 'Transfer was cancelled.'
              });
            }
          }
          break;
        }

        case 'transfer:control':
        case 'transfer:chunk': {
          if (!client.sessionId) return;
          const session = sessionManager.getSessionById(client.sessionId);
          if (!session) return;

          const otherWsId = client.role === 'sender' ? session.receiverWsId : session.senderWsId;
          if (otherWsId) {
            const other = getClient(otherWsId);
            if (other) {
              sendToWs(other.ws, {
                type,
                sessionId: session.id,
                payload: msg.payload
              });
            }
          }
          break;
        }

        case 'session:completed': {
          if (!client.sessionId) return;
          const session = sessionManager.getSessionById(client.sessionId);
          if (session) {
            session.completedAt = Date.now();
            sessionManager.transitionStatus(session.id, 'completed');
            const otherWsId = client.role === 'sender' ? session.receiverWsId : session.senderWsId;
            if (otherWsId) {
              const other = getClient(otherWsId);
              if (other) {
                sendToWs(other.ws, {
                  type: 'session:completed',
                  sessionId: session.id
                });
              }
            }
          }
          break;
        }

        default:
          break;
      }
    });

    ws.on('close', () => {
      if (client.sessionId) {
        const session = sessionManager.getSessionById(client.sessionId);
        if (session) {
          const otherWsId = client.role === 'sender' ? session.receiverWsId : session.senderWsId;
          if (otherWsId) {
            const other = getClient(otherWsId);
            if (other) {
              sendToWs(other.ws, {
                type: 'peer:disconnected',
                sessionId: session.id,
                role: client.role,
                message: `${client.role === 'sender' ? 'Sender' : 'Receiver'} disconnected.`
              });
            }
          }
          if (session.status !== 'completed') {
            sessionManager.transitionStatus(session.id, 'cancelled');
          }
        }
      }
      clients.delete(wsId);
    });

    ws.on('error', () => {
      clients.delete(wsId);
    });
  });
}
