# SwiftDrop

<p align="center">
  <strong>Fast. Private. Direct.</strong>
</p>

<p align="center">
  A modern device-to-device file transfer platform engineered for high-performance transfers, secure device pairing, and complete user control.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Web-2563EB?style=flat-square" alt="Platform: Web" />
  <img src="https://img.shields.io/badge/Transport-WebRTC-7C3AED?style=flat-square" alt="Transport: WebRTC" />
  <img src="https://img.shields.io/badge/Database-SQLite-0F766E?style=flat-square" alt="Database: SQLite" />
  <img src="https://img.shields.io/badge/Runtime-Node.js-43853D?style=flat-square" alt="Runtime: Node.js" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License: MIT" />
</p>

<p align="center">
  <a href="#overview">Overview</a> ·
  <a href="#key-features">Features</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#getting-started">Getting Started</a> ·
  <a href="#deployment">Deployment</a> ·
  <a href="#testing">Testing</a>
</p>

---

## Overview

SwiftDrop is a full-stack file transfer platform designed to move files directly between devices without routing file contents through a central cloud storage service.

Built around WebRTC DataChannels, WebSocket-based signaling, and a persistent SQLite database, SwiftDrop combines direct peer-to-peer transfers with account management, device organization, transfer history, integrity verification, and network diagnostics.

The platform is designed for both quick, account-free transfers and authenticated users who need a persistent dashboard for managing their transfer activity.

### Core Principles

- **Direct by default** — Transfer file data peer-to-peer whenever a direct connection can be established.
- **Privacy first** — Keep file contents out of the signaling server; use explicit controls for persistent transfer metadata.
- **Performance focused** — Support parallel DataChannels, adaptive chunking, compression, and backpressure.
- **Secure by design** — Protect accounts, sessions, pairing codes, and recovery workflows.
- **Transparent operation** — Provide transfer progress, connection diagnostics, integrity results, and downloadable receipts.

> **Important:** WebRTC uses ICE to establish connectivity. Depending on the network and configured ICE servers, traffic may travel directly between devices or through a TURN relay. SwiftDrop does not require central cloud file storage for its direct-transfer architecture, but signaling and optional relay infrastructure may still be involved.

---

## Key Features

### 01. High-Performance Transfer Engine

SwiftDrop uses a configurable transport layer designed to make efficient use of available network capacity.

| Capability | Implementation |
|---|---|
| Parallel streams | 1×, 2×, 4×, or 8× WebRTC DataChannels |
| Transport | WebRTC DataChannels over SCTP/DTLS |
| Chunk sizes | 64 KiB, 128 KiB, or 256 KiB |
| Flow control | Buffered-amount monitoring and adaptive backpressure |
| Packet framing | Binary headers, magic identifier, and chunk indexing |
| Integrity | SHA-256 file verification |
| Network diagnostics | RTT, connection type, and active stream count |

Parallel channels distribute chunks across independent DataChannels. Chunk indexing enables the receiver to reconstruct files correctly when chunks arrive out of order.

Performance depends on device capabilities, browser implementation, network conditions, and the selected transport path. Parallel channels are configurable rather than a guarantee of increased throughput.

### 02. Intelligent Stream Compression

SwiftDrop supports browser-native streaming compression for eligible file types.

- Uses `CompressionStream` and `DecompressionStream` where supported.
- Detects file types that are likely to benefit from compression.
- Avoids unnecessary compression for already-compressed formats.
- Preserves original file contents through decompression and integrity verification.
- Applies streaming backpressure to manage memory consumption.

Compression is most effective for text-heavy data, source code, JSON, CSV, logs, and similar content. Actual savings vary by file; already-compressed files may show little or no improvement.

### 03. Direct LAN Connectivity

When devices share a compatible local network, SwiftDrop can establish a direct WebRTC connection without routing file data through an external relay.

- ICE candidate inspection for connection diagnostics.
- Local-network connectivity when supported by the browser and network.
- Support for private IPv4 address ranges.
- Live connection telemetry and transfer-speed monitoring.
- Optional TURN relay fallback for restrictive network environments.

**Note:** A private IP address alone does not prove that the connection is using a direct LAN route. Connection classification should use the selected ICE candidate pair and connection statistics.

