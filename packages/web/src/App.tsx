import React, { useEffect, useState } from "react";
import {
  Server,
  Bot,
  Terminal as TerminalIcon,
  ShieldCheck,
  Activity,
  KeyRound,
  Settings,
  AlertOctagon,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
  Send,
  RotateCcw,
  FileCode,
  Sparkles,
  Download,
  Wrench,
  Layers,
  Copy,
  Check,
  Trash2,
  CloudCog,
  Container,
  Database,
  HardDrive,
  Monitor,
  Router,
  Search,
  Wand2,
} from "lucide-react";
import { TerminalPanel } from "./TerminalPanel";
import { PlatformHubPanel } from "./PlatformHubPanel";
import { CommandPaletteModal, OnboardingWizardModal } from "./OnboardingAndAIHubModal";

type TabId =
  | "dashboard"
  | "ai-chat"
  | "k8s-hub"
  | "docker-hub"
  | "linux-hub"
  | "windows-hub"
  | "network-hub"
  | "virt-hub"
  | "db-hub"
  | "proxy-hub"
  | "obs-hub"
  | "terminal"
  | "audits"
  | "monitors"
  | "vault"
  | "settings";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string>("");
  const [providerApiKeyInput, setProviderApiKeyInput] = useState<string>("");
  const [providerBaseUrlInput, setProviderBaseUrlInput] = useState<string>("");
  const [providerModelInput, setProviderModelInput] = useState<string>("");
  const [overview, setOverview] = useState<any>({
    hosts: [],
    groups: [],
    sshKeys: [],
    pendingApprovals: [],
    recentSnapshots: [],
    recentScans: [],
    monitors: [],
    recentAuditLogs: [],
    aiStatus: null,
    aiProviders: [],
    envProfile: null,
  });
  const [catalog, setCatalog] = useState<any>({
    skills: [],
    monitors: [],
    reports: [],
    frameworks: [],
    mcpPlugins: [],
  });
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string>("");

  // Selected host for console / file editor
  const [selectedHostId, setSelectedHostId] = useState<string>("");

  // Add Host Modal state
  const [showAddHost, setShowAddHost] = useState(false);
  const [newHost, setNewHost] = useState({
    hostname: "",
    ipAddress: "",
    sshPort: 22,
    sshUser: "root",
    sshKeyId: "",
    osType: "linux",
    groupName: "k3s-lan",
    siteName: "Main Datacenter",
    safetyTier: "supervised",
    readOnlyAi: false,
    bootstrapPassword: "",
  });

  // AI Chat state
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [messages, setMessages] = useState<any[]>([]);
  const [sessionApprovals, setSessionApprovals] = useState<any[]>([]);
  const [chatProvider, setChatProvider] = useState("claude-sub");
  const [chatModel, setChatModel] = useState("claude-sonnet-4-6");
  const [chatScope, setChatScope] = useState("@all");
  const [chatSafety, setChatSafety] = useState<"readonly" | "supervised" | "autonomous">("supervised");
  const [chatPrompt, setChatPrompt] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  // Audits & Compliance state
  const [selectedScanHostId, setSelectedScanHostId] = useState<string>("");
  const [selectedReportType, setSelectedReportType] = useState<string>("security");
  const [scanRunning, setScanRunning] = useState(false);
  const [activeScanReport, setActiveScanReport] = useState<any | null>(null);
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string>("cis_l1");
  const [complianceResult, setComplianceResult] = useState<any | null>(null);

  // Monitors, Credentials, Keystore state
  const [newMonitor, setNewMonitor] = useState({ hostId: "", monitorSlug: "ssh", name: "SSH Port Check", port: 22 });
  const [credentials, setCredentials] = useState<any[]>([]);
  const [keystoreKeys, setKeystoreKeys] = useState<any[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyType, setNewKeyType] = useState<"ed25519" | "rsa">("ed25519");
  const [newKeystoreHandle, setNewKeystoreHandle] = useState("");
  const [newKeystoreAlg, setNewKeystoreAlg] = useState("EC-P256");
  const [keystoreTestResult, setKeystoreTestResult] = useState("");
  const [copiedText, setCopiedText] = useState("");

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4500);
  };

  const fetchOverview = async () => {
    try {
      const r = await fetch("/api/overview");
      const d = await r.json();
      setOverview(d);
      if (!selectedHostId && d.hosts?.[0]?.id) {
        setSelectedHostId(d.hosts[0].id);
        setSelectedScanHostId(d.hosts[0].id);
        setNewMonitor((m) => ({ ...m, hostId: d.hosts[0].id }));
      }
    } catch (e) {
      console.error("Overview fetch error:", e);
    }
  };

  const fetchCatalog = async () => {
    try {
      const r = await fetch("/api/catalog");
      const d = await r.json();
      setCatalog(d);
    } catch (e) {
      console.error("Catalog fetch error:", e);
    }
  };

  const fetchSessions = async () => {
    const r = await fetch("/api/ai/sessions");
    const d = await r.json();
    if (Array.isArray(d)) {
      setSessions(d);
      if (!activeSessionId && d[0]?.id) {
        setActiveSessionId(d[0].id);
      }
    }
  };

  const fetchMessages = async (sid: string) => {
    if (!sid) return;
    const r = await fetch(`/api/ai/sessions/${sid}/messages`);
    const d = await r.json();
    setMessages(d.messages || []);
    setSessionApprovals(d.approvals || []);
  };

  const fetchVaultExtras = async () => {
    const [cr, kr] = await Promise.all([fetch("/api/credentials"), fetch("/api/keystore")]);
    setCredentials(await cr.json());
    setKeystoreKeys(await kr.json());
  };

  useEffect(() => {
    fetchOverview();
    fetchCatalog();
    fetchSessions();
    fetchVaultExtras();
    const timer = setInterval(fetchOverview, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      fetchMessages(activeSessionId);
    }
  }, [activeSessionId]);

  useEffect(() => {
    if (activeTab === "audits" && selectedFrameworkId) {
      fetch(`/api/compliance/${selectedFrameworkId}`)
        .then((r) => r.json())
        .then(setComplianceResult)
        .catch(() => {});
    }
  }, [activeTab, selectedFrameworkId, overview.recentScans]);

  const handleCreateOrSendPrompt = async (customScope?: string, customPrompt?: string) => {
    const promptToUse = (customPrompt ?? chatPrompt).trim();
    const scopeToUse = customScope ?? chatScope;
    if (!promptToUse || chatBusy) return;

    setChatBusy(true);
    if (!customPrompt) setChatPrompt("");

    try {
      let sid = activeSessionId;
      if (!sid || customScope) {
        const sr = await fetch("/api/ai/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `${scopeToUse}: ${promptToUse.slice(0, 42)}`,
            provider: chatProvider,
            model: chatModel,
            targetScope: scopeToUse,
            safetyTier: chatSafety,
          }),
        });
        const newSess = await sr.json();
        sid = newSess.id;
        setActiveSessionId(sid);
        await fetchSessions();
      }

      // Optimistic user message
      setMessages((prev) => [...prev, { id: "temp-user", role: "user", content: promptToUse, tool_calls: [] }]);

      const mr = await fetch(`/api/ai/sessions/${sid}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptToUse,
          provider: chatProvider,
          model: chatModel,
          targetScope: scopeToUse,
          safetyTier: chatSafety,
        }),
      });
      const resData = await mr.json();
      if (!mr.ok) throw new Error(resData.error || "AI request failed");
      await fetchMessages(sid);
      await fetchOverview();
    } catch (e: any) {
      notify(`AI Execution Error: ${e?.message}`);
    } finally {
      setChatBusy(false);
    }
  };

  const handleResolveApproval = async (approvalId: string, decision: "approve" | "reject") => {
    try {
      const r = await fetch(`/api/approvals/${approvalId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error || "Failed to resolve approval");
      }
      notify(decision === "approve" ? "Approved & executed on host!" : "Action rejected.");
      if (activeSessionId) await fetchMessages(activeSessionId);
      await fetchOverview();
    } catch (e: any) {
      notify(`Approval Error: ${e?.message}`);
    }
  };

  const handleRevertSnapshot = async (snapshotId: string) => {
    try {
      const r = await fetch(`/api/snapshots/${snapshotId}/revert`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Revert failed");
      notify(`Reverted ${d.filePath} on ${d.hostname} to pre-change state!`);
      await fetchOverview();
    } catch (e: any) {
      notify(`Revert Error: ${e?.message}`);
    }
  };

  const handleAddHost = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await fetch("/api/hosts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newHost),
      });
      const created = await r.json();
      if (!r.ok) throw new Error(created.error || "Failed to add host");

      if (newHost.bootstrapPassword.trim()) {
        await fetch(`/api/hosts/${created.id}/bootstrap-ssh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: newHost.bootstrapPassword, keyId: newHost.sshKeyId || undefined }),
        });
      }
      setShowAddHost(false);
      setNewHost({
        hostname: "",
        ipAddress: "",
        sshPort: 22,
        sshUser: "root",
        sshKeyId: "",
        osType: "linux",
        groupName: "k3s-lan",
        siteName: "Main Datacenter",
        safetyTier: "supervised",
        readOnlyAi: false,
        bootstrapPassword: "",
      });
      notify(`Host ${created.hostname} added and probed!`);
      await fetchOverview();
    } catch (err: any) {
      notify(`Error adding host: ${err?.message}`);
    }
  };

  const handlePanic = async () => {
    if (!window.confirm("EMERGENCY PANIC BUTTON: Lock all hosts into Read-Only AI mode and cancel all pending mutations?")) {
      return;
    }
    const r = await fetch("/api/panic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "@all" }),
    });
    const d = await r.json();
    notify(`PANIC LOCKDOWN ACTIVE: ${d.lockedHosts} hosts locked to Read-Only AI mode.`);
    await fetchOverview();
  };

  const handleRunScan = async (hostId = selectedScanHostId, reportType = selectedReportType) => {
    if (!hostId) return;
    setScanRunning(true);
    try {
      const r = await fetch(`/api/hosts/${hostId}/scans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Scan failed");
      setActiveScanReport(d);
      notify(`Completed ${reportType.toUpperCase()} scan!`);
      await fetchOverview();
    } catch (e: any) {
      notify(`Scan failed: ${e?.message}`);
    } finally {
      setScanRunning(false);
    }
  };

  const copyToClipboard = (txt: string, label: string) => {
    navigator.clipboard.writeText(txt);
    setCopiedText(label);
    setTimeout(() => setCopiedText(""), 2000);
  };

  const onlineCount = overview.hosts.filter((h: any) => h.status === "online").length;

  return (
    <div className="min-h-screen flex bg-[#050811] text-slate-100">
      {/* Left Navigation Sidebar */}
      <aside className="w-64 bg-slate-950 border-r border-slate-800/80 flex flex-col justify-between shrink-0">
        <div>
          <div className="p-5 border-b border-slate-800/80 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-bold text-base tracking-tight text-white flex items-center gap-2">
                FleetOps AI
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold">
                  v1.0
                </span>
              </div>
              <div className="text-[11px] text-slate-400">Autonomous Infrastructure Ops</div>
            </div>
          </div>

          <nav className="p-3 space-y-1">
            {[
              { id: "dashboard", label: "Fleet Overview & Hosts", icon: Server, badge: overview.hosts.length },
              {
                id: "ai-chat",
                label: "AI Operations Center",
                icon: Sparkles,
                badge: overview.pendingApprovals.length || undefined,
              },
              {
                id: "k8s-hub",
                label: "Kubernetes & MCPs",
                icon: CloudCog,
                badge: (catalog.mcpPlugins || []).filter((p: any) => p.category === "kubernetes").length || 7,
              },
              {
                id: "docker-hub",
                label: "Docker Hosts & MCPs",
                icon: Container,
                badge: (catalog.mcpPlugins || []).filter((p: any) => p.category === "docker").length || 6,
              },
              {
                id: "linux-hub",
                label: "Linux Fleet & MCPs",
                icon: Server,
                badge: (catalog.mcpPlugins || []).filter((p: any) => p.category === "linux").length || 6,
              },
              {
                id: "windows-hub",
                label: "Windows Server & MCPs",
                icon: Monitor,
                badge: (catalog.mcpPlugins || []).filter((p: any) => p.category === "windows").length || 6,
              },
              {
                id: "network-hub",
                label: "Switches, FW & Printers",
                icon: Router,
                badge: (catalog.mcpPlugins || []).filter((p: any) => p.category === "network").length || 6,
              },
              {
                id: "virt-hub",
                label: "Proxmox, VM & Storage",
                icon: HardDrive,
                badge: (catalog.mcpPlugins || []).filter((p: any) => p.category === "virtualization").length || 6,
              },
              {
                id: "db-hub",
                label: "Databases & Caches",
                icon: Database,
                badge: (catalog.mcpPlugins || []).filter((p: any) => p.category === "databases").length || 6,
              },
              {
                id: "proxy-hub",
                label: "SSO, Proxy & SSL/PKI",
                icon: Lock,
                badge: (catalog.mcpPlugins || []).filter((p: any) => p.category === "identity_proxy").length || 6,
              },
              {
                id: "obs-hub",
                label: "Observability & SIEM",
                icon: Activity,
                badge: (catalog.mcpPlugins || []).filter((p: any) => p.category === "observability").length || 6,
              },
              { id: "terminal", label: "Web Console & /etc Files", icon: TerminalIcon },
              { id: "audits", label: "Audits & 13 Compliance", icon: ShieldCheck },
              { id: "monitors", label: "Monitors & 55 Skills", icon: Layers, badge: overview.monitors.length },
              { id: "vault", label: "SSH Vault & Keystore", icon: KeyRound },
              { id: "settings", label: "Connect All AIs & MCP", icon: Settings },
            ].map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as TabId)}
                  className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-medium transition ${
                    active
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
                      : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </span>
                  {item.badge !== undefined && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                        active ? "bg-indigo-800 text-white" : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Subscription & Governance Status Footer */}
        <div className="p-4 border-t border-slate-800/80 space-y-2 text-xs">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <span>Connected AI Brains</span>
            <span className="text-indigo-400">
              {(overview.aiProviders || []).filter((p: any) => p.enabled).length || 3}/12
            </span>
          </div>
          <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1.5">
            <span className="text-slate-300 font-medium">Claude Code CLI</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                overview.aiStatus?.claude?.authenticated
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-amber-500/15 text-amber-400"
              }`}
            >
              {overview.aiStatus?.claude?.authenticated ? "ACTIVE" : "SETUP"}
            </span>
          </div>
          <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1.5">
            <span className="text-slate-300 font-medium">Google Gemini CLI</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                overview.aiStatus?.gemini?.authenticated
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-amber-500/15 text-amber-400"
              }`}
            >
              {overview.aiStatus?.gemini?.authenticated ? "ACTIVE" : "SETUP"}
            </span>
          </div>
          <button
            onClick={() => setShowOnboarding(true)}
            className="w-full mt-1 py-1.5 px-2.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 font-semibold flex items-center justify-center gap-1.5 text-[11px]"
          >
            <Wand2 className="w-3.5 h-3.5" /> Environment & AI Setup
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="h-16 bg-slate-950/90 border-b border-slate-800/80 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-base font-bold text-white capitalize">
              {activeTab === "ai-chat"
                ? "AI Fleet Operations Center"
                : activeTab === "k8s-hub"
                ? "Kubernetes Clusters & MCP Hub"
                : activeTab === "docker-hub"
                ? "Docker Hosts & MCP Hub"
                : activeTab === "linux-hub"
                ? "Linux Fleet & MCP Hub"
                : activeTab === "windows-hub"
                ? "Windows Server & MCP Hub"
                : activeTab === "network-hub"
                ? "Switches, Firewalls & Printers Hub"
                : activeTab === "virt-hub"
                ? "Virtualization, Hypervisors & Storage NAS Hub"
                : activeTab === "db-hub"
                ? "Databases, Caches & Message Brokers Hub"
                : activeTab === "proxy-hub"
                ? "SSO Identity, Reverse Proxies & SSL/PKI Hub"
                : activeTab === "obs-hub"
                ? "Observability, SIEM & Scheduled Runbooks Hub"
                : activeTab.replace("-", " ")}
            </h1>
            <span className="text-xs text-slate-400 hidden xl:inline">
              {onlineCount} / {overview.hosts.length} Systems Online &bull; {(catalog.mcpPlugins || []).length || 55}{" "}
              MCP Plugins (9 Hubs) &bull; Policy:{" "}
              <strong className="text-indigo-300 uppercase">
                {overview.envProfile?.agent_decision_mode || "supervised"}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {toast && (
              <div className="px-3 py-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-200 text-xs font-medium">
                {toast}
              </div>
            )}
            <button
              onClick={() => setShowCommandPalette(true)}
              className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-2"
              title="Open Global Command Palette"
            >
              <Search className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden md:inline">Quick Search & Runbooks</span>
              <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">Ctrl+K</kbd>
            </button>
            <button
              onClick={() => setShowOnboarding(true)}
              className="bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/40 text-violet-200 px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Wand2 className="w-3.5 h-3.5 text-violet-400" /> Setup Wizard
            </button>
            <button
              onClick={async () => {
                setLoading(true);
                await fetch("/api/hosts/probe-all", { method: "POST" });
                await fetchOverview();
                setLoading(false);
                notify("Probed all fleet hosts & appliances!");
              }}
              className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Probe Fleet
            </button>
            <button
              onClick={() => setShowAddHost(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add System
            </button>
            <button
              onClick={handlePanic}
              className="bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition"
              title="Emergency Lockdown: Switch all hosts to Read-Only AI mode and abort pending mutations"
            >
              <AlertOctagon className="w-3.5 h-3.5" /> PANIC
            </button>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 p-6 overflow-y-auto">
          {/* 9 PLATFORM & INFRASTRUCTURE HUBS */}
          {(activeTab === "k8s-hub" ||
            activeTab === "docker-hub" ||
            activeTab === "linux-hub" ||
            activeTab === "windows-hub" ||
            activeTab === "network-hub" ||
            activeTab === "virt-hub" ||
            activeTab === "db-hub" ||
            activeTab === "proxy-hub" ||
            activeTab === "obs-hub") && (
            <PlatformHubPanel
              initialPlatform={
                activeTab === "k8s-hub"
                  ? "kubernetes"
                  : activeTab === "docker-hub"
                  ? "docker"
                  : activeTab === "linux-hub"
                  ? "linux"
                  : activeTab === "windows-hub"
                  ? "windows"
                  : activeTab === "network-hub"
                  ? "network"
                  : activeTab === "virt-hub"
                  ? "virtualization"
                  : activeTab === "db-hub"
                  ? "databases"
                  : activeTab === "proxy-hub"
                  ? "identity_proxy"
                  : "observability"
              }
              hosts={overview.hosts}
              mcpPlugins={catalog.mcpPlugins || []}
              onRefreshCatalog={fetchCatalog}
              onLaunchAIPrompt={(prompt, scope) => {
                setChatScope(scope);
                setChatPrompt(prompt);
                setActiveTab("ai-chat");
                notify(`Loaded ${activeTab.replace("-hub", "").toUpperCase()} prompt into AI Operations Center`);
              }}
            />
          )}
          {/* TAB 1: DASHBOARD & FLEET MATRIX */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              {/* KPI Summary Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-400">Managed Fleet Hosts</div>
                  <div className="text-2xl font-bold text-white mt-1">
                    {onlineCount} <span className="text-sm font-normal text-slate-400">/ {overview.hosts.length} online</span>
                  </div>
                  <div className="text-[11px] text-emerald-400 mt-1">Agentless SSH-Key + Outbound Go Agent</div>
                </div>
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-400">AI Subscriptions Ready</div>
                  <div className="text-2xl font-bold text-white mt-1">
                    {(overview.aiStatus?.claude?.authenticated ? 1 : 0) +
                      (overview.aiStatus?.gemini?.authenticated ? 1 : 0)}{" "}
                    <span className="text-sm font-normal text-slate-400">/ 2 CLI Subscriptions</span>
                  </div>
                  <div className="text-[11px] text-indigo-400 mt-1">Claude Pro/Max + Google Gemini CLI</div>
                </div>
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-400">/etc Config Snapshots (1-Click Revert)</div>
                  <div className="text-2xl font-bold text-white mt-1">{overview.recentSnapshots.length}</div>
                  <div className="text-[11px] text-amber-400 mt-1">
                    {overview.pendingApprovals.length} pending Supervised approvals
                  </div>
                </div>
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-400">Skills & Compliance Catalog</div>
                  <div className="text-2xl font-bold text-white mt-1">
                    {catalog.skills.length} <span className="text-sm font-normal text-slate-400">Skills</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {catalog.monitors.length} Service Monitors &bull; {catalog.frameworks.length} Frameworks
                  </div>
                </div>
              </div>

              {/* Host Matrix Table */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-white">Managed Infrastructure Fleet</h2>
                    <p className="text-xs text-slate-400">
                      Click any host to open an interactive SSH Web Console, edit `/etc` files with rollback, or prompt Claude/Gemini.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950/70 text-slate-400 border-b border-slate-800 uppercase text-[11px]">
                        <th className="py-3 px-4">Host</th>
                        <th className="py-3 px-4">Group / Site</th>
                        <th className="py-3 px-4">Transport</th>
                        <th className="py-3 px-4">OS / Kernel</th>
                        <th className="py-3 px-4">CPU / RAM / Disk</th>
                        <th className="py-3 px-4">AI Safety Policy</th>
                        <th className="py-3 px-4 text-right">Quick Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {overview.hosts.map((h: any) => {
                        const m = h.metrics || {};
                        return (
                          <tr key={h.id} className="hover:bg-slate-800/40 transition">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <span
                                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                    h.status === "online"
                                      ? "bg-emerald-400 shadow-sm shadow-emerald-400/60"
                                      : h.status === "offline"
                                      ? "bg-red-400"
                                      : "bg-amber-400"
                                  }`}
                                />
                                <div>
                                  <div className="font-bold text-white text-sm">{h.hostname}</div>
                                  <div className="text-[11px] font-mono text-slate-400">
                                    {h.ssh_user}@{h.ip_address}:{h.ssh_port}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-medium">
                                {h.group_name}
                              </span>
                              <div className="text-[11px] text-slate-500 mt-0.5">{h.site_name}</div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono text-[11px]">
                                {h.connection_mode === "agent" ? "Go Agent WSS" : "SSH Key"}
                              </span>
                            </td>
                            <td className="py-3 px-4 max-w-[220px]">
                              <div className="truncate text-slate-200">{h.os_info || h.os_type}</div>
                              {h.last_error && (
                                <div className="text-[11px] text-amber-400 truncate" title={h.last_error}>
                                  {h.last_error}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-300">
                                <span>CPU {m.cpu_percent ?? "—"}%</span>
                                <span>&bull;</span>
                                <span>RAM {m.memory_percent ?? "—"}%</span>
                                <span>&bull;</span>
                                <span>DSK {m.disk_percent ?? "—"}%</span>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={async () => {
                                    await fetch(`/api/hosts/${h.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ readOnlyAi: !h.read_only_ai }),
                                    });
                                    await fetchOverview();
                                  }}
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold ${
                                    h.read_only_ai
                                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                      : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                  }`}
                                  title="Toggle Read-Only AI Access"
                                >
                                  {h.read_only_ai ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                                  {h.read_only_ai ? "Read-Only AI" : h.safety_tier.toUpperCase()}
                                </button>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                              <button
                                onClick={() => {
                                  setChatScope(`@${h.hostname}`);
                                  setActiveTab("ai-chat");
                                }}
                                className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 font-semibold transition"
                              >
                                Prompt AI
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedHostId(h.id);
                                  setActiveTab("terminal");
                                }}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium"
                              >
                                Console & Files
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedScanHostId(h.id);
                                  setActiveTab("audits");
                                  handleRunScan(h.id, "security");
                                }}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium"
                              >
                                Audit
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: AI OPERATIONS CENTER */}
          {activeTab === "ai-chat" && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 h-[calc(100vh-8.5rem)]">
              {/* Sessions & Prompt Templates Sidebar */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between overflow-y-auto">
                <div>
                  <button
                    onClick={async () => {
                      const r = await fetch("/api/ai/sessions", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          title: `Fleet Task (${chatScope})`,
                          provider: chatProvider,
                          model: chatModel,
                          targetScope: chatScope,
                          safetyTier: chatSafety,
                        }),
                      });
                      const ns = await r.json();
                      setActiveSessionId(ns.id);
                      await fetchSessions();
                    }}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2 px-3 text-xs font-semibold flex items-center justify-center gap-1.5 mb-4"
                  >
                    <Plus className="w-4 h-4" /> New AI Fleet Session
                  </button>

                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Active Sessions
                  </div>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => setActiveSessionId(s.id)}
                        className={`cursor-pointer rounded-lg px-3 py-2 text-xs transition flex items-center justify-between ${
                          activeSessionId === s.id
                            ? "bg-indigo-600/20 border border-indigo-500/40 text-white"
                            : "bg-slate-950/60 hover:bg-slate-800 text-slate-300"
                        }`}
                      >
                        <div className="truncate pr-2">
                          <div className="font-semibold truncate">{s.title}</div>
                          <div className="text-[10px] text-slate-400">
                            {s.provider} &bull; {s.target_scope}
                          </div>
                        </div>
                        <button
                          onClick={async (ev) => {
                            ev.stopPropagation();
                            await fetch(`/api/ai/sessions/${s.id}`, { method: "DELETE" });
                            if (activeSessionId === s.id) setActiveSessionId("");
                            await fetchSessions();
                          }}
                          className="text-slate-500 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-3 mt-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    1-Click Fleet Runbooks
                  </div>
                  <div className="space-y-1.5">
                    {[
                      "Check uptime, CPU load, memory usage, and disk usage >80% on target host(s)",
                      "List any failed systemd units and show the last 25 journal error lines",
                      "Audit listening TCP/UDP ports and active SSH sessions",
                      "Run a CIS security audit scan and summarize high/critical findings",
                    ].map((tpl) => (
                      <button
                        key={tpl}
                        onClick={() => setChatPrompt(tpl)}
                        className="w-full text-left text-[11px] bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg p-2 text-slate-300 transition"
                      >
                        {tpl}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Main Chat & Execution Stream */}
              <div className="lg:col-span-3 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
                {/* Session Toolbar */}
                <div className="p-3 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-400 font-medium">AI Brain:</span>
                    <select
                      value={chatProvider}
                      onChange={(e) => {
                        const p = e.target.value;
                        setChatProvider(p);
                        const found = (overview.aiProviders || []).find((x: any) => x.id === p);
                        if (found?.default_model) setChatModel(found.default_model);
                        else if (p === "claude-sub") setChatModel("claude-sonnet-4-6");
                        else if (p === "gemini-sub") setChatModel("gemini-2.5-pro");
                        else setChatModel("qwen2.5-coder:14b");
                      }}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-semibold"
                    >
                      {(overview.aiProviders && overview.aiProviders.length > 0
                        ? overview.aiProviders
                        : [
                            { id: "claude-sub", name: "Claude Subscription (CLI OAuth)" },
                            { id: "gemini-sub", name: "Gemini Subscription (CLI OAuth)" },
                            { id: "codex-sub", name: "OpenAI ChatGPT / Codex (CLI OAuth)" },
                            { id: "anthropic-api", name: "Anthropic Claude API" },
                            { id: "openai-api", name: "OpenAI Platform API (GPT-5 / o3)" },
                            { id: "gemini-api", name: "Google Gemini / Vertex API" },
                            { id: "xai-grok", name: "xAI Grok API (Grok 3)" },
                            { id: "deepseek", name: "DeepSeek AI (R1 / V3)" },
                            { id: "mistral", name: "Mistral & Codestral API" },
                            { id: "openrouter", name: "OpenRouter / Groq (300+ Models)" },
                            { id: "github-models", name: "GitHub Copilot Models / Azure" },
                            { id: "local-llm", name: "Local / Self-Hosted LLM (Ollama / vLLM)" },
                          ]
                      ).map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={chatModel}
                      onChange={(e) => setChatModel(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono"
                    >
                      {(
                        (overview.aiProviders || []).find((x: any) => x.id === chatProvider)?.models || [
                          chatModel,
                          "claude-sonnet-4-6",
                          "claude-opus-4-6",
                          "gemini-2.5-pro",
                          "gpt-5",
                          "grok-3",
                          "deepseek-reasoner",
                          "qwen2.5-coder:14b",
                        ]
                      ).map((m: string) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>

                    <span className="text-slate-400 font-medium ml-2">Target:</span>
                    <select
                      value={chatScope}
                      onChange={(e) => setChatScope(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-indigo-300 font-mono font-semibold"
                    >
                      <option value="@all">@all (Entire Fleet)</option>
                      {overview.groups.map((g: any) => (
                        <option key={g.id} value={`@group:${g.name}`}>
                          @group:{g.name}
                        </option>
                      ))}
                      {overview.hosts.map((h: any) => (
                        <option key={h.id} value={`@${h.hostname}`}>
                          @{h.hostname} ({h.ip_address})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Safety Tier:</span>
                    {(["readonly", "supervised", "autonomous"] as const).map((tier) => (
                      <button
                        key={tier}
                        onClick={() => setChatSafety(tier)}
                        className={`px-2.5 py-1 rounded-lg font-semibold capitalize transition ${
                          chatSafety === tier
                            ? tier === "readonly"
                              ? "bg-amber-600 text-white"
                              : tier === "supervised"
                              ? "bg-indigo-600 text-white"
                              : "bg-emerald-600 text-white"
                            : "bg-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {tier}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Messages Stream */}
                <div className="flex-1 p-4 overflow-y-auto space-y-4">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto text-slate-400">
                      <Bot className="w-10 h-10 text-indigo-400 mb-3" />
                      <h3 className="text-sm font-bold text-white mb-1">
                        Prompt Your Infrastructure with Claude or Gemini Subscriptions
                      </h3>
                      <p className="text-xs leading-relaxed">
                        Select a target host (`@prod-db-01`), group (`@group:k8s-prod`), or `@all`. Read-only commands execute automatically; mutating commands or `/etc` edits pause for your approval in Supervised mode and create 1-click rollback snapshots.
                      </p>
                    </div>
                  ) : (
                    messages.map((m, idx) => (
                      <div
                        key={m.id || idx}
                        className={`rounded-xl p-4 border ${
                          m.role === "user"
                            ? "bg-indigo-950/30 border-indigo-500/30 ml-8"
                            : "bg-slate-950/90 border-slate-800 mr-4"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
                          <span className="font-bold uppercase tracking-wider text-slate-200">
                            {m.role === "user" ? "Operator Prompt" : "FleetOps AI Agent"}
                          </span>
                          {m.created_at && <span>{new Date(m.created_at).toLocaleTimeString()}</span>}
                        </div>

                        <div className="text-xs text-slate-100 whitespace-pre-wrap leading-relaxed">{m.content}</div>

                        {/* Executed / Blocked / Pending Tool Calls */}
                        {Array.isArray(m.tool_calls) && m.tool_calls.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {m.tool_calls.map((tc: any, i: number) => (
                              <div key={i} className="bg-[#060911] border border-slate-800 rounded-lg p-3 text-xs">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="font-mono text-indigo-400 font-semibold">
                                    [{tc.tool}] on {tc.host}: <span className="text-slate-200">{tc.command}</span>
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      tc.status === "executed"
                                        ? "bg-emerald-500/15 text-emerald-400"
                                        : tc.status === "pending_approval"
                                        ? "bg-amber-500/20 text-amber-300"
                                        : "bg-red-500/20 text-red-400"
                                    }`}
                                  >
                                    {tc.status}
                                  </span>
                                </div>
                                {tc.output && (
                                  <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto max-h-52 whitespace-pre-wrap bg-slate-950 p-2 rounded">
                                    {tc.output}
                                  </pre>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Created File Snapshots (1-Click Revert) */}
                        {Array.isArray(m.snapshots) && m.snapshots.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {m.snapshots.map((snap: any) => (
                              <button
                                key={snap.snapshotId}
                                onClick={() => handleRevertSnapshot(snap.snapshotId)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold"
                              >
                                <RotateCcw className="w-3.5 h-3.5" /> 1-Click Revert {snap.filePath} on {snap.host}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {/* Pending Approvals Gate */}
                  {sessionApprovals
                    .filter((a) => a.status === "pending")
                    .map((app) => (
                      <div
                        key={app.id}
                        className="bg-amber-950/30 border-2 border-amber-500/50 rounded-xl p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                            Supervised Mode Approval Required on {app.hostname}
                          </div>
                          <span className="text-[11px] text-amber-200/80">{app.reason}</span>
                        </div>
                        <div className="font-mono text-xs bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white">
                          {app.action_type}: {app.command_or_path}
                        </div>
                        {app.diff_preview && (
                          <pre className="text-[11px] font-mono bg-[#060911] border border-slate-800 rounded-lg p-3 text-emerald-300 overflow-x-auto max-h-56">
                            {app.diff_preview}
                          </pre>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleResolveApproval(app.id, "approve")}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Approve & Execute (with Backup Snapshot)
                          </button>
                          <button
                            onClick={() => handleResolveApproval(app.id, "reject")}
                            className="bg-red-600/20 hover:bg-red-600/40 text-red-300 px-4 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
                          >
                            <XCircle className="w-4 h-4" /> Reject
                          </button>
                        </div>
                      </div>
                    ))}
                </div>

                {/* Prompt Input Bar */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleCreateOrSendPrompt();
                  }}
                  className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-3"
                >
                  <input
                    type="text"
                    value={chatPrompt}
                    onChange={(e) => setChatPrompt(e.target.value)}
                    disabled={chatBusy}
                    placeholder={`Ask ${
                      chatProvider === "claude-sub" ? "Claude" : chatProvider === "gemini-sub" ? "Gemini" : "Local LLM"
                    } to inspect or manage ${chatScope}...`}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={chatBusy || !chatPrompt.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition"
                  >
                    <Send className="w-3.5 h-3.5" /> {chatBusy ? "Running Agent..." : "Execute Prompt"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 3: WEB TERMINAL, SFTP FILE EDITOR & SESSION RECORDINGS */}
          {activeTab === "terminal" && (
            <TerminalPanel
              hosts={overview.hosts}
              selectedHostId={selectedHostId}
              onSelectHost={setSelectedHostId}
              snapshots={overview.recentSnapshots}
              onRefreshOverview={fetchOverview}
              onAskAI={(scope, prompt) => {
                setChatScope(scope);
                setActiveTab("ai-chat");
                handleCreateOrSendPrompt(scope, prompt);
              }}
            />
          )}

          {/* TAB 4: SECURITY AUDITS, INVENTORY & 13 COMPLIANCE FRAMEWORKS */}
          {activeTab === "audits" && (
            <div className="space-y-6">
              {/* Scan Runner Bar */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-semibold text-slate-300">Run Fleet Scanner:</span>
                  <select
                    value={selectedScanHostId}
                    onChange={(e) => setSelectedScanHostId(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                  >
                    {overview.hosts.map((h: any) => (
                      <option key={h.id} value={h.id}>
                        {h.hostname} ({h.ip_address})
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedReportType}
                    onChange={(e) => setSelectedReportType(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                  >
                    <option value="security">Security Audit (CIS & Hardening Rules)</option>
                    <option value="inventory">System Inventory (OS, Packages, Services, Ports)</option>
                    <option value="cert">TLS Certificate Discovery (Disk X.509 Expiry)</option>
                    <option value="ssh_keys">SSH Authorized Keys & Sudoers Audit</option>
                    <option value="activity">Login, Sudo & /etc File Activity Audit</option>
                  </select>
                  <button
                    onClick={() => handleRunScan()}
                    disabled={scanRunning}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    {scanRunning ? "Running Scan over SSH..." : "Run Scan Now"}
                  </button>
                </div>

                {activeScanReport && (
                  <a
                    href={`/api/scans/${activeScanReport.id}/export`}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Export Printable Report (PDF/HTML)
                  </a>
                )}
              </div>

              {/* 13 Compliance Frameworks Section */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white">
                      Compliance & Regulatory Frameworks ({catalog.frameworks.length} Built-in Standards)
                    </h2>
                    <p className="text-xs text-slate-400">
                      Evaluates security audit findings against CIS Level 1, CIS Docker, CIS Windows, NIS2, ISO 27001, GDPR Art. 32, DORA, SOC2, PCI-DSS, NIST 800-53, and HIPAA.
                    </p>
                  </div>
                  <select
                    value={selectedFrameworkId}
                    onChange={(e) => setSelectedFrameworkId(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-semibold text-indigo-300"
                  >
                    {catalog.frameworks.map((fw: any) => (
                      <option key={fw.id} value={fw.id}>
                        {fw.name} (v{fw.version})
                      </option>
                    ))}
                  </select>
                </div>

                {complianceResult && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-6 bg-slate-950 border border-slate-800 rounded-xl p-4">
                      <div>
                        <div className="text-xs text-slate-400">Compliance Score</div>
                        <div className="text-2xl font-bold text-emerald-400">{complianceResult.complianceScore}%</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">Passed Controls</div>
                        <div className="text-lg font-bold text-white">
                          {complianceResult.passedControls} / {complianceResult.totalControls}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">Failed Controls</div>
                        <div className="text-lg font-bold text-amber-400">{complianceResult.failedControls}</div>
                      </div>
                      <div className="text-xs text-slate-400 flex-1">{complianceResult.description}</div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                      {(complianceResult.controls || []).map((ctrl: any) => (
                        <div
                          key={ctrl.ref}
                          className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col justify-between gap-2"
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-white">
                                [{ctrl.ref}] {ctrl.name}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  ctrl.status === "pass"
                                    ? "bg-emerald-500/15 text-emerald-400"
                                    : ctrl.status === "fail"
                                    ? "bg-red-500/20 text-red-400"
                                    : "bg-slate-800 text-slate-400"
                                }`}
                              >
                                {ctrl.status}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1">{ctrl.description}</p>
                          </div>

                          {ctrl.failures?.length > 0 && (
                            <div className="border-t border-slate-800/80 pt-2 mt-1 space-y-1.5">
                              {ctrl.failures.map((f: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between text-[11px]">
                                  <span className="text-amber-300 truncate pr-2">
                                    <strong>{f.hostname}:</strong> {f.finding}
                                  </span>
                                  <button
                                    onClick={() => {
                                      setChatScope(`@${f.hostname}`);
                                      setActiveTab("ai-chat");
                                      handleCreateOrSendPrompt(
                                        `@${f.hostname}`,
                                        `Remediate security finding "${f.finding}" (${f.slug}) on ${f.hostname}. Recommended remediation: ${f.remediation}`
                                      );
                                    }}
                                    className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold inline-flex items-center gap-1 shrink-0"
                                  >
                                    <Wrench className="w-3 h-3" /> Fix with AI
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Active Scan Output Viewer */}
              {activeScanReport && (
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">
                      Latest Scan Output: {activeScanReport.summary?.hostname} —{" "}
                      {activeScanReport.report_type.toUpperCase()}
                    </h3>
                    {activeScanReport.score !== null && (
                      <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-bold">
                        Score: {activeScanReport.score} / 100
                      </span>
                    )}
                  </div>

                  {Array.isArray(activeScanReport.findings) && activeScanReport.findings.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-amber-300">
                        Findings ({activeScanReport.findings.length})
                      </div>
                      {activeScanReport.findings.map((f: any, i: number) => (
                        <div
                          key={i}
                          className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex items-center justify-between gap-3 text-xs"
                        >
                          <div>
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold uppercase text-[10px] mr-2">
                              {f.severity}
                            </span>
                            <strong className="text-white">{f.finding}</strong>
                            <div className="text-slate-400 text-[11px] mt-0.5">{f.remediation || f.explanation}</div>
                          </div>
                          <button
                            onClick={() => {
                              const hn = activeScanReport.summary?.hostname;
                              setChatScope(`@${hn}`);
                              setActiveTab("ai-chat");
                              handleCreateOrSendPrompt(
                                `@${hn}`,
                                `Fix security finding "${f.finding}" on ${hn}: ${f.remediation}`
                              );
                            }}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 inline-flex items-center gap-1"
                          >
                            <Wrench className="w-3.5 h-3.5" /> Fix with AI
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.entries<any>(activeScanReport.raw_results || {}).map(([k, v]) => (
                      <div key={k} className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                        <div className="text-xs font-bold text-indigo-300 mb-1.5">{v.name || k}</div>
                        <pre className="text-[11px] font-mono text-slate-300 max-h-48 overflow-auto whitespace-pre-wrap">
                          {v.output || "(empty)"}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: SERVICE MONITORS & 55 SKILLS CATALOG */}
          {activeTab === "monitors" && (
            <div className="space-y-6">
              {/* Create Service Monitor */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5">
                <h2 className="text-sm font-bold text-white mb-3">
                  Active Service Monitors ({overview.monitors.length} configured / {catalog.monitors.length} templates)
                </h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await fetch("/api/monitors", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        hostId: newMonitor.hostId || overview.hosts[0]?.id,
                        monitorSlug: newMonitor.monitorSlug,
                        name: newMonitor.name,
                        config: { port: Number(newMonitor.port) || 22 },
                      }),
                    });
                    notify("Service monitor created and probed!");
                    await fetchOverview();
                  }}
                  className="flex flex-wrap items-center gap-3 mb-4 text-xs"
                >
                  <select
                    value={newMonitor.hostId}
                    onChange={(e) => setNewMonitor({ ...newMonitor, hostId: e.target.value })}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white"
                  >
                    {overview.hosts.map((h: any) => (
                      <option key={h.id} value={h.id}>
                        {h.hostname}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newMonitor.monitorSlug}
                    onChange={(e) => {
                      const slug = e.target.value;
                      const found = catalog.monitors.find((m: any) => m.slug === slug);
                      setNewMonitor({
                        ...newMonitor,
                        monitorSlug: slug,
                        name: found?.name || slug,
                        port: found?.definition?.defaults?.port || 22,
                      });
                    }}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white"
                  >
                    {catalog.monitors.map((m: any) => (
                      <option key={m.slug} value={m.slug}>
                        {m.name} ({m.category})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={newMonitor.port}
                    onChange={(e) => setNewMonitor({ ...newMonitor, port: Number(e.target.value) })}
                    placeholder="Port"
                    className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white"
                  />
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg font-semibold"
                  >
                    + Add Monitor
                  </button>
                </form>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {overview.monitors.map((m: any) => (
                    <div
                      key={m.id}
                      className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-white">
                          {m.hostname} — {m.name}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{m.last_value || "Pending check"}</div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                          m.last_status === "up"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {m.last_status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 55 Built-In Agent Skills Catalog */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <h2 className="text-sm font-bold text-white">
                    Built-In Operational Skills Catalog ({catalog.skills.length} Linux & Windows Modules)
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto">
                  {catalog.skills.map((s: any) => (
                    <div key={`${s.slug}-${s.node_type}`} className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-white">{s.name}</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-indigo-300">
                          {s.node_type}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{s.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: SSH VAULT, CREDENTIAL ROTATION & SOFTWARE KEYSTORE */}
          {activeTab === "vault" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* SSH Keys Vault */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
                <h2 className="text-sm font-bold text-white">AES-256-GCM SSH Key Vault</h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newKeyName.trim()) return;
                    await fetch("/api/ssh-keys", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: newKeyName, keyType: newKeyType }),
                    });
                    setNewKeyName("");
                    notify("Generated new SSH keypair in Vault!");
                    await fetchOverview();
                  }}
                  className="flex items-center gap-2 text-xs"
                >
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="Key name (e.g. dmz-ed25519)"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white"
                  />
                  <select
                    value={newKeyType}
                    onChange={(e) => setNewKeyType(e.target.value as any)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  >
                    <option value="ed25519">Ed25519</option>
                    <option value="rsa">RSA 4096</option>
                  </select>
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg font-semibold"
                  >
                    Generate Key
                  </button>
                </form>

                <div className="space-y-2.5">
                  {overview.sshKeys.map((k: any) => (
                    <div key={k.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">
                          {k.name}{" "}
                          {k.is_default && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">
                              DEFAULT
                            </span>
                          )}
                        </span>
                        <button
                          onClick={() => copyToClipboard(k.public_key, k.id)}
                          className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
                        >
                          {copiedText === k.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          Copy Public Key
                        </button>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 truncate">{k.fingerprint}</div>
                      <div className="text-[11px] font-mono text-slate-500 truncate">{k.public_key}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Central Software Keystore */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
                <h2 className="text-sm font-bold text-white">Central Keystore (Sign / Encrypt / Wrap)</h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newKeystoreHandle.trim()) return;
                    await fetch("/api/keystore", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ handle: newKeystoreHandle, algorithm: newKeystoreAlg }),
                    });
                    setNewKeystoreHandle("");
                    notify("Created Keystore key!");
                    await fetchVaultExtras();
                  }}
                  className="flex items-center gap-2 text-xs"
                >
                  <input
                    type="text"
                    value={newKeystoreHandle}
                    onChange={(e) => setNewKeystoreHandle(e.target.value)}
                    placeholder="Key handle (e.g. artifact-signing-key)"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white"
                  />
                  <select
                    value={newKeystoreAlg}
                    onChange={(e) => setNewKeystoreAlg(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  >
                    <option value="EC-P256">EC P-256 (Sign)</option>
                    <option value="RSA-2048">RSA 2048 (Sign)</option>
                    <option value="AES-256">AES-256-GCM (Wrap/Encrypt)</option>
                    <option value="HMAC-SHA256">HMAC-SHA256</option>
                  </select>
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg font-semibold"
                  >
                    Create Key
                  </button>
                </form>

                {keystoreTestResult && (
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-indigo-500/40 font-mono text-[11px] text-indigo-300 break-all">
                    {keystoreTestResult}
                  </div>
                )}

                <div className="space-y-2">
                  {keystoreKeys.map((k: any) => (
                    <div
                      key={k.id}
                      className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-white">
                          {k.handle} <span className="text-indigo-400 font-mono">({k.algorithm})</span>
                        </div>
                        <div className="text-[11px] text-slate-400">Used {k.usage_count} times</div>
                      </div>
                      <button
                        onClick={async () => {
                          const r = await fetch(`/api/keystore/${k.id}/op`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              operation: k.algorithm === "AES-256" ? "encrypt" : "sign",
                              payload: `fleetops-attestation-${new Date().toISOString()}`,
                            }),
                          });
                          const d = await r.json();
                          setKeystoreTestResult(`${d.handle} (${d.operation}): ${d.result}`);
                          await fetchVaultExtras();
                        }}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg font-medium"
                      >
                        Test {k.algorithm === "AES-256" ? "Encrypt" : "Sign"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: UNIVERSAL AI PROVIDERS HUB, MCP SERVER & AGENT INSTALLER SETTINGS */}
          {activeTab === "settings" && (
            <div className="space-y-6">
              {/* Universal 12 AI Providers Configuration Grid */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      Universal AI Brain Connector (All Major Subscriptions, Cloud APIs & Self-Hosted LLMs)
                    </h2>
                    <p className="text-xs text-slate-400">
                      Connect your existing CLI subscriptions (Claude Pro/Max, Gemini Pro/Ultra, ChatGPT/Codex) or any API / local LLM endpoint.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowOnboarding(true)}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-semibold inline-flex items-center gap-1.5"
                  >
                    <Wand2 className="w-3.5 h-3.5" /> Launch Environment & AI Setup Wizard
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {(overview.aiProviders || []).map((prov: any) => {
                    const isEditing = editingProviderId === prov.id;
                    return (
                      <div
                        key={prov.id}
                        className={`rounded-xl border p-4 flex flex-col justify-between transition ${
                          prov.enabled
                            ? "bg-slate-950/90 border-emerald-500/40 shadow-md shadow-emerald-950/10"
                            : "bg-slate-950/50 border-slate-800"
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-bold text-sm text-white">{prov.name}</div>
                              <div className="text-[11px] text-indigo-300 font-mono">
                                {prov.vendor} &bull; {prov.auth_mode}
                              </div>
                            </div>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                prov.enabled
                                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                  : "bg-slate-800 text-slate-400"
                              }`}
                            >
                              {prov.enabled ? "ACTIVE" : "READY TO CONNECT"}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-2 leading-relaxed">{prov.description}</p>
                          <div className="mt-2.5 text-[11px] font-mono text-slate-300">
                            Default Model: <span className="text-indigo-300">{prov.default_model}</span>
                          </div>

                          {isEditing && (
                            <div className="mt-3 pt-3 border-t border-slate-800 space-y-2 text-xs">
                              {prov.auth_mode !== "cli_oauth" && (
                                <div>
                                  <label className="block text-[10px] text-slate-400 mb-0.5">
                                    API Key / Token (AES-256-GCM Encrypted)
                                  </label>
                                  <input
                                    type="password"
                                    value={providerApiKeyInput}
                                    onChange={(e) => setProviderApiKeyInput(e.target.value)}
                                    placeholder={prov.has_api_key ? "•••••••• (Saved in Vault)" : "Paste API Key..."}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                                  />
                                </div>
                              )}
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-0.5">Base URL / Endpoint</label>
                                <input
                                  value={providerBaseUrlInput}
                                  onChange={(e) => setProviderBaseUrlInput(e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-0.5">Default Model</label>
                                <input
                                  value={providerModelInput}
                                  onChange={(e) => setProviderModelInput(e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                                />
                              </div>
                              <div className="flex justify-end gap-1.5 pt-1">
                                <button
                                  onClick={() => setEditingProviderId("")}
                                  className="px-2.5 py-1 rounded bg-slate-800 text-slate-300"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={async () => {
                                    await fetch(`/api/ai/providers/${prov.id}`, {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        apiKey: providerApiKeyInput || undefined,
                                        baseUrl: providerBaseUrlInput || undefined,
                                        defaultModel: providerModelInput || undefined,
                                        enabled: true,
                                      }),
                                    });
                                    setEditingProviderId("");
                                    setProviderApiKeyInput("");
                                    await fetchOverview();
                                    notify(`Updated & enabled ${prov.name}`);
                                  }}
                                  className="px-3 py-1 rounded bg-indigo-600 text-white font-semibold"
                                >
                                  Save & Enable
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs">
                          <button
                            onClick={() => {
                              setEditingProviderId(isEditing ? "" : prov.id);
                              setProviderBaseUrlInput(prov.base_url || "");
                              setProviderModelInput(prov.default_model || "");
                              setProviderApiKeyInput("");
                            }}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                          >
                            {isEditing ? "Close" : "Configure"}
                          </button>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={async () => {
                                notify(`Testing ${prov.name}...`);
                                const r = await fetch(`/api/ai/providers/${prov.id}/test`, { method: "POST" });
                                const d = await r.json();
                                await fetchOverview();
                                notify(d.ok ? `${prov.name}: Connected (${d.reply})` : `${prov.name}: ${d.error}`);
                              }}
                              className="px-2.5 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 font-medium"
                            >
                              Test Connection
                            </button>
                            <button
                              onClick={() => {
                                setChatProvider(prov.id);
                                setChatModel(prov.default_model);
                                setActiveTab("ai-chat");
                              }}
                              className="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-medium"
                            >
                              Use in Chat
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* CLI Subscription Status */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
                  <h2 className="text-sm font-bold text-white">CLI OAuth Subscription Profiles (/data/ai-profiles)</h2>
                  <div className="space-y-3 text-xs">
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">Anthropic Claude Code CLI (`claude`)</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">
                          {overview.aiStatus?.claude?.authenticated ? "AUTHENTICATED" : "NOT CONFIGURED"}
                        </span>
                      </div>
                      <div className="text-slate-400 mt-1">
                        Binary:{" "}
                        <code className="text-slate-200">{overview.aiStatus?.claude?.binaryPath || "not found"}</code>{" "}
                        ({overview.aiStatus?.claude?.version}) &bull; Tier:{" "}
                        <strong className="text-indigo-300">{overview.aiStatus?.claude?.subscriptionType}</strong>
                      </div>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">Google Gemini CLI (`gemini`)</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">
                          {overview.aiStatus?.gemini?.authenticated ? "AUTHENTICATED" : "NOT CONFIGURED"}
                        </span>
                      </div>
                      <div className="text-slate-400 mt-1">
                        Binary:{" "}
                        <code className="text-slate-200">{overview.aiStatus?.gemini?.binaryPath || "not found"}</code>{" "}
                        ({overview.aiStatus?.gemini?.version}) &bull; Account:{" "}
                        <strong className="text-indigo-300">{overview.aiStatus?.gemini?.activeAccount || "OAuth"}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Built-in MCP Server & Outbound Go Agent One-Liner */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
                  <h2 className="text-sm font-bold text-white">MCP Server Connector & Outbound Go Agent</h2>
                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="font-semibold text-slate-300 mb-1">
                        External MCP Server Endpoint (for Claude Desktop / Claude Code / Antigravity / Cursor):
                      </div>
                      <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-[11px] text-indigo-300 overflow-x-auto">
{`{
  "mcpServers": {
    "fleetops-ai": {
      "url": "${window.location.origin}/mcp"
    }
  }
}`}
                      </pre>
                    </div>

                    <div>
                      <div className="font-semibold text-slate-300 mb-1">
                        Ultra-Lightweight Outbound Go Client Agent Installer (~4.2 MB static binary, zero deps):
                      </div>
                      <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-[11px] text-emerald-300 overflow-x-auto">
                        {`curl -fsSL "${window.location.origin}/install.sh" | sudo sh`}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Add Host / Network Appliance Modal */}
      {showAddHost && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <h2 className="text-base font-bold text-white">
              Add Server, Switch, Firewall or Network Printer
            </h2>
            <form onSubmit={handleAddHost} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Hostname / Device Name</label>
                  <input
                    required
                    value={newHost.hostname}
                    onChange={(e) => setNewHost({ ...newHost, hostname: e.target.value })}
                    placeholder="core-sw01 / fw-edge01 / srv01"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">IP Address / FQDN</label>
                  <input
                    required
                    value={newHost.ipAddress}
                    onChange={(e) => setNewHost({ ...newHost, ipAddress: e.target.value })}
                    placeholder="192.168.1.10"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Admin / SSH User</label>
                  <input
                    value={newHost.sshUser}
                    onChange={(e) => setNewHost({ ...newHost, sshUser: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Port (SSH/IPP/HTTPS)</label>
                  <input
                    type="number"
                    value={newHost.sshPort}
                    onChange={(e) => setNewHost({ ...newHost, sshPort: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">System / Device Type</label>
                  <select
                    value={newHost.osType}
                    onChange={(e) => setNewHost({ ...newHost, osType: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="linux">Linux Server / K8s / Docker</option>
                    <option value="windows">Windows Server / AD</option>
                    <option value="switch">Network Switch (Cisco/Aruba/UniFi)</option>
                    <option value="firewall">Firewall / VPN Gateway</option>
                    <option value="router">Core Router / Gateway</option>
                    <option value="printer">Network Printer / MFP (SNMP/IPP)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Group / Role</label>
                  <input
                    value={newHost.groupName}
                    onChange={(e) => setNewHost({ ...newHost, groupName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">SSH Key</label>
                  <select
                    value={newHost.sshKeyId}
                    onChange={(e) => setNewHost({ ...newHost, sshKeyId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="">Default Vault SSH Key</option>
                    {overview.sshKeys.map((k: any) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  Optional 1-Time Password (auto-installs Vault SSH Public Key into ~/.ssh/authorized_keys)
                </label>
                <input
                  type="password"
                  value={newHost.bootstrapPassword}
                  onChange={(e) => setNewHost({ ...newHost, bootstrapPassword: e.target.value })}
                  placeholder="Leave blank if SSH key is already authorized"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddHost(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold">
                  Add & Probe System
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Environment Discovery, Credentials & AI Governance Setup Wizard */}
      <OnboardingWizardModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        envProfile={overview.envProfile}
        aiProviders={overview.aiProviders || []}
        onSaved={() => {
          fetchOverview();
          fetchCatalog();
          notify("Saved Environment Profile, Vault Credentials & AI Governance Policy!");
        }}
      />

      {/* Global Command Palette (Ctrl+K) */}
      <CommandPaletteModal
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        hosts={overview.hosts || []}
        mcpPlugins={catalog.mcpPlugins || []}
        skills={catalog.skills || []}
        onNavigateTab={(tab) => setActiveTab(tab)}
        onSelectHost={(id) => setSelectedHostId(id)}
        onRunAIPrompt={(prompt, scope) => {
          setChatScope(scope);
          setChatPrompt(prompt);
          setActiveTab("ai-chat");
        }}
      />
    </div>
  );
}
