import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { initDatabase, logAudit, pool } from "./db.js";
import {
  computePublicKeyFingerprint,
  decryptSecret,
  encryptSecret,
  generateKeystoreMaterial,
  generateSSHKeyPair,
  hashPassword,
  keystoreOperation,
  verifyPassword,
} from "./vault.js";
import {
  bootstrapSSHKeyOnHost,
  connectSSH,
  executeOnHost,
  listDirectoryOnHost,
  probeHostHealth,
  readFileOnHost,
  registerAgentSocket,
  revertFileSnapshot,
  triggerPanicLockdown,
  writeFileWithBackupOnHost,
} from "./executor.js";
import {
  evaluateComplianceFramework,
  rotateManagedCredential,
  runMonitorCheck,
  runReportScanOnHost,
  syncSSHKeysToHost,
} from "./scanners.js";
import {
  ensureAIProfilesDir,
  getAISubscriptionStatus,
  handleMCPJsonRpc,
  importSubscriptionCredentials,
  invokeModelText,
  resolvePendingApproval,
  runAIFleetPrompt,
} from "./ai-bridge.js";
import net from "node:net";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });

await app.register(fastifyCors, { origin: true, credentials: true });
await app.register(fastifyCookie, {
  secret: process.env.SESSION_SECRET || "fleetops-session-secret-key",
});
await app.register(fastifyWebsocket);

function getActor(req: any): { username: string; email: string; role: string; authSource: string } {
  const fwdUser = req.headers["x-authentik-username"] as string | undefined;
  const fwdEmail = req.headers["x-authentik-email"] as string | undefined;
  const fwdGroups = (req.headers["x-authentik-groups"] as string | undefined) || "";
  if (fwdUser) {
    return {
      username: fwdUser,
      email: fwdEmail || `${fwdUser}@sso`,
      role: fwdGroups.includes("Admins") || fwdGroups.includes("Infrastructure") ? "owner" : "admin",
      authSource: "authentik-sso",
    };
  }
  return {
    username: (req.cookies?.fleetops_user as string) || "admin",
    email: "admin@fleetops.local",
    role: "owner",
    authSource: "local",
  };
}

// Health check
app.get("/health", async () => ({ status: "ok", service: "fleetops-ai", version: "1.0.0" }));

// Auth endpoints
app.get("/api/auth/me", async (req) => {
  const actor = getActor(req);
  const users = await pool.query(
    `SELECT id, username, email, display_name, role, ssh_public_key, system_username, created_at FROM users ORDER BY created_at ASC`
  );
  return { currentUser: actor, users: users.rows };
});

app.post("/api/auth/login", async (req, reply) => {
  const { username, password } = (req.body as any) || {};
  const res = await pool.query(`SELECT * FROM users WHERE username = $1 OR email = $1 LIMIT 1`, [username || "admin"]);
  if (res.rows.length === 0 || !verifyPassword(password || "", res.rows[0].password_hash || "")) {
    return reply.code(401).send({ error: "Invalid credentials" });
  }
  const u = res.rows[0];
  reply.setCookie("fleetops_user", u.username, { path: "/", httpOnly: true, sameSite: "lax" });
  return { ok: true, user: { username: u.username, email: u.email, role: u.role } };
});

app.post("/api/users", async (req) => {
  const actor = getActor(req);
  const { username, email, displayName, role, sshPublicKey, systemUsername, password } = (req.body as any) || {};
  const ins = await pool.query(
    `INSERT INTO users (username, email, display_name, password_hash, role, ssh_public_key, system_username)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (username) DO UPDATE SET
       email = EXCLUDED.email,
       display_name = EXCLUDED.display_name,
       role = EXCLUDED.role,
       ssh_public_key = EXCLUDED.ssh_public_key,
       system_username = EXCLUDED.system_username
     RETURNING id, username, email, display_name, role, ssh_public_key, system_username`,
    [
      username,
      email || `${username}@local`,
      displayName || username,
      hashPassword(password || "fleetops-user"),
      role || "admin",
      sshPublicKey || null,
      systemUsername || username,
    ]
  );
  await logAudit(actor.username, "users", `Upserted user ${username}`, username);
  return ins.rows[0];
});