### 04. Flexible File Saving

SwiftDrop distinguishes between receiving file data and saving it to persistent device storage.

- File System Access API support where available.
- Standard browser download fallback.
- Multi-file transfer support.
- Per-file progress and completion status.
- SHA-256 integrity results.
- Explicit saved-to-disk status where it can be verified.

Browser permissions and platform restrictions may affect the available save methods.

### 05. Guest Transfers and Account Management

SwiftDrop supports two complementary usage modes:

**Guest mode**
- Generate temporary pairing codes.
- Connect through a pairing code or QR code.
- Transfer files without requiring a persistent account.
- Keep connection sessions separate from account login sessions.

**Account mode**
- Create an account and securely authenticate.
- Access a personal dashboard and transfer history.
- Manage saved device labels and preferences.
- Review active login sessions.
- Export account data or delete the account.

Guest-mode transfers and authenticated account history should remain separate unless the user explicitly chooses to associate them.

---

## Security & Privacy

SwiftDrop is designed around minimizing unnecessary exposure of file contents and protecting persistent account data.

| Area | Approach |
|---|---|
| Password storage | Scrypt with cryptographically random salts |
| Login sessions | HTTP-only cookies and hashed session tokens |
| Session lifecycle | Rotation, expiration, and revocation |
| Password recovery | Single-use, hashed, time-limited tokens |
| Transfer integrity | SHA-256 verification |
| Signaling | WebSocket session coordination |
| Data storage | SQLite outside publicly served directories |
| Account privacy | History controls, data export, and account deletion |
| Network traversal | Configurable STUN/TURN infrastructure |

### Privacy Model

- File bytes are exchanged through WebRTC DataChannels, not uploaded to the signaling server.
- WebSocket signaling coordinates pairing and exchanges connection-negotiation information.
- TURN relays may forward encrypted WebRTC traffic when direct connectivity fails.
- Transfer metadata is stored only according to the application's history and account policies.
- Account exports and deletion workflows provide user control over persisted information.

**Security considerations:** WebRTC encrypts DataChannel traffic using DTLS. Production deployments should also enforce HTTPS/WSS, validate WebSocket message schemas, authorize pairing operations, rate-limit authentication and pairing endpoints, protect against cross-site request forgery where applicable, and avoid logging sensitive tokens or credentials.

---

## Platform Architecture

SwiftDrop separates the user interface, signaling infrastructure, transfer transport, and persistent account data.

```text
┌──────────────────────────────────────────┐
│             SwiftDrop Web UI              │
│  Sender · Receiver · Dashboard · Devices  │
└───────────────────┬──────────────────────┘
                    │
          HTTPS / Secure WebSocket
                    │
┌───────────────────▼──────────────────────┐
│            Node.js Backend                │
│                                          │
│  Authentication     Pairing & Signaling  │
│  Session Management Rate Limiting         │
│  TURN Credentials   API Authorization     │
└──────────────┬───────────────────────────┘
               │
       ┌───────▼────────┐
       │ SQLite Database │
       │                 │
       │ Users & Sessions│
       │ Transfer History│
       │ Devices & Audit │
       └─────────────────┘

        Direct WebRTC DataChannel
                 ⇅
       ┌────────────────────┐
       │  Sender Device     │
       └────────────────────┘
                 ⇅
       ┌────────────────────┐
       │  Receiver Device   │
       └────────────────────┘

     Optional TURN relay when needed
```

### Technology Stack

| Component | Technology |
|---|---|
| Frontend | Vite-based web application |
| Backend | Node.js and Express |
| Real-time signaling | WebSocket |
| File transport | WebRTC DataChannels |
| Persistent database | SQLite |
| Database runtime | Node.js `node:sqlite` |
| Password hashing | Scrypt |
| File integrity | SHA-256 |
| Stream compression | Compression Streams API |
| Network traversal | STUN / TURN |
| Testing | Automated unit and integration tests |

The production runtime and frontend build configuration should be kept consistent with the versions declared in `package.json` and the deployment environment.

---

## Database Design

Database location: `data/swiftdrop.db`

SwiftDrop uses SQLite with Write-Ahead Logging (WAL), foreign-key enforcement, and an explicit durability configuration.

