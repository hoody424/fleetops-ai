import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pool, logAudit } from "./db.js";
import { decryptSecret } from "./vault.js";
import {
  classifyCommandSafety,
  createSimpleDiff,
  executeOnHost,
  readFileOnHost,
  revertFileSnapshot,
  writeFileWithBackupOnHost,
} from "./executor.js";
import { evaluateComplianceFramework, runReportScanOnHost } from "./scanners.js";

const AI_PROFILES_DIR = process.env.AI_PROFILES_DIR || path.join(os.homedir(), ".fleetops-ai-profiles");

export function ensureAIProfilesDir(): void {
  fs.mkdirSync(AI_PROFILES_DIR, { recursive: true });
  const claudeTarget = path.join(AI_PROFILES_DIR, ".claude");
  const geminiTarget = path.join(AI_PROFILES_DIR, ".gemini");
  const codexTarget = path.join(AI_PROFILES_DIR, ".codex");

  // Auto-seed from current user's ~/.claude and ~/.gemini if present and target doesn't exist yet
  const homeClaude = path.join(os.homedir(), ".claude");
  const homeGemini = path.join(os.homedir(), ".gemini");
  const homeCodex = path.join(os.homedir(), ".codex");

  if (!fs.existsSync(claudeTarget) && fs.existsSync(homeClaude)) {
    try {
      fs.mkdirSync(claudeTarget, { recursive: true });
      for (const f of [".credentials.json", "settings.json", "config.json"]) {
        const src = path.join(homeClaude, f);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(claudeTarget, f));
        }
      }
    } catch {
      // Ignore copy warnings
    }
  }
  const homeClaudeJson = path.join(os.homedir(), ".claude.json");
  const targetClaudeJson = path.join(AI_PROFILES_DIR, ".claude.json");
  if (!fs.existsSync(targetClaudeJson) && fs.existsSync(homeClaudeJson)) {
    try {
      fs.copyFileSync(homeClaudeJson, targetClaudeJson);
    } catch {
      // Ignore
    }
  }

  if (!fs.existsSync(geminiTarget) && fs.existsSync(homeGemini)) {
    try {
      fs.mkdirSync(geminiTarget, { recursive: true });
      for (const f of ["oauth_creds.json", "google_accounts.json", "settings.json"]) {
        const src = path.join(homeGemini, f);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(geminiTarget, f));
        }
      }
    } catch {
      // Ignore
    }
  }

  if (!fs.existsSync(codexTarget) && fs.existsSync(homeCodex)) {
    try {
      fs.mkdirSync(codexTarget, { recursive: true });
      for (const f of ["auth.json", "config.json"]) {
        const src = path.join(homeCodex, f);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(codexTarget, f));
        }
      }
    } catch {
      // Ignore
    }
  }
}

