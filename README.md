<div align="center">

# ⚡ FleetOps AI

**Universal Self-Hosted AI Fleet & Infrastructure Operations Platform**

Manage Linux, Windows, Kubernetes, Docker, switches, firewalls, and network printers with **Agentless SSH** or **Lightweight Outbound Go Agents** — powered by **Claude**, **Gemini**, or **Codex** CLI subscriptions, cloud APIs, and air-gapped local LLMs.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Go](https://img.shields.io/badge/Go-1.22-00ADD8.svg?logo=go&logoColor=white)](https://go.dev/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](./LICENSE)
[![MCP Plugins](https://img.shields.io/badge/MCP_Plugins-55_Built--in-8B5CF6.svg)](./docs/wiki/Platform-Hubs-and-MCP-Catalog.md)
[![Compliance](https://img.shields.io/badge/Compliance-13_Frameworks-06B6D4.svg)](./docs/wiki/Compliance-and-Runbooks.md)
[![Wiki](https://img.shields.io/badge/Docs-Wiki-4F46E5.svg)](./docs/wiki/Home.md)

</div>

---

## ⚡ Quick Install

### Option A: Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/hoody424/fleetops-ai.git
cd fleetops-ai

# Configure environment variables
cp .env.example .env

# Launch production stack (Control Plane + PostgreSQL + Redis)
docker compose up -d --build
```
> Open **`http://localhost:3000`** in your browser. Default login: `admin` / `fleetops-admin`.

---

### Option B: Kubernetes / k3s (GitOps Ready)

```bash
# Deploy to Kubernetes cluster
kubectl apply -k deploy/kubernetes/
```
> See [`deploy/kubernetes/README.md`](./deploy/kubernetes/README.md) for Traefik ForwardAuth SSO, Longhorn PVC sizing, and seed configurations.

---

### Option C: Disposable Sandbox Stack (With Test SSH Hosts)

Spins up the full platform alongside two isolated Linux SSH target containers (`sandbox-ubuntu` and `sandbox-alpine`) pre-configured for testing SSH key bootstrap, `/etc` rollbacks, and CIS scans:

```bash
docker compose -f docker-compose.yml -f docker-compose.sandbox.yml up -d --build
```

---

### Option D: Outbound Go Client Agent (`fleetops-agent`)

For isolated nodes or DMZs where inbound SSH ports cannot be opened:

```bash
# 1. Download or build the static binary (~4.2 MB)
cd packages/agent-go && CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/fleetops-agent .

# 2. Run with outbound WebSocket connection (Zero inbound ports required)
./bin/fleetops-agent \
  --server="wss://fleetops.yourdomain.com/ws/agent" \
  --token="YOUR_HOST_AGENT_TOKEN" \
  --hostname="prod-node-01"
```

---

## ⚖️ Comparison with Other Platforms

| Capability | Portainer / Komodo | Rundeck / AWX | Teleport | NetBox / Oxidized | ManageLM | **FleetOps AI** |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Claude / Gemini / Codex CLI Subscriptions (No API Billing)** | ❌ No | ❌ No | ❌ No | ❌ No | ⚠️ Partial | **✅ Yes (OAuth CLI profiles)** |
| **All Cloud APIs + Air-Gapped Local LLMs (Ollama / llama.cpp)** | ❌ No | ❌ No | ❌ No | ❌ No | ⚠️ Cloud Only | **✅ 12 AI Providers** |
| **Hybrid Connectivity (Agentless SSH + 4.2 MB Go Agent)** | ⚠️ Agent only | ⚠️ SSH only | ⚠️ Agent only | ⚠️ SSH/SNMP | ⚠️ SSH only | **✅ Both (SSH + Outbound Agent)** |
| **Kubernetes, Docker, Linux & Windows Hubs** | K8s/Docker | Playbooks | Access Proxy | Inventory | Linux/Win | **✅ All 4 + Live Telemetry** |
| **Network Switches, Firewalls & Printer-MIB Hub** | ❌ No | ❌ Manual | ❌ No | Switches only | Basic | **✅ Native Hub (6 MCPs)** |
| **Multiple SNMP Communities Pool (v1 / v2c / v3 USM)** | ❌ No | ❌ No | ❌ No | ⚠️ Single | ⚠️ Single | **✅ Yes (Multi-pool + Bulk Add)** |
| **Linux SSH Multi-Profiles (Key, Sudo Pass, Custom Ports)** | ❌ No | ⚠️ Global | ⚠️ SSH certs | ❌ No | ⚠️ Basic | **✅ Yes (Per-profile Sudo & Keys)** |
| **Storage (TrueNAS / Ceph) & DBA (Postgres / MySQL) Hubs** | ❌ No | ❌ Manual | ⚠️ DB Proxy | ❌ No | ❌ No | **✅ Native Hubs (12 MCPs)** |
| **Pre-Change `/etc` Snapshots & 1-Click Rollback** | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | **✅ Yes (SFTP Atomic Rollback)** |
| **13 Security Frameworks (CIS, NIS2, ISO27001, DORA) + AI Fix** | ❌ No | ❌ No | ⚠️ SOC2 | ❌ No | ⚠️ 6 Frameworks | **✅ 13 Frameworks + 1-Click Fix** |
| **Built-in Model Context Protocol Server (`/mcp`)** | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | **✅ Yes (55 MCP Plugins)** |

---

## 📸 UI Walkthrough

| Screen | Preview | Highlights |
| :--- | :--- | :--- |
| **Fleet Operations Center** | [![Fleet Operations Overview](./docs/screenshots/01-fleet-dashboard-overview.svg)](./docs/screenshots/01-fleet-dashboard-overview.svg) | Live status of Linux, Windows, K8s, Docker, and Network nodes with telemetry, quick runbooks, and node grouping. |
| **AI Operations Center** | [![Universal AI Operations Center](./docs/screenshots/02-ai-operations-center.svg)](./docs/screenshots/02-ai-operations-center.svg) | Interactive AI chat with Claude/Gemini, multi-node prompt broadcasts, diagnostic streaming, and unified diff approvals. |
| **9 Dedicated Platform Hubs** | [![9 Platform Hubs](./docs/screenshots/03-nine-platform-mcp-hubs.svg)](./docs/screenshots/03-nine-platform-mcp-hubs.svg) | Specialized operational workspaces for Kubernetes, Docker, Linux, Windows, Switches, DBs, Storage, SSO & SIEM. |
| **Setup & Credentials Wizard** | [![Setup Wizard & Credentials](./docs/screenshots/04-onboarding-governance-wizard.svg)](./docs/screenshots/04-onboarding-governance-wizard.svg) | Subnet prober, multi-profile Linux SSH (key/sudo), Windows WinRM/RDP, Switch CLI, and multiple SNMP communities pool. |
| **Compliance & Terminal** | [![Compliance & Terminal](./docs/screenshots/05-compliance-and-web-terminal.svg)](./docs/screenshots/05-compliance-and-web-terminal.svg) | 13 Compliance benchmarks (CIS, NIS2, ISO27001), 1-click AI fixes, interactive web SSH console, and SFTP config rollback. |

---

## 🎯 What Makes FleetOps AI Unique

- **No Double Billing for AI:** Run fleet-wide diagnostic and remediation tasks using your existing Anthropic Claude, Google Gemini, or ChatGPT/Codex subscriptions via local CLI OAuth tokens.
- **5-Step Onboarding Wizard with Multi-Profile Credentials:**
  - **Multiple SNMP Communities Pool:** Configure an extensible list of SNMP communities across VLANs (`public`, `private`, custom strings, or SNMPv3 USM with SHA/AES) with bulk comma-separated import.
  - **Multi-Profile Linux SSH Credentials:** Define multiple Linux credential profiles with custom ports, password auth, RSA/Ed25519 private keys, separate sudo escalation passwords, and privilege modes (`root`, `sudo`, `doas`, `su`).
  - **Windows & Switch Profiles:** WinRM HTTPS (`:5986`), WinRM HTTP (`:5985`), Windows OpenSSH (`:22`), RDP (`:3389`), and Switch CLI/API tokens with Cisco Enable secrets.
- **Safe 4-Tier AI Governance:** Choose how AI models execute actions: `Strict Read-Only`, `Supervised Approval` (with unified diff previews), `Smart Auto-Append` (auto-appends safe rules while requiring approval for restarts), or `Autonomous SRE` (with atomic pre-change `/etc` snapshots and 1-click rollback).
- **9 Dedicated Infrastructure Hubs with 55 Curated MCPs:** Kubernetes, Docker, Linux, Windows, Switches/Firewalls/Printers, Virtualization/Storage, Databases, Identity/Proxies, and Observability/SIEM.

---

## 📚 Documentation & Wiki

Explore detailed operational guides in the **[FleetOps AI Wiki](./docs/wiki/Home.md)**:

- 🏛️ **[System Architecture](./docs/wiki/Architecture.md)** — Hybrid connectivity, AES-256-GCM Vault, Keystore, and MCP server.
- 🧙 **[Setup Wizard & Credentials](./docs/wiki/Setup-Wizard-and-Credentials.md)** — Subnet discovery, multiple SNMP communities, and multi-profile Linux/Windows/Switch credentials.
- 🧠 **[AI Brains & Decision Governance](./docs/wiki/AI-Brains-and-Governance.md)** — 12 AI providers, CLI OAuth profiles, and 4 decision governance tiers.
- 🧩 **[Platform Hubs & 55 MCP Catalog](./docs/wiki/Platform-Hubs-and-MCP-Catalog.md)** — Guide to the 9 specialized hubs and installable MCP servers.
- ⚡ **[Outbound Go Client Agent](./docs/wiki/Agent-Go-Deployment.md)** — Zero-inbound-port client agent (`fleetops-agent`) for Linux and Windows.
- 🛡️ **[Compliance & Runbooks](./docs/wiki/Compliance-and-Runbooks.md)** — 13 compliance benchmarks, 1-click AI remediation, and ChatOps notifications.

---

## 📄 License

MIT License — see [LICENSE](./LICENSE).
