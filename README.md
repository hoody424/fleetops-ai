# fleetops-ai

**Self-Hosted AI Fleet & Infrastructure Operations Platform** — Manage Linux & Windows servers via **Agentless SSH Keys** or **Lightweight Outbound Go Agents**, powered directly by your existing **Claude (Pro/Max/Team)** and **Gemini (Google AI Pro/Workspace/CLI)** subscriptions (or local Ollama / OpenAI-compatible models).

---

## Key Features

- **Universal AI Brain — Connect All Major Subscriptions, Cloud APIs & Local LLMs:**
  - **Subscription CLI OAuth (No Double Billing):** Connect **Anthropic Claude (`claude` CLI — Pro/Max/Team)**, **Google Gemini (`gemini` CLI — AI Pro/Ultra/Workspace)**, and **OpenAI ChatGPT / Codex (`codex` CLI — Plus/Pro/Team)**.
  - **All Cloud & Sovereign AI APIs:** Native support for **Anthropic API**, **OpenAI Platform (`GPT-5` / `o3` / `GPT-4.1`)**, **Google Gemini / Vertex AI**, **xAI Grok (`Grok 3`)**, **DeepSeek (`R1` Reasoner & `V3`)**, **Mistral & Codestral**, **OpenRouter / Groq LPU (300+ models)**, and **GitHub Copilot Models / Azure OpenAI**.
  - **100% Air-Gapped Local AI:** Connect **Ollama**, **llama.cpp (`llama-server`)**, **vLLM**, **LM Studio**, or **LocalAI**.
- **Interactive Environment Discovery, Credentials Vault & AI Governance Wizard:**
  - **Subnet & Appliance Auto-Discovery:** Built-in TCP port & service scanner (`:22` SSH, `:6443` K8s, `:3389`/`:5985` Windows RDP/WinRM, `:443`/`:8443` Firewalls/Switches, `:9100`/`:631` JetDirect/IPP Network Printers) to discover and onboard systems in 1 click.
  - **4-Mode AI Decision Governance:** Choose how AI agents decide: **Strict Read-Only**, **Human-in-the-Loop Approval** (with unified diff preview), **Smart Auto-Append** (automatically appends safe rules, `authorized_keys`, and monitors while requiring user approval for restarts/deletions), or **Full Autonomous SRE** (with mandatory `/etc` pre-change snapshots and 1-click revert).
- **Hybrid Host Connectivity (Agentless SSH + Ultra-Lightweight Outbound Go Agent):**
  - **Agentless SSH-Key / SNMP / IPP Mode:** Manage Linux, Windows, BSD, Cisco/Aruba/UniFi/MikroTik switches, FortiGate/OPNsense firewalls, and network printers using AES-256-GCM Vault-stored credentials (with 1-click password bootstrap to install `authorized_keys`).
  - **Outbound Go Client Agent:** Zero-dependency pure-Go static binary (`fleetops-agent`, ~4.2 MB, ~8 MB RSS) for Linux & Windows that dials outbound over WebSocket (`ws://` / `wss://`) — zero inbound firewall ports required.
