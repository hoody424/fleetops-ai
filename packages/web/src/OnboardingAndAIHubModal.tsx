import React, { useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Compass,
  Copy,
  Cpu,
  Eye,
  EyeOff,
  FolderKey,
  Globe,
  Key,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  Network,
  Plus,
  PlusCircle,
  Radar,
  Router,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Wand2,
  X,
} from "lucide-react";

export interface SnmpCommunityOption {
  id: string;
  name: string;
  community: string;
  version: "v2c" | "v1" | "v3";
  port: number;
  access: "ro" | "rw";
  isPrimary?: boolean;
  secName?: string;
  authProtocol?: "SHA" | "MD5" | "SHA-256";
  authPassword?: string;
  privProtocol?: "AES" | "DES" | "AES-256";
  privPassword?: string;
}

export interface LinuxCredentialOption {
  id: string;
  name: string;
  username: string;
  authType: "password" | "key" | "key_and_sudo" | "password_and_sudo";
  password?: string;
  privateKey?: string;
  passphrase?: string;
  sudoPassword?: string;
  sshPort: number;
  elevationMode: "root" | "sudo" | "sudo_nopasswd" | "doas" | "su";
  isPrimary?: boolean;
}

export interface WindowsCredentialOption {
  id: string;
  name: string;
  username: string;
  password?: string;
  domain?: string;
  protocol: "winrm_https" | "winrm_http" | "rdp" | "ssh";
  port: number;
  isPrimary?: boolean;
}

export interface NetworkCredentialOption {
  id: string;
  name: string;
  username: string;
  authType: "ssh" | "api_token" | "telnet";
  password?: string;
  apiToken?: string;
  enableSecret?: string;
  port: number;
  isPrimary?: boolean;
}

interface OnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  envProfile: any;
  aiProviders: any[];
  onSaved: () => void;
}