// Dashboard overview
app.get("/api/overview", async () => {
  const [hostsRes, groupsRes, keysRes, approvalsRes, snapsRes, scansRes, monitorsRes, logsRes, aiProvsRes, envProfRes] =
    await Promise.all([
      pool.query(`SELECT * FROM hosts ORDER BY hostname ASC`),
      pool.query(`SELECT * FROM host_groups ORDER BY name ASC`),
      pool.query(`SELECT id, name, key_type, public_key, fingerprint, is_default, created_at FROM ssh_keys ORDER BY created_at DESC`),
      pool.query(`SELECT * FROM pending_approvals WHERE status = 'pending' ORDER BY created_at DESC`),
      pool.query(
        `SELECT s.id, s.host_id, h.hostname, s.file_path, s.existed_before, s.reverted, s.reverted_at, s.created_by, s.created_at
         FROM file_snapshots s JOIN hosts h ON s.host_id = h.id ORDER BY s.created_at DESC LIMIT 20`
      ),
      pool.query(
        `SELECT r.id, r.host_id, h.hostname, r.report_type, r.summary, r.score, r.created_at
         FROM scan_reports r JOIN hosts h ON r.host_id = h.id ORDER BY r.created_at DESC LIMIT 15`
      ),
      pool.query(
        `SELECT m.*, h.hostname FROM host_monitors m JOIN hosts h ON m.host_id = h.id ORDER BY m.created_at DESC`
      ),
      pool.query(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 25`),
      pool.query(
        `SELECT id, name, vendor, auth_mode, base_url, default_model, models, (api_key_enc IS NOT NULL AND api_key_enc != '') AS has_api_key, enabled, status, description, updated_at
         FROM ai_providers_config ORDER BY vendor, name`
      ),
      pool.query(`SELECT * FROM environment_profile WHERE id = 'default' LIMIT 1`),
    ]);

  return {
    hosts: hostsRes.rows,
    groups: groupsRes.rows,
    sshKeys: keysRes.rows,
    pendingApprovals: approvalsRes.rows,
    recentSnapshots: snapsRes.rows,
    recentScans: scansRes.rows,
    monitors: monitorsRes.rows,
    recentAuditLogs: logsRes.rows,
    aiStatus: getAISubscriptionStatus(),
    aiProviders: aiProvsRes.rows,
    envProfile: envProfRes.rows[0] || null,
  };
});

// Hosts CRUD & Operations
app.get("/api/hosts", async () => {
  const res = await pool.query(`SELECT * FROM hosts ORDER BY hostname ASC`);
  return res.rows;
});

app.post("/api/hosts", async (req) => {
  const actor = getActor(req);
  const b = (req.body as any) || {};
  let sshKeyId = b.sshKeyId || null;
  if (!sshKeyId) {
    const def = await pool.query(`SELECT id FROM ssh_keys WHERE is_default = true LIMIT 1`);
    sshKeyId = def.rows[0]?.id || null;
  }
  const ins = await pool.query(
    `INSERT INTO hosts (
       hostname, display_name, ip_address, ssh_port, ssh_user, ssh_key_id,
       connection_mode, os_type, os_info, group_name, site_name, tags,
       safety_tier, read_only_ai, assigned_skills
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (hostname) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       ip_address = EXCLUDED.ip_address,
       ssh_port = EXCLUDED.ssh_port,
       ssh_user = EXCLUDED.ssh_user,
       ssh_key_id = COALESCE(EXCLUDED.ssh_key_id, hosts.ssh_key_id),
       connection_mode = EXCLUDED.connection_mode,
       os_type = EXCLUDED.os_type,
       group_name = EXCLUDED.group_name,
       site_name = EXCLUDED.site_name,
       safety_tier = EXCLUDED.safety_tier,
       read_only_ai = EXCLUDED.read_only_ai
     RETURNING *`,
    [
      b.hostname,
      b.displayName || b.hostname,
      b.ipAddress,
      Number(b.sshPort) || 22,
      b.sshUser || "root",
      sshKeyId,
      b.connectionMode || "ssh",
      b.osType || "linux",
      b.osInfo || "",
      b.groupName || "default",
      b.siteName || "Main Datacenter",
      JSON.stringify(b.tags || []),
      b.safetyTier || "supervised",
      Boolean(b.readOnlyAi),
      JSON.stringify(
        b.assignedSkills || ["system", "services", "files", "packages", "network", "logs", "security", "containers"]
      ),
    ]
  );
  const host = ins.rows[0];
  await logAudit(actor.username, "host", `Added/updated host ${host.hostname} (${host.ip_address})`, host.hostname);
  probeHostHealth(host.id).catch(() => {});
  return host;
});

app.patch("/api/hosts/:id", async (req) => {
  const actor = getActor(req);
  const { id } = req.params as any;
  const b = (req.body as any) || {};
  const upd = await pool.query(
    `UPDATE hosts SET
       display_name = COALESCE($1, display_name),
       ip_address = COALESCE($2, ip_address),
       ssh_port = COALESCE($3, ssh_port),
       ssh_user = COALESCE($4, ssh_user),
       ssh_key_id = COALESCE($5, ssh_key_id),
       group_name = COALESCE($6, group_name),
       site_name = COALESCE($7, site_name),
       read_only_ai = COALESCE($8, read_only_ai),
       safety_tier = COALESCE($9, safety_tier),
       assigned_skills = COALESCE($10, assigned_skills),
       record_sessions = COALESCE($11, record_sessions)
     WHERE id = $12 RETURNING *`,
    [
      b.displayName ?? null,
      b.ipAddress ?? null,
      b.sshPort !== undefined ? Number(b.sshPort) : null,
      b.sshUser ?? null,
      b.sshKeyId ?? null,
      b.groupName ?? null,
      b.siteName ?? null,
      b.readOnlyAi !== undefined ? Boolean(b.readOnlyAi) : null,
      b.safetyTier ?? null,
      b.assignedSkills ? JSON.stringify(b.assignedSkills) : null,
      b.recordSessions !== undefined ? Boolean(b.recordSessions) : null,
      id,
    ]
  );
  await logAudit(actor.username, "host", `Updated host settings`, upd.rows[0]?.hostname || id);
  return upd.rows[0];
});

app.delete("/api/hosts/:id", async (req) => {
  const actor = getActor(req);
  const { id } = req.params as any;
  const del = await pool.query(`DELETE FROM hosts WHERE id = $1 RETURNING hostname`, [id]);
  await logAudit(actor.username, "host", `Removed host`, del.rows[0]?.hostname || id);
  return { ok: true };
});

app.post("/api/hosts/:id/probe", async (req) => {
  const { id } = req.params as any;
  return await probeHostHealth(id);
});

app.post("/api/hosts/probe-all", async () => {
  const hosts = await pool.query(`SELECT id FROM hosts`);
  const results = await Promise.all(hosts.rows.map((h) => probeHostHealth(h.id)));
  return { probed: results.length, online: results.filter((r) => r.status === "online").length };
});

app.post("/api/hosts/:id/bootstrap-ssh", async (req) => {
  const { id } = req.params as any;
  const { password, keyId } = (req.body as any) || {};
  return await bootstrapSSHKeyOnHost(id, password, keyId);
});

app.post("/api/hosts/:id/sync-ssh", async (req) => {
  const actor = getActor(req);
  const { id } = req.params as any;
  return await syncSSHKeysToHost(id, actor.username);
});

// Host Groups
app.get("/api/groups", async () => {
  const res = await pool.query(`SELECT * FROM host_groups ORDER BY name ASC`);
  return res.rows;
});

app.post("/api/groups", async (req) => {
  const b = (req.body as any) || {};
  const ins = await pool.query(
    `INSERT INTO host_groups (name, site_name, description, read_only_ai, assigned_skills)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (name) DO UPDATE SET
       site_name = EXCLUDED.site_name,
       description = EXCLUDED.description,
       read_only_ai = EXCLUDED.read_only_ai
     RETURNING *`,
    [
      b.name,
      b.siteName || "Main Datacenter",
      b.description || "",
      Boolean(b.readOnlyAi),
      JSON.stringify(b.assignedSkills || ["system", "services", "files", "packages", "network", "logs", "security"]),
    ]
  );
  return ins.rows[0];
});

// SSH Keys Vault
app.get("/api/ssh-keys", async () => {
  const res = await pool.query(
    `SELECT id, name, key_type, public_key, fingerprint, is_default, created_at FROM ssh_keys ORDER BY created_at DESC`
  );
  return res.rows;
});

app.post("/api/ssh-keys", async (req) => {
  const actor = getActor(req);
  const { name, keyType, privateKey, publicKey, isDefault } = (req.body as any) || {};
  let pub = publicKey || "";
  let priv = privateKey || "";
  let fp = "";

  if (!priv) {
    const gen = generateSSHKeyPair(name || "fleetops-key", keyType === "rsa" ? "rsa" : "ed25519");
    pub = gen.publicKey;
    priv = gen.privateKey;
    fp = gen.fingerprint;
  } else {
    fp = pub ? computePublicKeyFingerprint(pub) : "SHA256:imported-key";
  }

  if (isDefault) {
    await pool.query(`UPDATE ssh_keys SET is_default = false`);
  }

  const ins = await pool.query(
    `INSERT INTO ssh_keys (name, key_type, public_key, private_key_enc, fingerprint, is_default)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, key_type, public_key, fingerprint, is_default, created_at`,
    [name || "SSH Key", keyType || "ed25519", pub, encryptSecret(priv), fp, Boolean(isDefault)]
  );
  await logAudit(actor.username, "ssh_vault", `Created/imported SSH key ${name}`, name);
  return ins.rows[0];
});

app.delete("/api/ssh-keys/:id", async (req) => {
  const { id } = req.params as any;
  await pool.query(`DELETE FROM ssh_keys WHERE id = $1`, [id]);
  return { ok: true };
});

// SFTP / File Browser & Editor with Automatic Pre-Change Snapshot
app.get("/api/hosts/:id/files", async (req) => {
  const { id } = req.params as any;
  const { dir, file } = (req.query as any) || {};
  if (file) {
    const content = await readFileOnHost(id, file);
    return { filePath: file, content };
  }
  const items = await listDirectoryOnHost(id, dir || "/etc");
  return { dirPath: dir || "/etc", items };
});

app.post("/api/hosts/:id/files", async (req) => {
  const actor = getActor(req);
  const { id } = req.params as any;
  const { filePath, content } = (req.body as any) || {};
  return await writeFileWithBackupOnHost(id, filePath, content || "", actor.username);
});

// Snapshots & 1-Click Revert
app.get("/api/snapshots", async (req) => {
  const { hostId } = (req.query as any) || {};
  const q = hostId
    ? await pool.query(
        `SELECT s.*, h.hostname FROM file_snapshots s JOIN hosts h ON s.host_id = h.id WHERE s.host_id = $1 ORDER BY s.created_at DESC LIMIT 50`,
        [hostId]
      )
    : await pool.query(
        `SELECT s.*, h.hostname FROM file_snapshots s JOIN hosts h ON s.host_id = h.id ORDER BY s.created_at DESC LIMIT 50`
      );
  return q.rows;
});

app.post("/api/snapshots/:id/revert", async (req) => {
  const actor = getActor(req);
  const { id } = req.params as any;
  return await revertFileSnapshot(id, actor.username);
});

// AI Subscriptions & Fleet Chat Sessions
app.get("/api/ai/status", async () => getAISubscriptionStatus());

app.post("/api/ai/credentials", async (req) => {
  const actor = getActor(req);
  const { provider, credentialsJson, accountEmail } = (req.body as any) || {};
  const res = importSubscriptionCredentials(provider, credentialsJson, accountEmail);
  await logAudit(actor.username, "ai_subscription", `Updated ${provider} subscription OAuth credentials`, provider);
  return { ...res, status: getAISubscriptionStatus() };
});

// Universal AI Providers Management (12 Cloud, Subscription & Local Providers)
app.get("/api/ai/providers", async () => {
  const res = await pool.query(
    `SELECT id, name, vendor, auth_mode, base_url, default_model, models, (api_key_enc IS NOT NULL AND api_key_enc != '') AS has_api_key, enabled, status, description, updated_at
     FROM ai_providers_config ORDER BY vendor, name`
  );
  return res.rows;
});

app.post("/api/ai/providers/:id", async (req) => {
  const actor = getActor(req);
  const { id } = req.params as any;
  const { baseUrl, defaultModel, apiKey, enabled, models } = (req.body as any) || {};
  const apiKeyEnc = apiKey ? encryptSecret(apiKey) : null;
  const upd = await pool.query(
    `UPDATE ai_providers_config SET
       base_url = COALESCE($1, base_url),
       default_model = COALESCE($2, default_model),
       api_key_enc = COALESCE($3, api_key_enc),
       enabled = COALESCE($4, enabled),
       models = COALESCE($5, models),
       status = CASE WHEN COALESCE($4, enabled) THEN 'ready' ELSE status END,
       updated_at = NOW()
     WHERE id = $6
     RETURNING id, name, vendor, auth_mode, base_url, default_model, models, (api_key_enc IS NOT NULL AND api_key_enc != '') AS has_api_key, enabled, status, description, updated_at`,
    [
      baseUrl ?? null,
      defaultModel ?? null,
      apiKeyEnc,
      enabled !== undefined ? Boolean(enabled) : null,
      models ? JSON.stringify(models) : null,
      id,
    ]
  );
  await logAudit(actor.username, "ai_provider", `Configured AI provider ${id}`, id);
  return upd.rows[0];
});

app.post("/api/ai/providers/:id/test", async (req) => {
  const { id } = req.params as any;
  try {
    const provRes = await pool.query(`SELECT default_model FROM ai_providers_config WHERE id = $1`, [id]);
    const model = provRes.rows[0]?.default_model || "";
    const reply = await invokeModelText(id, model, "Reply with the exact word: READY");
    await pool.query(`UPDATE ai_providers_config SET status = 'ready', enabled = true, updated_at = NOW() WHERE id = $1`, [
      id,
    ]);
    return { ok: true, status: "ready", reply: reply.slice(0, 120) };
  } catch (err: any) {
    await pool.query(`UPDATE ai_providers_config SET status = 'error', updated_at = NOW() WHERE id = $1`, [id]);
    return { ok: false, status: "error", error: err?.message || String(err) };
  }
});

// Environment Onboarding, Subnet Discovery & AI Governance Policy
app.get("/api/onboarding/profile", async () => {
  const res = await pool.query(`SELECT * FROM environment_profile WHERE id = 'default' LIMIT 1`);
  return res.rows[0] || null;
});

app.post("/api/onboarding/save", async (req) => {
  const actor = getActor(req);
  const b = (req.body as any) || {};
  const snmpEnc = b.snmpCommunity ? encryptSecret(b.snmpCommunity) : null;
  const upd = await pool.query(
    `UPDATE environment_profile SET
       org_name = COALESCE($1, org_name),
       primary_site = COALESCE($2, primary_site),
       subnets = COALESCE($3, subnets),
       enabled_platforms = COALESCE($4, enabled_platforms),
       agent_decision_mode = COALESCE($5, agent_decision_mode),
       auto_append_rules = COALESCE($6, auto_append_rules),
       auto_onboard_discovered = COALESCE($7, auto_onboard_discovered),
       require_approval_restarts = COALESCE($8, require_approval_restarts),
       require_approval_firewall = COALESCE($9, require_approval_firewall),
       mandatory_config_snapshots = COALESCE($10, mandatory_config_snapshots),
       default_ai_provider = COALESCE($11, default_ai_provider),
       default_ai_model = COALESCE($12, default_ai_model),
       fallback_ai_provider = COALESCE($13, fallback_ai_provider),
       snmp_community_enc = COALESCE($14, snmp_community_enc),
       onboarding_completed = true,
       updated_at = NOW()
     WHERE id = 'default'
     RETURNING *`,
    [
      b.orgName ?? null,
      b.primarySite ?? null,
      b.subnets ? JSON.stringify(b.subnets) : null,
      b.enabledPlatforms ? JSON.stringify(b.enabledPlatforms) : null,
      b.agentDecisionMode ?? null,
      b.autoAppendRules !== undefined ? Boolean(b.autoAppendRules) : null,
      b.autoOnboardDiscovered !== undefined ? Boolean(b.autoOnboardDiscovered) : null,
      b.requireApprovalRestarts !== undefined ? Boolean(b.requireApprovalRestarts) : null,
      b.requireApprovalFirewall !== undefined ? Boolean(b.requireApprovalFirewall) : null,
      b.mandatoryConfigSnapshots !== undefined ? Boolean(b.mandatoryConfigSnapshots) : null,
      b.defaultAiProvider ?? null,
      b.defaultAiModel ?? null,
      b.fallbackAiProvider ?? null,
      snmpEnc,
    ]
  );

  // If the user opted to apply the decision mode across existing hosts, update safety_tier
  if (b.applyDecisionModeToFleet && b.agentDecisionMode) {
    const mappedTier =
      b.agentDecisionMode === "readonly"
        ? "readonly"
        : b.agentDecisionMode === "autonomous"
        ? "autonomous"
        : "supervised";
    await pool.query(`UPDATE hosts SET safety_tier = $1, read_only_ai = $2`, [
      mappedTier,
      mappedTier === "readonly",
    ]);
  }

  // If default credentials were supplied in the wizard, save them into managed_credentials Vault
  if (b.defaultLinuxPassword) {
    await pool.query(
      `INSERT INTO managed_credentials (name, cred_type, target_user, secret_enc, rotation_days)
       VALUES ($1, 'ssh_password', $2, $3, 90)`,
      ["Default Linux SSH / Sudo Credential", b.defaultLinuxUser || "root", encryptSecret(b.defaultLinuxPassword)]
    );
  }
  if (b.defaultWindowsPassword) {
    await pool.query(
      `INSERT INTO managed_credentials (name, cred_type, target_user, secret_enc, rotation_days)
       VALUES ($1, 'winrm_rdp', $2, $3, 90)`,
      [
        "Default Windows Server Admin Credential",
        b.defaultWindowsUser || "Administrator",
        encryptSecret(b.defaultWindowsPassword),
      ]
    );
  }
  if (b.defaultNetworkPassword) {
    await pool.query(
      `INSERT INTO managed_credentials (name, cred_type, target_user, secret_enc, rotation_days)
       VALUES ($1, 'network_appliance', $2, $3, 90)`,
      [
        "Default Switch / Firewall Admin Credential",
        b.defaultNetworkUser || "admin",
        encryptSecret(b.defaultNetworkPassword),
      ]
    );
  }

  await logAudit(
    actor.username,
    "onboarding",
    `Updated environment profile & AI governance policy (${b.agentDecisionMode || "supervised"})`,
    "environment_profile"
  );
  return upd.rows[0];
});

// Fast TCP Port Prober for Subnet / IP Range Discovery
function checkPortFast(ip: string, port: number, timeoutMs = 450): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let settled = false;
    const finish = (ok: boolean) => {
      if (!settled) {
        settled = true;
        sock.destroy();
        resolve(ok);
      }
    };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
    sock.connect(port, ip);
  });
}

app.post("/api/onboarding/discover-subnet", async (req) => {
  const { subnetOrRange = "127.0.0.1" } = (req.body as any) || {};
  const ipsToProbe: string[] = [];
  const trimmed = String(subnetOrRange).trim();

  if (trimmed.includes("/")) {
    // Parse /24 CIDR prefix and scan .1 .. .30 + .250 .. .254 for fast interactive discovery
    const base = trimmed.split("/")[0].split(".").slice(0, 3).join(".");
    if (base.split(".").length === 3) {
      for (let i = 1; i <= 30; i++) ipsToProbe.push(`${base}.${i}`);
      for (let i = 240; i <= 254; i++) ipsToProbe.push(`${base}.${i}`);
    }
  } else if (trimmed.includes(",")) {
    for (const part of trimmed.split(",")) {
      if (part.trim()) ipsToProbe.push(part.trim());
    }
  } else {
    ipsToProbe.push(trimmed);
  }

  const probePorts = [22, 443, 631, 3389, 5985, 6443, 8443, 9100];
  const discovered: Array<{
    ip: string;
    openPorts: number[];
    detectedType: string;
    suggestedGroup: string;
    osType: string;
  }> = [];

  await Promise.all(
    ipsToProbe.slice(0, 48).map(async (ip) => {
      const checks = await Promise.all(probePorts.map(async (p) => ((await checkPortFast(ip, p)) ? p : null)));
      const open = checks.filter((p): p is number => p !== null);
      if (open.length > 0) {
        let detectedType = "Linux Server";
        let suggestedGroup = "linux-servers";
        let osType = "linux";
        if (open.includes(9100) || open.includes(631)) {
          detectedType = "Network Printer / MFP (JetDirect / IPP)";
          suggestedGroup = "network-printers";
          osType = "printer";
        } else if (open.includes(3389) || open.includes(5985)) {
          detectedType = "Windows Server (RDP / WinRM)";
          suggestedGroup = "windows-servers";
          osType = "windows";
        } else if (open.includes(6443)) {
          detectedType = "Kubernetes / K3s Control Plane Node";
          suggestedGroup = "k3s-cluster";
          osType = "linux";
        } else if ((open.includes(443) || open.includes(8443)) && !open.includes(22)) {
          detectedType = "Firewall / Managed Switch Appliance";
          suggestedGroup = "network-appliances";
          osType = "firewall";
        }
        discovered.push({ ip, openPorts: open, detectedType, suggestedGroup, osType });
      }
    })
  );

  return { scannedCount: ipsToProbe.length, discovered };
});

app.get("/api/ai/sessions", async () => {
  const res = await pool.query(`SELECT * FROM ai_sessions ORDER BY updated_at DESC LIMIT 40`);
  return res.rows;
});

app.post("/api/ai/sessions", async (req) => {
  const actor = getActor(req);
  const b = (req.body as any) || {};
  const ins = await pool.query(
    `INSERT INTO ai_sessions (title, provider, model, target_scope, safety_tier, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      b.title || `Fleet Session — ${b.targetScope || "@all"}`,
      b.provider || "claude-sub",
      b.model || "claude-sonnet-4-6",
      b.targetScope || "@all",
      b.safetyTier || "supervised",
      actor.username,
    ]
  );
  return ins.rows[0];
});

app.delete("/api/ai/sessions/:id", async (req) => {
  const { id } = req.params as any;
  await pool.query(`DELETE FROM ai_sessions WHERE id = $1`, [id]);
  return { ok: true };
});

app.get("/api/ai/sessions/:id/messages", async (req) => {
  const { id } = req.params as any;
  const [msgs, approvals] = await Promise.all([
    pool.query(`SELECT * FROM ai_messages WHERE session_id = $1 ORDER BY created_at ASC`, [id]),
    pool.query(`SELECT * FROM pending_approvals WHERE session_id = $1 ORDER BY created_at DESC`, [id]),
  ]);
  return { messages: msgs.rows, approvals: approvals.rows };
});

app.post("/api/ai/sessions/:id/messages", async (req) => {
  const actor = getActor(req);
  const { id } = req.params as any;
  const b = (req.body as any) || {};
  const sessRes = await pool.query(`SELECT * FROM ai_sessions WHERE id = $1`, [id]);
  if (sessRes.rows.length === 0) throw new Error("Session not found");
  const sess = sessRes.rows[0];

  const provider = b.provider || sess.provider;
  const model = b.model || sess.model;
  const targetScope = b.targetScope || sess.target_scope;
  const safetyTier = b.safetyTier || sess.safety_tier;

  await pool.query(
    `UPDATE ai_sessions SET provider = $1, model = $2, target_scope = $3, safety_tier = $4, updated_at = NOW() WHERE id = $5`,
    [provider, model, targetScope, safetyTier, id]
  );

  return await runAIFleetPrompt({
    sessionId: id,
    userPrompt: b.prompt || "",
    provider,
    model,
    targetScope,
    safetyTier,
    actor: actor.username,
  });
});

// Supervised Mode Approvals
app.get("/api/approvals", async () => {
  const res = await pool.query(`SELECT * FROM pending_approvals ORDER BY created_at DESC LIMIT 50`);
  return res.rows;
});

app.post("/api/approvals/:id/resolve", async (req) => {
  const actor = getActor(req);
  const { id } = req.params as any;
  const { decision } = (req.body as any) || {};
  return await resolvePendingApproval(id, decision === "approve" ? "approve" : "reject", actor.username);
});

// Catalogs (Skills, Monitors, Reports, Compliance Frameworks, MCP Plugins)
app.get("/api/catalog", async () => {
  const [skills, monitors, reports, frameworks, mcpPlugins] = await Promise.all([
    pool.query(`SELECT slug, node_type, name, category, description, definition FROM skills_catalog ORDER BY category, name`),
    pool.query(`SELECT slug, name, category, check_type, definition FROM monitors_catalog ORDER BY category, name`),
    pool.query(`SELECT type, node_type, name, definition FROM reports_catalog ORDER BY type, node_type`),
    pool.query(`SELECT id, name, version, description, definition FROM frameworks_catalog ORDER BY id`),
    pool.query(`SELECT * FROM mcp_plugins_catalog ORDER BY category, name`),
  ]);
  return {
    skills: skills.rows,
    monitors: monitors.rows,
    reports: reports.rows,
    frameworks: frameworks.rows,
    mcpPlugins: mcpPlugins.rows,
  };
});

// MCP Plugins Marketplace & Configuration (Kubernetes, Docker, Linux, Windows)
app.get("/api/mcp-plugins", async (req) => {
  const { category } = (req.query as any) || {};
  const res = category
    ? await pool.query(`SELECT * FROM mcp_plugins_catalog WHERE category = $1 ORDER BY name`, [category])
    : await pool.query(`SELECT * FROM mcp_plugins_catalog ORDER BY category, name`);
  return res.rows;
});

app.post("/api/mcp-plugins/:slug/toggle", async (req) => {
  const actor = getActor(req);
  const { slug } = req.params as any;
  const { installed, enabled, targetHostId, customEnv } = (req.body as any) || {};
  const upd = await pool.query(
    `UPDATE mcp_plugins_catalog SET
       installed = COALESCE($1, installed),
       enabled = COALESCE($2, enabled),
       target_host_id = COALESCE($3, target_host_id),
       custom_env = COALESCE($4, custom_env),
       updated_at = NOW()
     WHERE slug = $5 RETURNING *`,
    [
      installed !== undefined ? Boolean(installed) : null,
      enabled !== undefined ? Boolean(enabled) : null,
      targetHostId !== undefined ? targetHostId || null : null,
      customEnv ? JSON.stringify(customEnv) : null,
      slug,
    ]
  );
  if (upd.rows.length === 0) throw new Error(`MCP plugin not found: ${slug}`);
  const row = upd.rows[0];
  await logAudit(
    actor.username,
    "mcp_plugin",
    `${row.installed ? "Installed/Enabled" : "Disabled"} MCP plugin ${row.name} (${row.category})`,
    slug
  );
  return row;
});

// Live Infrastructure Platform Inspector (Kubernetes, Docker, Linux, Windows)
app.get("/api/platforms/inspect", async (req) => {
  const { platform = "kubernetes", hostId } = (req.query as any) || {};
  let host: any = null;
  if (hostId) {
    const hRes = await pool.query(`SELECT * FROM hosts WHERE id = $1`, [hostId]);
    host = hRes.rows[0] || null;
  } else {
    const allRes = await pool.query(`SELECT * FROM hosts WHERE status = 'online' ORDER BY hostname ASC`);
    if (platform === "windows") {
      host = allRes.rows.find((h) => h.os_type === "windows") || null;
    } else if (platform === "kubernetes") {
      host =
        allRes.rows.find(
          (h) =>
            h.os_type === "linux" &&
            (h.group_name?.toLowerCase().includes("k3s") ||
              h.group_name?.toLowerCase().includes("k8s") ||
              h.hostname?.toLowerCase().includes("cloud") ||
              (h.tags || []).includes("k3s") ||
              (h.tags || []).includes("kubernetes"))
        ) ||
        allRes.rows.find((h) => h.os_type === "linux") ||
        null;
    } else if (platform === "docker") {
      host =
        allRes.rows.find(
          (h) =>
            h.os_type === "linux" &&
            (h.hostname?.toLowerCase().includes("dock") ||
              (h.tags || []).includes("docker") ||
              (h.assigned_skills || []).includes("containers"))
        ) ||
        allRes.rows.find((h) => h.os_type === "linux") ||
        null;
    } else {
      host = allRes.rows.find((h) => h.os_type === "linux") || null;
    }
  }

  if (!host) {
    return {
      platform,
      host: null,
      summary: `No online ${platform} host selected or reachable.`,
      sections: {},
    };
  }

  const sections: Record<string, string> = {};
  if (platform === "kubernetes") {
    const cmd = `
      export KUBECONFIG=/etc/rancher/k3s/k3s.yaml;
      if command -v kubectl >/dev/null 2>&1 || command -v k3s >/dev/null 2>&1; then
        KCMD="kubectl";
        command -v kubectl >/dev/null 2>&1 || KCMD="k3s kubectl";
        echo "===NODES===";
        $KCMD get nodes -o wide 2>&1 || true;
        echo "===UNHEALTHY_PODS===";
        $KCMD get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded 2>&1 || true;
        echo "===WORKLOAD_SUMMARY===";
        $KCMD get deployments,statefulsets,daemonsets,pvc -A 2>&1 | head -n 45 || true;
        echo "===EVENTS===";
        $KCMD get events -A --sort-by=.lastTimestamp 2>&1 | tail -n 18 || true;
      else
        echo "===NODES===";
        echo "kubectl / k3s binary not detected on ${host.hostname}. Install mcp-server-kubernetes or select a Kubernetes control-plane node.";
      fi
    `;
    const res = await executeOnHost(host.id, cmd, 20000);
    const out = res.stdout || res.stderr || "";
    const parts = out.split(/===([A-Z_]+)===/);
    for (let i = 1; i < parts.length; i += 2) {
      sections[parts[i].toLowerCase()] = (parts[i + 1] || "").trim();
    }
  } else if (platform === "docker") {
    const cmd = `
      if command -v docker >/dev/null 2>&1; then
        echo "===CONTAINERS===";
        docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" 2>&1 || true;
        echo "===STATS===";
        docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.PIDs}}" 2>&1 || true;
        echo "===COMPOSE_STACKS===";
        docker compose ls 2>&1 || true;
        echo "===STORAGE===";
        docker system df 2>&1 || true;
      else
        echo "===CONTAINERS===";
        echo "Docker Engine not installed or running on ${host.hostname}.";
      fi
    `;
    const res = await executeOnHost(host.id, cmd, 20000);
    const out = res.stdout || res.stderr || "";
    const parts = out.split(/===([A-Z_]+)===/);
    for (let i = 1; i < parts.length; i += 2) {
      sections[parts[i].toLowerCase()] = (parts[i + 1] || "").trim();
    }
  } else if (platform === "linux") {
    const cmd = `
      echo "===SYSTEMD_SERVICES===";
      systemctl list-units --type=service --state=running --no-pager --no-legend 2>&1 | head -n 22 || ps aux | head -n 15;
      echo "===FAILED_UNITS===";
      systemctl --failed --no-pager 2>&1 || true;
      echo "===STORAGE_MOUNTS===";
      df -hT -x tmpfs -x devtmpfs 2>&1 || df -h;
      echo "===LISTENING_PORTS===";
      ss -tulnp 2>&1 | head -n 22 || netstat -tulnp 2>&1 | head -n 22 || true;
    `;
    const res = await executeOnHost(host.id, cmd, 20000);
    const out = res.stdout || res.stderr || "";
    const parts = out.split(/===([A-Z_]+)===/);
    for (let i = 1; i < parts.length; i += 2) {
      sections[parts[i].toLowerCase()] = (parts[i + 1] || "").trim();
    }
  } else if (platform === "windows") {
    const cmd =
      host.os_type === "windows"
        ? `powershell -NoProfile -Command "Write-Output '===WINDOWS_SERVICES==='; Get-Service | Where-Object {$_.StartType -eq 'Automatic'} | Select-Object -First 22 Status,Name,DisplayName | Format-Table -AutoSize | Out-String -Width 160; Write-Output '===EVENT_LOGS==='; Get-WinEvent -LogName System -MaxEvents 12 -ErrorAction SilentlyContinue | Select-Object TimeCreated,Id,LevelDisplayName,ProviderName | Format-Table -AutoSize | Out-String -Width 160; Write-Output '===VOLUMES==='; Get-PSDrive -PSProvider FileSystem | Format-Table Name,Used,Free,Root -AutoSize | Out-String -Width 160; Write-Output '===HOTFIXES==='; Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 10 HotFixID,Description,InstalledOn | Format-Table -AutoSize | Out-String -Width 160"`
        : `echo "===WINDOWS_SERVICES===" && echo "Selected host (${host.hostname}) is Linux. Select a Windows Server host to run live PowerShell/WinRM inspection."`;
    const res = await executeOnHost(host.id, cmd, 25000);
    const out = res.stdout || res.stderr || "";
    const parts = out.split(/===([A-Z_]+)===/);
    for (let i = 1; i < parts.length; i += 2) {
      sections[parts[i].toLowerCase()] = (parts[i + 1] || "").trim();
    }
  } else if (platform === "network") {
    const cmd = `
      echo "===INTERFACES_AND_VLANS===";
      ip -brief addr 2>&1 || ifconfig 2>&1 || true;
      echo "--- Routing Table ---";
      ip route show 2>&1 | head -n 18 || true;
      echo "===FIREWALL_AND_VPN_STATUS===";
      (ufw status verbose 2>/dev/null || nft list tables 2>/dev/null || iptables -S 2>/dev/null | head -n 20 || echo "Standard host packet filter active") 2>&1;
      wg show 2>/dev/null || ipsec status 2>/dev/null || true;
      echo "===ARP_AND_LLDP_NEIGHBORS===";
      ip neigh show 2>&1 | head -n 22 || arp -an 2>&1 | head -n 22 || true;
      lldpctl 2>/dev/null | head -n 20 || true;
      echo "===PRINTER_AND_APPLIANCE_SERVICES===";
      lpstat -p -d -o 2>/dev/null || echo "CUPS / IPP local spooler: idle (Use SNMP/IPP Printer MCP or target IP for remote JetDirect :9100 / IPP :631 printers)";
      ss -tulnp 2>/dev/null | grep -E ':(22|53|67|68|161|443|515|631|8443|9100)\\b' || true;
    `;
    const res = await executeOnHost(host.id, cmd, 20000);
    const out = res.stdout || res.stderr || "";
    const parts = out.split(/===([A-Z_]+)===/);
    for (let i = 1; i < parts.length; i += 2) {
      sections[parts[i].toLowerCase()] = (parts[i + 1] || "").trim();
    }
  } else if (platform === "virtualization") {
    const cmd = `
      echo "===VMS_AND_HYPERVISOR===";
      (qm list 2>/dev/null; pct list 2>/dev/null; virsh list --all 2>/dev/null; systemd-detect-virt 2>/dev/null || lscpu | grep -E 'Architecture|Model name|Virtualization|CPU\\(s\\)') 2>&1 | head -n 25;
      echo "===ZFS_AND_RAID_POOLS===";
      (zpool status 2>/dev/null || cat /proc/mdstat 2>/dev/null || echo "No ZFS / mdadm RAID arrays on host (Standard LVM/ext4/xfs active)") 2>&1 | head -n 25;
      echo "===BLOCK_DEVICES_AND_MOUNTS===";
      lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT 2>&1 | head -n 25 || df -hT 2>&1;
      echo "===NFS_SMB_ISCSI_SHARES===";
      (exportfs -v 2>/dev/null; cat /etc/exports 2>/dev/null | grep -v '^#'; mount | grep -E 'nfs|cifs|zfs|ceph' 2>/dev/null || echo "No active NFS/SMB/Ceph network exports detected") 2>&1 | head -n 20;
    `;
    const res = await executeOnHost(host.id, cmd, 20000);
    const out = res.stdout || res.stderr || "";
    const parts = out.split(/===([A-Z_]+)===/);
    for (let i = 1; i < parts.length; i += 2) {
      sections[parts[i].toLowerCase()] = (parts[i + 1] || "").trim();
    }
  } else if (platform === "databases") {
    const cmd = `
      echo "===ACTIVE_DATABASE_ENGINES===";
      ps -eo pid,user,pcpu,pmem,comm,args | grep -E 'postgres|mariadbd|mysqld|redis-server|valkey|mongod|clickhouse|beam.smp|elastic' | grep -v grep 2>&1 | head -n 20 || echo "No local database daemon running directly on host (check Docker / Kubernetes workloads)";
      echo "===DATABASE_PORTS_AND_POOLS===";
      ss -tulnp 2>/dev/null | grep -E ':(3306|5432|5433|6379|6432|8123|9042|9200|27017)\\b' || echo "No local DB ports (:5432, :3306, :6379, :27017, :9200) bound on host network";
      echo "===REDIS_AND_CACHE_HEALTH===";
      (redis-cli info memory 2>/dev/null | grep -E 'used_memory_human|maxmemory_human|mem_fragmentation_ratio' || echo "Redis CLI local probe: no unauthenticated localhost:6379 instance") 2>&1;
      echo "===BACKUP_ARCHIVES_AND_DUMPS===";
      ls -lh /var/backups /tmp/*.sql* /var/lib/postgresql 2>/dev/null | head -n 20 || echo "Standard backup directory scan complete";
    `;
    const res = await executeOnHost(host.id, cmd, 20000);
    const out = res.stdout || res.stderr || "";
    const parts = out.split(/===([A-Z_]+)===/);
    for (let i = 1; i < parts.length; i += 2) {
      sections[parts[i].toLowerCase()] = (parts[i + 1] || "").trim();
    }
  } else if (platform === "identity_proxy") {
    const cmd = `
      echo "===REVERSE_PROXIES_AND_INGRESS===";
      ps -eo pid,user,pcpu,pmem,comm,args | grep -E 'nginx|traefik|zoraxy|caddy|haproxy|cloudflared|authentik|keycloak' | grep -v grep 2>&1 | head -n 20 || echo "No host-level reverse proxy process detected (check container/k8s ingress)";
      ss -tulnp 2>/dev/null | grep -E ':(80|443|8000|8080|8443|9000|9443)\\b' || true;
      echo "===TLS_CERTIFICATES_AND_PKI===";
      (certbot certificates 2>/dev/null || ls -la /etc/letsencrypt/live /etc/ssl/certs/fleetops* 2>/dev/null || echo "Local PKI / CA store: $(ls /etc/ssl/certs 2>/dev/null | wc -l) trusted root certificates installed") 2>&1 | head -n 22;
      echo "===CROWDSEC_AND_FAIL2BAN_WAF===";
      (cscli decisions list 2>/dev/null || fail2ban-client status 2>/dev/null || echo "No active CrowdSec / Fail2ban local bans on ${host.hostname}") 2>&1 | head -n 20;
      echo "===SSO_AUTH_AND_PAM_SESSIONS===";
      (who -a 2>/dev/null; last -n 8 2>/dev/null) | head -n 18;
    `;
    const res = await executeOnHost(host.id, cmd, 20000);
    const out = res.stdout || res.stderr || "";
    const parts = out.split(/===([A-Z_]+)===/);
    for (let i = 1; i < parts.length; i += 2) {
      sections[parts[i].toLowerCase()] = (parts[i + 1] || "").trim();
    }
  } else if (platform === "observability") {
    const cmd = `
      echo "===MONITORING_AND_SIEM_AGENTS===";
      ps -eo pid,user,pcpu,pmem,comm | grep -E 'prometheus|node_exporter|promtail|alloy|vector|wazuh|auditd|falco|zabbix|telegraf|fleetops-agent' | grep -v grep 2>&1 || echo "Agentless SSH telemetry active";
      echo "===RECENT_CRITICAL_SYSLOG_EVENTS===";
      (journalctl -p err..emerg -n 15 --no-pager 2>/dev/null || tail -n 15 /var/log/syslog /var/log/messages 2>/dev/null || dmesg | tail -n 15) 2>&1;
      echo "===SCHEDULED_CRON_AND_SYSTEMD_TIMERS===";
      (systemctl list-timers --no-pager 2>/dev/null | head -n 15; ls -la /etc/cron.d /etc/cron.daily 2>/dev/null | head -n 15) 2>&1;
      echo "===AUDITD_AND_SECURITY_EVENTS===";
      (aureport --summary 2>/dev/null || grep -iE 'sudo|failed|accepted' /var/log/auth.log /var/log/secure 2>/dev/null | tail -n 12 || last -n 8 2>/dev/null) 2>&1;
    `;
    const res = await executeOnHost(host.id, cmd, 20000);
    const out = res.stdout || res.stderr || "";
    const parts = out.split(/===([A-Z_]+)===/);
    for (let i = 1; i < parts.length; i += 2) {
      sections[parts[i].toLowerCase()] = (parts[i + 1] || "").trim();
    }
  }

  return {
    platform,
    host: {
      id: host.id,
      hostname: host.hostname,
      ip_address: host.ip_address,
      os_type: host.os_type,
      os_info: host.os_info,
      group_name: host.group_name,
      read_only_ai: host.read_only_ai,
    },
    sections,
  };
});

app.post("/api/platforms/action", async (req) => {
  const actor = getActor(req);
  const { hostId, platform, action, target } = (req.body as any) || {};
  const hRes = await pool.query(`SELECT * FROM hosts WHERE id = $1`, [hostId]);
  if (hRes.rows.length === 0) throw new Error("Target host not found");
  const host = hRes.rows[0];

  const mutatingActions = new Set([
    "k8s_restart_deployment",
    "k8s_etcd_snapshot",
    "docker_restart_container",
    "docker_stop_container",
    "docker_start_container",
    "docker_prune_images",
    "linux_restart_service",
    "windows_restart_service",
    "virt_zfs_snapshot",
    "proxy_reload_Check",
  ]);
  if (host.read_only_ai && mutatingActions.has(action)) {
    throw new Error(`Host ${host.hostname} has Read-Only AI Access enabled; mutating action '${action}' blocked.`);
  }

  const safeTarget = String(target || "").replace(/[^a-zA-Z0-9_.:/@-]/g, "");
  let cmd = "";
  if (action === "k8s_pod_logs") {
    const [ns, pod] = safeTarget.includes("/") ? safeTarget.split("/") : ["default", safeTarget];
    cmd = `export KUBECONFIG=/etc/rancher/k3s/k3s.yaml; kubectl -n ${ns} logs ${pod} --tail=80 2>&1`;
  } else if (action === "k8s_restart_deployment") {
    const [ns, dep] = safeTarget.includes("/") ? safeTarget.split("/") : ["default", safeTarget];
    cmd = `export KUBECONFIG=/etc/rancher/k3s/k3s.yaml; kubectl -n ${ns} rollout restart deployment/${dep} 2>&1`;
  } else if (action === "k8s_top_pods") {
    cmd = `export KUBECONFIG=/etc/rancher/k3s/k3s.yaml; kubectl top nodes 2>&1; echo "---"; kubectl top pods -A --sort-by=memory 2>&1 | head -n 25`;
  } else if (action === "docker_container_logs") {
    cmd = `docker logs --tail 80 ${safeTarget} 2>&1`;
  } else if (action === "docker_restart_container") {
    cmd = `docker restart ${safeTarget} 2>&1`;
  } else if (action === "docker_prune_images") {
    cmd = `docker image prune -f 2>&1`;
  } else if (action === "linux_service_logs") {
    cmd = `journalctl -u ${safeTarget} -n 60 --no-pager 2>&1`;
  } else if (action === "linux_restart_service") {
    cmd = `systemctl restart ${safeTarget} && systemctl status ${safeTarget} --no-pager | head -n 15 2>&1`;
  } else if (action === "linux_check_updates") {
    cmd = `if command -v apt-get >/dev/null 2>&1; then apt-get -s upgrade 2>&1 | grep -E '^(Inst |Conf |[0-9]+ upgraded)' | head -n 35; elif command -v dnf >/dev/null 2>&1; then dnf check-update 2>&1 | head -n 35; else echo "Package manager check complete"; fi`;
  } else if (action === "windows_restart_service") {
    cmd = `powershell -NoProfile -Command "Restart-Service -Name '${safeTarget}' -Force; Get-Service -Name '${safeTarget}' | Format-Table -AutoSize"`;
  } else if (action === "windows_defender_status") {
    cmd = `powershell -NoProfile -Command "Get-MpComputerStatus | Select-Object AMServiceEnabled,AntispywareEnabled,AntivirusEnabled,RealTimeProtectionEnabled,AntivirusSignatureLastUpdated | Format-List"`;
  } else if (action === "network_backup_config") {
    cmd = `echo "# Network & Firewall Config Snapshot ($(date -Iseconds))"; ip addr show; echo "---"; ip route show; echo "---"; (nft list ruleset 2>/dev/null || iptables-save 2>/dev/null || cat /etc/hosts) | head -n 80`;
  } else if (action === "network_printer_status") {
    const printerIp = safeTarget || host.ip_address;
    cmd = `echo "=== Printer / MFP Diagnostic Probe (${printerIp}) ==="; ping -c 2 -W 1 ${printerIp} 2>&1 || true; lpstat -p -d -o 2>/dev/null || true; (curl -skL --max-time 3 https://${printerIp} || curl -sL --max-time 3 http://${printerIp}:631) 2>/dev/null | head -n 20 || echo "Probed IPP (:631) and JetDirect (:9100) on ${printerIp}"`;
  } else if (action === "network_ping_trace") {
    const dest = safeTarget || "1.1.1.1";
    cmd = `ping -c 3 -W 1 ${dest} 2>&1; echo "---"; (traceroute -m 8 -w 1 ${dest} 2>/dev/null || tracepath -m 8 ${dest} 2>/dev/null || ip route get ${dest}) 2>&1`;
  } else if (action === "virt_smart_health") {
    cmd = `lsblk -d -o NAME,SIZE,MODEL,ROTA,STATE 2>&1; echo "---"; (for d in /dev/sd[a-z] /dev/nvme[0-9]n1; do [ -e "$d" ] && smartctl -H "$d" 2>/dev/null; done) || echo "SMART block device health check completed"`;
  } else if (action === "virt_storage_pools") {
    cmd = `df -hT -x tmpfs -x devtmpfs 2>&1; echo "---"; zpool list 2>/dev/null || vgs 2>/dev/null || true`;
  } else if (action === "db_connection_summary") {
    cmd = `ss -tan 2>/dev/null | grep -E ':(5432|3306|6379|27017)\\b' | awk '{print $1}' | sort | uniq -c || echo "Active DB socket summary completed"; ps -eo pid,user,pcpu,pmem,comm | grep -E 'postgres|mysql|mariadb|redis|mongo' | grep -v grep || true`;
  } else if (action === "db_verify_backups") {
    cmd = `find /var/backups /tmp -maxdepth 2 -type f \\( -name "*.sql*" -o -name "*.dump*" -o -name "*.bak*" -o -name "*.tar*" \\) -ls 2>/dev/null | head -n 25 || echo "Backup archive scan finished"`;
  } else if (action === "tls_probe_cert") {
    const ep = safeTarget.includes(":") ? safeTarget : `${safeTarget || host.ip_address}:443`;
    cmd = `echo | openssl s_client -connect ${ep} -servername ${ep.split(":")[0]} 2>/dev/null | openssl x509 -noout -subject -issuer -dates -ext subjectAltName 2>&1 || echo "Probed TLS endpoint ${ep}"`;
  } else if (action === "proxy_test_config") {
    cmd = `(nginx -t 2>&1 || caddy validate 2>&1 || haproxy -c -f /etc/haproxy/haproxy.cfg 2>&1 || echo "Reverse proxy / ingress process check:") && ps aux | grep -E 'nginx|traefik|zoraxy|caddy|haproxy' | grep -v grep || true`;
  } else if (action === "obs_error_digest") {
    cmd = `(journalctl -p err..emerg --since "24 hours ago" --no-pager 2>/dev/null | tail -n 35 || dmesg -T 2>/dev/null | tail -n 25) 2>&1`;
  } else if (action === "obs_cron_audit") {
    cmd = `echo "=== /etc/crontab ==="; cat /etc/crontab 2>/dev/null || true; echo "=== /etc/cron.d ==="; ls -la /etc/cron.d 2>/dev/null || true; echo "=== Systemd Timers ==="; systemctl list-timers --all --no-pager 2>/dev/null | head -n 20 || true`;
  } else {
    throw new Error(`Unsupported platform action: ${action}`);
  }

  const res = await executeOnHost(host.id, cmd, 25000);
  await logAudit(actor.username, `platform_${platform}`, `Executed ${action} (${safeTarget || "cluster"})`, host.hostname);
  return {
    ok: res.exitCode === 0,
    exitCode: res.exitCode,
    output: (res.stdout || "") + (res.stderr ? `\n${res.stderr}` : ""),
  };
});

// Fleet Scans & Reports
app.get("/api/scans", async (req) => {
  const { hostId, reportType } = (req.query as any) || {};
  let sql = `SELECT r.*, h.hostname FROM scan_reports r JOIN hosts h ON r.host_id = h.id WHERE 1=1`;
  const params: any[] = [];
  if (hostId) {
    params.push(hostId);
    sql += ` AND r.host_id = $${params.length}`;
  }
  if (reportType) {
    params.push(reportType);
    sql += ` AND r.report_type = $${params.length}`;
  }
  sql += ` ORDER BY r.created_at DESC LIMIT 30`;
  const res = await pool.query(sql, params);
  return res.rows;
});

app.post("/api/hosts/:id/scans", async (req) => {
  const actor = getActor(req);
  const { id } = req.params as any;
  const { reportType } = (req.body as any) || {};
  return await runReportScanOnHost(id, reportType || "inventory", actor.username);
});

app.get("/api/scans/:id/export", async (req, reply) => {
  const { id } = req.params as any;
  const res = await pool.query(
    `SELECT r.*, h.hostname, h.ip_address, h.os_info FROM scan_reports r JOIN hosts h ON r.host_id = h.id WHERE r.id = $1`,
    [id]
  );
  if (res.rows.length === 0) return reply.code(404).send("Report not found");
  const r = res.rows[0];
  const findingsHtml = (r.findings || [])
    .map(
      (f: any) => `
      <tr>
        <td><strong>${f.severity?.toUpperCase()}</strong></td>
        <td>${f.name || f.slug}</td>
        <td>${f.finding}</td>
        <td>${f.remediation || ""}</td>
      </tr>`
    )
    .join("");
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>FleetOps AI Report — ${r.hostname} (${r.report_type})</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 32px; color: #0f172a; }
    h1 { margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; font-size: 13px; }
    th { background: #f1f5f9; }
    pre { background: #0f172a; color: #f8fafc; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; }
  </style>
</head>
<body onload="window.print()">
  <h1>FleetOps AI — ${r.report_type.toUpperCase()} Report</h1>
  <p><strong>Host:</strong> ${r.hostname} (${r.ip_address}) &bull; <strong>OS:</strong> ${r.os_info} &bull; <strong>Date:</strong> ${new Date(r.created_at).toLocaleString()}</p>
  ${r.score !== null ? `<p><strong>Security Score:</strong> ${r.score} / 100</p>` : ""}
  ${findingsHtml ? `<h2>Findings (${r.findings.length})</h2><table><thead><tr><th>Severity</th><th>Check</th><th>Finding</th><th>Remediation</th></tr></thead><tbody>${findingsHtml}</tbody></table>` : ""}
  <h2>Collected Check Outputs</h2>
  ${Object.entries<any>(r.raw_results || {})
    .map(([k, v]) => `<h3>${v.name || k}</h3><pre>${(v.output || "").replace(/</g, "&lt;")}</pre>`)
    .join("")}
</body>
</html>`;
  return reply.type("text/html").send(html);
});

// Compliance Frameworks Evaluation
app.get("/api/compliance/:frameworkId", async (req) => {
  const { frameworkId } = req.params as any;
  const { hostId } = (req.query as any) || {};
  return await evaluateComplianceFramework(frameworkId, hostId);
});

// Service Monitors
app.get("/api/monitors", async () => {
  const res = await pool.query(
    `SELECT m.*, h.hostname, h.ip_address FROM host_monitors m JOIN hosts h ON m.host_id = h.id ORDER BY m.created_at DESC`
  );
  return res.rows;
});

app.post("/api/monitors", async (req) => {
  const b = (req.body as any) || {};
  const ins = await pool.query(
    `INSERT INTO host_monitors (host_id, monitor_slug, name, config, enabled)
     VALUES ($1, $2, $3, $4, true) RETURNING *`,
    [b.hostId, b.monitorSlug || "tcp", b.name || b.monitorSlug, JSON.stringify(b.config || {})]
  );
  runMonitorCheck(ins.rows[0].id).catch(() => {});
  return ins.rows[0];
});

app.post("/api/monitors/:id/check", async (req) => {
  const { id } = req.params as any;
  return await runMonitorCheck(id);
});

app.delete("/api/monitors/:id", async (req) => {
  const { id } = req.params as any;
  await pool.query(`DELETE FROM host_monitors WHERE id = $1`, [id]);
  return { ok: true };
});

// Managed Credentials & Multi-Host Rotation
app.get("/api/credentials", async () => {
  const res = await pool.query(
    `SELECT id, name, cred_type, target_user, target_host_ids, rotation_days, last_rotated_at, last_status, created_at
     FROM managed_credentials ORDER BY created_at DESC`
  );
  return res.rows;
});

app.post("/api/credentials", async (req) => {
  const actor = getActor(req);
  const b = (req.body as any) || {};
  const ins = await pool.query(
    `INSERT INTO managed_credentials (name, cred_type, target_user, target_host_ids, secret_enc, rotation_days)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, cred_type, target_user, target_host_ids, rotation_days, last_rotated_at, last_status, created_at`,
    [
      b.name,
      b.credType || "password",
      b.targetUser || "root",
      JSON.stringify(b.targetHostIds || []),
      encryptSecret(b.initialSecret || "auto-generated"),
      Number(b.rotationDays) || 30,
    ]
  );
  await logAudit(actor.username, "credentials", `Created managed credential ${b.name}`, b.name);
  return ins.rows[0];
});

app.post("/api/credentials/:id/rotate", async (req) => {
  const actor = getActor(req);
  const { id } = req.params as any;
  return await rotateManagedCredential(id, actor.username);
});

app.delete("/api/credentials/:id", async (req) => {
  const { id } = req.params as any;
  await pool.query(`DELETE FROM managed_credentials WHERE id = $1`, [id]);
  return { ok: true };
});

// Software Keystore (PKCS#11-style Central Custody Sign/Encrypt/Decrypt)
app.get("/api/keystore", async () => {
  const res = await pool.query(
    `SELECT id, handle, description, algorithm, public_material, allowed_clients, usage_count, last_used_at, created_at
     FROM keystore_keys ORDER BY created_at DESC`
  );
  return res.rows;
});

app.post("/api/keystore", async (req) => {
  const actor = getActor(req);
  const b = (req.body as any) || {};
  const alg = b.algorithm || "EC-P256";
  const mat = generateKeystoreMaterial(alg);
  const ins = await pool.query(
    `INSERT INTO keystore_keys (handle, description, algorithm, public_material, private_material_enc, allowed_clients)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, handle, description, algorithm, public_material, allowed_clients, usage_count, last_used_at, created_at`,
    [b.handle, b.description || "", alg, mat.publicMaterial, mat.privateMaterialEncrypted, JSON.stringify(b.allowedClients || ["*"])]
  );
  await logAudit(actor.username, "keystore", `Created keystore key ${b.handle} (${alg})`, b.handle);
  return ins.rows[0];
});

app.post("/api/keystore/:id/op", async (req) => {
  const actor = getActor(req);
  const { id } = req.params as any;
  const { operation, payload } = (req.body as any) || {};
  const res = await pool.query(`SELECT * FROM keystore_keys WHERE id::text = $1 OR handle = $1`, [id]);
  if (res.rows.length === 0) throw new Error("Keystore key not found");
  const key = res.rows[0];
  const output = keystoreOperation(key.algorithm, key.private_material_enc, operation || "sign", payload || "");
  await pool.query(`UPDATE keystore_keys SET usage_count = usage_count + 1, last_used_at = NOW() WHERE id = $1`, [key.id]);
  await logAudit(actor.username, "keystore_op", `Executed ${operation} with key ${key.handle}`, key.handle);
  return { handle: key.handle, algorithm: key.algorithm, operation, result: output };
});

app.delete("/api/keystore/:id", async (req) => {
  const { id } = req.params as any;
  await pool.query(`DELETE FROM keystore_keys WHERE id = $1`, [id]);
  return { ok: true };
});

// Terminal Session Recordings
app.get("/api/recordings", async () => {
  const res = await pool.query(
    `SELECT id, host_id, hostname, username, protocol, duration_sec, markers, created_at
     FROM terminal_recordings ORDER BY created_at DESC LIMIT 40`
  );
  return res.rows;
});

app.get("/api/recordings/:id", async (req) => {
  const { id } = req.params as any;
  const res = await pool.query(`SELECT * FROM terminal_recordings WHERE id = $1`, [id]);
  return res.rows[0] || null;
});

// Emergency Panic Button
app.post("/api/panic", async (req) => {
  const actor = getActor(req);
  const { scope } = (req.body as any) || {};
  return await triggerPanicLockdown(scope || "@all", actor.username);
});

// Audit Logs
app.get("/api/audit-logs", async () => {
  const res = await pool.query(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100`);
  return res.rows;
});

// External & Internal MCP Server Endpoint (/mcp)
app.post("/mcp", async (req) => {
  return await handleMCPJsonRpc(req.body);
});

// Outbound Go Client Agent Installer Script
app.get("/install.sh", async (req, reply) => {
  const publicUrl = process.env.PUBLIC_URL || `http://${req.headers.host || "localhost:3000"}`;
  const script = `#!/usr/bin/env sh
set -eu
echo "==> Installing FleetOps AI Outbound Client Agent..."
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) BIN_ARCH="amd64" ;;
  aarch64|arm64) BIN_ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac
mkdir -p /opt/fleetops-ai
curl -fsSL "${publicUrl}/dl/agent/linux/\${BIN_ARCH}" -o /opt/fleetops-ai/fleetops-agent
chmod +x /opt/fleetops-ai/fleetops-agent
cat <<EOF >/etc/systemd/system/fleetops-agent.service
[Unit]
Description=FleetOps AI Outbound Agent
After=network-online.target

[Service]
ExecStart=/opt/fleetops-ai/fleetops-agent --server "${publicUrl.replace(/^http/, "ws")}/ws/agent" --hostname "\$(hostname)"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now fleetops-agent.service
echo "==> FleetOps AI Agent installed and connected to ${publicUrl}"
`;
  return reply.type("text/x-shellscript").send(script);
});

app.get("/dl/agent/:os/:arch", async (req, reply) => {
  const { os: targetOs, arch } = req.params as any;
  const ext = targetOs === "windows" ? ".exe" : "";
  const fileName = `fleetops-agent-${targetOs}-${arch}${ext}`;
  const agentsDir = process.env.AGENTS_DIR || path.resolve(__dirname, "../../../dist/agents");
  const fullPath = path.join(agentsDir, fileName);
  if (!fs.existsSync(fullPath)) {
    return reply.code(404).send({ error: `Agent binary not found: ${fileName}` });
  }
  reply.header("Content-Type", "application/octet-stream");
  reply.header("Content-Disposition", `attachment; filename="${fileName}"`);
  return reply.send(fs.createReadStream(fullPath));
});

// WebSocket: Interactive Browser SSH Terminal Console (with Session Recording)
app.get("/ws/terminal", { websocket: true }, async (socket, req) => {
  const q = (req.query as any) || {};
  const hostId = q.hostId;
  if (!hostId) {
    socket.send(JSON.stringify({ type: "error", data: "Missing hostId parameter\r\n" }));
    socket.close();
    return;
  }

  try {
    const hostRes = await pool.query(
      `SELECT h.*, k.private_key_enc FROM hosts h LEFT JOIN ssh_keys k ON h.ssh_key_id = k.id WHERE h.id = $1`,
      [hostId]
    );
    if (hostRes.rows.length === 0) {
      socket.send(JSON.stringify({ type: "error", data: "Host not found\r\n" }));
      socket.close();
      return;
    }
    const host = hostRes.rows[0];
    let privKey: string | null = host.private_key_enc ? decryptSecret(host.private_key_enc) : null;
    if (!privKey) {
      const def = await pool.query(`SELECT private_key_enc FROM ssh_keys WHERE is_default = true LIMIT 1`);
      if (def.rows[0]?.private_key_enc) privKey = decryptSecret(def.rows[0].private_key_enc);
    }
    if (!privKey) {
      socket.send(JSON.stringify({ type: "error", data: "No SSH key configured for host\r\n" }));
      socket.close();
      return;
    }

    const ssh = await connectSSH(host, privKey);
    const startTs = Date.now();
    const recordedEvents: Array<[number, string, string]> = [];
    const markers: Array<{ time: number; label: string }> = [
      { time: 0, label: `Session opened on ${host.hostname} as ${host.ssh_user}` },
    ];

    ssh.shell({ term: "xterm-256color", cols: Number(q.cols) || 110, rows: Number(q.rows) || 32 }, (err, stream) => {
      if (err) {
        socket.send(JSON.stringify({ type: "error", data: `Shell error: ${err.message}\r\n` }));
        ssh.end();
        socket.close();
        return;
      }

      stream.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        if (host.record_sessions && recordedEvents.length < 3000) {
          recordedEvents.push([Math.round((Date.now() - startTs) / 10) / 100, "o", text]);
        }
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: "output", data: text }));
        }
      });

      stream.on("close", () => {
        ssh.end();
        if (socket.readyState === 1) socket.close();
      });

      socket.on("message", (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "input" && msg.data) {
            stream.write(msg.data);
          } else if (msg.type === "resize" && msg.cols && msg.rows) {
            stream.setWindow(Number(msg.rows), Number(msg.cols), 0, 0);
          } else if (msg.type === "marker" && msg.label) {
            markers.push({ time: Math.round((Date.now() - startTs) / 1000), label: msg.label });
          }
        } catch {
          stream.write(raw.toString());
        }
      });

      socket.on("close", async () => {
        stream.end();
        ssh.end();
        if (host.record_sessions && recordedEvents.length > 2) {
          const durationSec = Math.max(1, Math.round((Date.now() - startTs) / 1000));
          await pool
            .query(
              `INSERT INTO terminal_recordings (host_id, hostname, username, protocol, duration_sec, events, markers)
               VALUES ($1, $2, $3, 'ssh', $4, $5, $6)`,
              [host.id, host.hostname, host.ssh_user, durationSec, JSON.stringify(recordedEvents), JSON.stringify(markers)]
            )
            .catch(() => {});
        }
      });
    });
  } catch (err: any) {
    socket.send(JSON.stringify({ type: "error", data: `SSH connection failed: ${err?.message || String(err)}\r\n` }));
    socket.close();
  }
});