- **9 Dedicated Platform & Infrastructure Hubs (55 Curated MCP Plugins):**
  1. **Kubernetes Clusters & Cloud-Native Hub (7 MCPs):** Live node/pod/event telemetry, rollout restarts, `kubectl top`, and installable K8s MCP plugins (`mcp-server-kubernetes`, `k8sgpt-diagnostics-mcp`, `helm-gitops-mcp`, `promql-k8s-metrics-mcp`, `trivy-k8s-security-mcp`, `cilium-netpol-mcp`, `etcd-velero-backup-mcp`).
  2. **Docker Hosts & Compose Stack Hub (6 MCPs):** Live container lifecycle, real-time `docker stats`, Compose stack discovery, disk pruning, and Docker MCP plugins (`mcp-server-docker`, `docker-compose-gitops-mcp`, `docker-security-cis-mcp`, `docker-disk-prune-mcp`, `docker-registry-watch-mcp`, `docker-reverse-proxy-mcp`).
  3. **Linux Fleet & Systemd Hub (6 MCPs):** Live `systemd` service control, `journalctl` triage, security patch inspection, storage/socket telemetry, and Linux MCP plugins (`linux-systemd-journal-mcp`, `linux-apt-dnf-patch-mcp`, `linux-pam-ssh-hardening-mcp`, `linux-storage-lvm-zfs-mcp`, `linux-ebpf-network-mcp`, `linux-ansible-playbook-mcp`).
  4. **Windows Server & Active Directory Hub (6 MCPs):** Live Windows Service management, Event Viewer System/Security audit logs, NTFS volumes, KB hotfix tracking, Defender status, and Windows MCP plugins (`windows-powershell-winrm-mcp`, `windows-eventlog-siem-mcp`, `windows-active-directory-gpo-mcp`, `windows-wsus-patch-mcp`, `windows-defender-cis-mcp`, `windows-iis-sqlserver-mcp`).
  5. **Network Switches, Firewalls & Printers Hub (6 MCPs):** Running-config backup & VLAN matrix for switches, WAN/NAT/VPN tunnel audit for firewalls, SNMP Printer-MIB toner/drum/page-counter polling & CUPS queue control for printers (`netmiko-napalm-switch-mcp`, `firewall-policy-vpn-mcp`, `ipp-snmp-printer-fleet-mcp`, `snmp-lldp-topology-mcp`, `unifi-omada-sdn-mcp`, `oxidized-netbox-sot-mcp`).
  6. **Virtualization, Hypervisors & Storage NAS/SAN Hub (6 MCPs):** Proxmox VE & PBS, VMware vSphere/ESXi, KVM/Libvirt, TrueNAS SCALE/CORE OpenZFS pools, Ceph/MinIO S3 storage, and SMART disk health (`proxmox-ve-pbs-mcp`, `truenas-zfs-storage-mcp`, `vmware-vsphere-esxi-mcp`, `libvirt-kvm-qemu-mcp`, `ceph-minio-object-mcp`, `synology-qnap-nas-mcp`).
  7. **Databases, Caches & Message Brokers Hub (6 MCPs):** Percona PMM & Teleport-grade DBA operations for PostgreSQL, MySQL/MariaDB, Redis/Valkey, MongoDB, Elasticsearch/OpenSearch, and PITR backup verification (`postgres-dba-tuning-mcp`, `mysql-mariadb-galera-mcp`, `redis-valkey-cluster-mcp`, `mongodb-replica-mcp`, `elasticsearch-opensearch-mcp`, `pgbackrest-walg-backup-mcp`).
  8. **Identity (SSO/IAM), Reverse Proxies, WAF & SSL/PKI Hub (6 MCPs):** Zoraxy, Traefik, Nginx, Caddy & HAProxy routes, Let's Encrypt / Internal PKI certificates, Authentik / Keycloak SSO, and CrowdSec / Fail2ban WAF (`reverse-proxy-waf-mcp`, `authentik-keycloak-iam-mcp`, `acme-stepca-pki-mcp`, `crowdsec-fail2ban-waf-mcp`, `cloudflare-dns-tunnel-mcp`, `hashicorp-vault-secrets-mcp`).
  9. **Observability, SIEM, Alerting & Runbook Automation Hub (6 MCPs):** Prometheus & Alertmanager firing alerts, Loki/Syslog correlation, Wazuh/Auditd SIEM threat hunting, Scheduled Cron Runbooks, and ChatOps notifications (`prometheus-alertmanager-mcp`, `loki-victorialogs-mcp`, `wazuh-siem-edr-mcp`, `uptime-kuma-blackbox-mcp`, `rundeck-cron-scheduler-mcp`, `chatops-incident-notify-mcp`).
