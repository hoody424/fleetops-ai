# FleetOps AI Architecture

FleetOps AI is engineered as a unified self-hosted control plane for hybrid cloud and on-premise infrastructure.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           External MCP / API Clients                            │
│           (Claude Desktop / Cursor / Claude Code / Antigravity CLI)             │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │ JSON-RPC 2.0 via /mcp
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         FleetOps AI Core Control Plane                          │
│                                                                                 │
│   ┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐   │
│   │ Universal AI Hub    │   │ Credentials Vault   │   │  Software Keystore  │   │
│   │ (12 AI Providers +  │   │  (AES-256-GCM       │   │  (EC-P256 Custody,  │   │
│   │ CLI Subscriptions)  │   │  Rotation & Encr.)  │   │  Sign / Encrypt)    │   │
│   └──────────┬──────────┘   └──────────┬──────────┘   └──────────┬──────────┘   │
│              │                         │                         │              │
│   ┌──────────┴─────────────────────────┴─────────────────────────┴──────────┐   │
│   │                    Autonomous AI Governance Engine                      │   │
│   │        (Read-Only / Supervised Approval / Auto-Append / Auto SRE)       │   │
│   └────────────────────────────────────┬────────────────────────────────────┘   │
└────────────────────────────────────────┼────────────────────────────────────────┘
                                         │
        ┌────────────────────────────────┴────────────────────────────────┐
        │                                                                 │
        ▼ (Inbound SSH / WinRM / SNMP / IPP)                              ▼ (Outbound WebSocket)
┌─────────────────────────────────┐                             ┌─────────────────────────────────┐
│     Agentless Target Fleet      │                             │   Lightweight Go Client Agent   │
│  - Linux Servers (SSH :22)      │                             │   (`fleetops-agent` ~4.2 MB)    │
│  - Windows Nodes (WinRM :5986)  │                             │   - Pure Go, Zero Dependencies  │
│  - Switches & Firewalls (SSH)   │                             │   - Outbound WebSocket wss://   │
│  - Printers (SNMP :161 / :9100) │                             │   - Zero Inbound Firewall Holes │
└─────────────────────────────────┘                             └─────────────────────────────────┘
```

## Hybrid Host Connectivity

FleetOps AI supports two concurrent modes for managing any infrastructure asset:

1. **Agentless SSH & Network Protocol Mode:**
   - Linux & BSD servers: Direct SSH using private keys (Ed25519/RSA) or password bootstrap.
   - Windows servers: WinRM over HTTPS (`:5986`) or Windows OpenSSH (`:22`).
   - Network appliances: SSH CLI and REST API tokens (Cisco, Aruba, UniFi, FortiGate, OPNsense).
   - Network printers: SNMPv1/v2c/v3 Printer-MIB (`:161`) and IPP/JetDirect (`:9100`).

2. **Ultra-Lightweight Outbound Go Agent (`fleetops-agent`):**
   - Pure Go static binary compiled for Linux (`amd64`, `arm64`) and Windows.
   - Memory footprint: ~8 MB RSS. Binary size: ~4.2 MB.
   - Operates entirely via an outbound TLS WebSocket connection to the FleetOps control plane.
   - Ideal for isolated DMZs, remote edge devices, and environments where inbound SSH access is strictly forbidden.

## Cryptographic Security & Vault

- **AES-256-GCM Credential Encryption:** Passwords, private keys, API tokens, and SNMP community secrets are encrypted at rest with an authenticated Galois/Counter Mode cipher.
- **Software Keystore:** Provides cryptographic custody for central signing and decryption operations without leaking raw private key material to end agents.
- **Pre-Change Config Snapshots:** Before any file mutation in `/etc`, FleetOps AI captures an atomic snapshot of the target file, enabling instantaneous 1-click rollback via SFTP.