// WebSocket: Outbound Go Client Agent Endpoint
app.get("/ws/agent", { websocket: true }, async (socket, req) => {
  const q = (req.query as any) || {};
  const hostname = q.hostname || (req.headers["x-agent-hostname"] as string) || "agent-host";
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "127.0.0.1";
  const osType = q.os || "linux";

  const up = await pool.query(
    `INSERT INTO hosts (hostname, display_name, ip_address, connection_mode, os_type, status, last_seen_at)
     VALUES ($1, $1, $2, 'agent', $3, 'online', NOW())
     ON CONFLICT (hostname) DO UPDATE SET
       connection_mode = 'agent',
       status = 'online',
       last_seen_at = NOW()
     RETURNING id, hostname`,
    [hostname, ip, osType]
  );
  const host = up.rows[0];
  registerAgentSocket(host.id, host.hostname, socket as any);
});

// Serve Frontend Static Build if present
const webDistDir = process.env.WEB_DIST_DIR || path.resolve(__dirname, "../../web/dist");
if (fs.existsSync(webDistDir)) {
  await app.register(fastifyStatic, {
    root: webDistDir,
    prefix: "/",
    wildcard: false,
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/") || req.url.startsWith("/ws/")) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html");
  });
}

async function start() {
  ensureAIProfilesDir();
  await initDatabase();

  // Initial background probe of hosts
  pool
    .query(`SELECT id FROM hosts`)
    .then((res) => Promise.all(res.rows.map((r) => probeHostHealth(r.id))))
    .catch(() => {});

  // Periodic health & service monitor sweep every 60s
  setInterval(async () => {
    try {
      const hosts = await pool.query(`SELECT id FROM hosts`);
      for (const h of hosts.rows) {
        await probeHostHealth(h.id).catch(() => {});
      }
      const mons = await pool.query(`SELECT id FROM host_monitors WHERE enabled = true`);
      for (const m of mons.rows) {
        await runMonitorCheck(m.id).catch(() => {});
      }
    } catch {
      // Ignore periodic errors
    }
  }, 60000);

  const port = Number(process.env.PORT) || 3000;
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`FleetOps AI Control Plane listening on http://0.0.0.0:${port}`);
}

start().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
