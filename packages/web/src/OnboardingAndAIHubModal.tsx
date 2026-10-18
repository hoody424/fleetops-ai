import React, { useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Compass,
  Cpu,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  Network,
  Plus,
  Radar,
  Router,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";

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

  // Step 2: Default System & Network Credentials
  const [defaultLinuxUser, setDefaultLinuxUser] = useState("root");
  const [defaultLinuxPassword, setDefaultLinuxPassword] = useState("");
  const [defaultWindowsUser, setDefaultWindowsUser] = useState("Administrator");
  const [defaultWindowsPassword, setDefaultWindowsPassword] = useState("");
  const [defaultNetworkUser, setDefaultNetworkUser] = useState("admin");
  const [defaultNetworkPassword, setDefaultNetworkPassword] = useState("");
  const [snmpCommunity, setSnmpCommunity] = useState("public");

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
    }
  }, [envProfile]);

  if (!isOpen) return null;

  const togglePlatform = (plat: string) => {
    setEnabledPlatforms((prev) => (prev.includes(plat) ? prev.filter((p) => p !== plat) : [...prev, plat]));
  };

  const handleRunDiscovery = async () => {
    setScanningSubnet(true);
    try {
      const r = await fetch("/api/onboarding/discover-subnet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subnetOrRange: scanSubnetInput }),
      });
      const d = await r.json();
      setDiscoveredNodes(d.discovered || []);
    } finally {
      setScanningSubnet(false);
    }
  };

  const handleOnboardDiscoveredNode = async (node: any) => {
    await fetch("/api/hosts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hostname: `node-${node.ip.replace(/\./g, "-")}`,
        ipAddress: node.ip,
        sshPort: node.openPorts.includes(22) ? 22 : node.openPorts[0] || 22,
        sshUser: node.osType === "windows" ? defaultWindowsUser : defaultLinuxUser,
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
          snmpCommunity,
          defaultLinuxUser,
          defaultLinuxPassword,
          defaultWindowsUser,
          defaultWindowsPassword,
          defaultNetworkUser,
          defaultNetworkPassword,
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
                            <div className="font-mono font-bold text-white">{n.ip}</div>
                            <div className="text-[11px] text-slate-400">
                              {n.detectedType} &bull; Ports: {n.openPorts.join(", ")}
                            </div>
                          </div>
                          <button
                            onClick={() => handleOnboardDiscoveredNode(n)}
                            className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium"
                          >
                            + Add to Fleet
                          </button>
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
              <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-200">
                All credentials entered below are encrypted at rest with <strong>AES-256-GCM</strong> inside the FleetOps Vault and used for 1-click SSH key bootstrap, WinRM/RDP, Switch/Firewall config backup, and Printer SNMP polling.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold text-emerald-400">Linux Fleet Default SSH / Sudo Credentials</h4>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Default SSH Username</label>
                    <input
                      value={defaultLinuxUser}
                      onChange={(e) => setDefaultLinuxUser(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Default SSH Bootstrap / Sudo Password (Optional)
                    </label>
                    <input
                      type="password"
                      value={defaultLinuxPassword}
                      onChange={(e) => setDefaultLinuxPassword(e.target.value)}
                      placeholder="Encrypted in AES-256-GCM Vault"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold text-violet-400">Windows Server / Active Directory Credentials</h4>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Default Windows Admin Username (Domain\User or Local)
                    </label>
                    <input
                      value={defaultWindowsUser}
                      onChange={(e) => setDefaultWindowsUser(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Windows OpenSSH / WinRM / RDP Password (Optional)
                    </label>
                    <input
                      type="password"
                      value={defaultWindowsPassword}
                      onChange={(e) => setDefaultWindowsPassword(e.target.value)}
                      placeholder="Encrypted in AES-256-GCM Vault"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold text-amber-400">Switches & Firewalls CLI / API Credentials</h4>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Switch / Firewall Admin User</label>
                    <input
                      value={defaultNetworkUser}
                      onChange={(e) => setDefaultNetworkUser(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Switch / Firewall Password or API Token</label>
                    <input
                      type="password"
                      value={defaultNetworkPassword}
                      onChange={(e) => setDefaultNetworkPassword(e.target.value)}
                      placeholder="Cisco / Aruba / UniFi / FortiGate / OPNsense"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold text-cyan-400">Network Printers & SNMPv2c/v3 Community</h4>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      SNMP Community String (Printer-MIB Toner & Switch LLDP Polling)
                    </label>
                    <input
                      value={snmpCommunity}
                      onChange={(e) => setSnmpCommunity(e.target.value)}
                      placeholder="public"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Used by `ipp-snmp-printer-fleet-mcp` and `snmp-lldp-topology-mcp` to read toner levels, page counters, and switch port tables.
                  </p>
                </div>
              </div>
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
