import net from "node:net";
import tls from "node:tls";
import crypto from "node:crypto";
import { pool, logAudit } from "./db.js";
import { executeOnHost } from "./executor.js";
import { encryptSecret } from "./vault.js";

function evaluateSecurityRule(evalSpec: any, output: string): boolean {
  if (!evalSpec || !evalSpec.type) return true;
  const val = String(evalSpec.value ?? "");
  switch (evalSpec.type) {
    case "contains":
      return output.toLowerCase().includes(val.toLowerCase());
    case "not_contains":
      return !output.toLowerCase().includes(val.toLowerCase());
    case "regex_match":
      try {
        return new RegExp(val, "im").test(output);
      } catch {
        return true;
      }
    case "regex_not_match":
      try {
        return !new RegExp(val, "im").test(output);
      } catch {
        return true;
      }
    case "numeric_lt": {
      const m = output.match(/-?\d+(\.\d+)?/);
      if (!m) return true;
      return parseFloat(m[0]) < parseFloat(val);
    }
    default:
      return true;
  }
}

export async function runReportScanOnHost(
  hostId: string,
  reportType: "inventory" | "security" | "cert" | "ssh_keys" | "activity",
  actor = "admin"
): Promise<any> {
  const hostRes = await pool.query(`SELECT * FROM hosts WHERE id = $1`, [hostId]);
  if (hostRes.rows.length === 0) throw new Error("Host not found");
  const host = hostRes.rows[0];
  const nodeType = host.os_type === "windows" ? "windows" : "linux";

  const catRes = await pool.query(
    `SELECT definition FROM reports_catalog WHERE type = $1 AND node_type = $2 LIMIT 1`,
    [reportType, nodeType]
  );
  if (catRes.rows.length === 0) {
    throw new Error(`No report definition found for ${reportType} (${nodeType})`);
  }

  const def = catRes.rows[0].definition;
  const checks = def.checks || {};
  const rawResults: Record<string, { name: string; output: string; exitCode: number }> = {};
  const findings: Array<any> = [];
  let totalRules = 0;
  let passedRules = 0;

  const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");

  for (const [checkKey, checkSpec] of Object.entries<any>(checks)) {
    let cmd = String(checkSpec.command || "");
    cmd = cmd.replace(/\{\{since\}\}/g, sinceIso).replace(/\{\{minutes\}\}/g, "1440");
    const timeoutMs = Math.min(45000, (Number(checkSpec.timeout) || 15) * 1000);

    try {
      const execRes = await executeOnHost(host.id, cmd, timeoutMs);
      const output = (execRes.stdout || execRes.stderr || "").slice(0, Number(checkSpec.max_output) || 60000);
      rawResults[checkKey] = {
        name: checkSpec.name || checkKey,
        output,
        exitCode: execRes.exitCode,
      };

      if (Array.isArray(checkSpec.rules)) {
        for (const rule of checkSpec.rules) {
          totalRules++;
          const passed = evaluateSecurityRule(rule.eval, output);
          if (passed) {
            passedRules++;
          } else {
            findings.push({
              slug: rule.slug,
              name: rule.name,
              finding: rule.finding || rule.name,
              severity: rule.severity_private || rule.severity_public || "medium",
              category: rule.category || checkKey,
              frameworks: rule.frameworks || [],
              explanation: rule.explanation || "",
              remediation: rule.remediation || "",
              evidence: output.slice(0, 400),
            });
          }
        }
      }
    } catch (err: any) {
      rawResults[checkKey] = {
        name: checkSpec.name || checkKey,
        output: `ERROR: ${err?.message || String(err)}`,
        exitCode: 1,
      };
    }
  }

  // Enrich certificate discovery with Subject, Issuer, and Expiry dates
  if (reportType === "cert" && nodeType === "linux" && rawResults.cert_files?.output) {
    const paths = rawResults.cert_files.output
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("/"))
      .slice(0, 30);
    if (paths.length > 0) {
      const inspectCmd = paths
        .map(
          (p) =>
            `openssl x509 -in '${p.replace(/'/g, "'\\''")}' -noout -subject -issuer -enddate 2>/dev/null | tr '\\n' '|' | sed "s#^#FILE=${p}|#"; echo ""`
        )
        .join("; ");
      try {
        const inspectRes = await executeOnHost(host.id, inspectCmd, 20000);
        for (const line of inspectRes.stdout.split("\n")) {
          if (!line.includes("notAfter=")) continue;
          const parts = Object.fromEntries(
            line
              .split("|")
              .filter(Boolean)
              .map((kv) => {
                const i = kv.indexOf("=");
                return i > 0 ? [kv.slice(0, i), kv.slice(i + 1)] : [kv, ""];
              })
          );
          const endDate = new Date(parts.notAfter || "");
          const daysLeft = isNaN(endDate.getTime())
            ? 999
            : Math.round((endDate.getTime() - Date.now()) / (86400 * 1000));
          findings.push({
            slug: `cert-${parts.FILE}`,
            name: parts.FILE,
            finding: `Subject: ${parts.subject || "unknown"} (expires in ${daysLeft}d)`,
            severity: daysLeft < 14 ? "critical" : daysLeft < 30 ? "high" : "low",
            category: "certificate",
            explanation: `Issuer: ${parts.issuer || "unknown"} | NotAfter: ${parts.notAfter || ""}`,
            remediation: daysLeft < 30 ? `Renew certificate at ${parts.FILE}` : "Certificate is valid",
          });
        }
      } catch {
        // Ignore enrichment errors
      }
    }
  }

  const score =
    reportType === "security" && totalRules > 0 ? Math.max(0, Math.round((passedRules / totalRules) * 100)) : null;

  const summary = {
    hostname: host.hostname,
    reportType,
    nodeType,
    checksRun: Object.keys(rawResults).length,
    totalRules,
    passedRules,
    failedFindings: findings.length,
    score,
  };

  const ins = await pool.query(
    `INSERT INTO scan_reports (host_id, report_type, summary, raw_results, findings, score)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [host.id, reportType, JSON.stringify(summary), JSON.stringify(rawResults), JSON.stringify(findings), score]
  );

  await logAudit(actor, "scan", `Completed ${reportType} scan on ${host.hostname}`, host.hostname, summary);
  return ins.rows[0];
}

export async function evaluateComplianceFramework(frameworkId: string, hostId?: string): Promise<any> {
  const fwRes = await pool.query(`SELECT * FROM frameworks_catalog WHERE id = $1`, [frameworkId]);
  if (fwRes.rows.length === 0) throw new Error(`Framework not found: ${frameworkId}`);
  const fw = fwRes.rows[0].definition;

  let scanQuery = `
    SELECT DISTINCT ON (s.host_id) s.*, h.hostname
    FROM scan_reports s
    JOIN hosts h ON s.host_id = h.id
    WHERE s.report_type = 'security'
    ORDER BY s.host_id, s.created_at DESC
  `;
  let params: any[] = [];
  if (hostId) {
    scanQuery = `
      SELECT s.*, h.hostname
      FROM scan_reports s
      JOIN hosts h ON s.host_id = h.id
      WHERE s.report_type = 'security' AND s.host_id = $1
      ORDER BY s.created_at DESC LIMIT 1
    `;
    params = [hostId];
  }

  const scans = await pool.query(scanQuery, params);
  const failedSlugsMap = new Map<string, Array<{ hostname: string; finding: string; remediation: string }>>();

  for (const row of scans.rows) {
    const findings: Array<any> = row.findings || [];
    for (const f of findings) {
      if (!f.slug) continue;
      const list = failedSlugsMap.get(f.slug) || [];
      list.push({
        hostname: row.hostname,
        finding: f.finding || f.name,
        remediation: f.remediation || "",
      });
      failedSlugsMap.set(f.slug, list);
    }
  }

  const controls = (fw.controls || []).map((ctrl: any) => {
    const slugs: string[] = ctrl.rule_slugs || [];
    const failures: Array<{ slug: string; hostname: string; finding: string; remediation: string }> = [];
    for (const slug of slugs) {
      const hits = failedSlugsMap.get(slug);
      if (hits) {
        for (const h of hits) {
          failures.push({ slug, ...h });
        }
      }
    }
    return {
      ref: ctrl.ref,
      name: ctrl.name,
      description: ctrl.desc || ctrl.description || "",
      ruleSlugs: slugs,
      status: scans.rows.length === 0 ? "not_scanned" : failures.length === 0 ? "pass" : "fail",
      failures,
    };
  });

  const passCount = controls.filter((c: any) => c.status === "pass").length;
  const complianceScore = controls.length > 0 ? Math.round((passCount / controls.length) * 100) : 100;

  return {
    frameworkId: fw.id,
    name: fw.name,
    version: fw.version,
    description: fw.description,
    evaluatedHosts: scans.rows.map((r) => r.hostname),
    complianceScore,
    totalControls: controls.length,
    passedControls: passCount,
    failedControls: controls.filter((c: any) => c.status === "fail").length,
    controls,
  };
}

export async function runMonitorCheck(monitorId: string): Promise<{ status: string; value: string }> {
  const res = await pool.query(
    `SELECT m.*, h.ip_address, h.hostname, c.check_type, c.definition
     FROM host_monitors m
     JOIN hosts h ON m.host_id = h.id
     LEFT JOIN monitors_catalog c ON m.monitor_slug = c.slug
     WHERE m.id = $1`,
    [monitorId]
  );
  if (res.rows.length === 0) throw new Error("Monitor not found");
  const mon = res.rows[0];
  const cfg = { ...(mon.definition?.defaults || {}), ...(mon.config || {}) };
  const checkType = mon.check_type || "tcp";
  const start = Date.now();

  let status = "up";
  let value = "OK";

  try {
    if (checkType === "tcp" || cfg.port) {
      const port = Number(cfg.port) || 22;
      await new Promise<void>((resolve, reject) => {
        const sock = cfg.ssl
          ? tls.connect({ host: mon.ip_address, port, rejectUnauthorized: false }, () => {
              sock.end();
              resolve();
            })
          : net.createConnection({ host: mon.ip_address, port }, () => {
              sock.end();
              resolve();
            });
        sock.setTimeout((Number(cfg.timeout) || 5) * 1000, () => {
          sock.destroy();
          reject(new Error(`Timeout connecting to ${mon.ip_address}:${port}`));
        });
        sock.on("error", reject);
      });
      value = `TCP :${port} reachable (${Date.now() - start}ms)`;
    } else if (checkType === "command" || cfg.command) {
      const r = await executeOnHost(mon.host_id, cfg.command || "uptime", 10000);
      if (r.exitCode !== 0) throw new Error(r.stderr || `Exit ${r.exitCode}`);
      value = r.stdout.trim().slice(0, 120) || "Exit 0";
    } else {
      const r = await executeOnHost(mon.host_id, "uptime", 10000);
      if (r.exitCode !== 0) throw new Error(r.stderr);
      value = r.stdout.trim().slice(0, 120);
    }
  } catch (err: any) {
    status = "down";
    value = err?.message || String(err);
  }

  await pool.query(
    `UPDATE host_monitors SET last_status = $1, last_value = $2, last_checked_at = NOW() WHERE id = $3`,
    [status, value, monitorId]
  );
  return { status, value };
}

export async function syncSSHKeysToHost(hostId: string, actor = "admin"): Promise<{ syncedKeys: number }> {
  const usersRes = await pool.query(
    `SELECT username, ssh_public_key, system_username, role FROM users WHERE ssh_public_key IS NOT NULL AND ssh_public_key != ''`
  );
  const defaultKeysRes = await pool.query(`SELECT public_key FROM ssh_keys WHERE is_default = true`);
  const keysToSync: string[] = [];
  for (const r of defaultKeysRes.rows) {
    if (r.public_key) keysToSync.push(r.public_key.trim());
  }
  for (const u of usersRes.rows) {
    if (u.ssh_public_key) keysToSync.push(u.ssh_public_key.trim());
  }

  for (const pub of keysToSync) {
    const escaped = pub.replace(/'/g, "'\\''");
    await executeOnHost(
      hostId,
      `mkdir -p ~/.ssh && chmod 700 ~/.ssh && (grep -qxF '${escaped}' ~/.ssh/authorized_keys 2>/dev/null || echo '${escaped}' >> ~/.ssh/authorized_keys) && chmod 600 ~/.ssh/authorized_keys`,
      15000
    );
  }

  await logAudit(actor, "ssh_sync", `Synced ${keysToSync.length} SSH public keys`, hostId);
  return { syncedKeys: keysToSync.length };
}

export async function rotateManagedCredential(credentialId: string, actor = "admin"): Promise<{
  rotatedHosts: number;
  status: string;
}> {
  const res = await pool.query(`SELECT * FROM managed_credentials WHERE id = $1`, [credentialId]);
  if (res.rows.length === 0) throw new Error("Managed credential not found");
  const cred = res.rows[0];
  const newPassword = crypto.randomBytes(18).toString("base64url");
  const targetHostIds: string[] = cred.target_host_ids || [];
  let rotated = 0;

  for (const hostId of targetHostIds) {
    try {
      const safeUser = String(cred.target_user).replace(/[^a-zA-Z0-9_.-]/g, "");
      const b64Line = Buffer.from(`${safeUser}:${newPassword}`, "utf8").toString("base64");
      const r = await executeOnHost(
        hostId,
        `echo '${b64Line}' | base64 -d | chpasswd 2>/dev/null || (echo '${b64Line}' | base64 -d | sudo -n chpasswd)`,
        15000
      );
      if (r.exitCode === 0) rotated++;
    } catch {
      // Continue rotating remaining hosts
    }
  }

  const status = rotated === targetHostIds.length ? "rotated" : rotated > 0 ? "partial" : "stored_in_vault";
  await pool.query(
    `UPDATE managed_credentials SET secret_enc = $1, last_rotated_at = NOW(), last_status = $2 WHERE id = $3`,
    [encryptSecret(newPassword), status, credentialId]
  );
  await logAudit(actor, "credential_rotation", `Rotated credential ${cred.name}`, cred.name, {
    targetHosts: targetHostIds.length,
    rotated,
  });

  return { rotatedHosts: rotated, status };
}
