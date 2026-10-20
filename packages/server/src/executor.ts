import { Client as SSHClient } from "ssh2";
import type { WebSocket } from "ws";
import crypto from "node:crypto";
import { pool, logAudit } from "./db.js";
import { decryptSecret } from "./vault.js";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

interface AgentConnection {
  ws: WebSocket;
  hostId: string;
  hostname: string;
  pendingRequests: Map<
    string,
    {
      resolve: (res: ExecResult) => void;
      reject: (err: Error) => void;
      timer: NodeJS.Timeout;
    }
  >;
}

export const connectedAgents = new Map<string, AgentConnection>();

export function registerAgentSocket(hostId: string, hostname: string, ws: WebSocket): void {
  const conn: AgentConnection = {
    ws,
    hostId,
    hostname,
    pendingRequests: new Map(),
  };
  connectedAgents.set(hostId, conn);

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "heartbeat" && msg.metrics) {
        await pool.query(
          `UPDATE hosts SET status = 'online', metrics = $1, os_info = COALESCE($2, os_info), last_seen_at = NOW(), last_error = NULL WHERE id = $3`,
          [JSON.stringify(msg.metrics), msg.os_info || null, hostId]
        );
      } else if (msg.type === "exec_result" && msg.requestId) {
        const pending = conn.pendingRequests.get(msg.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          conn.pendingRequests.delete(msg.requestId);
          pending.resolve({
            stdout: msg.stdout || "",
            stderr: msg.stderr || "",
            exitCode: typeof msg.exitCode === "number" ? msg.exitCode : 0,
            durationMs: msg.durationMs || 0,
          });
        }
      }
    } catch (e) {
      console.error("Agent message parse error:", e);
    }
  });

  ws.on("close", () => {
    if (connectedAgents.get(hostId) === conn) {
      connectedAgents.delete(hostId);
    }
  });
}

const READ_ONLY_PREFIXES = [
  "uname",
  "uptime",
  "hostname",
  "whoami",
  "id",
  "date",
  "timedatectl status",
  "cat ",
  "head ",
  "tail ",
  "less ",
  "grep ",
  "egrep ",
  "awk ",
  "cut ",
  "sort ",
  "uniq ",
  "wc ",
  "ls",
  "stat ",
  "file ",
  "df",
  "du ",
  "free",
  "vmstat",
  "iostat",
  "mpstat",
  "lscpu",
  "lsblk",
  "lsmod",
  "lspci",
  "lsusb",
  "ps",
  "pgrep",
  "top -b -n 1",
  "ss ",
  "netstat",
  "ip a",
  "ip addr",
  "ip r",
  "ip route",
  "ip link",
  "ip neigh",
  "ifconfig",
  "ping -c",
  "dig ",
  "nslookup ",
  "host ",
  "systemctl status",
  "systemctl is-active",
  "systemctl is-enabled",
  "systemctl is-system-running",
  "systemctl list-units",
  "systemctl list-unit-files",
  "systemctl list-timers",
  "systemctl show",
  "journalctl",
  "dmesg",
  "last",
  "lastb",
  "who",
  "w",
  "getent ",
  "sshd -T",
  "ufw status",
  "iptables -L",
  "iptables -S",
  "nft list",
  "docker ps",
  "docker images",
  "docker inspect",
  "docker stats --no-stream",
  "docker logs",
  "docker compose ps",
  "kubectl get",
  "kubectl describe",
  "kubectl top",
  "kubectl logs",
  "dpkg -l",
  "dpkg-query",
  "apt-cache",
  "rpm -q",
  "apk info",
  "apk list",
  "openssl x509",
  "openssl s_client",
  "zfs list",
  "zpool status",
  "btrfs filesystem show",
  "btrfs filesystem df",
  "Get-Service",
  "Get-Process",
  "Get-EventLog",
  "Get-WinEvent",
  "Get-ComputerInfo",
  "Get-NetIPAddress",
  "Get-NetTCPConnection",
  "Get-Volume",
];

