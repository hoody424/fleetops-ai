<div align="center">

# FleetOps AI

**Universal Self-Hosted AI Fleet & Infrastructure Operations Platform**

Manage Linux, Windows, Kubernetes, Docker, switches, firewalls, and network printers with **Agentless SSH Keys** or **Ultra-Lightweight Outbound Go Agents** — powered directly by your **Claude**, **Gemini**, or **Codex** CLI subscriptions, cloud APIs, and sovereign local LLMs.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Go](https://img.shields.io/badge/Go-1.22-00ADD8.svg?logo=go&logoColor=white)](https://go.dev/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-5.0-black.svg?logo=fastify&logoColor=white)](https://fastify.dev/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](./LICENSE)
[![MCP Plugins](https://img.shields.io/badge/MCP_Plugins-55_Curated-violet.svg)](#9-dedicated-platform-hubs-55-mcp-plugins)
[![Compliance](https://img.shields.io/badge/Compliance-13_Frameworks-cyan.svg)](#13-compliance-frameworks--remediation)
[![Wiki](https://img.shields.io/badge/Documentation-Full_Wiki-indigo.svg)](./docs/wiki/Home.md)

</div>

---

## 📸 Screenshots & UI Walkthrough

| Screen | Preview | Highlights |
| :--- | :--- | :--- |
| **Fleet Operations Center** | [![Fleet Operations Overview](./docs/screenshots/01-fleet-dashboard-overview.svg)](./docs/screenshots/01-fleet-dashboard-overview.svg) | Live status of Linux, Windows, K8s, Docker, and Network nodes with telemetry, quick action runbooks, and node grouping. |
| **AI Operations Center** | [![Universal AI Operations Center](./docs/screenshots/02-ai-operations-center.svg)](./docs/screenshots/02-ai-operations-center.svg) | Interactive AI chat with Claude/Gemini, multi-node prompt broadcasts, diagnostic streaming, and unified diff approvals. |
| **9 Dedicated Platform Hubs** | [![9 Platform Hubs](./docs/screenshots/03-nine-platform-mcp-hubs.svg)](./docs/screenshots/03-nine-platform-mcp-hubs.svg) | Specialized operational workspaces for Kubernetes, Docker, Linux, Windows, Switches, DBs, Storage, SSO & SIEM. |
| **Setup & Credentials Wizard** | [![Setup Wizard & Credentials](./docs/screenshots/04-onboarding-governance-wizard.svg)](./docs/screenshots/04-onboarding-governance-wizard.svg) | Subnet prober, multi-profile Linux SSH (key/sudo), Windows WinRM/RDP, Switch CLI, and multiple SNMP communities pool. |
| **Compliance & Terminal** | [![Compliance & Terminal](./docs/screenshots/05-compliance-and-web-terminal.svg)](./docs/screenshots/05-compliance-and-web-terminal.svg) | 13 Compliance benchmarks (CIS, NIS2, ISO27001), 1-click AI fixes, interactive web SSH console, and SFTP config rollback. |

---

## 📖 Comprehensive Wiki Documentation

For in-depth architecture diagrams, operational guides, and tutorials, explore the **[FleetOps AI Wiki](./docs/wiki/Home.md)**:

- 🏛️ **[System Architecture](./docs/wiki/Architecture.md)** — Hybrid connectivity, AES-256-GCM Vault, Keystore, and MCP server.
- 🧙 **[Setup Wizard & Credentials](./docs/wiki/Setup-Wizard-and-Credentials.md)** — Subnet discovery, multiple SNMP communities, and multi-profile Linux/Windows/Switch credentials.
- 🧠 **[AI Brains & Decision Governance](./docs/wiki/AI-Brains-and-Governance.md)** — 12 AI providers, CLI OAuth profiles, and 4 decision governance tiers.
- 🧩 **[Platform Hubs & 55 MCP Catalog](./docs/wiki/Platform-Hubs-and-MCP-Catalog.md)** — Guide to the 9 specialized hubs and installable MCP servers.
- ⚡ **[Outbound Go Client Agent](./docs/wiki/Agent-Go-Deployment.md)** — Zero-inbound-port client agent (`fleetops-agent`) for Linux and Windows.
- 🛡️ **[Compliance & Runbooks](./docs/wiki/Compliance-and-Runbooks.md)** — 13 compliance benchmarks, 1-click AI remediation, and ChatOps notifications.

---

## 🌟 Key Features

### 1. Universal AI Brain (No Double Billing)
- **Subscription CLI OAuth:** Connect your existing paid **Anthropic Claude (`claude` CLI — Pro/Max/Team)**, **Google Gemini (`gemini` CLI — AI Pro/Ultra/Workspace)**, and **OpenAI Codex (`codex` CLI — Plus/Pro/Team)** subscriptions directly.
- **Cloud & Sovereign APIs:** Anthropic API (Claude 3.7 Sonnet Thinking / Opus), OpenAI Platform (GPT-4.5 / o3), Google Vertex AI, xAI Grok (Grok 3), DeepSeek (R1 / V3), Mistral / Codestral, and OpenRouter / Groq LPU (300+ models).
- **100% Air-Gapped Local LLMs:** Native endpoints for **Ollama**, **llama.cpp (`llama-server`)**, **vLLM**, **LM Studio**, and **LocalAI**.

### 2. Multi-Profile Credentials & Multiple SNMP Communities
- **Multiple SNMP Communities Pool:** Configure an extensible list of SNMP communities across VLANs (v1, v2c, and v3 USM with SHA/AES authentication and privacy protocols), with bulk comma-separated import and Printer-MIB toner polling.
- **Multi-Profile Linux SSH Credentials:** Define multiple Linux credential profiles with custom ports, password auth, RSA/Ed25519 private keys, separate sudo escalation passwords, and privilege modes (`root`, `sudo`, `doas`, `su`).
- **Windows & Switch Profiles:** WinRM HTTPS (`:5986`), WinRM HTTP (`:5985`), Windows OpenSSH (`:22`), RDP (`:3389`), and Switch CLI/API tokens with Cisco Enable secrets.

### 3. Hybrid Host Connectivity
- **Agentless SSH / Network Mode:** Direct SSH, WinRM, SNMP, and IPP connectivity without installing agents.
- **Outbound Go Client Agent (`fleetops-agent`):** Zero-dependency pure Go static binary (~4.2 MB, ~8 MB RSS) communicating via outbound WebSocket (`wss://`) — requires zero inbound firewall openings.

### 4. 9 Dedicated Platform Hubs (55 Curated MCP Plugins)
1. **Kubernetes Clusters & Cloud-Native Hub (7 MCPs)**
2. **Docker Hosts & Compose Stack Hub (6 MCPs)**
3. **Linux Fleet & Systemd Hub (6 MCPs)**
4. **Windows Server & Active Directory Hub (6 MCPs)**
5. **Network Switches, Firewalls & Printers Hub (6 MCPs)**
6. **Virtualization, Hypervisors & Storage NAS/SAN Hub (6 MCPs)**
7. **Databases, Caches & Message Brokers Hub (6 MCPs)**
8. **Identity (SSO/IAM), Reverse Proxies, WAF & SSL/PKI Hub (6 MCPs)**
9. **Observability, SIEM, Alerting & Runbook Automation Hub (6 MCPs)**

### 5. 13 Compliance Frameworks & 1-Click AI Fix
Evaluate nodes against **CIS Linux Levels 1 & 2**, **CIS Docker**, **CIS Windows**, **NIS2**, **ISO/IEC 27001**, **GDPR Art. 32**, **DORA**, **SOC 2 Type II**, **PCI-DSS v4.0**, **NIST SP 800-53**, **HIPAA**, and **BSI IT-Grundschutz** with 1-click AI-assisted remediation.

---

## 🚀 Quick Start (Docker Compose)

### 1. Production Stack
```bash
cp .env.example .env
# Set ENCRYPTION_KEY and POSTGRES_PASSWORD in .env
docker compose up -d --build
```
Open **`http://localhost:3000`** in your browser.

### 2. Sandbox Stack (With Disposable Target Hosts)
Spins up the core platform alongside two isolated Linux SSH target containers (`sandbox-ubuntu` and `sandbox-alpine`) for testing:
```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.sandbox.yml up -d --build
```

---

## ☸️ Kubernetes & k3s Deployment

Manifests are located in `deploy/kubernetes/`:
```bash
kubectl apply -k deploy/kubernetes/
```
See [`deploy/kubernetes/README.md`](./deploy/kubernetes/README.md) for Traefik ForwardAuth SSO, Longhorn storage class configuration, and seed configuration.

---

## 📄 License

MIT License — see [LICENSE](./LICENSE).
