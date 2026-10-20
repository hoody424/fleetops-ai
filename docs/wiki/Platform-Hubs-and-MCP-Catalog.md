# 9 Platform Hubs & 55 Curated MCP Plugins

FleetOps AI organizes infrastructure operations into 9 dedicated hubs, exposing 55 specialized Model Context Protocol (MCP) plugins:

---

### 1. Kubernetes Clusters & Cloud-Native Hub (7 MCPs)
- Live node and pod telemetry, resource metrics (`kubectl top`), rollout restart controls.
- **MCP Plugins:**
  - `mcp-server-kubernetes`: Core cluster inspection and pod debugging.
  - `k8sgpt-diagnostics-mcp`: AI cluster error analysis and root-cause detection.
  - `helm-gitops-mcp`: Helm release management and drift detection.
  - `promql-k8s-metrics-mcp`: PromQL queries for cluster node and pod saturation.
  - `trivy-k8s-security-mcp`: Container CVE and misconfiguration scanning.
  - `cilium-netpol-mcp`: eBPF network policy and packet drop verification.
  - `etcd-velero-backup-mcp`: Disaster recovery snapshot validation.

### 2. Docker Hosts & Compose Stack Hub (6 MCPs)
- Container lifecycle controls, live CPU/memory streaming, Compose stack inspection.
- **MCP Plugins:** `mcp-server-docker`, `docker-compose-gitops-mcp`, `docker-security-cis-mcp`, `docker-disk-prune-mcp`, `docker-registry-watch-mcp`, `docker-reverse-proxy-mcp`.

### 3. Linux Fleet & Systemd Hub (6 MCPs)
- Systemd service lifecycle, journal triage, security patches, storage and network sockets.
- **MCP Plugins:** `linux-systemd-journal-mcp`, `linux-apt-dnf-patch-mcp`, `linux-pam-ssh-hardening-mcp`, `linux-storage-lvm-zfs-mcp`, `linux-ebpf-network-mcp`, `linux-ansible-playbook-mcp`.

### 4. Windows Server & Active Directory Hub (6 MCPs)
- Windows Services, Event Viewer System/Security logs, NTFS volumes, WSUS updates, Defender status.
- **MCP Plugins:** `windows-powershell-winrm-mcp`, `windows-eventlog-siem-mcp`, `windows-active-directory-gpo-mcp`, `windows-wsus-patch-mcp`, `windows-defender-cis-mcp`, `windows-iis-sqlserver-mcp`.

### 5. Network Switches, Firewalls & Printers Hub (6 MCPs)
- Switch running-config backup, VLAN matrix, firewall rules, VPN tunnels, SNMP Printer-MIB toner/drum polling, and CUPS queues.
- **MCP Plugins:** `netmiko-napalm-switch-mcp`, `firewall-policy-vpn-mcp`, `ipp-snmp-printer-fleet-mcp`, `snmp-lldp-topology-mcp`, `unifi-omada-sdn-mcp`, `oxidized-netbox-sot-mcp`.

### 6. Virtualization, Hypervisors & Storage NAS/SAN Hub (6 MCPs)
- Proxmox VE/PBS, VMware vSphere/ESXi, KVM/Libvirt, TrueNAS OpenZFS, Ceph/MinIO S3, and SMART disk health.
- **MCP Plugins:** `proxmox-ve-pbs-mcp`, `truenas-zfs-storage-mcp`, `vmware-vsphere-esxi-mcp`, `libvirt-kvm-qemu-mcp`, `ceph-minio-object-mcp`, `synology-qnap-nas-mcp`.

### 7. Databases, Caches & Message Brokers Hub (6 MCPs)
- PostgreSQL, MySQL/MariaDB, Redis/Valkey, MongoDB, Elasticsearch, PITR backup verification.
- **MCP Plugins:** `postgres-dba-tuning-mcp`, `mysql-mariadb-galera-mcp`, `redis-valkey-cluster-mcp`, `mongodb-replica-mcp`, `elasticsearch-opensearch-mcp`, `pgbackrest-walg-backup-mcp`.

### 8. Identity (SSO/IAM), Reverse Proxies, WAF & SSL/PKI Hub (6 MCPs)
- Reverse proxy routes (Zoraxy, Traefik, Nginx), Let's Encrypt / Internal PKI, Authentik SSO, CrowdSec WAF.
- **MCP Plugins:** `reverse-proxy-waf-mcp`, `authentik-keycloak-iam-mcp`, `acme-stepca-pki-mcp`, `crowdsec-fail2ban-waf-mcp`, `cloudflare-dns-tunnel-mcp`, `hashicorp-vault-secrets-mcp`.

### 9. Observability, SIEM, Alerting & Runbook Automation Hub (6 MCPs)
- Prometheus alerts, Loki logs, Wazuh SIEM threats, Cron runbooks, ChatOps webhook notifications.
- **MCP Plugins:** `prometheus-alertmanager-mcp`, `loki-victorialogs-mcp`, `wazuh-siem-edr-mcp`, `uptime-kuma-blackbox-mcp`, `rundeck-cron-scheduler-mcp`, `chatops-incident-notify-mcp`.