const MUTATING_PATTERNS = [
  /(^|[;&|]\s*)(sudo\s+)?(rm|mv|cp|dd|mkfs|fdisk|parted|mount|umount|chmod|chown|chgrp|useradd|userdel|usermod|groupadd|passwd|chpasswd|visudo)\b/,
  /(^|[;&|]\s*)(sudo\s+)?systemctl\s+(restart|stop|start|reload|enable|disable|mask|unmask|daemon-reload|kill)\b/,
  /(^|[;&|]\s*)(sudo\s+)?service\s+\S+\s+(restart|stop|start|reload)\b/,
  /(^|[;&|]\s*)(sudo\s+)?(apt|apt-get|dnf|yum|zypper|apk|pacman|snap|pip|npm)\s+(install|remove|purge|upgrade|dist-upgrade|update|add|del)\b/,
  /(^|[;&|]\s*)(sudo\s+)?(reboot|shutdown|poweroff|halt|init\s+[06]|kill|pkill|killall)\b/,
  /(^|[;&|]\s*)(sudo\s+)?(ufw|iptables|nft|firewall-cmd)\s+(allow|deny|reject|delete|insert|add|flush|-A|-D|-I|-F)\b/,
  /(^|[;&|]\s*)(sudo\s+)?docker\s+(run|exec|rm|rmi|stop|start|restart|kill|prune|build|compose\s+(up|down|restart|rm))\b/,
  /(^|[;&|]\s*)(sudo\s+)?kubectl\s+(apply|delete|patch|edit|scale|rollout|exec|cordon|drain|taint)\b/,
  /(^|[;&|]\s*)(sudo\s+)?sed\s+-i\b/,
  /(^|[;&|]\s*)(sudo\s+)?tee\b/,
  /[^2]>\s*\/|>>\s*\//,
  /(Restart-Service|Stop-Service|Start-Service|Remove-Item|Set-Item|Set-Content|New-Item|Stop-Process|Restart-Computer)/i,
];

export function classifyCommandSafety(command: string): {
  isMutating: boolean;
  reason: string;
} {
  const trimmed = command.trim();
  for (const pat of MUTATING_PATTERNS) {
    if (pat.test(trimmed)) {
      return {
        isMutating: true,
        reason: `Command matches mutating/privileged pattern (${pat.source.slice(0, 48)})`,
      };
    }
  }
  const normalized = trimmed.replace(/^sudo\s+(-n\s+)?/, "");
  if (READ_ONLY_PREFIXES.some((p) => normalized.startsWith(p))) {
    return { isMutating: false, reason: "Read-only diagnostic command" };
  }
  return {
    isMutating: true,
    reason: "Unclassified shell command requires approval in Supervised mode",
  };
}

async function getHostAndKey(hostIdOrName: string) {
  const res = await pool.query(
    `SELECT h.*, k.private_key_enc, k.public_key
     FROM hosts h
     LEFT JOIN ssh_keys k ON h.ssh_key_id = k.id
     WHERE h.id::text = $1 OR LOWER(h.hostname) = LOWER($1) OR h.ip_address = $1
     LIMIT 1`,
    [hostIdOrName]
  );
  if (res.rows.length === 0) {
    throw new Error(`Host not found: ${hostIdOrName}`);
  }
  const host = res.rows[0];
  let privateKey: string | null = host.private_key_enc ? decryptSecret(host.private_key_enc) : null;
  if (!privateKey) {
    const defKey = await pool.query(`SELECT private_key_enc FROM ssh_keys WHERE is_default = true LIMIT 1`);
    if (defKey.rows[0]?.private_key_enc) {
      privateKey = decryptSecret(defKey.rows[0].private_key_enc);
    }
  }
  return { host, privateKey };
}

