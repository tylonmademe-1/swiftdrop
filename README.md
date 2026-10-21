# SwiftDrop — Complete Device-to-Device File Transfer Platform

SwiftDrop is a full-stack, production-grade file transfer platform combining instant guest peer-to-peer file transfer with parallel UDP stream multiplexing, on-the-fly stream compression, direct LAN routing, persistent account management, SQLite-backed transfer metadata, device management, privacy controls, and transfer receipts.

---

## 1. High-Performance Transfer Acceleration Engine

SwiftDrop implements high-speed network acceleration techniques inspired by IBM Aspera FASP, bbcp, and lftp parallel transfers:

1. **UDP-Based WebRTC Acceleration & Parallel Stream Multiplexing (`bbcp -P 4` / `lftp --parallel=4` style)**:
   - Splits file transmission across **1x, 2x, 4x, or 8x concurrent WebRTC RTCDataChannels** running on top of UDP/SCTP.
   - Eliminates head-of-line blocking on single browser buffers.
   - Saturates high-bandwidth WiFi, 5G, and high-latency WAN links.
   - Out-of-order parallel packets are safely reordered using 16-byte magic headers (`0x53574644`) with explicit chunk indexing.

2. **On-the-Fly Stream Compression (Gzip / Deflate)**:
   - Employs browser-native `CompressionStream('gzip')` and `DecompressionStream('gzip')`.
   - Automatically detects compressible files (code, JSON, text, CSV, documents, logs, SVGs, uncompressed archives).
   - Reduces wire payload size by 50% to 90%, multiplying effective throughput.
   - Skips already compressed media (JPEG, PNG, MP4, ZIP) to preserve CPU performance.