- **Built-in Catalogs (55 Skills, 49 Service Monitors, 10 Scanners, 13 Compliance Frameworks):**
  - Out-of-the-box System Inventory, Security Audits, **CIS Level 1 / CIS Docker / CIS Windows / NIS2 / ISO 27001 / GDPR Art. 32 / DORA / SOC2 / PCI-DSS / NIST / HIPAA** compliance evaluation with HTML/PDF export and **1-Click "Fix Finding with AI"**.
  - Fleet-wide **SSH Key & Sudo Discovery + Sync**, **TLS Certificate Discovery & PKI Lifecycle**, **Multi-Host Credential Rotation**, **Software Keystore**, **Global `Ctrl+K` Command Palette**, and **Emergency Panic Button**.
- **Built-in MCP Server (`/mcp`):**
  - Connect external MCP clients (Claude Desktop, Claude Code, Antigravity, Cursor) to query and manage your entire fleet, dynamically exposing all 55 enabled MCP plugins.

---

## Comparison with Similar Platforms

| Capability Domain | ManageLM | Rundeck / AWX | Portainer / Komodo | Teleport | NetBox / Oxidized | **FleetOps AI** |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Claude / Gemini / Codex CLI OAuth Subscriptions** | Partial | No | No | No | No | **Yes (+ 12 Cloud/Local AIs)** |
| **Agentless SSH + Ultra-Light Outbound Go Agent (4.2 MB)** | SSH | SSH | Agent | Agent | SSH/SNMP | **Both (SSH + 8 MB RSS Go Agent)** |
| **Kubernetes, Docker, Linux & Windows Hubs** | Linux/Win | Playbooks | K8s/Docker | Access | Inventory | **All 4 + Live Telemetry** |
| **Switches, Firewalls & Network Printers (SNMP/IPP)** | Basic | Manual | No | No | Switches | **Native Hub + 6 MCPs** |
| **Proxmox VE, VMware, TrueNAS ZFS & Ceph Storage** | No | Manual | No | No | No | **Native Hub + 6 MCPs** |
| **PostgreSQL, MySQL, Redis & PITR Backup DBA Hub** | No | Manual | No | DB Proxy | No | **Native Hub + 6 MCPs** |
| **Reverse Proxies (Zoraxy/Traefik/Nginx), SSO & SSL/PKI** | Certs | No | No | SSO/PKI | No | **Native Hub + 6 MCPs** |
| **Prometheus, Loki, Wazuh SIEM, Cron & ChatOps Webhooks** | Monitors | Cron/Jobs | No | Audit | Webhooks | **Native Hub + 5-Step Wizard** |
| **13 Compliance Frameworks (CIS, NIS2, ISO27001, DORA)** | 6 | No | No | SOC2 | No | **13 Frameworks + 1-Click AI Fix** |

---

## Quick Start (Docker Compose)

### 1. Production Stack
```bash
cp .env.example .env
# Edit .env and set ENCRYPTION_KEY / POSTGRES_PASSWORD
docker compose up -d --build
```
Open `http://localhost:3000`.

### 2. Sandbox Environment (Includes Disposable SSH Target Hosts)
To spin up the full platform alongside two isolated Linux SSH target containers (`sandbox-ubuntu` and `sandbox-alpine`) pre-wired for testing SSH bootstrap, AI Fleet Chat, `/etc` rollback, and CIS compliance scans:
```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.sandbox.yml up -d --build
```

---

## Kubernetes / k3s Deployment

Apply the manifests in `deploy/kubernetes/`:
```bash
kubectl apply -k deploy/kubernetes/
```
See `deploy/kubernetes/README.md` for Authentik / Traefik ForwardAuth SSO, Longhorn PVC sizing, and external seed configuration (`SEED_CONFIG_PATH`).

---

## License

MIT License — see [LICENSE](./LICENSE).