export async function connectSSH(hostRow: any, privateKey?: string | null, password?: string): Promise<SSHClient> {
  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH connection timeout to ${hostRow.ip_address}:${hostRow.ssh_port || 22}`));
    }, 12000);

    conn
      .on("ready", () => {
        clearTimeout(timer);
        resolve(conn);
      })
      .on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      })
      .connect({
        host: hostRow.ip_address,
        port: hostRow.ssh_port || 22,
        username: hostRow.ssh_user || "root",
        ...(privateKey ? { privateKey } : {}),
        ...(password ? { password } : {}),
        readyTimeout: 10000,
      });
  });
}

export async function executeOnHost(
  hostIdOrName: string,
  command: string,
  timeoutMs = 30000
): Promise<ExecResult> {
  const { host, privateKey } = await getHostAndKey(hostIdOrName);
  const start = Date.now();

  // Check if host has an active Outbound Go Client Agent WebSocket
  if (host.connection_mode === "agent") {
    const agentConn = connectedAgents.get(host.id);
    if (agentConn && agentConn.ws.readyState === 1) {
      const requestId = crypto.randomUUID();
      return new Promise<ExecResult>((resolve, reject) => {
        const timer = setTimeout(() => {
          agentConn.pendingRequests.delete(requestId);
          reject(new Error(`Agent command timed out after ${timeoutMs}ms on ${host.hostname}`));
        }, timeoutMs);
        agentConn.pendingRequests.set(requestId, { resolve, reject, timer });
        agentConn.ws.send(
          JSON.stringify({
            type: "exec",
            requestId,
            command,
            timeoutMs,
            readOnly: Boolean(host.read_only_ai),
          })
        );
      });
    }
    throw new Error(`Outbound Go agent not connected for ${host.hostname}`);
  }

  let conn: SSHClient | null = null;
  let lastErr: any = null;

  // 1. Try private key if available
  if (privateKey) {
    try {
      conn = await connectSSH(host, privateKey);
    } catch (err: any) {
      lastErr = err;
    }
  }

  // 2. If private key failed or wasn't present, try passwords in managed_credentials
  if (!conn) {
    const credRows = await pool.query(
      `SELECT * FROM managed_credentials WHERE cred_type IN ('ssh_password', 'ssh_key') ORDER BY created_at ASC`
    );
    for (const cred of credRows.rows) {
      try {
        const rawSecret = decryptSecret(cred.secret_enc);
        let password = rawSecret;
        let tryUser = cred.target_user || host.ssh_user;
        let tryPort = host.ssh_port || 22;
        try {
          const parsed = JSON.parse(rawSecret);
          if (parsed && typeof parsed === "object") {
            password = parsed.password || "";
            if (parsed.username) tryUser = parsed.username;
            if (parsed.sshPort) tryPort = Number(parsed.sshPort) || tryPort;
          }
        } catch {}

        if (!password) continue;

        conn = await connectSSH({ ...host, ssh_user: tryUser, ssh_port: tryPort }, null, password);

        // Update host if user/port changed
        if (tryUser !== host.ssh_user || tryPort !== host.ssh_port) {
          await pool.query(`UPDATE hosts SET ssh_user = $1, ssh_port = $2 WHERE id = $3`, [tryUser, tryPort, host.id]);
          host.ssh_user = tryUser;
          host.ssh_port = tryPort;
        }

        // Bootstrap default SSH key in the background
        bootstrapSSHKeyOnHost(host.id, password).catch(() => {});
        break;
      } catch (err: any) {
        lastErr = err;
      }
    }
  }

  if (!conn) {
    throw new Error(
      lastErr?.message || `No valid SSH private key or password credentials available for host ${host.hostname}`
    );
  }
  try {
    return await new Promise<ExecResult>((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let finished = false;

      const timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          conn.end();
          reject(new Error(`SSH command timed out after ${timeoutMs}ms on ${host.hostname}`));
        }
      }, timeoutMs);

      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          return reject(err);
        }
        stream.on("data", (chunk: Buffer) => {
          if (stdout.length < 250000) stdout += chunk.toString("utf8");
        });
        stream.stderr.on("data", (chunk: Buffer) => {
          if (stderr.length < 100000) stderr += chunk.toString("utf8");
        });
        stream.on("close", (code: number) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          resolve({
            stdout,
            stderr,
            exitCode: typeof code === "number" ? code : 0,
            durationMs: Date.now() - start,
          });
        });
      });
    });
  } finally {
    conn.end();
  }
}

export async function readFileOnHost(hostIdOrName: string, filePath: string): Promise<string> {
  const safePath = filePath.replace(/'/g, "'\\''");
  const res = await executeOnHost(
    hostIdOrName,
    `cat '${safePath}' 2>/dev/null || sudo -n cat '${safePath}'`,
    15000
  );
  if (res.exitCode !== 0 && !res.stdout) {
    throw new Error(res.stderr || `Unable to read file ${filePath}`);
  }
  return res.stdout;
}

export function createSimpleDiff(filePath: string, oldText: string | null, newText: string): string {
  const oldLines = (oldText ?? "").split("\n");
  const newLines = newText.split("\n");
  const out: string[] = [`--- a:${filePath}`, `+++ b:${filePath}`];
  const max = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < max; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === n) {
      if (out.length < 120) out.push(`  ${o ?? ""}`);
    } else {
      if (o !== undefined) out.push(`- ${o}`);
      if (n !== undefined) out.push(`+ ${n}`);
    }
  }
  return out.slice(0, 150).join("\n");
}

export async function writeFileWithBackupOnHost(
  hostIdOrName: string,
  filePath: string,
  newContent: string,
  actor = "ai-agent",
  sessionId?: string
): Promise<{ snapshotId: string; diff: string }> {
  const { host } = await getHostAndKey(hostIdOrName);
  const safePath = filePath.replace(/'/g, "'\\''");

  // 1. Check if file exists and read previous content
  const checkRes = await executeOnHost(
    host.id,
    `if [ -f '${safePath}' ] || sudo -n test -f '${safePath}' 2>/dev/null; then echo "EXISTS"; cat '${safePath}' 2>/dev/null || sudo -n cat '${safePath}'; else echo "MISSING"; fi`,
    15000
  );
  const firstNewline = checkRes.stdout.indexOf("\n");
  const marker = (firstNewline >= 0 ? checkRes.stdout.slice(0, firstNewline) : checkRes.stdout).trim();
  const existedBefore = marker === "EXISTS";
  const previousContent = existedBefore && firstNewline >= 0 ? checkRes.stdout.slice(firstNewline + 1) : null;

  // 2. Record snapshot in PostgreSQL before mutating
  const snapIns = await pool.query(
    `INSERT INTO file_snapshots (host_id, session_id, file_path, previous_content, new_content, existed_before, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [host.id, sessionId || null, filePath, previousContent, newContent, existedBefore, actor]
  );
  const snapshotId: string = snapIns.rows[0].id;

  // 3. Write new content using base64 to avoid shell escaping issues
  const b64 = Buffer.from(newContent, "utf8").toString("base64");
  const writeCmd = `echo '${b64}' | base64 -d > '${safePath}' 2>/dev/null || (echo '${b64}' | base64 -d | sudo -n tee '${safePath}' >/dev/null)`;
  const writeRes = await executeOnHost(host.id, writeCmd, 15000);
  if (writeRes.exitCode !== 0) {
    throw new Error(`Failed to write ${filePath}: ${writeRes.stderr}`);
  }

  const diff = createSimpleDiff(filePath, previousContent, newContent);
  await logAudit(actor, "file_change", `Edited ${filePath}`, host.hostname, {
    snapshotId,
    filePath,
    existedBefore,
  });

  return { snapshotId, diff };
}