| Table | Purpose |
|---|---|
| `users` | User identity, normalized email, password hash, and timestamps |
| `auth_sessions` | Hashed session tokens, activity timestamps, and revocation status |
| `transfers` | Transfer direction, status, byte counts, timestamps, and device labels |
| `transfer_files` | File names, sizes, MIME types, integrity results, and save status |
| `user_preferences` | Theme, history recording, and default device settings |
| `devices` | Saved device labels and last-seen activity |
| `password_reset_tokens` | Hashed, single-use password recovery tokens |
| `audit_events` | Security events and account activity |

### Dashboard & Transfer History

The account dashboard derives its metrics from stored transfer records.

- Completed transfer count.
- Total bytes sent and received.
- Failed, cancelled, and incomplete transfers.
- Recent activity with links to individual records.

The history interface supports:

- Direction filters: `All`, `Sent`, `Received`.
- Status filters: `All`, `Completed`, `Failed`, `Cancelled`.
- Filename and device-label search.
- Pagination and individual record deletion.
- Clear-history actions.
- JSON transfer receipts.

### Transfer Receipts

Downloadable JSON receipts can include:

- Transfer identifiers and timestamps.
- File names, sizes, and file counts.
- Transfer direction and final status.
- SHA-256 verification results.
- Transport security and connection metadata where available.

Receipts document recorded results; they should not be represented as cryptographic proof of sender identity unless an appropriate signing mechanism is implemented.

---

## Getting Started

### Prerequisites

- Node.js 22 or later for the native `node:sqlite` API.
- npm.
- A modern browser with WebRTC support.
- Git, for cloning the repository.

> Node.js 18 does not provide the same built-in `node:sqlite` support expected by this architecture. Use the runtime version required by your actual dependencies.

### 1. Clone the Repository

```bash
git clone https://github.com/tylonmademe/swiftdrop.git
cd swiftdrop
```

Replace the repository URL if your project is hosted elsewhere.

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file using the variables supported by your application.

```dotenv
PORT=3000
APP_URL=http://localhost:3000

# Configure these for deployments that require TURN.
TURN_SERVER_URL=
TURN_USERNAME=
TURN_CREDENTIAL=
```

Use strong, unique production credentials and keep `.env` out of version control. Never commit production secrets to the repository.

### 4. Start Development

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

The development server starts the Express backend, SQLite integration, WebSocket signaling, and Vite middleware according to the configured project scripts.

### 5. Build and Run

```bash
npm run build
npm start
```

### 6. Run Tests

```bash
npm test
```

Refer to the test scripts and actual test output to confirm which suites run in your current checkout.

---

## Local Network Deployment

To connect devices on the same Wi-Fi network, the server must be reachable from the other devices.

### 1. Determine Your LAN Address

Find the host computer's local IPv4 address, for example:

```text
192.168.1.3
```

Your address may be different.

### 2. Configure the Application

```dotenv
PORT=3000
LAN_IP=192.168.1.3
APP_URL=http://192.168.1.3:3000
```

Ensure the server binds to an interface reachable by other devices and that your firewall permits the required connections.

### 3. Start the Server

```bash
npm run dev
```

### 4. Connect Your Devices

Open the configured application URL on both devices, or scan the sender's pairing QR code. Enter or accept the pairing code and complete the connection workflow.

**Browser security note:** Secure-context requirements vary by API. `localhost` is generally treated as a secure context, but a website opened using a plain HTTP LAN address may not have access to every browser API available over HTTPS. Use a properly configured HTTPS deployment when required.

---

## Production Deployment

### HTTPS & Signaling

Use HTTPS and secure WebSockets (`WSS`) in production. Configure a reverse proxy or hosting environment to forward requests to the Node.js application.

Production deployments should include:

- Secure cookie configuration and session expiration.
- Rate limiting on login, registration, password recovery, and pairing.
- Input validation and authorization checks.
- Request size and connection limits.
- Secure secret management.
- Structured, privacy-conscious logs.
- Database backups and recovery procedures.
- Dependency updates and vulnerability monitoring.

### STUN / TURN Configuration

For networks where direct peer-to-peer connectivity cannot be established, configure a TURN server such as Coturn.