export const OnboardingWizardModal: React.FC<OnboardingWizardProps> = ({
  isOpen,
  onClose,
  envProfile,
  aiProviders,
  onSaved,
}) => {
  const [step, setStep] = useState<number>(1);
  const [saving, setSaving] = useState(false);

  // Step 1: Environment & Subnets
  const [orgName, setOrgName] = useState(envProfile?.org_name || "Enterprise Infrastructure Fleet");
  const [primarySite, setPrimarySite] = useState(envProfile?.primary_site || "Main Datacenter");
  const [subnetsText, setSubnetsText] = useState(
    Array.isArray(envProfile?.subnets) ? envProfile.subnets.join(", ") : "192.168.1.0/24, 10.10.20.0/24"
  );
  const [enabledPlatforms, setEnabledPlatforms] = useState<string[]>(
    Array.isArray(envProfile?.enabled_platforms)
      ? envProfile.enabled_platforms
      : [
          "kubernetes",
          "docker",
          "linux",
          "windows",
          "network",
          "virtualization",
          "databases",
          "identity_proxy",
          "observability",
        ]
  );
  const [scanSubnetInput, setScanSubnetInput] = useState("127.0.0.1");
  const [scanningSubnet, setScanningSubnet] = useState(false);
  const [discoveredNodes, setDiscoveredNodes] = useState<any[]>([]);

  // Step 2: System Credentials, Linux SSH Options & SNMP Communities
  const [activeCredTab, setActiveCredTab] = useState<"linux" | "windows" | "network" | "snmp" | "all">("linux");
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  const toggleShowPassword = (key: string) => {
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Linux Credential Options
  const [linuxCredentials, setLinuxCredentials] = useState<LinuxCredentialOption[]>([
    {
      id: "linux-1",
      name: "Default Linux Root SSH",
      username: "root",
      authType: "password",
      password: "",
      privateKey: "",
      passphrase: "",
      sudoPassword: "",
      sshPort: 22,
      elevationMode: "root",
      isPrimary: true,
    },
  ]);

  // Windows Credential Options
  const [windowsCredentials, setWindowsCredentials] = useState<WindowsCredentialOption[]>([
    {
      id: "win-1",
      name: "Default Windows Server Admin",
      username: "Administrator",
      password: "",
      domain: "",
      protocol: "winrm_https",
      port: 5986,
      isPrimary: true,
    },
  ]);

  // Switch & Firewall Network Credential Options
  const [networkCredentials, setNetworkCredentials] = useState<NetworkCredentialOption[]>([
    {
      id: "net-1",
      name: "Default Switch / Firewall Admin",
      username: "admin",
      authType: "ssh",
      password: "",
      enableSecret: "",
      apiToken: "",
      port: 22,
      isPrimary: true,
    },
  ]);

  // Multiple SNMP Communities
  const [snmpCommunities, setSnmpCommunities] = useState<SnmpCommunityOption[]>([
    {
      id: "snmp-1",
      name: "Public (Standard Read-Only)",
      community: "public",
      version: "v2c",
      port: 161,
      access: "ro",
      isPrimary: true,
    },
    {
      id: "snmp-2",
      name: "Printer-MIB Fleet",
      community: "printers",
      version: "v2c",
      port: 161,
      access: "ro",
      isPrimary: false,
    },
  ]);
  const [bulkSnmpInput, setBulkSnmpInput] = useState("");

  // Helpers for Linux Credentials
  const addLinuxProfile = (preset?: Partial<LinuxCredentialOption>) => {
    const id = `linux-${Date.now()}`;
    const newProfile: LinuxCredentialOption = {
      id,
      name: preset?.name || `Linux Profile ${linuxCredentials.length + 1}`,
      username: preset?.username || "root",
      authType: preset?.authType || "password",
      password: preset?.password || "",
      privateKey: preset?.privateKey || "",
      passphrase: preset?.passphrase || "",
      sudoPassword: preset?.sudoPassword || "",
      sshPort: preset?.sshPort || 22,
      elevationMode: preset?.elevationMode || (preset?.username === "root" ? "root" : "sudo"),
      isPrimary: false,
    };
    setLinuxCredentials((prev) => [...prev, newProfile]);
  };

  const updateLinuxProfile = (id: string, updates: Partial<LinuxCredentialOption>) => {
    setLinuxCredentials((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const deleteLinuxProfile = (id: string) => {
    if (linuxCredentials.length <= 1) return;
    setLinuxCredentials((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      if (!filtered.some((p) => p.isPrimary)) filtered[0].isPrimary = true;
      return filtered;
    });
  };

  const setPrimaryLinuxProfile = (id: string) => {
    setLinuxCredentials((prev) => prev.map((p) => ({ ...p, isPrimary: p.id === id })));
  };

  // Helpers for Windows Credentials
  const addWindowsProfile = (preset?: Partial<WindowsCredentialOption>) => {
    const id = `win-${Date.now()}`;
    const newProfile: WindowsCredentialOption = {
      id,
      name: preset?.name || `Windows Profile ${windowsCredentials.length + 1}`,
      username: preset?.username || "Administrator",
      password: preset?.password || "",
      domain: preset?.domain || "",
      protocol: preset?.protocol || "winrm_https",
      port: preset?.port || (preset?.protocol === "rdp" ? 3389 : preset?.protocol === "ssh" ? 22 : 5986),
      isPrimary: false,
    };
    setWindowsCredentials((prev) => [...prev, newProfile]);
  };

  const updateWindowsProfile = (id: string, updates: Partial<WindowsCredentialOption>) => {
    setWindowsCredentials((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const deleteWindowsProfile = (id: string) => {
    if (windowsCredentials.length <= 1) return;
    setWindowsCredentials((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      if (!filtered.some((p) => p.isPrimary)) filtered[0].isPrimary = true;
      return filtered;
    });
  };

  const setPrimaryWindowsProfile = (id: string) => {
    setWindowsCredentials((prev) => prev.map((p) => ({ ...p, isPrimary: p.id === id })));
  };

  // Helpers for Network Credentials
  const addNetworkProfile = (preset?: Partial<NetworkCredentialOption>) => {
    const id = `net-${Date.now()}`;
    const newProfile: NetworkCredentialOption = {
      id,
      name: preset?.name || `Network Profile ${networkCredentials.length + 1}`,
      username: preset?.username || "admin",
      authType: preset?.authType || "ssh",
      password: preset?.password || "",
      enableSecret: preset?.enableSecret || "",
      apiToken: preset?.apiToken || "",
      port: preset?.port || (preset?.authType === "api_token" ? 443 : 22),
      isPrimary: false,
    };
    setNetworkCredentials((prev) => [...prev, newProfile]);
  };

  const updateNetworkProfile = (id: string, updates: Partial<NetworkCredentialOption>) => {
    setNetworkCredentials((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const deleteNetworkProfile = (id: string) => {
    if (networkCredentials.length <= 1) return;
    setNetworkCredentials((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      if (!filtered.some((p) => p.isPrimary)) filtered[0].isPrimary = true;
      return filtered;
    });
  };

  const setPrimaryNetworkProfile = (id: string) => {
    setNetworkCredentials((prev) => prev.map((p) => ({ ...p, isPrimary: p.id === id })));
  };

  // Helpers for SNMP Communities
  const addSnmpCommunity = (preset?: Partial<SnmpCommunityOption>) => {
    const id = `snmp-${Date.now()}`;
    const newComm: SnmpCommunityOption = {
      id,
      name: preset?.name || `Community ${snmpCommunities.length + 1}`,
      community: preset?.community || "public",
      version: preset?.version || "v2c",
      port: preset?.port || 161,
      access: preset?.access || "ro",
      secName: preset?.secName || "",
      authProtocol: preset?.authProtocol || "SHA",
      authPassword: preset?.authPassword || "",
      privProtocol: preset?.privProtocol || "AES",
      privPassword: preset?.privPassword || "",
      isPrimary: false,
    };
    setSnmpCommunities((prev) => [...prev, newComm]);
  };

  const updateSnmpCommunity = (id: string, updates: Partial<SnmpCommunityOption>) => {
    setSnmpCommunities((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const deleteSnmpCommunity = (id: string) => {
    if (snmpCommunities.length <= 1) return;
    setSnmpCommunities((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      if (!filtered.some((c) => c.isPrimary)) filtered[0].isPrimary = true;
      return filtered;
    });
  };

  const setPrimarySnmpCommunity = (id: string) => {
    setSnmpCommunities((prev) => prev.map((c) => ({ ...c, isPrimary: c.id === id })));
  };

  const handleBulkAddSnmp = () => {
    if (!bulkSnmpInput.trim()) return;
    const parts = bulkSnmpInput
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const existing = new Set(snmpCommunities.map((c) => c.community.toLowerCase()));
    const toAdd: SnmpCommunityOption[] = [];
    parts.forEach((p, idx) => {
      if (!existing.has(p.toLowerCase())) {
        existing.add(p.toLowerCase());
        toAdd.push({
          id: `snmp-${Date.now()}-${idx}`,
          name: `${p.toUpperCase()} Community`,
          community: p,
          version: "v2c",
          port: 161,
          access: "ro",
          isPrimary: false,
        });
      }
    });
    if (toAdd.length > 0) {
      setSnmpCommunities((prev) => [...prev, ...toAdd]);
      setBulkSnmpInput("");
    }
  };

  // Step 3: Default AI Provider & Fallback
  const [defaultAiProvider, setDefaultAiProvider] = useState(envProfile?.default_ai_provider || "claude-sub");
  const [defaultAiModel, setDefaultAiModel] = useState(envProfile?.default_ai_model || "claude-sonnet-4-6");
  const [fallbackAiProvider, setFallbackAiProvider] = useState(envProfile?.fallback_ai_provider || "local-llm");
  const [quickApiKeyProvider, setQuickApiKeyProvider] = useState("openai-api");
  const [quickApiKeyValue, setQuickApiKeyValue] = useState("");
  const [quickBaseUrl, setQuickBaseUrl] = useState("");

  // Step 4: Agent Decision & Governance Policy
  const [agentDecisionMode, setAgentDecisionMode] = useState<string>(
    envProfile?.agent_decision_mode || "supervised"
  );
  const [autoAppendRules, setAutoAppendRules] = useState<boolean>(
    envProfile?.auto_append_rules !== undefined ? Boolean(envProfile.auto_append_rules) : true
  );
  const [autoOnboardDiscovered, setAutoOnboardDiscovered] = useState<boolean>(
    Boolean(envProfile?.auto_onboard_discovered)
  );
  const [requireApprovalRestarts, setRequireApprovalRestarts] = useState<boolean>(
    envProfile?.require_approval_restarts !== undefined ? Boolean(envProfile.require_approval_restarts) : true
  );
  const [requireApprovalFirewall, setRequireApprovalFirewall] = useState<boolean>(
    envProfile?.require_approval_firewall !== undefined ? Boolean(envProfile.require_approval_firewall) : true
  );
  const [mandatoryConfigSnapshots, setMandatoryConfigSnapshots] = useState<boolean>(true);
  const [applyDecisionModeToFleet, setApplyDecisionModeToFleet] = useState<boolean>(true);

  // Step 5: Automation Schedules, ChatOps Notifications, SSO & GitOps (Rundeck / Teleport / NetBox parity)
  const [slackTeamsWebhook, setSlackTeamsWebhook] = useState<string>(
    envProfile?.governance_policy?.slackTeamsWebhook || ""
  );
  const [ntfyPagerdutyUrl, setNtfyPagerdutyUrl] = useState<string>(
    envProfile?.governance_policy?.ntfyPagerdutyUrl || ""
  );
  const [oidcIssuerUrl, setOidcIssuerUrl] = useState<string>(
    envProfile?.governance_policy?.oidcIssuerUrl || ""
  );
  const [gitopsBackupRepo, setGitopsBackupRepo] = useState<string>(
    envProfile?.governance_policy?.gitopsBackupRepo || ""
  );
  const [auditRetentionDays, setAuditRetentionDays] = useState<number>(
    envProfile?.governance_policy?.auditRetentionDays || 90
  );
  const [scheduledRunbooks, setScheduledRunbooks] = useState<Record<string, boolean>>({
    nightlySecuritySweep: true,
    nightlyGitopsSnapshot: true,
    weeklyTlsCertAudit: true,
    weeklyStorageAndPrinterReport: true,
  });

  useEffect(() => {
    if (envProfile) {
      setOrgName(envProfile.org_name || "Enterprise Infrastructure Fleet");
      setPrimarySite(envProfile.primary_site || "Main Datacenter");
      if (Array.isArray(envProfile.subnets)) setSubnetsText(envProfile.subnets.join(", "));
      if (Array.isArray(envProfile.enabled_platforms)) setEnabledPlatforms(envProfile.enabled_platforms);
      if (envProfile.agent_decision_mode) setAgentDecisionMode(envProfile.agent_decision_mode);
      if (envProfile.default_ai_provider) setDefaultAiProvider(envProfile.default_ai_provider);
      if (envProfile.default_ai_model) setDefaultAiModel(envProfile.default_ai_model);

      if (Array.isArray(envProfile.snmp_communities) && envProfile.snmp_communities.length > 0) {
        setSnmpCommunities(envProfile.snmp_communities);
      } else if (envProfile.snmp_community) {
        setSnmpCommunities([
          {
            id: "snmp-1",
            name: "Primary Community",
            community: envProfile.snmp_community,
            version: "v2c",
            port: 161,
            access: "ro",
            isPrimary: true,
          },
        ]);
      }

      if (envProfile.credential_presets) {
        const cp = envProfile.credential_presets;
        if (Array.isArray(cp.linuxCredentials) && cp.linuxCredentials.length > 0) {
          setLinuxCredentials(cp.linuxCredentials);
        }
        if (Array.isArray(cp.windowsCredentials) && cp.windowsCredentials.length > 0) {
          setWindowsCredentials(cp.windowsCredentials);
        }
        if (Array.isArray(cp.networkCredentials) && cp.networkCredentials.length > 0) {
          setNetworkCredentials(cp.networkCredentials);
        }
      }
    }
  }, [envProfile]);

  if (!isOpen) return null;

  const togglePlatform = (plat: string) => {
    setEnabledPlatforms((prev) => (prev.includes(plat) ? prev.filter((p) => p !== plat) : [...prev, plat]));
  };

  const handleRunDiscovery = async (targetRange?: string) => {
    setScanningSubnet(true);
    try {
      const rangeToUse = targetRange || scanSubnetInput || subnetsText.split(",")[0]?.trim() || "10.20.99.0/24";
      const r = await fetch("/api/onboarding/discover-subnet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subnetOrRange: rangeToUse, autoOnboard: autoOnboardDiscovered }),
      });
      const d = await r.json();
      setDiscoveredNodes(d.discovered || []);
      if (autoOnboardDiscovered) onSaved();
    } finally {
      setScanningSubnet(false);
    }
  };

  const handleOnboardDiscoveredNode = async (node: any) => {
    const primaryLinux = linuxCredentials.find((c) => c.isPrimary) || linuxCredentials[0];
    const primaryWin = windowsCredentials.find((c) => c.isPrimary) || windowsCredentials[0];
    await fetch("/api/hosts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hostname: node.hostname || `node-${node.ip.replace(/\./g, "-")}`,
        ipAddress: node.ip,
        sshPort: node.openPorts.includes(2002)
          ? 2002
          : node.openPorts.includes(primaryLinux?.sshPort || 22)
          ? primaryLinux?.sshPort || 22
          : node.openPorts[0] || 22,
        sshUser: node.osType === "windows" ? (primaryWin?.username || "Administrator") : (primaryLinux?.username || "root"),
        osType: node.osType,
        osInfo: node.detectedType,
        groupName: node.suggestedGroup,
        siteName: primarySite,
        safetyTier: agentDecisionMode === "readonly" ? "readonly" : "supervised",
      }),
    });
    onSaved();
  };

  const handleSaveQuickProviderKey = async () => {
    if (!quickApiKeyValue && !quickBaseUrl) return;
    await fetch(`/api/ai/providers/${quickApiKeyProvider}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: quickApiKeyValue || undefined,
        baseUrl: quickBaseUrl || undefined,
        enabled: true,
      }),
    });
    setQuickApiKeyValue("");
    onSaved();
  };

  const handleCompleteWizard = async () => {
    setSaving(true);
    try {
      const subnets = subnetsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const primaryLinux = linuxCredentials.find((c) => c.isPrimary) || linuxCredentials[0];
      const primaryWin = windowsCredentials.find((c) => c.isPrimary) || windowsCredentials[0];
      const primaryNet = networkCredentials.find((c) => c.isPrimary) || networkCredentials[0];
      const primarySnmp = snmpCommunities.find((c) => c.isPrimary) || snmpCommunities[0];

      await fetch("/api/onboarding/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgName,
          primarySite,
          subnets,
          enabledPlatforms,
          agentDecisionMode,
          autoAppendRules,
          autoOnboardDiscovered,
          requireApprovalRestarts,
          requireApprovalFirewall,
          mandatoryConfigSnapshots,
          defaultAiProvider,
          defaultAiModel,
          fallbackAiProvider,
          snmpCommunity: primarySnmp?.community || "public",
          snmpCommunities,
          defaultLinuxUser: primaryLinux?.username || "root",
          defaultLinuxPassword: primaryLinux?.password || "",
          defaultWindowsUser: primaryWin?.username || "Administrator",
          defaultWindowsPassword: primaryWin?.password || "",
          defaultNetworkUser: primaryNet?.username || "admin",
          defaultNetworkPassword: primaryNet?.password || primaryNet?.apiToken || "",
          linuxCredentials,
          windowsCredentials,
          networkCredentials,
          credentialPresets: {
            linuxCredentials,
            windowsCredentials,
            networkCredentials,
            snmpCommunities,
          },
          applyDecisionModeToFleet,
          slackTeamsWebhook,
          ntfyPagerdutyUrl,
          oidcIssuerUrl,
          gitopsBackupRepo,
          auditRetentionDays,
          scheduledRunbooks,
        }),
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl shadow-indigo-950/50 overflow-hidden">
        {/* Top Wizard Header */}
        <div className="p-5 bg-gradient-to-r from-indigo-950/80 via-slate-900 to-violet-950/60 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Environment Discovery, Credentials & AI Governance Setup Wizard
              </h2>
              <p className="text-xs text-slate-300">
                Configure your networks, system credentials, connected AI brains, and how autonomous agents make decisions.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Bar */}
        <div className="px-6 py-3 bg-slate-950/90 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { n: 1, title: "1. Environment & Subnets", sub: "Sites, VLANs & 9 Hubs" },
            { n: 2, title: "2. System Credentials", sub: "SSH, Windows, Switch & SNMP" },
            { n: 3, title: "3. Connect All AIs", sub: "12 Cloud, CLI & Local Brains" },
            { n: 4, title: "4. Agent Governance", sub: "Approvals vs Auto-Append" },
            { n: 5, title: "5. Schedules, SSO & ChatOps", sub: "Cron, Webhooks & GitOps" },
          ].map((s) => (
            <button
              key={s.n}
              onClick={() => setStep(s.n)}
              className={`text-left p-2.5 rounded-xl border transition ${
                step === s.n
                  ? "bg-indigo-600/20 border-indigo-500 text-white"
                  : step > s.n
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-slate-900/60 border-slate-800 text-slate-400"
              }`}
            >
              <div className="text-xs font-bold">{s.title}</div>
              <div className="text-[10px] opacity-80">{s.sub}</div>
            </button>
          ))}
        </div>

        {/* Step Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {step === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Organization / Fleet Name
                  </label>
                  <input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Primary Datacenter / Site Name
                  </label>
                  <input
                    value={primarySite}
                    onChange={(e) => setPrimarySite(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Managed Subnets / VLAN CIDRs (comma-separated)
                </label>
                <input
                  value={subnetsText}
                  onChange={(e) => setSubnetsText(e.target.value)}
                  placeholder="192.168.1.0/24, 10.10.20.0/24, 192.168.50.0/24"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Active Infrastructure Platforms in Your Environment (9 Specialized Hubs)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: "kubernetes", label: "Kubernetes / K3s Clusters" },
                    { id: "docker", label: "Docker & Compose Hosts" },
                    { id: "linux", label: "Linux Server Fleet" },
                    { id: "windows", label: "Windows Server & AD" },
                    { id: "network", label: "Switches, Firewalls & Printers" },
                    { id: "virtualization", label: "Proxmox, VMware & ZFS NAS" },
                    { id: "databases", label: "Postgres, MySQL & Redis DBs" },
                    { id: "identity_proxy", label: "SSO, Reverse Proxy & SSL/PKI" },
                    { id: "observability", label: "Prometheus, Loki & Wazuh SIEM" },
                  ].map((p) => {
                    const active = enabledPlatforms.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePlatform(p.id)}
                        className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition ${
                          active
                            ? "bg-indigo-600/20 border-indigo-500 text-white"
                            : "bg-slate-950 border-slate-800 text-slate-400"
                        }`}
                      >
                        <span>{p.label}</span>
                        {active && <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live Subnet / IP Discovery Scanner */}
              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Radar className="w-4 h-4 text-emerald-400" />
                      Live Network & Appliance Auto-Discovery Probe
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Probes TCP ports for SSH (:22), K8s (:6443), Windows RDP/WinRM (:3389/:5985), Firewalls/Switches (:443/:8443), and Network Printers (:9100 JetDirect / :631 IPP).
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    value={scanSubnetInput}
                    onChange={(e) => setScanSubnetInput(e.target.value)}
                    placeholder="Enter CIDR (e.g. 192.168.1.0/24) or comma-separated IPs"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                  />
                  <button
                    onClick={handleRunDiscovery}
                    disabled={scanningSubnet}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    {scanningSubnet ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radar className="w-3.5 h-3.5" />}
                    Scan Network
                  </button>
                </div>

                {discoveredNodes.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <div className="text-[11px] font-semibold text-emerald-400">
                      Discovered {discoveredNodes.length} Responsive System(s):
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {discoveredNodes.map((n) => (
                        <div
                          key={n.ip}
                          className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-mono font-bold text-white flex items-center gap-1.5">
                              <span>{n.hostname || n.ip}</span>
                              {n.hostname && n.hostname !== n.ip && (
                                <span className="text-[10px] text-slate-400 font-normal">({n.ip})</span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {n.detectedType} &bull; Ports: {n.openPorts.join(", ")}
                            </div>
                          </div>
                          {n.onboarded ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                              In Fleet
                            </span>
                          ) : (
                            <button
                              onClick={() => handleOnboardDiscoveredNode(n)}
                              className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium"
                            >
                              + Add to Fleet
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-200 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                <div>
                  All credentials entered below are encrypted at rest with <strong>AES-256-GCM</strong> inside the FleetOps Vault.
                  You can configure <strong>multiple SNMP communities</strong> (v1, v2c, v3 USM), <strong>custom Linux SSH credential & sudo escalation options</strong>, Windows OpenSSH/WinRM/RDP targets, and Switch/Firewall CLI profiles for discovery and fleet operations.
                </div>
              </div>

              {/* Category Sub-Tabs Navigation */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setActiveCredTab("linux")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                      activeCredTab === "linux"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    Linux SSH & Sudo
                    <span className="px-1.5 py-0.2 rounded-full bg-slate-900 border border-emerald-500/30 text-[10px] text-emerald-300 font-mono">
                      {linuxCredentials.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveCredTab("windows")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                      activeCredTab === "windows"
                        ? "bg-violet-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Server className="w-3.5 h-3.5" />
                    Windows & WinRM
                    <span className="px-1.5 py-0.2 rounded-full bg-slate-900 border border-violet-500/30 text-[10px] text-violet-300 font-mono">
                      {windowsCredentials.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveCredTab("network")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                      activeCredTab === "network"
                        ? "bg-amber-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Router className="w-3.5 h-3.5" />
                    Switches & Firewalls
                    <span className="px-1.5 py-0.2 rounded-full bg-slate-900 border border-amber-500/30 text-[10px] text-amber-300 font-mono">
                      {networkCredentials.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveCredTab("snmp")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                      activeCredTab === "snmp"
                        ? "bg-cyan-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Network className="w-3.5 h-3.5" />
                    SNMP Communities
                    <span className="px-1.5 py-0.2 rounded-full bg-slate-900 border border-cyan-500/30 text-[10px] text-cyan-300 font-mono">
                      {snmpCommunities.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveCredTab("all")}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                      activeCredTab === "all"
                        ? "bg-slate-800 text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    View All
                  </button>
                </div>
              </div>

              {/* 1. Linux Fleet SSH & Privilege Escalation Section */}
              {(activeCredTab === "linux" || activeCredTab === "all") && (
                <div className="space-y-3 p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <Terminal className="w-4 h-4 text-emerald-400" />
                        Linux Fleet SSH Credential Profiles & Sudo Escalation ({linuxCredentials.length})
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Supports password authentication, SSH private keys (PEM/Ed25519), custom ports, and separate sudo escalation passwords.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          addLinuxProfile({
                            name: "Ansible / Sudo Deployer",
                            username: "ansible",
                            authType: "password_and_sudo",
                            elevationMode: "sudo",
                          })
                        }
                        className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-emerald-300 font-medium"
                      >
                        + Add 'ansible' (sudo)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          addLinuxProfile({
                            name: "SSH Key Profile (Ed25519)",
                            username: "root",
                            authType: "key",
                            elevationMode: "root",
                          })
                        }
                        className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-emerald-300 font-medium"
                      >
                        + Add SSH Key Profile
                      </button>
                      <button
                        type="button"
                        onClick={() => addLinuxProfile()}
                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Profile
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 pt-1">
                    {linuxCredentials.map((p, idx) => {
                      const isPwdVisible = Boolean(showPasswords[`linux-pwd-${p.id}`]);
                      const isSudoVisible = Boolean(showPasswords[`linux-sudo-${p.id}`]);
                      return (
                        <div
                          key={p.id}
                          className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-bold flex items-center justify-center">
                                {idx + 1}
                              </span>
                              <input
                                value={p.name}
                                onChange={(e) => updateLinuxProfile(p.id, { name: e.target.value })}
                                placeholder="Profile Name (e.g. Primary Root, Sudo Deployer)"
                                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-semibold text-white w-56"
                              />
                              {p.isPrimary ? (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                                  ★ Primary Default
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setPrimaryLinuxProfile(p.id)}
                                  className="px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
                                >
                                  Make Primary
                                </button>
                              )}
                            </div>
                            {linuxCredentials.length > 1 && (
                              <button
                                type="button"
                                onClick={() => deleteLinuxProfile(p.id)}
                                className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-slate-800 transition"
                                title="Remove Profile"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Auth Method Pills */}
                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                              Authentication Method:
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                              {[
                                { val: "password", label: "SSH Password", sub: "Standard Password" },
                                { val: "key", label: "SSH Private Key", sub: "PEM / Ed25519 Key" },
                                { val: "password_and_sudo", label: "Password + Sudo", sub: "Login + Sudo Pass" },
                                { val: "key_and_sudo", label: "Key + Sudo", sub: "SSH Key + Sudo Pass" },
                              ].map((m) => (
                                <button
                                  key={m.val}
                                  type="button"
                                  onClick={() => updateLinuxProfile(p.id, { authType: m.val as any })}
                                  className={`p-2 rounded-lg text-left border transition ${
                                    p.authType === m.val
                                      ? "bg-emerald-600/20 border-emerald-500 text-white"
                                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                                  }`}
                                >
                                  <div className="text-xs font-semibold">{m.label}</div>
                                  <div className="text-[10px] opacity-70">{m.sub}</div>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Inputs Row */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[11px] text-slate-400 mb-1">SSH Username</label>
                              <input
                                value={p.username}
                                onChange={(e) => updateLinuxProfile(p.id, { username: e.target.value })}
                                placeholder="root, ansible, ubuntu"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-slate-400 mb-1">SSH Port</label>
                              <input
                                type="number"
                                value={p.sshPort}
                                onChange={(e) =>
                                  updateLinuxProfile(p.id, { sshPort: Number(e.target.value) || 22 })
                                }
                                placeholder="22"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-slate-400 mb-1">Privilege Escalation</label>
                              <select
                                value={p.elevationMode}
                                onChange={(e) =>
                                  updateLinuxProfile(p.id, { elevationMode: e.target.value as any })
                                }
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                              >
                                <option value="root">Direct root (No sudo)</option>
                                <option value="sudo">sudo (Interactive password)</option>
                                <option value="sudo_nopasswd">sudo NOPASSWD</option>
                                <option value="doas">doas</option>
                                <option value="su">su - root</option>
                              </select>
                            </div>
                          </div>

                          {/* Password Field */}
                          {(p.authType === "password" || p.authType === "password_and_sudo") && (
                            <div>
                              <label className="block text-[11px] text-slate-400 mb-1">
                                SSH Login Password
                              </label>
                              <div className="relative">
                                <input
                                  type={isPwdVisible ? "text" : "password"}
                                  value={p.password || ""}
                                  onChange={(e) => updateLinuxProfile(p.id, { password: e.target.value })}
                                  placeholder="Encrypted in AES-256-GCM Vault"
                                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white pr-9"
                                />
                                <button
                                  type="button"
                                  onClick={() => toggleShowPassword(`linux-pwd-${p.id}`)}
                                  className="absolute right-2 top-2 text-slate-400 hover:text-white"
                                >
                                  {isPwdVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Private Key Field */}
                          {(p.authType === "key" || p.authType === "key_and_sudo") && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="block text-[11px] text-slate-400">
                                  SSH Private Key (PEM / OpenSSH format)
                                </label>
                                <span className="text-[10px] text-slate-400">
                                  Saved into Fleet Keystore & Vault
                                </span>
                              </div>
                              <textarea
                                value={p.privateKey || ""}
                                onChange={(e) => updateLinuxProfile(p.id, { privateKey: e.target.value })}
                                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                                rows={3}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-[11px] text-emerald-300 font-mono"
                              />
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] text-slate-400 mb-1">
                                    Key Passphrase (if encrypted)
                                  </label>
                                  <input
                                    type="password"
                                    value={p.passphrase || ""}
                                    onChange={(e) => updateLinuxProfile(p.id, { passphrase: e.target.value })}
                                    placeholder="Optional Passphrase"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Separate Sudo Password Field */}
                          {(p.authType === "password_and_sudo" || p.authType === "key_and_sudo") && (
                            <div>
                              <label className="block text-[11px] text-slate-400 mb-1">
                                Sudo Escalation Password (if different from login)
                              </label>
                              <div className="relative">
                                <input
                                  type={isSudoVisible ? "text" : "password"}
                                  value={p.sudoPassword || ""}
                                  onChange={(e) => updateLinuxProfile(p.id, { sudoPassword: e.target.value })}
                                  placeholder="Sudo password for administrative commands"
                                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white pr-9"
                                />
                                <button
                                  type="button"
                                  onClick={() => toggleShowPassword(`linux-sudo-${p.id}`)}
                                  className="absolute right-2 top-2 text-slate-400 hover:text-white"
                                >
                                  {isSudoVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. Windows Server & Active Directory Section */}
              {(activeCredTab === "windows" || activeCredTab === "all") && (
                <div className="space-y-3 p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-violet-400 flex items-center gap-1.5">
                        <Server className="w-4 h-4 text-violet-400" />
                        Windows Server & Active Directory Credentials ({windowsCredentials.length})
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Supports WinRM HTTPS (5986), WinRM HTTP (5985), Windows OpenSSH (22), and RDP Console (3389).
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          addWindowsProfile({
                            name: "WinRM HTTPS Administrator",
                            protocol: "winrm_https",
                            port: 5986,
                          })
                        }
                        className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-violet-300 font-medium"
                      >
                        + WinRM 5986
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          addWindowsProfile({
                            name: "RDP Console Admin",
                            protocol: "rdp",
                            port: 3389,
                          })
                        }
                        className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-violet-300 font-medium"
                      >
                        + RDP 3389
                      </button>
                      <button
                        type="button"
                        onClick={() => addWindowsProfile()}
                        className="px-2.5 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-semibold flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Profile
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 pt-1">
                    {windowsCredentials.map((p, idx) => {
                      const isPwdVisible = Boolean(showPasswords[`win-pwd-${p.id}`]);
                      return (
                        <div
                          key={p.id}
                          className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 text-[11px] font-bold flex items-center justify-center">
                                {idx + 1}
                              </span>
                              <input
                                value={p.name}
                                onChange={(e) => updateWindowsProfile(p.id, { name: e.target.value })}
                                placeholder="Profile Name"
                                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-semibold text-white w-56"
                              />
                              {p.isPrimary ? (
                                <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 text-[10px] font-bold">
                                  ★ Primary Default
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setPrimaryWindowsProfile(p.id)}
                                  className="px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
                                >
                                  Make Primary
                                </button>
                              )}
                            </div>
                            {windowsCredentials.length > 1 && (
                              <button
                                type="button"
                                onClick={() => deleteWindowsProfile(p.id)}
                                className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-slate-800 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                            <div>
                              <label className="block text-[11px] text-slate-400 mb-1">Protocol</label>
                              <select
                                value={p.protocol}
                                onChange={(e) => {
                                  const proto = e.target.value as any;
                                  const autoPort =
                                    proto === "rdp"
                                      ? 3389
                                      : proto === "winrm_http"
                                      ? 5985
                                      : proto === "ssh"
                                      ? 22
                                      : 5986;
                                  updateWindowsProfile(p.id, { protocol: proto, port: autoPort });
                                }}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                              >
                                <option value="winrm_https">WinRM HTTPS (:5986)</option>
                                <option value="winrm_http">WinRM HTTP (:5985)</option>
                                <option value="rdp">RDP Console (:3389)</option>
                                <option value="ssh">Windows OpenSSH (:22)</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] text-slate-400 mb-1">
                                Domain (Optional)
                              </label>
                              <input
                                value={p.domain || ""}
                                onChange={(e) => updateWindowsProfile(p.id, { domain: e.target.value })}
                                placeholder="CORP or DOMAIN"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-slate-400 mb-1">Admin Username</label>
                              <input
                                value={p.username}
                                onChange={(e) => updateWindowsProfile(p.id, { username: e.target.value })}
                                placeholder="Administrator"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-slate-400 mb-1">Port</label>
                              <input
                                type="number"
                                value={p.port}
                                onChange={(e) =>
                                  updateWindowsProfile(p.id, { port: Number(e.target.value) || 5986 })
                                }
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Password</label>
                            <div className="relative">
                              <input
                                type={isPwdVisible ? "text" : "password"}
                                value={p.password || ""}
                                onChange={(e) => updateWindowsProfile(p.id, { password: e.target.value })}
                                placeholder="Encrypted in AES-256-GCM Vault"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white pr-9"
                              />
                              <button
                                type="button"
                                onClick={() => toggleShowPassword(`win-pwd-${p.id}`)}
                                className="absolute right-2 top-2 text-slate-400 hover:text-white"
                              >
                                {isPwdVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Switches & Firewalls Section */}
              {(activeCredTab === "network" || activeCredTab === "all") && (
                <div className="space-y-3 p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                        <Router className="w-4 h-4 text-amber-400" />
                        Switches & Firewalls CLI / API Profiles ({networkCredentials.length})
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Supports Cisco/Aruba/FortiGate/Junos SSH CLI, Cisco Enable secret, and REST API tokens.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          addNetworkProfile({
                            name: "Cisco Switch (SSH + Enable)",
                            authType: "ssh",
                            port: 22,
                          })
                        }
                        className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-amber-300 font-medium"
                      >
                        + Cisco Enable
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          addNetworkProfile({
                            name: "Firewall REST API Token",
                            authType: "api_token",
                            port: 443,
                          })
                        }
                        className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-amber-300 font-medium"
                      >
                        + API Token
                      </button>
                      <button
                        type="button"
                        onClick={() => addNetworkProfile()}
                        className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Profile
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 pt-1">
                    {networkCredentials.map((p, idx) => {
                      const isPwdVisible = Boolean(showPasswords[`net-pwd-${p.id}`]);
                      const isEnableVisible = Boolean(showPasswords[`net-enable-${p.id}`]);
                      return (
                        <div
                          key={p.id}
                          className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-[11px] font-bold flex items-center justify-center">
                                {idx + 1}
                              </span>
                              <input
                                value={p.name}
                                onChange={(e) => updateNetworkProfile(p.id, { name: e.target.value })}
                                placeholder="Profile Name"
                                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-semibold text-white w-56"
                              />
                              {p.isPrimary ? (
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                                  ★ Primary Default
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setPrimaryNetworkProfile(p.id)}
                                  className="px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
                                >
                                  Make Primary
                                </button>
                              )}
                            </div>
                            {networkCredentials.length > 1 && (
                              <button
                                type="button"
                                onClick={() => deleteNetworkProfile(p.id)}
                                className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-slate-800 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[11px] text-slate-400 mb-1">Access Mode</label>
                              <select
                                value={p.authType}
                                onChange={(e) => {
                                  const a = e.target.value as any;
                                  const autoPort = a === "api_token" ? 443 : a === "telnet" ? 23 : 22;
                                  updateNetworkProfile(p.id, { authType: a, port: autoPort });
                                }}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                              >
                                <option value="ssh">SSH CLI (:22)</option>
                                <option value="api_token">REST API Token (:443)</option>
                                <option value="telnet">Telnet CLI (:23)</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] text-slate-400 mb-1">Username / Key Name</label>
                              <input
                                value={p.username}
                                onChange={(e) => updateNetworkProfile(p.id, { username: e.target.value })}
                                placeholder="admin"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-slate-400 mb-1">Port</label>
                              <input
                                type="number"
                                value={p.port}
                                onChange={(e) =>
                                  updateNetworkProfile(p.id, { port: Number(e.target.value) || 22 })
                                }
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] text-slate-400 mb-1">
                                {p.authType === "api_token" ? "API Token / Bearer Key" : "Login Password"}
                              </label>
                              <div className="relative">
                                <input
                                  type={isPwdVisible ? "text" : "password"}
                                  value={p.authType === "api_token" ? p.apiToken || "" : p.password || ""}
                                  onChange={(e) =>
                                    updateNetworkProfile(p.id, {
                                      password: e.target.value,
                                      apiToken: e.target.value,
                                    })
                                  }
                                  placeholder={
                                    p.authType === "api_token"
                                      ? "OPNsense / UniFi API Key"
                                      : "Switch / Router Login Password"
                                  }
                                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white pr-9"
                                />
                                <button
                                  type="button"
                                  onClick={() => toggleShowPassword(`net-pwd-${p.id}`)}
                                  className="absolute right-2 top-2 text-slate-400 hover:text-white"
                                >
                                  {isPwdVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>

                            <div>
                              <label className="block text-[11px] text-slate-400 mb-1">
                                Enable / Privileged EXEC Secret (Optional)
                              </label>
                              <div className="relative">
                                <input
                                  type={isEnableVisible ? "text" : "password"}
                                  value={p.enableSecret || ""}
                                  onChange={(e) => updateNetworkProfile(p.id, { enableSecret: e.target.value })}
                                  placeholder="Cisco enable password"
                                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white pr-9"
                                />
                                <button
                                  type="button"
                                  onClick={() => toggleShowPassword(`net-enable-${p.id}`)}
                                  className="absolute right-2 top-2 text-slate-400 hover:text-white"
                                >
                                  {isEnableVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 4. Multiple SNMP Communities Section */}
              {(activeCredTab === "snmp" || activeCredTab === "all") && (
                <div className="space-y-3 p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                        <Network className="w-4 h-4 text-cyan-400" />
                        SNMP Community Pool ({snmpCommunities.length} configured)
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Polled by Printer-MIB (:161) for toner levels & page counters, and LLDP/CDP switch neighbor discovery across your VLANs.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          addSnmpCommunity({
                            name: "General Read-Only",
                            community: "public",
                            version: "v2c",
                            access: "ro",
                          })
                        }
                        className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-cyan-300 font-medium"
                      >
                        + 'public' (v2c)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          addSnmpCommunity({
                            name: "Printer Fleet MIB",
                            community: "printers-ro",
                            version: "v2c",
                            access: "ro",
                          })
                        }
                        className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-cyan-300 font-medium"
                      >
                        + 'printers-ro'
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          addSnmpCommunity({
                            name: "Secure Core SNMPv3",
                            version: "v3",
                            community: "v3-auth-priv",
                            secName: "snmpv3admin",
                            authProtocol: "SHA",
                            privProtocol: "AES",
                          })
                        }
                        className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-cyan-300 font-medium"
                      >
                        + SNMPv3 USM
                      </button>
                      <button
                        type="button"
                        onClick={() => addSnmpCommunity()}
                        className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-semibold flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Community
                      </button>
                    </div>
                  </div>

                  {/* Bulk Input Bar */}
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[11px] text-slate-400 shrink-0 font-medium">Quick Bulk Add:</span>
                    <input
                      value={bulkSnmpInput}
                      onChange={(e) => setBulkSnmpInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleBulkAddSnmp();
                        }
                      }}
                      placeholder="Enter comma-separated communities, e.g. public, private, sab-snmp, printers"
                      className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleBulkAddSnmp}
                      className="px-3 py-1 rounded bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-medium shrink-0"
                    >
                      + Bulk Add
                    </button>
                  </div>

                  {/* Communities List */}
                  <div className="space-y-3 pt-1">
                    {snmpCommunities.map((c, idx) => (
                      <div
                        key={c.id}
                        className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-[11px] font-bold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="text-[11px] font-medium text-slate-400">Community String:</span>
                            <input
                              value={c.community}
                              onChange={(e) => updateSnmpCommunity(c.id, { community: e.target.value })}
                              placeholder="public"
                              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-cyan-300 w-44"
                            />
                            {c.isPrimary ? (
                              <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold">
                                ★ Primary Default
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setPrimarySnmpCommunity(c.id)}
                                className="px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
                              >
                                Make Primary
                              </button>
                            )}
                          </div>
                          {snmpCommunities.length > 1 && (
                            <button
                              type="button"
                              onClick={() => deleteSnmpCommunity(c.id)}
                              className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-slate-800 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Label / Scope</label>
                            <input
                              value={c.name}
                              onChange={(e) => updateSnmpCommunity(c.id, { name: e.target.value })}
                              placeholder="e.g. Office Printers, Switches"
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">SNMP Version</label>
                            <select
                              value={c.version}
                              onChange={(e) =>
                                updateSnmpCommunity(c.id, { version: e.target.value as any })
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                            >
                              <option value="v2c">SNMPv2c (Standard)</option>
                              <option value="v1">SNMPv1 (Legacy)</option>
                              <option value="v3">SNMPv3 (Secure USM)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Port</label>
                            <input
                              type="number"
                              value={c.port}
                              onChange={(e) =>
                                updateSnmpCommunity(c.id, { port: Number(e.target.value) || 161 })
                              }
                              placeholder="161"
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Access Mode</label>
                            <select
                              value={c.access}
                              onChange={(e) =>
                                updateSnmpCommunity(c.id, { access: e.target.value as any })
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                            >
                              <option value="ro">Read-Only (RO)</option>
                              <option value="rw">Read-Write (RW)</option>
                            </select>
                          </div>
                        </div>

                        {/* SNMPv3 USM Parameters */}
                        {c.version === "v3" && (
                          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
                            <div className="text-[11px] font-semibold text-cyan-300">
                              SNMPv3 USM Security Parameters:
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-1">Security / Username</label>
                                <input
                                  value={c.secName || ""}
                                  onChange={(e) => updateSnmpCommunity(c.id, { secName: e.target.value })}
                                  placeholder="snmpv3user"
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-1">Auth Protocol</label>
                                <select
                                  value={c.authProtocol || "SHA"}
                                  onChange={(e) =>
                                    updateSnmpCommunity(c.id, { authProtocol: e.target.value as any })
                                  }
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                                >
                                  <option value="SHA">SHA-1</option>
                                  <option value="SHA-256">SHA-256</option>
                                  <option value="MD5">MD5</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-1">Auth Password</label>
                                <input
                                  type="password"
                                  value={c.authPassword || ""}
                                  onChange={(e) => updateSnmpCommunity(c.id, { authPassword: e.target.value })}
                                  placeholder="Auth Passphrase"
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-1">Privacy Protocol</label>
                                <select
                                  value={c.privProtocol || "AES"}
                                  onChange={(e) =>
                                    updateSnmpCommunity(c.id, { privProtocol: e.target.value as any })
                                  }
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                                >
                                  <option value="AES">AES-128</option>
                                  <option value="AES-256">AES-256</option>
                                  <option value="DES">DES</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-1">Privacy Password</label>
                                <input
                                  type="password"
                                  value={c.privPassword || ""}
                                  onChange={(e) => updateSnmpCommunity(c.id, { privPassword: e.target.value })}
                                  placeholder="Privacy / Encryption Passphrase"
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Primary Default AI Brain
                  </label>
                  <select
                    value={defaultAiProvider}
                    onChange={(e) => {
                      setDefaultAiProvider(e.target.value);
                      const found = (aiProviders || []).find((p) => p.id === e.target.value);
                      if (found?.default_model) setDefaultAiModel(found.default_model);
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    {(aiProviders || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.vendor})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Default AI Model</label>
                  <input
                    value={defaultAiModel}
                    onChange={(e) => setDefaultAiModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Air-Gapped / Fallback AI Brain
                  </label>
                  <select
                    value={fallbackAiProvider}
                    onChange={(e) => setFallbackAiProvider(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    {(aiProviders || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick API Key / Endpoint Connector */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-white">
                  Quick-Connect Any Cloud or Local AI Provider (Anthropic, OpenAI, Gemini, xAI Grok, DeepSeek, Mistral, OpenRouter, Copilot, Ollama)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
                  <select
                    value={quickApiKeyProvider}
                    onChange={(e) => setQuickApiKeyProvider(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                  >
                    {(aiProviders || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="password"
                    value={quickApiKeyValue}
                    onChange={(e) => setQuickApiKeyValue(e.target.value)}
                    placeholder="API Key / Token (sk-..., xai-..., ghp_...)"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white font-mono"
                  />
                  <input
                    value={quickBaseUrl}
                    onChange={(e) => setQuickBaseUrl(e.target.value)}
                    placeholder="Optional Custom Base URL (e.g. Ollama)"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white font-mono"
                  />
                  <button
                    onClick={handleSaveQuickProviderKey}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-3 py-2 text-xs font-semibold"
                  >
                    Save & Enable Provider
                  </button>
                </div>
              </div>

              {/* All 12 Connectable AI Providers Status Matrix */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pr-1">
                {(aiProviders || []).map((p) => (
                  <div
                    key={p.id}
                    className={`p-3 rounded-xl border text-xs flex flex-col justify-between ${
                      p.enabled
                        ? "bg-slate-950/90 border-emerald-500/40"
                        : "bg-slate-950/40 border-slate-800"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-slate-100">{p.name}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            p.enabled
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {p.enabled ? "CONNECTED" : p.auth_mode.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 line-clamp-2">{p.description}</div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-indigo-300">
                      <span>Default: {p.default_model}</span>
                      <span>{(p.models || []).length} models</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-white mb-2">
                  How Should AI Agents Decide & Execute Actions Across Your Fleet?
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    {
                      id: "readonly",
                      title: "1. Strict Read-Only Observer",
                      badge: "Zero Mutation",
                      desc: "AI agents can inspect logs, metrics, configs, and run diagnostic scans, but all write/restart commands are strictly blocked.",
                    },
                    {
                      id: "supervised",
                      title: "2. Human-in-the-Loop Approval (Recommended)",
                      badge: "User Approval Required",
                      desc: "Read-only diagnostics run automatically. Any config edit, package install, or service restart pauses for explicit User Approval with diff preview.",
                    },
                    {
                      id: "auto_safe_append",
                      title: "3. Smart Auto-Append & Safe Autonomy",
                      badge: "Auto-Append + Guarded Delete",
                      desc: "AI agents can automatically append safe items (authorized_keys, new monitoring checks, additive config lines with snapshot), while destructive/restart actions require User Approval.",
                    },
                    {
                      id: "autonomous",
                      title: "4. Full Autonomous SRE Mode",
                      badge: "Auto-Execute + 1-Click Revert",
                      desc: "AI agents autonomously execute multi-step remediations within assigned skills. Every file change automatically creates a pre-edit snapshot for 1-click rollback.",
                    },
                  ].map((mode) => {
                    const active = agentDecisionMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setAgentDecisionMode(mode.id)}
                        className={`text-left p-4 rounded-xl border transition ${
                          active
                            ? "bg-indigo-600/20 border-indigo-500 ring-1 ring-indigo-500/40"
                            : "bg-slate-950 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-white">{mode.title}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {mode.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">{mode.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Granular Governance Toggles */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="text-xs font-bold text-white mb-1">Granular AI Decision Guardrails</div>
                {[
                  {
                    label: "Allow AI to auto-append non-destructive entries (SSH keys, monitors, additive rules)",
                    val: autoAppendRules,
                    set: setAutoAppendRules,
                  },
                  {
                    label: "Require explicit User Approval before restarting services, containers, or rebooting hosts",
                    val: requireApprovalRestarts,
                    set: setRequireApprovalRestarts,
                  },
                  {
                    label: "Require explicit User Approval before modifying Firewall, Switch VLAN, or Routing policies",
                    val: requireApprovalFirewall,
                    set: setRequireApprovalFirewall,
                  },
                  {
                    label: "Auto-onboard newly discovered subnet hosts & outbound Go agents into the inventory",
                    val: autoOnboardDiscovered,
                    set: setAutoOnboardDiscovered,
                  },
                  {
                    label: "Enforce automatic pre-change config snapshot before any file edit (1-Click Revert)",
                    val: mandatoryConfigSnapshots,
                    set: setMandatoryConfigSnapshots,
                  },
                  {
                    label: "Apply this decision policy to all existing fleet hosts immediately",
                    val: applyDecisionModeToFleet,
                    set: setApplyDecisionModeToFleet,
                  },
                ].map((item, i) => (
                  <label key={i} className="flex items-center justify-between text-xs text-slate-200 cursor-pointer py-1">
                    <span>{item.label}</span>
                    <input
                      type="checkbox"
                      checked={item.val}
                      onChange={(e) => item.set(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-xs text-teal-200">
                Enterprise configuration parity with <strong>Rundeck / AWX</strong> (scheduled runbooks), <strong>PagerDuty / Gotify / Ntfy</strong> (incident notifications), <strong>Teleport</strong> (OIDC SSO & session retention), and <strong>Oxidized / NetBox</strong> (GitOps config backup).
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold text-indigo-300">ChatOps & Incident Notification Channels</h4>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Slack / Microsoft Teams / Discord Webhook URL
                    </label>
                    <input
                      value={slackTeamsWebhook}
                      onChange={(e) => setSlackTeamsWebhook(e.target.value)}
                      placeholder="https://hooks.slack.com/services/... or Discord/Teams webhook"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Ntfy / Gotify / PagerDuty / Telegram Webhook URL
                    </label>
                    <input
                      value={ntfyPagerdutyUrl}
                      onChange={(e) => setNtfyPagerdutyUrl(e.target.value)}
                      placeholder="https://ntfy.sh/fleetops-alerts or PagerDuty Events v2 URL"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold text-rose-300">SSO Identity (OIDC/LDAP) & GitOps Backup</h4>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      OIDC / SAML Identity Provider Issuer URL (Authentik / Keycloak / Okta)
                    </label>
                    <input
                      value={oidcIssuerUrl}
                      onChange={(e) => setOidcIssuerUrl(e.target.value)}
                      placeholder="https://auth.example.com/application/o/fleetops-ai/"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-[11px] text-slate-400 mb-1">
                        GitOps Config Backup Repository
                      </label>
                      <input
                        value={gitopsBackupRepo}
                        onChange={(e) => setGitopsBackupRepo(e.target.value)}
                        placeholder="git@github.com:org/fleet-configs.git"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Audit Retention</label>
                      <input
                        type="number"
                        value={auditRetentionDays}
                        onChange={(e) => setAuditRetentionDays(Number(e.target.value) || 90)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="text-xs font-bold text-emerald-300">
                  Scheduled AI Maintenance & Compliance Runbooks (Rundeck / AWX Cron Engine)
                </div>
                {[
                  {
                    key: "nightlySecuritySweep",
                    cron: "0 2 * * *",
                    label: "Nightly Security, CIS & NIS2/ISO27001 Drift Sweep across all hosts",
                  },
                  {
                    key: "nightlyGitopsSnapshot",
                    cron: "0 3 * * *",
                    label: "Automated /etc, Network Switch & Firewall Running-Config Snapshot",
                  },
                  {
                    key: "weeklyTlsCertAudit",
                    cron: "0 6 * * 1",
                    label: "Weekly SSL/TLS Certificate Expiry, Database PITR Backup & ZFS Scrub Verification",
                  },
                  {
                    key: "weeklyStorageAndPrinterReport",
                    cron: "0 4 * * 0",
                    label: "Weekly Docker Disk Hygiene & Network Printer Toner/Queue Executive Digest",
                  },
                ].map((job) => (
                  <label
                    key={job.key}
                    className="flex items-center justify-between text-xs text-slate-200 cursor-pointer py-1"
                  >
                    <span className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-[10px] text-indigo-300">
                        {job.cron}
                      </span>
                      <span>{job.label}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(scheduledRunbooks[job.key])}
                      onChange={(e) =>
                        setScheduledRunbooks((prev) => ({ ...prev, [job.key]: e.target.checked }))
                      }
                      className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={() => (step > 1 ? setStep(step - 1) : onClose())}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium"
          >
            {step > 1 ? "Back" : "Cancel"}
          </button>

          <div className="flex items-center gap-2">
            {step < 5 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-semibold"
              >
                Next Step &rarr;
              </button>
            ) : (
              <button
                onClick={handleCompleteWizard}
                disabled={saving}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs text-white font-bold inline-flex items-center gap-1.5 shadow-lg shadow-emerald-950/50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Save Environment, Schedules & Governance Policy
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  hosts: any[];
  mcpPlugins: any[];
  skills: any[];
  onNavigateTab: (tab: any) => void;
  onSelectHost: (hostId: string) => void;
  onRunAIPrompt: (prompt: string, scope: string) => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  hosts,
  mcpPlugins,
  skills,
  onNavigateTab,
  onSelectHost,
  onRunAIPrompt,
}) => {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isOpen) onClose();
      } else if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const q = query.toLowerCase().trim();
  const matchedHosts = (hosts || [])
    .filter((h) => !q || h.hostname?.toLowerCase().includes(q) || h.ip_address?.includes(q) || h.group_name?.toLowerCase().includes(q))
    .slice(0, 6);
  const matchedPlugins = (mcpPlugins || [])
    .filter((p) => !q || p.name?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q) || p.slug?.toLowerCase().includes(q))
    .slice(0, 6);

  const quickRunbooks = [
    {
      title: "Morning Fleet Health, Security & OOMKill Sweep",
      scope: "@all",
      prompt:
        "Run a comprehensive health sweep across all hosts: check CPU/memory/disk pressure, failed systemd/Windows services, unhealthy Kubernetes pods, and recent OOMKills.",
    },
    {
      title: "Switch & Firewall Running-Config Backup & Rule Audit",
      scope: "@all",
      prompt:
        "Backup network switch and firewall configurations, verify active VPN tunnels, and flag any permissive WAN rules.",
    },
    {
      title: "Printer Fleet Toner, Drum & Stuck Queue Report",
      scope: "@all",
      prompt:
        "Poll all network printers via SNMP/IPP/CUPS and report toner levels, page counters, and any paper tray or queue alerts.",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-start justify-center pt-20 p-4">
      <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden">
        <div className="p-3.5 border-b border-slate-800 flex items-center gap-3 bg-slate-950">
          <Search className="w-4 h-4 text-indigo-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search hosts, switches, printers, 55 MCP plugins across 9 hubs, 55 skills, or launch AI runbooks..."
            className="flex-1 bg-transparent text-xs text-white focus:outline-none"
          />
          <button onClick={onClose} className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
            ESC
          </button>
        </div>

        <div className="p-4 max-h-96 overflow-y-auto space-y-4">
          {/* Quick AI Runbooks */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-1.5">
              1-Click Autonomous AI Fleet Runbooks
            </div>
            <div className="space-y-1">
              {quickRunbooks.map((rb, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    onRunAIPrompt(rb.prompt, rb.scope);
                    onClose();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-indigo-600/20 flex items-center justify-between text-xs text-slate-200"
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    {rb.title}
                  </span>
                  <span className="text-[10px] font-mono text-indigo-300">{rb.scope}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Matched Hosts */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Managed Hosts & Network Appliances ({matchedHosts.length})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {matchedHosts.map((h) => (
                <button
                  key={h.id}
                  onClick={() => {
                    onSelectHost(h.id);
                    onNavigateTab("terminal");
                    onClose();
                  }}
                  className="text-left px-3 py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <span className="font-semibold text-white">{h.hostname}</span>
                  <span className="text-[10px] font-mono text-slate-400">{h.ip_address}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Matched MCP Plugins */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              MCP Plugins ({matchedPlugins.length})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {matchedPlugins.map((p) => (
                <button
                  key={p.slug}
                  onClick={() => {
                    const tabMap: Record<string, string> = {
                      kubernetes: "k8s-hub",
                      docker: "docker-hub",
                      linux: "linux-hub",
                      windows: "windows-hub",
                      network: "network-hub",
                      virtualization: "virt-hub",
                      databases: "db-hub",
                      identity_proxy: "proxy-hub",
                      observability: "obs-hub",
                    };
                    onNavigateTab(tabMap[p.category] || "k8s-hub");
                    onClose();
                  }}
                  className="text-left px-3 py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <span className="text-slate-200 truncate">{p.name}</span>
                  <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                    {p.category}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