function findBinary(name: string, envVar?: string): string | null {
  if (envVar && process.env[envVar]) return process.env[envVar]!;
  const candidates = [
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
    path.join(os.homedir(), `.local/bin/${name}`),
    path.join(AI_PROFILES_DIR, `.local/bin/${name}`),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  try {
    return execFileSync("which", [name], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

export function getAISubscriptionStatus() {
  ensureAIProfilesDir();
  const claudeBin = findBinary("claude", "CLAUDE_CLI_PATH");
  const geminiBin = findBinary("gemini", "GEMINI_CLI_PATH");
  const codexBin = findBinary("codex", "CODEX_CLI_PATH");

  let claudeVersion = "";
  if (claudeBin) {
    try {
      claudeVersion = execFileSync(claudeBin, ["--version"], { encoding: "utf8", timeout: 4000 }).trim();
    } catch {
      claudeVersion = "installed";
    }
  }

  let geminiVersion = "";
  if (geminiBin) {
    try {
      geminiVersion = execFileSync(geminiBin, ["--version"], { encoding: "utf8", timeout: 4000 }).trim();
    } catch {
      geminiVersion = "installed";
    }
  }

  const claudeCredPaths = [
    path.join(AI_PROFILES_DIR, ".claude", ".credentials.json"),
    path.join(os.homedir(), ".claude", ".credentials.json"),
  ];
  let claudeAuth = false;
  let claudeSubType = "none";
  for (const p of claudeCredPaths) {
    if (fs.existsSync(p)) {
      try {
        const d = JSON.parse(fs.readFileSync(p, "utf8"));
        if (d.claudeAiOauth?.accessToken || d.accessToken || Object.keys(d).length > 0) {
          claudeAuth = true;
          claudeSubType = d.claudeAiOauth?.subscriptionType || "Claude Pro/Max OAuth";
          break;
        }
      } catch {
        // Ignore
      }
    }
  }

  const geminiCredPaths = [
    path.join(AI_PROFILES_DIR, ".gemini", "oauth_creds.json"),
    path.join(os.homedir(), ".gemini", "oauth_creds.json"),
  ];
  let geminiAuth = false;
  let geminiAccount = "";
  for (const p of geminiCredPaths) {
    if (fs.existsSync(p)) {
      try {
        const d = JSON.parse(fs.readFileSync(p, "utf8"));
        if (d.refresh_token || d.access_token) {
          geminiAuth = true;
          break;
        }
      } catch {
        // Ignore
      }
    }
  }
  const geminiAccPaths = [
    path.join(AI_PROFILES_DIR, ".gemini", "google_accounts.json"),
    path.join(os.homedir(), ".gemini", "google_accounts.json"),
  ];
  for (const p of geminiAccPaths) {
    if (fs.existsSync(p)) {
      try {
        const d = JSON.parse(fs.readFileSync(p, "utf8"));
        geminiAccount = d.active || "";
        if (geminiAccount) break;
      } catch {
        // Ignore
      }
    }
  }

  const codexCredPaths = [
    path.join(AI_PROFILES_DIR, ".codex", "auth.json"),
    path.join(os.homedir(), ".codex", "auth.json"),
  ];
  let codexAuth = false;
  for (const p of codexCredPaths) {
    if (fs.existsSync(p)) {
      codexAuth = true;
      break;
    }
  }

  return {
    profilesDir: AI_PROFILES_DIR,
    claude: {
      installed: Boolean(claudeBin),
      binaryPath: claudeBin,
      version: claudeVersion,
      authenticated: claudeAuth,
      subscriptionType: claudeSubType,
      models: ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5"],
    },
    gemini: {
      installed: Boolean(geminiBin),
      binaryPath: geminiBin,
      version: geminiVersion,
      authenticated: geminiAuth,
      activeAccount: geminiAccount || (geminiAuth ? "Google OAuth Connected" : ""),
      models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    },
    codex: {
      installed: Boolean(codexBin),
      binaryPath: codexBin,
      authenticated: codexAuth,
      models: ["gpt-5", "gpt-4.1", "o3", "o4-mini"],
    },
    localLlm: {
      configured: Boolean(process.env.FALLBACK_LLM_URL || process.env.LOCAL_LLM_BASE_URL),
      endpoint: process.env.FALLBACK_LLM_URL || process.env.LOCAL_LLM_BASE_URL || "http://localhost:11434/v1",
      model: process.env.FALLBACK_LLM_MODEL || process.env.LOCAL_LLM_MODEL || "qwen2.5-coder:14b",
    },
  };
}

export function importSubscriptionCredentials(
  provider: "claude" | "gemini" | "codex",
  credentialsJson: string,
  accountEmail?: string
): { ok: boolean } {
  ensureAIProfilesDir();
  const parsed = JSON.parse(credentialsJson);
  if (provider === "claude") {
    const dir = path.join(AI_PROFILES_DIR, ".claude");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, ".credentials.json"), JSON.stringify(parsed, null, 2), { mode: 0o600 });
  } else if (provider === "codex") {
    const dir = path.join(AI_PROFILES_DIR, ".codex");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "auth.json"), JSON.stringify(parsed, null, 2), { mode: 0o600 });
  } else {
    const dir = path.join(AI_PROFILES_DIR, ".gemini");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "oauth_creds.json"), JSON.stringify(parsed, null, 2), { mode: 0o600 });
    if (accountEmail) {
      fs.writeFileSync(
        path.join(dir, "google_accounts.json"),
        JSON.stringify({ active: accountEmail, old: [] }, null, 2),
        { mode: 0o600 }
      );
    }
  }
  return { ok: true };
}

