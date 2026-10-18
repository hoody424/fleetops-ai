import React, { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ClipboardCopy,
  CloudCog,
  Container,
  Database,
  HardDrive,
  Loader2,
  Monitor,
  PlugZap,
  RefreshCw,
  Router,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wrench,
} from "lucide-react";

export type PlatformCategory =
  | "kubernetes"
  | "docker"
  | "linux"
  | "windows"
  | "network"
  | "virtualization"
  | "databases"
  | "identity_proxy"
  | "observability";

interface PlatformHubProps {
  initialPlatform?: PlatformCategory;
  hosts: any[];
  mcpPlugins: any[];
  onRefreshCatalog: () => void;
  onLaunchAIPrompt: (prompt: string, targetScope: string) => void;
}

const PLATFORM_META: Record<
  PlatformCategory,
  {
    title: string;
    subtitle: string;
    accent: string;
    badgeBg: string;
    quickPrompts: Array<{ label: string; prompt: string }>;
  }
> = {
  kubernetes: {
    title: "Kubernetes Cluster & Cloud-Native Operations",
    subtitle:
      "Live K3s / Kubernetes cluster telemetry, workload health, warning events, and 1-click Model Context Protocol (MCP) plugins for AI-driven cluster operations.",
    accent: "from-sky-500/20 to-indigo-500/10 border-sky-500/30",
    badgeBg: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    quickPrompts: [
      {
        label: "Diagnose Unhealthy Pods",
        prompt:
          "Inspect all Kubernetes namespaces for CrashLoopBackOff, OOMKilled, Pending, or ImagePullBackOff pods, check their events/logs, and recommend exact fixes.",
      },
      {
        label: "Node Resource & Memory Pressure",
        prompt:
          "Compare CPU and Memory utilization across all Kubernetes nodes, identify top memory-consuming pods, and flag any OOMKill risk.",
      },
      {
        label: "Audit Ingress, TLS & NetworkPolicies",
        prompt:
          "List all Kubernetes Ingresses, Services, and TLS secrets across namespaces and verify certificate expiration and backend readiness.",
      },
      {
        label: "K3s / etcd & PVC Storage Health",
        prompt:
          "Check all PersistentVolumeClaims (PVCs), storage classes, and K3s etcd snapshot health across the cluster.",
      },
    ],
  },
  docker: {
    title: "Docker Engine & Compose Stack Management",
    subtitle:
      "Real-time container lifecycle control, resource telemetry, Docker Compose stack orchestration, and specialized Docker MCP plugins.",
    accent: "from-cyan-500/20 to-blue-500/10 border-cyan-500/30",
    badgeBg: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    quickPrompts: [
      {
        label: "Audit All Containers & Restart Loops",
        prompt:
          "Inspect all running and exited Docker containers, check CPU/memory stats, and diagnose any containers with non-zero exit codes or high restart counts.",
      },
      {
        label: "Docker Disk & Volume Cleanup Plan",
        prompt:
          "Analyze Docker disk usage (`docker system df -v`), identify dangling images, unused volumes, and large container logs, and propose a safe cleanup plan.",
      },
      {
        label: "CIS Docker Security & Socket Audit",
        prompt:
          "Audit all running containers on this Docker host for `--privileged` mode, mounted `/var/run/docker.sock`, root user execution, or missing memory limits.",
      },
      {
        label: "Discover Compose Stacks & Port Map",
        prompt:
          "List all active Docker Compose stacks and map all host-exposed TCP/UDP ports (`0.0.0.0` vs `127.0.0.1`).",
      },
    ],
  },
  linux: {
    title: "Linux Fleet & Systemd Operations Hub",
    subtitle:
      "Deep Linux server administration: systemd unit control, journald error triage, APT/DNF security patching, LVM/ZFS storage, and Linux MCP plugins.",
    accent: "from-emerald-500/20 to-teal-500/10 border-emerald-500/30",
    badgeBg: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    quickPrompts: [
      {
        label: "Triage Failed Systemd Services & Logs",
        prompt:
          "Check for any failed systemd units, recent journalctl errors, or kernel dmesg OOM/I/O warnings on this Linux host.",
      },
      {
        label: "Security Patch & Reboot Audit",
        prompt:
          "Check for pending APT/DNF security package updates and determine whether `/var/run/reboot-required` is set across the Linux fleet.",
      },
      {
        label: "Harden SSH, Sudoers & Firewall",
        prompt:
          "Audit `/etc/ssh/sshd_config`, `/etc/sudoers`, and active firewall rules (`ufw`/`nftables`/`iptables`) against CIS Linux Level 1 best practices.",
      },
      {
        label: "Disk Space & Inode Forensics",
        prompt:
          "Analyze filesystem mounts, LVM volumes, inode usage, and the top 10 largest directories under `/var` and `/opt`.",
      },
    ],
  },
  windows: {
    title: "Windows Server & Active Directory Hub",
    subtitle:
      "Agentless OpenSSH / WinRM & Outbound Go Agent management for Windows Server: Services, Event Viewer, Active Directory, KB Hotfixes, Defender, and Windows MCP plugins.",
    accent: "from-violet-500/20 to-indigo-500/10 border-violet-500/30",
    badgeBg: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    quickPrompts: [
      {
        label: "Stopped Automatic Windows Services",
        prompt:
          "Find all Windows Services configured for Automatic startup that are currently Stopped, check Event Viewer logs for crash events, and recommend remediation.",
      },
      {
        label: "Windows Event Log & RDP Security Audit",
        prompt:
          "Query Windows System, Application, and Security Event Logs for Critical errors, failed RDP logons (Event ID 4625), or account lockouts in the last 24h.",
      },
      {
        label: "Windows Update (KB) & Pending Reboot Check",
        prompt:
          "List recently installed Windows KB HotFixes, check for missing critical updates, and verify if a Windows Update reboot is pending.",
      },
      {
        label: "Microsoft Defender & CIS Hardening",
        prompt:
          "Verify Microsoft Defender real-time protection status, signature age, Windows Firewall profiles, and RDP Network Level Authentication (NLA).",
      },
    ],
  },
  network: {
    title: "Network Switches, Firewalls & Printer Fleet Hub",
    subtitle:
      "Unified management for Managed Switches (Cisco/Aruba/UniFi/MikroTik), Firewalls (OPNsense/FortiGate/PaloAlto), and Network Printers/MFPs (SNMP Printer-MIB, IPP, JetDirect, CUPS).",
    accent: "from-amber-500/20 to-orange-500/10 border-amber-500/30",
    badgeBg: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    quickPrompts: [
      {
        label: "Switch Running-Config Backup & VLAN Audit",
        prompt:
          "Backup the running configuration of our network switches, verify VLAN trunk assignments, and check for interface CRC errors or PoE faults.",
      },
      {
        label: "Firewall Policy, NAT & VPN Tunnel Audit",
        prompt:
          "Audit all firewall rules, NAT port-forwards, and IPsec/WireGuard site-to-site VPN tunnels for security exposures or dropped links.",
      },
      {
        label: "Printer Fleet Toner, Drum & Queue Status",
        prompt:
          "Poll all network printers and MFPs via SNMP/IPP/CUPS for toner/drum supply levels, page counters, paper tray alerts, and stuck print jobs.",
      },
      {
        label: "LLDP / ARP Network Topology Discovery",
        prompt:
          "Discover ARP/MAC neighbor tables, LLDP switch port mappings, and active subnet gateways across the network.",
      },
    ],
  },
  virtualization: {
    title: "Virtualization, Hypervisors & Storage NAS/SAN Hub",
    subtitle:
      "Manage Proxmox VE & PBS, VMware vSphere/ESXi, KVM/Libvirt, TrueNAS SCALE/CORE OpenZFS pools, Ceph/MinIO S3 storage, and SMART disk health.",
    accent: "from-fuchsia-500/20 to-purple-500/10 border-fuchsia-500/30",
    badgeBg: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
    quickPrompts: [
      {
        label: "Proxmox / KVM VM & LXC Inventory",
        prompt:
          "List all virtual machines and LXC containers across our hypervisor nodes, check CPU/RAM overcommitment, and verify nightly backup status.",
      },
      {
        label: "ZFS Pool, RAID & Scrub Health",
        prompt:
          "Inspect all ZFS pools (`zpool status`) and Linux RAID arrays for degraded vdevs, scrub age, snapshot retention, and capacity over 80%.",
      },
      {
        label: "SMART Disk Wear & NVMe Health",
        prompt:
          "Check block devices (`lsblk`) and SMART health (`smartctl`) across all storage hosts for reallocated sectors or high NVMe wear.",
      },
      {
        label: "NFS / SMB / iSCSI & Ceph S3 Audit",
        prompt:
          "Audit all exported NFS/SMB/iSCSI storage shares, mount options, and S3 backup repository immutability.",
      },
    ],
  },
  databases: {
    title: "Databases, Caches & Message Brokers Hub",
    subtitle:
      "Percona PMM & Teleport-grade DBA operations for PostgreSQL, MySQL/MariaDB, Redis/Valkey, MongoDB, Elasticsearch/OpenSearch, and PITR backup verification.",
    accent: "from-blue-500/20 to-indigo-500/10 border-blue-500/30",
    badgeBg: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    quickPrompts: [
      {
        label: "PostgreSQL / MySQL Active Locks & Slow Queries",
        prompt:
          "Inspect active PostgreSQL (`pg_stat_activity`) and MySQL/MariaDB connections for blocking locks, long-running queries, and connection pool saturation.",
      },
      {
        label: "Database Backup & PITR Verification",
        prompt:
          "Verify that all PostgreSQL, MySQL, and MongoDB instances have valid logical or PITR backups created within the last 24 hours.",
      },
      {
        label: "Redis / Valkey Memory & Eviction Audit",
        prompt:
          "Check Redis/Valkey memory fragmentation, keyspace hit ratio, evicted keys, and RDB/AOF persistence status.",
      },
      {
        label: "Replication Lag & Table Bloat Analysis",
        prompt:
          "Check database streaming replication lag, table/index bloat, and autovacuum performance across all DB hosts.",
      },
    ],
  },
  identity_proxy: {
    title: "Identity (SSO/IAM), Reverse Proxies, WAF & SSL/PKI Hub",
    subtitle:
      "Unified Edge & Zero-Trust Hub: Zoraxy, Traefik, Nginx, Caddy & HAProxy routes, Let's Encrypt / Internal PKI certificates, Authentik / Keycloak SSO, and CrowdSec / Fail2ban WAF.",
    accent: "from-rose-500/20 to-pink-500/10 border-rose-500/30",
    badgeBg: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    quickPrompts: [
      {
        label: "SSL/TLS Certificate Expiration Sweep",
        prompt:
          "Scan all reverse proxies, local certificate stores, and HTTPS endpoints for SSL/TLS certificates expiring within 30 days.",
      },
      {
        label: "Reverse Proxy Upstreams & 502/504 Triage",
        prompt:
          "Inspect Zoraxy, Traefik, Nginx, or HAProxy reverse proxies for unreachable upstream backends, HTTP 5xx errors, or memory pressure.",
      },
      {
        label: "CrowdSec & Fail2ban Active Threat Bans",
        prompt:
          "List all active CrowdSec decisions and Fail2ban banned IPs across our perimeter hosts and summarize top attacking ASNs.",
      },
      {
        label: "Authentik / Keycloak SSO & MFA Audit",
        prompt:
          "Verify Authentik / Keycloak SSO health, OIDC outpost connectivity, and administrative MFA enforcement.",
      },
    ],
  },
  observability: {
    title: "Observability, SIEM, Alerting & Runbook Automation Hub",
    subtitle:
      "Rundeck & Grafana/Wazuh-grade operations: Prometheus & Alertmanager firing alerts, Loki/Syslog correlation, Wazuh/Auditd SIEM threat hunting, and Scheduled Cron Runbooks.",
    accent: "from-teal-500/20 to-emerald-500/10 border-teal-500/30",
    badgeBg: "bg-teal-500/15 text-teal-300 border-teal-500/30",
    quickPrompts: [
      {
        label: "Correlate Firing Alerts & Error Logs",
        prompt:
          "Inspect firing Prometheus/Alertmanager alerts and correlate them with the last 60 minutes of syslog/journalctl/Loki error logs across all hosts.",
      },
      {
        label: "SIEM, Auditd & File Integrity Triage",
        prompt:
          "Check Wazuh / Auditd / auth.log security events for brute-force attempts, privileged sudo commands, or `/etc` file integrity changes.",
      },
      {
        label: "Cron Jobs & Systemd Timers Audit",
        prompt:
          "Audit all `/etc/crontab`, `/etc/cron.d`, and systemd timers across the fleet for failed scheduled jobs or unauthorized persistence.",
      },
      {
        label: "Generate Executive SLA & Incident Digest",
        prompt:
          "Compile a 24-hour fleet availability, backup verification, and security incident summary ready for Slack/Teams dispatch.",
      },
    ],
  },
};