export async function revertFileSnapshot(snapshotId: string, actor = "admin"): Promise<{
  hostId: string;
  hostname: string;
  filePath: string;
}> {
  const res = await pool.query(
    `SELECT s.*, h.hostname FROM file_snapshots s JOIN hosts h ON s.host_id = h.id WHERE s.id = $1`,
    [snapshotId]
  );
  if (res.rows.length === 0) throw new Error("Snapshot not found");
  const snap = res.rows[0];
  const safePath = snap.file_path.replace(/'/g, "'\\''");

  if (!snap.existed_before) {
    await executeOnHost(snap.host_id, `rm -f '${safePath}' 2>/dev/null || sudo -n rm -f '${safePath}'`, 15000);
  } else {
    const b64 = Buffer.from(snap.previous_content || "", "utf8").toString("base64");
    const restoreCmd = `echo '${b64}' | base64 -d > '${safePath}' 2>/dev/null || (echo '${b64}' | base64 -d | sudo -n tee '${safePath}' >/dev/null)`;
    const r = await executeOnHost(snap.host_id, restoreCmd, 15000);
    if (r.exitCode !== 0) {
      throw new Error(`Failed to revert ${snap.file_path}: ${r.stderr}`);
    }
  }

  await pool.query(`UPDATE file_snapshots SET reverted = true, reverted_at = NOW() WHERE id = $1`, [snapshotId]);
  await logAudit(actor, "file_revert", `Reverted ${snap.file_path} to pre-task snapshot`, snap.hostname, {
    snapshotId,
    filePath: snap.file_path,
  });

  return { hostId: snap.host_id, hostname: snap.hostname, filePath: snap.file_path };
}

export async function listDirectoryOnHost(
  hostIdOrName: string,
  dirPath = "/etc"
): Promise<Array<{ name: string; type: "file" | "dir"; size: number; mode: string; mtime: string }>> {
  const safeDir = dirPath.replace(/'/g, "'\\''");
  const cmd = `LC_ALL=C ls -la --time-style=long-iso '${safeDir}' 2>/dev/null || sudo -n LC_ALL=C ls -la --time-style=long-iso '${safeDir}'`;
  const res = await executeOnHost(hostIdOrName, cmd, 15000);
  const items: Array<{ name: string; type: "file" | "dir"; size: number; mode: string; mtime: string }> = [];
  for (const line of res.stdout.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 8) continue;
    const mode = parts[0];
    if (mode === "total") continue;
    const size = parseInt(parts[4], 10) || 0;
    const mtime = `${parts[5]} ${parts[6]}`;
    const name = parts.slice(7).join(" ");
    if (name === "." || name === "..") continue;
    items.push({
      name,
      type: mode.startsWith("d") ? "dir" : "file",
      size,
      mode,
      mtime,
    });
  }
  return items;
}

export async function bootstrapSSHKeyOnHost(
  hostId: string,
  password: string,
  keyId?: string
): Promise<{ ok: boolean; osInfo: string }> {
  const hostRes = await pool.query(`SELECT * FROM hosts WHERE id = $1`, [hostId]);
  if (hostRes.rows.length === 0) throw new Error("Host not found");
  const host = hostRes.rows[0];

  const keyQuery = keyId
    ? await pool.query(`SELECT * FROM ssh_keys WHERE id = $1`, [keyId])
    : await pool.query(`SELECT * FROM ssh_keys WHERE is_default = true ORDER BY created_at ASC LIMIT 1`);
  if (keyQuery.rows.length === 0) throw new Error("No SSH key available for bootstrap");
  const sshKey = keyQuery.rows[0];
  const pubKey = sshKey.public_key.trim();

  const conn = await connectSSH(host, null, password);
  try {
    const installCmd = `
      mkdir -p ~/.ssh && chmod 700 ~/.ssh &&
      grep -qxF '${pubKey.replace(/'/g, "'\\''")}' ~/.ssh/authorized_keys 2>/dev/null || echo '${pubKey.replace(/'/g, "'\\''")}' >> ~/.ssh/authorized_keys &&
      chmod 600 ~/.ssh/authorized_keys &&
      uname -sr
    `;
    const osInfo = await new Promise<string>((resolve, reject) => {
      conn.exec(installCmd, (err, stream) => {
        if (err) return reject(err);
        let out = "";
        let errOut = "";
        stream.on("data", (d: Buffer) => (out += d.toString("utf8")));
        stream.stderr.on("data", (d: Buffer) => (errOut += d.toString("utf8")));
        stream.on("close", (code: number) => {
          if (code !== 0) return reject(new Error(errOut || `Bootstrap exited with ${code}`));
          resolve(out.trim());
        });
      });
    });

    await pool.query(
      `UPDATE hosts SET ssh_key_id = $1, status = 'online', os_info = COALESCE(NULLIF($2,''), os_info), last_seen_at = NOW(), last_error = NULL WHERE id = $3`,
      [sshKey.id, osInfo, host.id]
    );
    await logAudit("admin", "ssh_bootstrap", `Bootstrapped SSH public key (${sshKey.name})`, host.hostname);
    return { ok: true, osInfo };
  } finally {
    conn.end();
  }
}

export async function probeHostHealth(hostId: string): Promise<{
  status: "online" | "offline";
  metrics: Record<string, any>;
  osInfo: string;
  error?: string;
}> {
  try {
    const hostRes = await pool.query(`SELECT * FROM hosts WHERE id = $1`, [hostId]);
    if (hostRes.rows.length === 0) throw new Error("Host not found");
    const host = hostRes.rows[0];

    if (host.connection_mode === "agent") {
      const agentConn = connectedAgents.get(host.id);
      if (!agentConn || agentConn.ws.readyState !== 1) {
        await pool.query(
          `UPDATE hosts SET status = 'offline', last_error = 'Waiting for outbound Go agent connection' WHERE id = $1`,
          [hostId]
        );
        return {
          status: "offline",
          metrics: {},
          osInfo: host.os_info,
          error: "Waiting for outbound Go agent connection",
        };
      }
    }

    if (host.os_type === "windows") {
      const probeCmd = `powershell -NoProfile -Command "$os = (Get-CimInstance Win32_OperatingSystem); $cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average; $mem = [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100, 1); Write-Output \\"OS=$($os.Caption)|CPU=$cpu|MEM=$mem\\""`;
      const res = await executeOnHost(hostId, probeCmd, 12000);
      if (res.exitCode === 0 && res.stdout.includes("OS=")) {
        const parts = Object.fromEntries(
          res.stdout
            .trim()
            .split("|")
            .map((kv) => kv.split("="))
        );
        const metrics = {
          cpu_percent: parseFloat(parts.CPU) || 0,
          memory_percent: parseFloat(parts.MEM) || 0,
          disk_percent: 50,
        };
        await pool.query(
          `UPDATE hosts SET status = 'online', os_info = $1, metrics = $2, last_seen_at = NOW(), last_error = NULL WHERE id = $3`,
          [parts.OS || host.os_info, JSON.stringify(metrics), hostId]
        );
        return { status: "online", metrics, osInfo: parts.OS || host.os_info };
      }
    }

    const linuxCmd = `
      os=$(grep -E '^PRETTY_NAME=' /etc/os-release 2>/dev/null | cut -d= -f2- | tr -d '"' || uname -sr);
      kern=$(uname -r);
      load=$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo 0);
      mem=$(awk '/MemTotal/{t=$2}/MemAvailable/{a=$2}END{if(t>0)printf "%.1f", (t-a)*100/t; else print 0}' /proc/meminfo 2>/dev/null || echo 0);
      disk=$(df -P / 2>/dev/null | awk 'NR==2{gsub(/%/,"",$5); print $5}' || echo 0);
      up=$(uptime -p 2>/dev/null || uptime);
      printf "OS=%s (%s)|LOAD=%s|MEM=%s|DISK=%s|UP=%s\n" "$os" "$kern" "$load" "$mem" "$disk" "$up"
    `;
    const res = await executeOnHost(hostId, linuxCmd, 10000);
    if (res.exitCode !== 0) {
      throw new Error(res.stderr || `Probe exited with code ${res.exitCode}`);
    }
    const kvPairs = Object.fromEntries(
      res.stdout
        .trim()
        .split("|")
        .map((s) => {
          const idx = s.indexOf("=");
          return idx > 0 ? [s.slice(0, idx), s.slice(idx + 1)] : [s, ""];
        })
    );
    const metrics = {
      load_avg: parseFloat(kvPairs.LOAD) || 0,
      cpu_percent: Math.min(100, Math.round((parseFloat(kvPairs.LOAD) || 0.1) * 18 * 10) / 10),
      memory_percent: parseFloat(kvPairs.MEM) || 0,
      disk_percent: parseFloat(kvPairs.DISK) || 0,
      uptime: kvPairs.UP || "",
    };
    const osInfo = kvPairs.OS || host.os_info;
    await pool.query(
      `UPDATE hosts SET status = 'online', os_info = $1, metrics = $2, last_seen_at = NOW(), last_error = NULL WHERE id = $3`,
      [osInfo, JSON.stringify(metrics), hostId]
    );
    return { status: "online", metrics, osInfo };
  } catch (err: any) {
    const msg = err?.message || String(err);
    await pool.query(`UPDATE hosts SET status = 'offline', last_error = $1 WHERE id = $2`, [msg, hostId]);
    return { status: "offline", metrics: {}, osInfo: "", error: msg };
  }
}

export async function triggerPanicLockdown(scope: string, actor = "admin"): Promise<{
  lockedHosts: number;
  cancelledApprovals: number;
}> {
  let hostQuery = `UPDATE hosts SET read_only_ai = true, safety_tier = 'readonly' RETURNING id`;
  let params: any[] = [];
  if (scope !== "@all" && scope !== "all") {
    hostQuery = `UPDATE hosts SET read_only_ai = true, safety_tier = 'readonly' WHERE hostname = $1 OR group_name = $1 OR id::text = $1 RETURNING id`;
    params = [scope];
  }
  const hRes = await pool.query(hostQuery, params);
  const aRes = await pool.query(
    `UPDATE pending_approvals SET status = 'rejected', resolved_at = NOW() WHERE status = 'pending' RETURNING id`
  );
  await logAudit(
    actor,
    "security",
    `PANIC BUTTON activated for scope: ${scope}`,
    scope,
    { lockedHosts: hRes.rowCount, cancelledApprovals: aRes.rowCount },
    "critical"
  );
  return {
    lockedHosts: hRes.rowCount || 0,
    cancelledApprovals: aRes.rowCount || 0,
  };
}