export async function invokeModelText(
  provider: string,
  model: string,
  fullPrompt: string
): Promise<string> {
  ensureAIProfilesDir();

  if (provider === "claude-sub") {
    const claudeBin = findBinary("claude", "CLAUDE_CLI_PATH");
    if (!claudeBin) throw new Error("Claude CLI binary not found");
    return await new Promise<string>((resolve, reject) => {
      const child = spawn(claudeBin, ["-p", fullPrompt, "--output-format", "text"], {
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Claude CLI timed out after 90s"));
      }, 90000);
      child.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
      child.stderr.on("data", (d: Buffer) => (err += d.toString("utf8")));
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0 && !out.trim()) {
          return reject(new Error(err.trim() || `Claude CLI exited with code ${code}`));
        }
        resolve(out.trim());
      });
    });
  }

  if (provider === "gemini-sub") {
    const geminiBin = findBinary("gemini", "GEMINI_CLI_PATH");
    if (!geminiBin) throw new Error("Gemini CLI binary not found");
    return await new Promise<string>((resolve, reject) => {
      const args = model ? ["-m", model, "-p", fullPrompt] : ["-p", fullPrompt];
      const child = spawn(geminiBin, args, {
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Gemini CLI timed out after 90s"));
      }, 90000);
      child.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
      child.stderr.on("data", (d: Buffer) => (err += d.toString("utf8")));
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0 && !out.trim()) {
          return reject(new Error(err.trim() || `Gemini CLI exited with code ${code}`));
        }
        resolve(out.trim());
      });
    });
  }

  // Look up configured provider in ai_providers_config
  const provRes = await pool
    .query(`SELECT * FROM ai_providers_config WHERE id = $1`, [provider])
    .catch(() => ({ rows: [] as any[] }));
  const cfg = provRes.rows[0];
  let apiKey = cfg?.api_key_enc ? decryptSecret(cfg.api_key_enc) : "";
  if (!apiKey) {
    if (provider === "anthropic-api") apiKey = process.env.ANTHROPIC_API_KEY || "";
    else if (provider === "openai-api") apiKey = process.env.OPENAI_API_KEY || "";
    else if (provider === "gemini-api") apiKey = process.env.GEMINI_API_KEY || "";
    else if (provider === "xai-grok") apiKey = process.env.XAI_API_KEY || "";
    else if (provider === "deepseek") apiKey = process.env.DEEPSEEK_API_KEY || "";
    else if (provider === "mistral") apiKey = process.env.MISTRAL_API_KEY || "";
    else if (provider === "openrouter") apiKey = process.env.OPENROUTER_API_KEY || "";
    else if (provider === "github-models") apiKey = process.env.GITHUB_TOKEN || "";
    else apiKey = process.env.FALLBACK_LLM_API_KEY || "";
  }

  // Direct Anthropic Messages API
  if (provider === "anthropic-api") {
    const baseUrl = (cfg?.base_url || "https://api.anthropic.com/v1").replace(/\/$/, "");
    const resp = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model || cfg?.default_model || "claude-sonnet-4-6",
        max_tokens: 4096,
        messages: [{ role: "user", content: fullPrompt }],
      }),
    });
    if (!resp.ok) throw new Error(`Anthropic API returned HTTP ${resp.status}`);
    const data: any = await resp.json();
    return data.content?.[0]?.text || "";
  }

  // Universal OpenAI-compatible Chat Completions (OpenAI, Gemini OpenAI adapter, xAI Grok, DeepSeek, Mistral, OpenRouter, GitHub Models, Ollama / llama-server)
  const baseUrl = (
    cfg?.base_url ||
    process.env.FALLBACK_LLM_URL ||
    process.env.LOCAL_LLM_BASE_URL ||
    "http://localhost:11434/v1"
  ).replace(/\/$/, "");

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: model || cfg?.default_model || process.env.FALLBACK_LLM_MODEL || "qwen2.5-coder:14b",
      messages: [{ role: "user", content: fullPrompt }],
      temperature: 0.2,
    }),
  });
  if (!resp.ok) {
    throw new Error(`AI Provider (${provider}) returned HTTP ${resp.status}`);
  }
  const data: any = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