export const PlatformHubPanel: React.FC<PlatformHubProps> = ({
  initialPlatform = "kubernetes",
  hosts,
  mcpPlugins,
  onRefreshCatalog,
  onLaunchAIPrompt,
}) => {
  const [platform, setPlatform] = useState<PlatformCategory>(initialPlatform);
  const [selectedHostId, setSelectedHostId] = useState<string>("");
  const [inspectData, setInspectData] = useState<any>(null);
  const [loadingInspect, setLoadingInspect] = useState(false);
  const [actionTarget, setActionTarget] = useState("");
  const [actionOutput, setActionOutput] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState(false);
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [configModalPlugin, setConfigModalPlugin] = useState<any | null>(null);

  useEffect(() => {
    setPlatform(initialPlatform);
  }, [initialPlatform]);

  const candidateHosts = hosts.filter((h) => {
    if (platform === "windows") return h.os_type === "windows";
    return true;
  });

  useEffect(() => {
    if (candidateHosts.length > 0 && (!selectedHostId || !candidateHosts.some((h) => h.id === selectedHostId))) {
      if (platform === "kubernetes") {
        const k8sHost =
          candidateHosts.find(
            (h) =>
              h.hostname?.toLowerCase().includes("cloud") ||
              h.group_name?.toLowerCase().includes("k3s") ||
              (h.tags || []).includes("k3s")
          ) || candidateHosts[0];
        setSelectedHostId(k8sHost.id);
      } else if (platform === "docker") {
        const dockHost =
          candidateHosts.find(
            (h) => h.hostname?.toLowerCase().includes("dock") || (h.tags || []).includes("docker")
          ) || candidateHosts[0];
        setSelectedHostId(dockHost.id);
      } else if (platform === "network") {
        const netHost =
          candidateHosts.find(
            (h) =>
              ["switch", "firewall", "router", "printer"].includes(h.os_type) ||
              h.group_name?.toLowerCase().includes("net")
          ) || candidateHosts[0];
        setSelectedHostId(netHost.id);
      } else {
        setSelectedHostId(candidateHosts[0].id);
      }
    } else if (candidateHosts.length === 0) {
      setSelectedHostId("");
    }
  }, [platform, hosts]);

  const fetchLiveInspection = async (plat: PlatformCategory, hostId: string) => {
    setLoadingInspect(true);
    setActionOutput(null);
    try {
      const q = new URLSearchParams({ platform: plat });
      if (hostId) q.set("hostId", hostId);
      const res = await fetch(`/api/platforms/inspect?${q.toString()}`);
      const data = await res.json();
      setInspectData(data);
    } catch (err: any) {
      setInspectData({ error: err?.message || String(err), sections: {} });
    } finally {
      setLoadingInspect(false);
    }
  };

  useEffect(() => {
    fetchLiveInspection(platform, selectedHostId);
  }, [platform, selectedHostId]);

  const handleTogglePlugin = async (plugin: any) => {
    setTogglingSlug(plugin.slug);
    try {
      const nextState = !plugin.enabled;
      await fetch(`/api/mcp-plugins/${plugin.slug}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installed: nextState ? true : plugin.installed,
          enabled: nextState,
          targetHostId: selectedHostId || null,
        }),
      });
      onRefreshCatalog();
    } finally {
      setTogglingSlug(null);
    }
  };

  const handleRunPlatformAction = async (action: string, customTarget?: string) => {
    const hostIdToUse = selectedHostId || inspectData?.host?.id;
    if (!hostIdToUse) return;
    setRunningAction(true);
    try {
      const res = await fetch("/api/platforms/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostId: hostIdToUse,
          platform,
          action,
          target: customTarget !== undefined ? customTarget : actionTarget,
        }),
      });
      const data = await res.json();
      setActionOutput(data.output || data.message || JSON.stringify(data, null, 2));
    } catch (err: any) {
      setActionOutput(`Action error: ${err?.message || String(err)}`);
    } finally {
      setRunningAction(false);
    }
  };

  const copyMcpConfig = (plugin: any) => {
    const def = plugin.definition || {};
    const snippet = {
      mcpServers: {
        [plugin.slug]: def.mcp_config || {
          command: "npx",
          args: ["-y", plugin.package_name],
        },
      },
    };
    navigator.clipboard.writeText(JSON.stringify(snippet, null, 2));
    setCopiedSlug(plugin.slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const meta = PLATFORM_META[platform];
  const filteredPlugins = (mcpPlugins || []).filter((p) => p.category === platform);
  const enabledCount = filteredPlugins.filter((p) => p.enabled).length;
  const activeHostName =
    hosts.find((h) => h.id === selectedHostId)?.hostname || inspectData?.host?.hostname || "@all";

  return (
    <div className="space-y-6">
      {/* 9-Platform & Infrastructure Hub Selector Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
        {(
          [
            {
              id: "kubernetes" as PlatformCategory,
              label: "Kubernetes & K3s",
              sub: "Workloads, Helm & GitOps MCPs",
              icon: CloudCog,
              color: "text-sky-400",
            },
            {
              id: "docker" as PlatformCategory,
              label: "Docker Hosts",
              sub: "Containers & Compose MCPs",
              icon: Container,
              color: "text-cyan-400",
            },
            {
              id: "linux" as PlatformCategory,
              label: "Linux Fleet",
              sub: "Systemd, Patch & LVM MCPs",
              icon: Server,
              color: "text-emerald-400",
            },
            {
              id: "windows" as PlatformCategory,
              label: "Windows Server",
              sub: "PowerShell, AD & WSUS MCPs",
              icon: Monitor,
              color: "text-violet-400",
            },
            {
              id: "network" as PlatformCategory,
              label: "Switches, FW & Printers",
              sub: "VLANs, VPN, SNMP & IPP MCPs",
              icon: Router,
              color: "text-amber-400",
            },
            {
              id: "virtualization" as PlatformCategory,
              label: "Proxmox, VM & Storage",
              sub: "PVE, VMware, TrueNAS ZFS & Ceph",
              icon: HardDrive,
              color: "text-fuchsia-400",
            },
            {
              id: "databases" as PlatformCategory,
              label: "Databases & Caches",
              sub: "Postgres, MySQL, Redis & PITR",
              icon: Database,
              color: "text-blue-400",
            },
            {
              id: "identity_proxy" as PlatformCategory,
              label: "SSO, Proxy & SSL/PKI",
              sub: "Zoraxy/Traefik, Authentik & WAF",
              icon: ShieldCheck,
              color: "text-rose-400",
            },
            {
              id: "observability" as PlatformCategory,
              label: "Observability & SIEM",
              sub: "Prometheus, Loki, Wazuh & Cron",
              icon: Activity,
              color: "text-teal-400",
            },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = platform === tab.id;
          const catPlugins = (mcpPlugins || []).filter((p) => p.category === tab.id);
          const catEnabled = catPlugins.filter((p) => p.enabled).length;
          return (
            <button
              key={tab.id}
              onClick={() => setPlatform(tab.id)}
              className={`text-left p-3 rounded-xl border transition-all ${
                isActive
                  ? "bg-slate-900/95 border-indigo-500/60 shadow-lg shadow-indigo-950/30 ring-1 ring-indigo-500/40"
                  : "bg-slate-900/50 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/80"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-slate-800/90 border border-slate-700/60">
                    <Icon className={`w-3.5 h-3.5 ${tab.color}`} />
                  </div>
                  <span className="font-semibold text-xs text-slate-100">{tab.label}</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {catEnabled}/{catPlugins.length}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 line-clamp-1">{tab.sub}</p>
            </button>
          );
        })}
      </div>

      {/* Hero Header + Target Host Picker + AI Quick Prompts */}
      <div className={`p-5 rounded-xl bg-gradient-to-r ${meta.accent} border`}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-white">{meta.title}</h2>
              <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${meta.badgeBg}`}>
                {enabledCount} Active MCP Plugins
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-3xl">{meta.subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={selectedHostId}
              onChange={(e) => setSelectedHostId(e.target.value)}
              className="bg-slate-950/90 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {candidateHosts.length === 0 ? (
                <option value="">No {platform} systems registered</option>
              ) : (
                candidateHosts.map((h) => (
                  <option key={h.id} value={h.id}>
                    Target: {h.hostname} ({h.ip_address}) [{h.os_type} • {h.status}]
                  </option>
                ))
              )}
            </select>

            <button
              onClick={() => fetchLiveInspection(platform, selectedHostId)}
              disabled={loadingInspect}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-medium"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingInspect ? "animate-spin" : ""}`} />
              Refresh Telemetry
            </button>
          </div>
        </div>

        {/* 1-Click AI Operations Bar */}
        <div className="mt-4 pt-3.5 border-t border-white/10">
          <div className="text-[11px] uppercase tracking-wider text-slate-300 font-semibold mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            1-Click AI Agent Prompts for {platform.toUpperCase()} ({activeHostName})
          </div>
          <div className="flex flex-wrap gap-2">
            {meta.quickPrompts.map((qp, idx) => (
              <button
                key={idx}
                onClick={() => onLaunchAIPrompt(qp.prompt, `@${activeHostName}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950/80 hover:bg-indigo-600/30 border border-slate-700/80 hover:border-indigo-400/60 text-xs text-slate-200 transition-colors"
              >
                <Sparkles className="w-3 h-3 text-indigo-400" />
                {qp.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Section 1: Curated MCP Plugins Marketplace for Selected Platform */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <PlugZap className="w-4 h-4 text-indigo-400" />
              Installable {meta.title} MCP Plugins ({filteredPlugins.length})
            </h3>
            <p className="text-xs text-slate-400">
              Enable plugins to expose specialized tools directly to Claude, Gemini, OpenAI, Grok, DeepSeek, Ollama, and external `/mcp` clients.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredPlugins.map((plugin) => {
            const def = plugin.definition || {};
            const capabilities: string[] = def.capabilities || [];
            const templates: string[] = def.ai_prompt_templates || [];
            const isToggling = togglingSlug === plugin.slug;
            return (
              <div
                key={plugin.slug}
                className={`rounded-xl border p-4 flex flex-col justify-between transition-all ${
                  plugin.enabled
                    ? "bg-slate-900/90 border-indigo-500/40 shadow-md shadow-indigo-950/20"
                    : "bg-slate-900/40 border-slate-800/80"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-sm text-slate-100">{plugin.name}</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-medium">
                          {plugin.badge}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {plugin.package_name} &bull; v{plugin.version}
                      </div>
                    </div>

                    <button
                      onClick={() => handleTogglePlugin(plugin)}
                      disabled={isToggling}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors shrink-0 ${
                        plugin.enabled
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25"
                          : "bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500"
                      }`}
                    >
                      {isToggling ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : plugin.enabled ? (
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Enabled
                        </span>
                      ) : (
                        "Install / Enable"
                      )}
                    </button>
                  </div>

                  <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">{plugin.description}</p>

                  {/* MCP Tools Exposed */}
                  <div className="mt-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
                      MCP Tools ({capabilities.length})
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {capabilities.map((cap) => (
                        <span
                          key={cap}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800"
                        >
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => copyMcpConfig(plugin)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 border border-slate-700"
                      title="Copy mcpServers JSON config"
                    >
                      <ClipboardCopy className="w-3 h-3" />
                      {copiedSlug === plugin.slug ? "Copied JSON!" : "MCP JSON"}
                    </button>
                    <button
                      onClick={() => setConfigModalPlugin(plugin)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 border border-slate-700"
                    >
                      <Terminal className="w-3 h-3" />
                      CLI Setup
                    </button>
                  </div>

                  {templates[0] && (
                    <button
                      onClick={() => onLaunchAIPrompt(templates[0], `@${activeHostName}`)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium"
                    >
                      <Sparkles className="w-3 h-3" />
                      Try with AI
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: Live Platform Control & Interactive Telemetry */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Wrench className="w-4 h-4 text-emerald-400" />
              Live {platform.toUpperCase()} Telemetry & Quick Actions{" "}
              {inspectData?.host ? `— ${inspectData.host.hostname} (${inspectData.host.ip_address})` : ""}
            </h3>
            <p className="text-xs text-slate-400">
              Direct real-time state collected from the target host or network appliance.
            </p>
          </div>

          {/* Quick Action Input + Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={actionTarget}
              onChange={(e) => setActionTarget(e.target.value)}
              placeholder={
                platform === "kubernetes"
                  ? "namespace/pod or namespace/deployment"
                  : platform === "docker"
                  ? "container name or ID"
                  : platform === "linux"
                  ? "systemd unit (e.g. ssh.service)"
                  : platform === "windows"
                  ? "Windows service name (e.g. WinRM)"
                  : platform === "identity_proxy"
                  ? "hostname:443 for TLS probe"
                  : "Target IP, pool, or service"
              }
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 w-56"
            />
            {platform === "kubernetes" && (
              <>
                <button
                  onClick={() => handleRunPlatformAction("k8s_pod_logs")}
                  disabled={runningAction || !actionTarget}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 disabled:opacity-50"
                >
                  Pod Logs
                </button>
                <button
                  onClick={() => handleRunPlatformAction("k8s_restart_deployment")}
                  disabled={runningAction || !actionTarget}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-xs text-amber-300 border border-amber-500/40 disabled:opacity-50"
                >
                  Rollout Restart
                </button>
                <button
                  onClick={() => handleRunPlatformAction("k8s_top_pods", "")}
                  disabled={runningAction}
                  className="px-2.5 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-xs text-indigo-300 border border-indigo-500/40"
                >
                  kubectl top
                </button>
              </>
            )}
            {platform === "docker" && (
              <>
                <button
                  onClick={() => handleRunPlatformAction("docker_container_logs")}
                  disabled={runningAction || !actionTarget}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 disabled:opacity-50"
                >
                  Container Logs
                </button>
                <button
                  onClick={() => handleRunPlatformAction("docker_restart_container")}
                  disabled={runningAction || !actionTarget}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-xs text-amber-300 border border-amber-500/40 disabled:opacity-50"
                >
                  Restart Container
                </button>
                <button
                  onClick={() => handleRunPlatformAction("docker_prune_images", "")}
                  disabled={runningAction}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-xs text-rose-300 border border-rose-500/40"
                >
                  Prune Dangling Images
                </button>
              </>
            )}
            {platform === "linux" && (
              <>
                <button
                  onClick={() => handleRunPlatformAction("linux_service_logs")}
                  disabled={runningAction || !actionTarget}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 disabled:opacity-50"
                >
                  Journalctl Logs
                </button>
                <button
                  onClick={() => handleRunPlatformAction("linux_restart_service")}
                  disabled={runningAction || !actionTarget}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-xs text-amber-300 border border-amber-500/40 disabled:opacity-50"
                >
                  Restart Service
                </button>
                <button
                  onClick={() => handleRunPlatformAction("linux_check_updates", "")}
                  disabled={runningAction}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-xs text-emerald-300 border border-emerald-500/40"
                >
                  Check Pending Updates
                </button>
              </>
            )}
            {platform === "windows" && (
              <>
                <button
                  onClick={() => handleRunPlatformAction("windows_restart_service")}
                  disabled={runningAction || !actionTarget}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-xs text-amber-300 border border-amber-500/40 disabled:opacity-50"
                >
                  Restart Service
                </button>
                <button
                  onClick={() => handleRunPlatformAction("windows_defender_status", "")}
                  disabled={runningAction}
                  className="px-2.5 py-1.5 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-xs text-violet-300 border border-violet-500/40"
                >
                  Defender Status
                </button>
              </>
            )}
            {platform === "network" && (
              <>
                <button
                  onClick={() => handleRunPlatformAction("network_backup_config", "")}
                  disabled={runningAction}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-xs text-amber-300 border border-amber-500/40"
                >
                  Snapshot Config & Routes
                </button>
                <button
                  onClick={() => handleRunPlatformAction("network_printer_status")}
                  disabled={runningAction}
                  className="px-2.5 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-xs text-indigo-300 border border-indigo-500/40"
                >
                  Probe Printer (IPP / JetDirect)
                </button>
                <button
                  onClick={() => handleRunPlatformAction("network_ping_trace")}
                  disabled={runningAction}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700"
                >
                  Ping & Route Trace
                </button>
              </>
            )}
            {platform === "virtualization" && (
              <>
                <button
                  onClick={() => handleRunPlatformAction("virt_smart_health", "")}
                  disabled={runningAction}
                  className="px-2.5 py-1.5 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-xs text-fuchsia-300 border border-fuchsia-500/40"
                >
                  SMART & Disk Health
                </button>
                <button
                  onClick={() => handleRunPlatformAction("virt_storage_pools", "")}
                  disabled={runningAction}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700"
                >
                  ZFS / LVM Pool Usage
                </button>
              </>
            )}
            {platform === "databases" && (
              <>
                <button
                  onClick={() => handleRunPlatformAction("db_connection_summary", "")}
                  disabled={runningAction}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-xs text-blue-300 border border-blue-500/40"
                >
                  Active Connections
                </button>
                <button
                  onClick={() => handleRunPlatformAction("db_verify_backups", "")}
                  disabled={runningAction}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-xs text-emerald-300 border border-emerald-500/40"
                >
                  Verify Backup Archives
                </button>
              </>
            )}
            {platform === "identity_proxy" && (
              <>
                <button
                  onClick={() => handleRunPlatformAction("tls_probe_cert")}
                  disabled={runningAction}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-xs text-rose-300 border border-rose-500/40"
                >
                  Inspect X.509 TLS Cert
                </button>
                <button
                  onClick={() => handleRunPlatformAction("proxy_test_config", "")}
                  disabled={runningAction}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700"
                >
                  Test Proxy Config
                </button>
              </>
            )}
            {platform === "observability" && (
              <>
                <button
                  onClick={() => handleRunPlatformAction("obs_error_digest", "")}
                  disabled={runningAction}
                  className="px-2.5 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-xs text-teal-300 border border-teal-500/40"
                >
                  24h Error Log Digest
                </button>
                <button
                  onClick={() => handleRunPlatformAction("obs_cron_audit", "")}
                  disabled={runningAction}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700"
                >
                  Audit Cron & Timers
                </button>
              </>
            )}
          </div>
        </div>

        {actionOutput && (
          <div className="rounded-lg bg-slate-950 border border-indigo-500/40 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-indigo-300">Action Execution Output</span>
              <button onClick={() => setActionOutput(null)} className="text-xs text-slate-400 hover:text-white">
                Clear
              </button>
            </div>
            <pre className="text-xs font-mono text-slate-200 overflow-x-auto max-h-64 whitespace-pre-wrap">
              {actionOutput}
            </pre>
          </div>
        )}

        {loadingInspect ? (
          <div className="py-12 flex items-center justify-center gap-2 text-slate-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
            Collecting live {platform} telemetry from target system...
          </div>
        ) : inspectData?.sections && Object.keys(inspectData.sections).length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Object.entries<string>(inspectData.sections).map(([secKey, secContent]) => (
              <div key={secKey} className="rounded-lg bg-slate-950/90 border border-slate-800 p-3.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2 flex items-center justify-between">
                  <span>{secKey.replace(/_/g, " ")}</span>
                  <span className="text-[10px] font-mono text-slate-500">{inspectData?.host?.hostname}</span>
                </div>
                <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto max-h-64 whitespace-pre">
                  {secContent || "(None / Healthy)"}
                </pre>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">
            {inspectData?.summary || "Select an online system above to inspect live platform telemetry."}
          </div>
        )}
      </div>

      {/* Modal for MCP Plugin CLI & JSON Config */}
      {configModalPlugin && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-white text-base">{configModalPlugin.name} — MCP Setup</h4>
              <button
                onClick={() => setConfigModalPlugin(null)}
                className="text-xs text-slate-400 hover:text-white px-2 py-1"
              >
                Close
              </button>
            </div>
            <p className="text-xs text-slate-300">{configModalPlugin.description}</p>
            <div>
              <div className="text-xs font-semibold text-slate-300 mb-1">1. Standalone CLI Launch Command</div>
              <pre className="p-2.5 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto">
                {configModalPlugin.definition?.install_command || `npx -y ${configModalPlugin.package_name}`}
              </pre>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-300 mb-1">
                2. Claude Code / Claude Desktop / Gemini CLI `mcpServers` Config
              </div>
              <pre className="p-2.5 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 overflow-x-auto">
                {JSON.stringify(
                  {
                    mcpServers: {
                      [configModalPlugin.slug]: configModalPlugin.definition?.mcp_config || {
                        command: "npx",
                        args: ["-y", configModalPlugin.package_name],
                      },
                    },
                  },
                  null,
                  2
                )}
              </pre>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => copyMcpConfig(configModalPlugin)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-medium"
              >
                Copy JSON Config
              </button>
              <button
                onClick={() => setConfigModalPlugin(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