3. **Direct Local Network (LAN) & 5 GHz WiFi Optimization**:
   - WebRTC ICE candidate inspection detects direct local subnet connections (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`).
   - Routes 100% of traffic directly over local switches/access points, achieving line-rate Gigabit LAN speeds without external internet round-trips.
   - Real-time Network Telemetry HUD reports Round-Trip Time (RTT in ms), active candidate type, and parallel stream count.

4. **Adaptive Chunk Sizing & Buffer Window Tuning**:
   - Configurable chunk framing (64 KiB, 128 KiB, 256 KiB).
   - High-water mark adaptive backpressure (`channels * 512 KiB`) ensures smooth streaming without starvation.

---

## 2. Platform Architecture

- **Direct WebRTC P2P Data Channels**: Files stream directly browser-to-browser. No file bytes are ever uploaded to cloud servers.
- **WebSocket Signaling**: Node.js backend handles session coordination, rate-limited pairing code lookup, and WebRTC SDP/ICE candidate exchange only.
- **Persistent SQLite Relational Database**: Built on native Node.js 22 `node:sqlite` (`DatabaseSync`) with Write-Ahead Logging (WAL) and foreign-key enforcement.
- **Secure Authentication & Sessions**:
  - OWASP-recommended `scrypt` memory-hard password hashing with cryptographically random salts.
  - HTTP-only session cookies with session rotation and revocation.
  - Password recovery with short-lived, single-use tokens.
- **Personal Dashboard**: Real aggregated metrics calculated directly from database records:
  - Completed transfers count
  - Total data sent (bytes formatted)
  - Total data received (bytes formatted)
  - Cancelled or incomplete transfers count
  - Recent activity feed with direct inspection links
- **Transfer History & Filter Engine**:
  - Direction filters (`All`, `Sent`, `Received`)
  - Status filters (`All`, `Completed`, `Failed`, `Cancelled`)
  - Search by filename or device labels
  - Pagination, individual record deletion, and clear history
- **Transfer Metadata Receipts**:
  - Downloadable JSON receipts verifying transfer timestamps, file counts, sizes, SHA-256 verification results, and transport security.
- **Device & Session Management**:
  - Saved custom device labels (e.g. "Work MacBook", "Living Room TV")
  - Active login sessions audit with remote session revocation
  - Conceptual separation between saved device shortcuts, login sessions, and ephemeral transfer connections
- **Privacy & Data Governance**:
  - History recording toggle (users can disable database logging of future transfers)
  - Data Export: Download complete profile, preferences, devices, and transfer metadata in JSON format
  - Permanent account deletion with password verification
- **Dual Save Architecture**: File System Access API where supported (desktop browsers) with automatic fallback to standard browser downloads. Distinguishes between "Transferred into memory" and "Saved to device disk".
- **Turn Relay Fallback**: Configurable TURN relay for symmetric NAT / strict firewall environments.

---

## 3. SQLite Database Schema

Located in `data/swiftdrop.db` with WAL mode and foreign keys:

1. `users`: User identity, display name, normalized email, scrypt hash, timestamps.
2. `auth_sessions`: Active login sessions, SHA-256 session token hashes, last seen timestamps, revocation flags.
3. `transfers`: Direction, status, timestamps, byte counters, file counts, device labels.
4. `transfer_files`: Per-file original names, sizes, MIME types, SHA-256 verification status, saved status.
5. `user_preferences`: Theme preference (light/dark/system), history recording toggle, default device label.
6. `devices`: User-saved device display labels and last-seen activity.
7. `password_reset_tokens`: Single-use SHA-256 hashed recovery tokens with 1-hour expiry.
8. `audit_events`: Security audit logging for registration, logins, password changes, and account actions.

---

## 4. Getting Started

### Prerequisites
- Node.js 18+ (or Node 22 for native `node:sqlite`)

### Installation & Development
```bash
npm install
npm run dev
```
Starts Express with SQLite and WebSocket signaling, mounting Vite dev middlewares on `http://localhost:3000`.

### Production Build & Run
```bash
npm run build
npm start
```

### Running Automated Test Suite
```bash
npm test
```
Executes 30 tests across 6 test suites:
- `tests/e2e_transfer.test.ts` (Complete end-to-end pairing, QR parsing, session state machine, out-of-order chunk assembly, SHA-256 verification)
- `tests/sessions.test.ts` (Pairing codes, brute-force rate limiting, session timeout & code reuse prevention)
- `tests/framing.test.ts` (16-byte binary packet framing headers, byte formatters, speed calculations)
- `tests/auth_db.test.ts` (Registration, login, scrypt verification, SQLite migrations, authorization boundaries, dashboard metrics, data export)
- `tests/acceleration.test.ts` (Parallel multi-channel packet striping and out-of-order reassembly)
- `tests/compression.test.ts` (On-the-fly streaming Gzip compression & decompression with 100% round-trip fidelity)

---

## 5. Deployment, Database Durability & Operations

### Local Network Hosting
To host SwiftDrop across your home or office local network (allowing smartphones and laptops on the same Wi-Fi to connect and scan QR codes):
1. Configure `.env`:
   ```bash
   PORT=3000
   LAN_IP=192.168.1.3
   APP_URL=http://192.168.1.3:3000
   ```
2. Start the server:
   ```bash
   npm run dev
   ```
3. Remote devices on the same Wi-Fi can navigate directly to `http://192.168.1.3:3000` or scan the pairing QR code displayed on the sender screen.

### SQLite Durability, Backup & Restore
SwiftDrop uses SQLite with Write-Ahead Logging (`WAL`) and `PRAGMA synchronous = NORMAL` for durable, high-concurrency operation.
- **Database Location**: `data/swiftdrop.db` (outside web-served directories).
- **Online Backup**:
  ```bash
  # Create a clean online snapshot without stopping the server:
  sqlite3 data/swiftdrop.db ".backup 'data/backup-$(date +%F).db'"
  ```
- **Restore from Backup**:
  ```bash
  sqlite3 data/swiftdrop.db ".restore 'data/backup-target.db'"
  ```
- **Integrity Check**:
  ```bash
  sqlite3 data/swiftdrop.db "PRAGMA integrity_check;"
  ```

### Production STUN/TURN Relay Setup
For restrictive corporate firewalls or symmetric NAT traversal where direct P2P connections are blocked:
1. Deploy a standard TURN server (e.g. Coturn).
2. Set credentials in `.env`:
   ```bash
   TURN_SERVER_URL="turn:turn.example.com:3478"
   TURN_USERNAME="swiftdrop"
   TURN_CREDENTIAL="secretpassword"
   ```
3. SwiftDrop securely dispenses credentials via `/api/turn-credentials` to authorized transfer sessions without exposing static credentials in client bundles.