function extractToolCalls(text: string): Array<{
  tool: "exec_command" | "read_file" | "write_file" | "run_scan";
  host: string;
  command?: string;
  path?: string;
  content?: string;
  scan_type?: "inventory" | "security" | "cert" | "ssh_keys" | "activity";
}> {
  const calls: Array<any> = [];
  const regex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      if (parsed && parsed.tool && parsed.host) {
        calls.push(parsed);
      }
    } catch {
      // Ignore malformed JSON inside tool_call
    }
  }
  return calls;
}

export async function resolveTargetHosts(targetScope: string): Promise<any[]> {
  if (!targetScope || targetScope === "@all" || targetScope === "all") {
    const res = await pool.query(`SELECT * FROM hosts ORDER BY hostname ASC`);
    return res.rows;
  }
  if (targetScope.startsWith("@group:")) {
    const grp = targetScope.slice("@group:".length);
    const res = await pool.query(`SELECT * FROM hosts WHERE LOWER(group_name) = LOWER($1) ORDER BY hostname ASC`, [grp]);
    return res.rows;
  }
  if (targetScope.startsWith("@site:")) {
    const site = targetScope.slice("@site:".length);
    const res = await pool.query(`SELECT * FROM hosts WHERE LOWER(site_name) = LOWER($1) ORDER BY hostname ASC`, [
      site,
    ]);
    return res.rows;
  }
  const clean = targetScope.replace(/^@/, "");
  const res = await pool.query(
    `SELECT * FROM hosts WHERE LOWER(hostname) = LOWER($1) OR id::text = $1 OR LOWER(group_name) = LOWER($1) ORDER BY hostname ASC`,
    [clean]
  );
  return res.rows;
}