Example environment configuration:

```dotenv
TURN_SERVER_URL=turn:turn.example.com:3478
TURN_USERNAME=your-turn-username
TURN_CREDENTIAL=your-turn-credential
```

The backend should provide short-lived TURN credentials to authorized transfer sessions where supported by the TURN provider. Static long-lived TURN credentials should not be embedded in client-side bundles.

---

## Database Durability & Recovery

SwiftDrop stores its database outside publicly served directories.

### Database Location

```text
data/
└── swiftdrop.db
```

### Online Backup

With the SQLite command-line utility installed:

```bash
sqlite3 data/swiftdrop.db \
  ".backup 'data/backup-$(date +%F).db'"
```

This produces a consistent database snapshot while the application is running.

### Restore from Backup

Stop the application first and preserve a copy of the existing database before replacing it.

```bash
sqlite3 data/swiftdrop.db \
  ".restore 'data/backup-target.db'"
```

Verify that the SQLite version and command syntax support the operation. An alternative is to restore the backup into a separate database file and then replace the application database while the application is stopped.

### Integrity Check

```bash
sqlite3 data/swiftdrop.db \
  "PRAGMA integrity_check;"
```

Expected successful result:

```text
ok
```

Back up the database and any associated operational configuration needed for recovery. Do not copy only the main database file while ignoring active WAL state; use SQLite's backup facilities or a properly coordinated backup procedure.

---

## Testing

SwiftDrop's test plan covers the major transfer, session, authentication, and persistence workflows.

| Test Suite | Coverage |
|---|---|
| `e2e_transfer.test.ts` | Pairing, QR parsing, session state, chunk assembly, integrity checks |
| `sessions.test.ts` | Pairing codes, rate limits, expiry, and code reuse |
| `framing.test.ts` | Binary framing, byte formatting, and speed calculations |
| `auth_db.test.ts` | Registration, login, database migrations, authorization, and export |
| `acceleration.test.ts` | Parallel channel distribution and out-of-order reassembly |
| `compression.test.ts` | Streaming compression and decompression fidelity |

Run the complete suite:

```bash
npm test
```

The documented test plan contains six suites and 30 tests. Actual test counts and results should be verified against the current repository before making release claims.

---

## Project Structure

A representative project layout:

```text
swiftdrop/
├── src/
│   ├── client/             # Web application and user interface
│   ├── server/             # Express API and signaling
│   ├── transfer/           # WebRTC transport and file handling
│   ├── auth/                # Authentication and session logic
│   └── shared/              # Shared types and protocol definitions
├── tests/
│   ├── e2e_transfer.test.ts
│   ├── sessions.test.ts
│   ├── framing.test.ts
│   ├── auth_db.test.ts
│   ├── acceleration.test.ts
│   └── compression.test.ts
├── data/                    # Persistent SQLite database
├── public/                  # Static public assets
├── .env.example
├── package.json
└── README.md
```

This is an illustrative structure; use the actual directories and filenames in the repository when maintaining the documentation.

---

## Roadmap

Potential areas for continued development:

- [ ] Adaptive stream selection based on live network measurements.
- [ ] Resumable transfers after temporary disconnections.
- [ ] Expiring pairing codes and explicit receiver approval.
- [ ] Per-file cancellation and transfer queue management.
- [ ] Improved mobile browser compatibility.
- [ ] Automated backup retention and restore verification.
- [ ] Performance benchmarks across LAN, Wi-Fi, and WAN.
- [ ] Accessibility and keyboard-navigation improvements.
- [ ] Expanded security and cross-browser integration tests.

---

## Contributing

Contributions, bug reports, performance improvements, and security feedback are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make focused changes and add relevant tests.
4. Run the test suite.
5. Submit a pull request describing the change and its verification.

Please avoid including credentials, private transfer data, or other sensitive information in issues and logs. Report security vulnerabilities privately through a repository-maintainer-approved channel.

---

## License

Distributed under the MIT License, subject to the repository's actual license file.

See [`LICENSE`](LICENSE) for details.

---

<p align="center">
  <strong>SwiftDrop</strong>
  <br />
  <sub>Move files directly. Keep control of your data.</sub>
</p>
