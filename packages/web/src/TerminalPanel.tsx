import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import {
  Terminal as TerminalIcon,
  FolderOpen,
  Save,
  RotateCcw,
  Play,
  RefreshCw,
  FileText,
  Sparkles,
  Film,
  CheckCircle2,
} from "lucide-react";

interface Props {
  hosts: any[];
  selectedHostId: string;
  onSelectHost: (id: string) => void;
  snapshots: any[];
  onRefreshOverview: () => void;
  onAskAI: (host: string, prompt: string) => void;
}

export const TerminalPanel: React.FC<Props> = ({
  hosts,
  selectedHostId,
  onSelectHost,
  snapshots,
  onRefreshOverview,
  onAskAI,
}) => {
  const [subTab, setSubTab] = useState<"console" | "files" | "recordings">("console");
  const termContainerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const [connected, setConnected] = useState(false);
  const [aiHelperPrompt, setAiHelperPrompt] = useState("");

  // File browser state
  const [dirPath, setDirPath] = useState("/etc");
  const [dirItems, setDirItems] = useState<any[]>([]);
  const [activeFilePath, setActiveFilePath] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [fileStatus, setFileStatus] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Recordings state
  const [recordings, setRecordings] = useState<any[]>([]);
  const [replayOutput, setReplayOutput] = useState<string>("");
  const [activeRecording, setActiveRecording] = useState<any | null>(null);

  const currentHost = hosts.find((h) => h.id === selectedHostId) || hosts[0];

  useEffect(() => {
    if (!selectedHostId && hosts[0]?.id) {
      onSelectHost(hosts[0].id);
    }
  }, [hosts, selectedHostId]);

  useEffect(() => {
    if (subTab !== "console" || !currentHost || !termContainerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      theme: {
        background: "#060911",
        foreground: "#e2e8f0",
        cursor: "#6366f1",
        selectionBackground: "#312e81",
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termContainerRef.current);
    setTimeout(() => fitAddon.fit(), 60);
    termRef.current = term;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${window.location.host}/ws/terminal?hostId=${encodeURIComponent(
      currentHost.id
    )}&cols=${term.cols || 110}&rows=${term.rows || 32}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    term.writeln(`\x1b[1;34m==> FleetOps AI Secure Web Console — Connecting to ${currentHost.hostname} (${currentHost.ip_address})...\x1b[0m`);

    ws.onopen = () => {
      setConnected(true);
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "output" && msg.data) {
          term.write(msg.data);
        } else if (msg.type === "error" && msg.data) {
          term.writeln(`\r\n\x1b[1;31m${msg.data}\x1b[0m`);
        }
      } catch {
        term.write(ev.data);
      }
    };
    ws.onclose = () => {
      setConnected(false);
      term.writeln("\r\n\x1b[1;33m[Session disconnected]\x1b[0m");
    };

    const disp = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    const handleResize = () => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      disp.dispose();
      ws.close();
      term.dispose();
    };
  }, [subTab, currentHost?.id]);

  const loadDirectory = async (targetDir = dirPath) => {
    if (!currentHost) return;
    setLoadingFiles(true);
    setFileStatus("");
    try {
      const r = await fetch(`/api/hosts/${currentHost.id}/files?dir=${encodeURIComponent(targetDir)}`);
      const d = await r.json();
      if (d.items) {
        setDirPath(targetDir);
        setDirItems(d.items);
      }
    } catch (e: any) {
      setFileStatus(`Failed to list directory: ${e?.message}`);
    } finally {
      setLoadingFiles(false);
    }
  };

  const openFile = async (fullPath: string) => {
    if (!currentHost) return;
    setLoadingFiles(true);
    setFileStatus("");
    try {
      const r = await fetch(`/api/hosts/${currentHost.id}/files?file=${encodeURIComponent(fullPath)}`);
      const d = await r.json();
      setActiveFilePath(fullPath);
      setFileContent(d.content ?? "");
    } catch (e: any) {
      setFileStatus(`Error reading file: ${e?.message}`);
    } finally {
      setLoadingFiles(false);
    }
  };

  const saveFileWithSnapshot = async () => {
    if (!currentHost || !activeFilePath) return;
    setFileStatus("Saving with pre-change backup snapshot...");
    try {
      const r = await fetch(`/api/hosts/${currentHost.id}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: activeFilePath, content: fileContent }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Save failed");
      setFileStatus(`Saved! Pre-change snapshot ${d.snapshotId?.slice(0, 8)} created for 1-click revert.`);
      onRefreshOverview();
    } catch (e: any) {
      setFileStatus(`Save failed: ${e?.message}`);
    }
  };

  const handleRevertSnapshot = async (snapshotId: string) => {
    try {
      const r = await fetch(`/api/snapshots/${snapshotId}/revert`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Revert failed");
      setFileStatus(`Reverted ${d.filePath} on ${d.hostname} to previous state!`);
      if (activeFilePath === d.filePath) {
        openFile(activeFilePath);
      }
      onRefreshOverview();
    } catch (e: any) {
      setFileStatus(`Revert failed: ${e?.message}`);
    }
  };

  const loadRecordings = async () => {
    const r = await fetch("/api/recordings");
    const d = await r.json();
    setRecordings(Array.isArray(d) ? d : []);
  };

  const playRecording = async (recId: string) => {
    const r = await fetch(`/api/recordings/${recId}`);
    const d = await r.json();
    if (!d) return;
    setActiveRecording(d);
    const events: Array<[number, string, string]> = d.events || [];
    setReplayOutput(events.map((e) => e[2]).join(""));
  };

  useEffect(() => {
    if (subTab === "files" && currentHost) {
      loadDirectory(dirPath);
    } else if (subTab === "recordings") {
      loadRecordings();
    }
  }, [subTab, currentHost?.id]);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Top Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-xl p-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Target Host:</span>
          <select
            value={currentHost?.id || ""}
            onChange={(e) => onSelectHost(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
          >
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.hostname} ({h.ip_address}) — {h.status.toUpperCase()}
              </option>
            ))}
          </select>
          {subTab === "console" && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                connected
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              {connected ? "SSH PTY Connected (Recording Active)" : "Connecting / Idle"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSubTab("console")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              subTab === "console"
                ? "bg-indigo-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            <TerminalIcon className="w-3.5 h-3.5" /> Interactive SSH Console
          </button>
          <button
            onClick={() => setSubTab("files")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              subTab === "files"
                ? "bg-indigo-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" /> SFTP File Editor & /etc Revert
          </button>
          <button
            onClick={() => setSubTab("recordings")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              subTab === "recordings"
                ? "bg-indigo-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            <Film className="w-3.5 h-3.5" /> Recorded Admin Sessions
          </button>
        </div>
      </div>

      {/* Console View */}
      {subTab === "console" && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-1 min-h-[520px]">
          <div className="lg:col-span-3 bg-[#060911] border border-slate-800 rounded-xl p-3 flex flex-col">
            <div ref={termContainerRef} className="flex-1 w-full min-h-[460px]" />
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm mb-2">
                <Sparkles className="w-4 h-4" /> AI Terminal Sidekick
              </div>
              <p className="text-xs text-slate-400 mb-3">
                Ask your connected Claude or Gemini subscription to diagnose an issue or run a multi-step task on{" "}
                <strong className="text-slate-200">{currentHost?.hostname}</strong>.
              </p>
              <textarea
                rows={4}
                value={aiHelperPrompt}
                onChange={(e) => setAiHelperPrompt(e.target.value)}
                placeholder={`e.g. Inspect failed systemd units and last 30 lines of journalctl on ${currentHost?.hostname}`}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => {
                  if (!aiHelperPrompt.trim() || !currentHost) return;
                  onAskAI(`@${currentHost.hostname}`, aiHelperPrompt);
                }}
                className="mt-2 w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2 text-xs font-semibold transition"
              >
                Send to AI Fleet Agent
              </button>
            </div>

            <div className="border-t border-slate-800 pt-3 mt-4">
              <div className="text-xs font-semibold text-slate-300 mb-2">Recent /etc Snapshots on Host</div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {snapshots
                  .filter((s) => s.host_id === currentHost?.id)
                  .slice(0, 5)
                  .map((s) => (
                    <div key={s.id} className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs">
                      <div className="font-mono text-slate-200 truncate">{s.file_path}</div>
                      <div className="flex items-center justify-between mt-1 text-slate-400">
                        <span>{new Date(s.created_at).toLocaleTimeString()}</span>
                        {s.reverted ? (
                          <span className="text-emerald-400">Reverted</span>
                        ) : (
                          <button
                            onClick={() => handleRevertSnapshot(s.id)}
                            className="text-amber-400 hover:text-amber-300 inline-flex items-center gap-1 font-medium"
                          >
                            <RotateCcw className="w-3 h-3" /> Revert
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Files & /etc Rollback Editor View */}
      {subTab === "files" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-[520px]">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                value={dirPath}
                onChange={(e) => setDirPath(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
              />
              <button
                onClick={() => loadDirectory(dirPath)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg text-xs inline-flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? "animate-spin" : ""}`} /> Go
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 text-xs">
              {dirPath !== "/" && (
                <button
                  onClick={() => {
                    const parent = dirPath.split("/").slice(0, -1).join("/") || "/";
                    loadDirectory(parent);
                  }}
                  className="w-full text-left py-2 px-2 hover:bg-slate-800/60 text-indigo-400 font-mono"
                >
                  .. (Parent Directory)
                </button>
              )}
              {dirItems.map((item) => {
                const full = `${dirPath.replace(/\/$/, "")}/${item.name}`;
                return (
                  <button
                    key={item.name}
                    onClick={() => (item.type === "dir" ? loadDirectory(full) : openFile(full))}
                    className="w-full flex items-center justify-between py-2 px-2 hover:bg-slate-800/60 text-left"
                  >
                    <span className="flex items-center gap-2 font-mono truncate">
                      {item.type === "dir" ? (
                        <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span className={item.type === "dir" ? "text-amber-200" : "text-slate-200"}>{item.name}</span>
                    </span>
                    <span className="text-[11px] text-slate-500 shrink-0">{item.size} B</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xs text-slate-400">File:</span>
                <input
                  type="text"
                  value={activeFilePath}
                  onChange={(e) => setActiveFilePath(e.target.value)}
                  placeholder="/etc/..."
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white"
                />
              </div>
              <button
                onClick={saveFileWithSnapshot}
                disabled={!activeFilePath}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" /> Save (Auto-Snapshot Backup)
              </button>
            </div>
            {fileStatus && (
              <div className="mb-2 px-3 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {fileStatus}
              </div>
            )}
            <textarea
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              placeholder="Select a file on the left or enter a path to edit..."
              className="flex-1 w-full min-h-[320px] bg-[#060911] border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
            <div className="mt-3 pt-3 border-t border-slate-800">
              <div className="text-xs font-semibold text-slate-300 mb-2">
                Change Tracking & 1-Click Rollback History (All Hosts)
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                {snapshots.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs"
                  >
                    <div className="truncate pr-2">
                      <span className="text-indigo-400 font-semibold">{s.hostname}:</span>{" "}
                      <span className="font-mono text-slate-200">{s.file_path}</span>
                      <div className="text-[11px] text-slate-500">
                        by {s.created_by} at {new Date(s.created_at).toLocaleString()}
                      </div>
                    </div>
                    {s.reverted ? (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[11px]">
                        Reverted
                      </span>
                    ) : (
                      <button
                        onClick={() => handleRevertSnapshot(s.id)}
                        className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold inline-flex items-center gap-1 shrink-0"
                      >
                        <RotateCcw className="w-3 h-3" /> Revert
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recorded Admin Sessions View */}
      {subTab === "recordings" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-[480px]">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 overflow-y-auto">
            <h3 className="text-sm font-semibold text-white mb-3">Recorded Console Sessions</h3>
            {recordings.length === 0 ? (
              <p className="text-xs text-slate-400">
                No recorded sessions yet. Open an SSH Console session and run commands to record automatically.
              </p>
            ) : (
              <div className="space-y-2">
                {recordings.map((rec) => (
                  <div
                    key={rec.id}
                    className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-semibold text-white">
                        {rec.hostname} <span className="text-slate-400 font-normal">({rec.username})</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {new Date(rec.created_at).toLocaleString()} &bull; {rec.duration_sec}s
                      </div>
                    </div>
                    <button
                      onClick={() => playRecording(rec.id)}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded-lg text-xs inline-flex items-center gap-1"
                    >
                      <Play className="w-3 h-3" /> Replay
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="lg:col-span-2 bg-[#060911] border border-slate-800 rounded-xl p-4 flex flex-col">
            <div className="text-xs text-slate-400 mb-2">
              {activeRecording
                ? `Replaying ${activeRecording.hostname} (${new Date(activeRecording.created_at).toLocaleString()})`
                : "Select a recorded session to inspect selectable terminal transcript & timeline markers"}
            </div>
            <pre className="flex-1 bg-slate-950 border border-slate-800/80 rounded-lg p-3 font-mono text-xs text-emerald-300 overflow-auto whitespace-pre-wrap">
              {replayOutput || "No recording selected."}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