export async function runAIFleetPrompt(params: {
  sessionId: string;
  userPrompt: string;
  provider: string;
  model: string;
  targetScope: string;
  safetyTier: "readonly" | "supervised" | "autonomous";
  actor: string;
}): Promise<{
  assistantMessage: any;
  toolRecords: any[];
  createdSnapshots: any[];
  pendingApprovals: any[];
}> {
  const { sessionId, userPrompt, provider, model, targetScope, safetyTier, actor } = params;

  await pool.query(
    `INSERT INTO ai_messages (session_id, role, content) VALUES ($1, 'user', $2)`,
    [sessionId, userPrompt]
  );

  const hosts = await resolveTargetHosts(targetScope);
  const historyRes = await pool.query(
    `SELECT role, content FROM ai_messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT 8`,
    [sessionId]
  );
  const recentHistory = historyRes.rows
    .reverse()
    .map((r) => `${r.role.toUpperCase()}: ${r.content}`)
    .join("\n\n");

  const hostSummary = hosts
    .map(
      (h) =>
        `- ${h.hostname} (ip=${h.ip_address}, os=${h.os_type} "${h.os_info}", group=${h.group_name}, status=${h.status}, read_only_ai=${h.read_only_ai})`
    )
    .join("\n");

  const toolInstructions = `You are FleetOps AI, a senior infrastructure & SRE operations agent managing a fleet of servers.
Target Scope: ${targetScope} | Safety Tier: ${safetyTier.toUpperCase()}

Available Target Hosts:
${hostSummary || "(No hosts matched scope)"}

To inspect or manage a host, emit one or more <tool_call>JSON</tool_call> blocks:
1. Execute shell command on a host:
<tool_call>{"tool":"exec_command","host":"<hostname>","command":"<shell command>"}</tool_call>
2. Read a file on a host:
<tool_call>{"tool":"read_file","host":"<hostname>","path":"/etc/nginx/nginx.conf"}</tool_call>
3. Write/update a config file on a host (automatically creates a pre-edit backup snapshot for 1-click revert):
<tool_call>{"tool":"write_file","host":"<hostname>","path":"/etc/sysctl.d/99-custom.conf","content":"..."}</tool_call>
4. Run a structured audit scan (inventory, security, cert, ssh_keys, activity):
<tool_call>{"tool":"run_scan","host":"<hostname>","scan_type":"security"}</tool_call>

Rules:
- When you need live data from a host, emit the <tool_call> block(s) first and wait for the tool output.
- Once you have all required outputs (or if an action was queued for operator approval), provide a clear, concise markdown answer summarizing findings, outputs, and any changes made.`;

  const toolRecords: any[] = [];
  const createdSnapshots: any[] = [];
  const pendingApprovals: any[] = [];
  let scratchpad = "";
  let finalReply = "";

  for (let turn = 0; turn < 4; turn++) {
    const promptForTurn = `${toolInstructions}\n\nConversation History:\n${recentHistory}\n\n${
      scratchpad ? `Tool Execution Results So Far:\n${scratchpad}\n\nNow provide the final summary or next <tool_call>:` : `User Request: ${userPrompt}`
    }`;

    const rawResponse = await invokeModelText(provider, model, promptForTurn);
    const calls = extractToolCalls(rawResponse);

    if (calls.length === 0) {
      finalReply = rawResponse;
      break;
    }

    let pausedForApproval = false;

    for (const call of calls) {
      const targetHost =
        hosts.find((h) => h.hostname.toLowerCase() === String(call.host).toLowerCase()) || hosts[0];
      if (!targetHost) {
        toolRecords.push({
          tool: call.tool,
          host: call.host,
          status: "error",
          output: `Host ${call.host} not found in scope`,
        });
        scratchpad += `\n[Tool ${call.tool} on ${call.host}]: ERROR - Host not found\n`;
        continue;
      }

      const effectiveReadOnly = safetyTier === "readonly" || Boolean(targetHost.read_only_ai);

      if (call.tool === "read_file" && call.path) {
        try {
          const content = await readFileOnHost(targetHost.id, call.path);
          toolRecords.push({
            tool: "read_file",
            host: targetHost.hostname,
            command: call.path,
            status: "executed",
            output: content.slice(0, 8000),
          });
          scratchpad += `\n[read_file ${call.path} on ${targetHost.hostname}]:\n${content.slice(0, 4000)}\n`;
        } catch (err: any) {
          const msg = err?.message || String(err);
          toolRecords.push({ tool: "read_file", host: targetHost.hostname, command: call.path, status: "error", output: msg });
          scratchpad += `\n[read_file ${call.path} on ${targetHost.hostname} ERROR]: ${msg}\n`;
        }
      } else if (call.tool === "run_scan" && call.scan_type) {
        try {
          const scan = await runReportScanOnHost(targetHost.id, call.scan_type, actor);
          const summaryStr = JSON.stringify({ summary: scan.summary, findings: (scan.findings || []).slice(0, 15) }, null, 2);
          toolRecords.push({
            tool: "run_scan",
            host: targetHost.hostname,
            command: call.scan_type,
            status: "executed",
            output: summaryStr,
          });
          scratchpad += `\n[run_scan ${call.scan_type} on ${targetHost.hostname}]:\n${summaryStr}\n`;
        } catch (err: any) {
          const msg = err?.message || String(err);
          toolRecords.push({ tool: "run_scan", host: targetHost.hostname, command: call.scan_type, status: "error", output: msg });
          scratchpad += `\n[run_scan ${call.scan_type} on ${targetHost.hostname} ERROR]: ${msg}\n`;
        }
      } else if (call.tool === "write_file" && call.path && typeof call.content === "string") {
        if (effectiveReadOnly) {
          const msg = `Blocked by Read-Only AI Access policy on ${targetHost.hostname}`;
          toolRecords.push({ tool: "write_file", host: targetHost.hostname, command: call.path, status: "blocked", output: msg });
          scratchpad += `\n[write_file ${call.path} on ${targetHost.hostname} BLOCKED]: ${msg}\n`;
          continue;
        }

        if (safetyTier === "supervised") {
          let prev: string | null = null;
          try {
            prev = await readFileOnHost(targetHost.id, call.path);
          } catch {
            prev = null;
          }
          const diff = createSimpleDiff(call.path, prev, call.content);
          const appIns = await pool.query(
            `INSERT INTO pending_approvals (session_id, host_id, hostname, action_type, command_or_path, proposed_content, diff_preview, reason)
             VALUES ($1, $2, $3, 'write_file', $4, $5, $6, $7) RETURNING *`,
            [sessionId, targetHost.id, targetHost.hostname, call.path, call.content, diff, "File modification requires approval in Supervised mode"]
          );
          pendingApprovals.push(appIns.rows[0]);
          toolRecords.push({
            tool: "write_file",
            host: targetHost.hostname,
            command: call.path,
            status: "pending_approval",
            approvalId: appIns.rows[0].id,
            output: diff,
          });
          pausedForApproval = true;
        } else {
          try {
            const snap = await writeFileWithBackupOnHost(targetHost.id, call.path, call.content, actor, sessionId);
            createdSnapshots.push({ ...snap, host: targetHost.hostname, filePath: call.path });
            toolRecords.push({
              tool: "write_file",
              host: targetHost.hostname,
              command: call.path,
              status: "executed",
              snapshotId: snap.snapshotId,
              output: snap.diff,
            });
            scratchpad += `\n[write_file ${call.path} on ${targetHost.hostname} SUCCESS (snapshot=${snap.snapshotId})]:\n${snap.diff}\n`;
          } catch (err: any) {
            const msg = err?.message || String(err);
            toolRecords.push({ tool: "write_file", host: targetHost.hostname, command: call.path, status: "error", output: msg });
            scratchpad += `\n[write_file ${call.path} on ${targetHost.hostname} ERROR]: ${msg}\n`;
          }
        }
      } else if (call.tool === "exec_command" && call.command) {
        const safety = classifyCommandSafety(call.command);

        if (effectiveReadOnly && safety.isMutating) {
          const msg = `Blocked by Read-Only AI Access policy (${safety.reason})`;
          toolRecords.push({
            tool: "exec_command",
            host: targetHost.hostname,
            command: call.command,
            status: "blocked",
            output: msg,
          });
          scratchpad += `\n[exec_command on ${targetHost.hostname} BLOCKED]: ${msg}\n`;
          continue;
        }

        if (safetyTier === "supervised" && safety.isMutating) {
          const appIns = await pool.query(
            `INSERT INTO pending_approvals (session_id, host_id, hostname, action_type, command_or_path, reason)
             VALUES ($1, $2, $3, 'exec_command', $4, $5) RETURNING *`,
            [sessionId, targetHost.id, targetHost.hostname, call.command, safety.reason]
          );
          pendingApprovals.push(appIns.rows[0]);
          toolRecords.push({
            tool: "exec_command",
            host: targetHost.hostname,
            command: call.command,
            status: "pending_approval",
            approvalId: appIns.rows[0].id,
            output: `Paused for operator approval: ${safety.reason}`,
          });
          pausedForApproval = true;
        } else {
          try {
            const execRes = await executeOnHost(targetHost.id, call.command, 25000);
            const combined = (execRes.stdout + (execRes.stderr ? `\nSTDERR:\n${execRes.stderr}` : "")).trim();
            toolRecords.push({
              tool: "exec_command",
              host: targetHost.hostname,
              command: call.command,
              status: "executed",
              exitCode: execRes.exitCode,
              output: combined.slice(0, 8000),
            });
            scratchpad += `\n[exec_command "${call.command}" on ${targetHost.hostname} (exit=${execRes.exitCode})]:\n${combined.slice(0, 4000)}\n`;
          } catch (err: any) {
            const msg = err?.message || String(err);
            toolRecords.push({
              tool: "exec_command",
              host: targetHost.hostname,
              command: call.command,
              status: "error",
              output: msg,
            });
            scratchpad += `\n[exec_command "${call.command}" on ${targetHost.hostname} ERROR]: ${msg}\n`;
          }
        }
      }
    }

    if (pausedForApproval) {
      const cleanExplanation = rawResponse.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();
      finalReply =
        (cleanExplanation ? `${cleanExplanation}\n\n` : "") +
        `⏸ **Supervised Mode Approval Gate:** ${pendingApprovals.length} mutating action(s) are ready and awaiting your confirmation below.`;
      break;
    }
  }

  if (!finalReply) {
    finalReply = "Completed host tool execution.";
  } else {
    finalReply = finalReply.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim() || finalReply;
  }

  const msgIns = await pool.query(
    `INSERT INTO ai_messages (session_id, role, content, tool_calls, snapshots)
     VALUES ($1, 'assistant', $2, $3, $4) RETURNING *`,
    [sessionId, finalReply, JSON.stringify(toolRecords), JSON.stringify(createdSnapshots)]
  );
  await pool.query(`UPDATE ai_sessions SET updated_at = NOW() WHERE id = $1`, [sessionId]);

  return {
    assistantMessage: msgIns.rows[0],
    toolRecords,
    createdSnapshots,
    pendingApprovals,
  };
}

export async function resolvePendingApproval(
  approvalId: string,
  decision: "approve" | "reject",
  actor = "admin"
): Promise<any> {
  const res = await pool.query(`SELECT * FROM pending_approvals WHERE id = $1`, [approvalId]);
  if (res.rows.length === 0) throw new Error("Approval request not found");
  const app = res.rows[0];
  if (app.status !== "pending") throw new Error(`Approval already ${app.status}`);

  if (decision === "reject") {
    const upd = await pool.query(
      `UPDATE pending_approvals SET status = 'rejected', resolved_at = NOW(), execution_output = 'Rejected by operator' WHERE id = $1 RETURNING *`,
      [approvalId]
    );
    await logAudit(actor, "approval", `Rejected ${app.action_type} on ${app.hostname}`, app.hostname, {
      commandOrPath: app.command_or_path,
    });
    return upd.rows[0];
  }

  let output = "";
  let snapshot: any = null;

  if (app.action_type === "write_file") {
    const snap = await writeFileWithBackupOnHost(
      app.host_id,
      app.command_or_path,
      app.proposed_content || "",
      actor,
      app.session_id
    );
    output = `File written (Snapshot ${snap.snapshotId} created for 1-click revert).\n${snap.diff}`;
    snapshot = { ...snap, host: app.hostname, filePath: app.command_or_path };
  } else {
    const execRes = await executeOnHost(app.host_id, app.command_or_path, 30000);
    output = `Exit ${execRes.exitCode}:\n${execRes.stdout}${execRes.stderr ? `\nSTDERR:\n${execRes.stderr}` : ""}`;
  }

  const upd = await pool.query(
    `UPDATE pending_approvals SET status = 'approved', resolved_at = NOW(), execution_output = $1 WHERE id = $2 RETURNING *`,
    [output, approvalId]
  );

  if (app.session_id) {
    await pool.query(
      `INSERT INTO ai_messages (session_id, role, content, tool_calls, snapshots)
       VALUES ($1, 'assistant', $2, $3, $4)`,
      [
        app.session_id,
        `✅ **Approved & Executed on \`${app.hostname}\`:** \`${app.command_or_path}\`\n\`\`\`text\n${output.slice(0, 4000)}\n\`\`\``,
        JSON.stringify([
          {
            tool: app.action_type,
            host: app.hostname,
            command: app.command_or_path,
            status: "executed",
            output: output.slice(0, 4000),
          },
        ]),
        JSON.stringify(snapshot ? [snapshot] : []),
      ]
    );
  }

  await logAudit(actor, "approval", `Approved & executed ${app.action_type} on ${app.hostname}`, app.hostname, {
    commandOrPath: app.command_or_path,
  });

  return { ...upd.rows[0], snapshot };
}

export async function handleMCPJsonRpc(body: any): Promise<any> {
  const { id, method, params } = body || {};

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "fleetops-ai-mcp", version: "1.0.0" },
      },
    };
  }

  if (method === "tools/list") {
    const enabledPluginsRes = await pool
      .query(`SELECT slug, name, category, definition FROM mcp_plugins_catalog WHERE enabled = true ORDER BY category, name`)
      .catch(() => ({ rows: [] as any[] }));
    const pluginTools: any[] = [];
    for (const p of enabledPluginsRes.rows) {
      const caps: string[] = p.definition?.capabilities || [];
      for (const cap of caps) {
        pluginTools.push({
          name: cap,
          description: `[${p.category.toUpperCase()} MCP Plugin: ${p.name}] ${p.definition?.description || ""}`,
          inputSchema: {
            type: "object",
            properties: {
              host: { type: "string", description: "Target host or cluster node" },
              target: { type: "string", description: "Optional resource name, namespace/pod, container, or service" },
            },
          },
        });
      }
    }

    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "list_hosts",
            description: "List all managed servers in FleetOps AI with OS, IP, status, and metrics",
            inputSchema: { type: "object", properties: { group: { type: "string" } } },
          },
          {
            name: "execute_host_command",
            description: "Execute a shell command on a managed server (respects Read-Only AI Access)",
            inputSchema: {
              type: "object",
              required: ["host", "command"],
              properties: { host: { type: "string" }, command: { type: "string" } },
            },
          },
          {
            name: "read_host_file",
            description: "Read a configuration or log file from a managed server",
            inputSchema: {
              type: "object",
              required: ["host", "path"],
              properties: { host: { type: "string" }, path: { type: "string" } },
            },
          },
          {
            name: "write_host_file_with_backup",
            description: "Write a file on a managed server with automatic pre-change snapshot for 1-click revert",
            inputSchema: {
              type: "object",
              required: ["host", "path", "content"],
              properties: {
                host: { type: "string" },
                path: { type: "string" },
                content: { type: "string" },
              },
            },
          },
          {
            name: "revert_file_snapshot",
            description: "Revert a file change using its snapshot ID",
            inputSchema: {
              type: "object",
              required: ["snapshot_id"],
              properties: { snapshot_id: { type: "string" } },
            },
          },
          {
            name: "run_host_scan",
            description: "Run an inventory, security, cert, ssh_keys, or activity scan on a host",
            inputSchema: {
              type: "object",
              required: ["host", "scan_type"],
              properties: {
                host: { type: "string" },
                scan_type: { type: "string", enum: ["inventory", "security", "cert", "ssh_keys", "activity"] },
              },
            },
          },
          {
            name: "evaluate_compliance",
            description: "Evaluate fleet or host compliance against CIS, NIS2, ISO 27001, GDPR, DORA, SOC2, PCI-DSS",
            inputSchema: {
              type: "object",
              required: ["framework_id"],
              properties: { framework_id: { type: "string" }, host_id: { type: "string" } },
            },
          },
          ...pluginTools,
        ],
      },
    };
  }

  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments || {};
    try {
      let resultData: any;
      if (name === "list_hosts") {
        const hosts = await resolveTargetHosts(args.group ? `@group:${args.group}` : "@all");
        resultData = hosts.map((h) => ({
          id: h.id,
          hostname: h.hostname,
          ip: h.ip_address,
          os: h.os_info,
          group: h.group_name,
          status: h.status,
          readOnlyAi: h.read_only_ai,
          metrics: h.metrics,
        }));
      } else if (name === "execute_host_command") {
        const hosts = await resolveTargetHosts(args.host);
        if (!hosts[0]) throw new Error(`Host not found: ${args.host}`);
        const safety = classifyCommandSafety(args.command);
        if (hosts[0].read_only_ai && safety.isMutating) {
          throw new Error(`Host ${hosts[0].hostname} has Read-Only AI Access enabled`);
        }
        resultData = await executeOnHost(hosts[0].id, args.command, 25000);
      } else if (name === "read_host_file") {
        resultData = await readFileOnHost(args.host, args.path);
      } else if (name === "write_host_file_with_backup") {
        const hosts = await resolveTargetHosts(args.host);
        if (!hosts[0]) throw new Error(`Host not found: ${args.host}`);
        if (hosts[0].read_only_ai) throw new Error(`Host ${hosts[0].hostname} has Read-Only AI Access enabled`);
        resultData = await writeFileWithBackupOnHost(hosts[0].id, args.path, args.content, "mcp-client");
      } else if (name === "revert_file_snapshot") {
        resultData = await revertFileSnapshot(args.snapshot_id, "mcp-client");
      } else if (name === "run_host_scan") {
        const hosts = await resolveTargetHosts(args.host);
        if (!hosts[0]) throw new Error(`Host not found: ${args.host}`);
        resultData = await runReportScanOnHost(hosts[0].id, args.scan_type, "mcp-client");
      } else if (name === "evaluate_compliance") {
        resultData = await evaluateComplianceFramework(args.framework_id, args.host_id);
      } else {
        throw new Error(`Unknown MCP tool: ${name}`);
      }

      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: typeof resultData === "string" ? resultData : JSON.stringify(resultData, null, 2),
            },
          ],
        },
      };
    } catch (err: any) {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          isError: true,
          content: [{ type: "text", text: err?.message || String(err) }],
        },
      };
    }
  }

  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}
