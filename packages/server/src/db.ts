import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encryptSecret, generateSSHKeyPair, hashPassword } from "./vault.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://fleetops:fleetops_secret@localhost:5432/fleetops",
  max: 20,
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CATALOG_DIR = process.env.CATALOG_DIR || path.resolve(__dirname, "../../../catalog");

export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        password_hash TEXT,
        role TEXT NOT NULL DEFAULT 'owner',
        ssh_public_key TEXT,
        system_username TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ssh_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        key_type TEXT NOT NULL DEFAULT 'ed25519',
        public_key TEXT NOT NULL,
        private_key_enc TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS host_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT UNIQUE NOT NULL,
        site_name TEXT NOT NULL DEFAULT 'Default Site',
        description TEXT NOT NULL DEFAULT '',
        read_only_ai BOOLEAN NOT NULL DEFAULT false,
        assigned_skills JSONB NOT NULL DEFAULT '["system","services","files","packages","network","logs","security","containers"]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS hosts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hostname TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        ssh_port INTEGER NOT NULL DEFAULT 22,
        ssh_user TEXT NOT NULL DEFAULT 'root',
        ssh_key_id UUID REFERENCES ssh_keys(id) ON DELETE SET NULL,
        connection_mode TEXT NOT NULL DEFAULT 'ssh',
        os_type TEXT NOT NULL DEFAULT 'linux',
        os_info TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'unknown',
        group_name TEXT NOT NULL DEFAULT 'default',
        site_name TEXT NOT NULL DEFAULT 'Main Datacenter',
        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        assigned_skills JSONB NOT NULL DEFAULT '["system","services","files","packages","network","logs","security","containers"]'::jsonb,
        read_only_ai BOOLEAN NOT NULL DEFAULT false,
        safety_tier TEXT NOT NULL DEFAULT 'supervised',
        record_sessions BOOLEAN NOT NULL DEFAULT true,
        sync_ssh_keys BOOLEAN NOT NULL DEFAULT false,
        agent_token TEXT,
        rdp_port INTEGER NOT NULL DEFAULT 3389,
        rdp_username TEXT,
        rdp_password_enc TEXT,
        metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
        last_seen_at TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS user_host_grants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
        can_console BOOLEAN NOT NULL DEFAULT true,
        can_ssh_root BOOLEAN NOT NULL DEFAULT false,
        can_sudo_root BOOLEAN NOT NULL DEFAULT false,
        can_ai_access BOOLEAN NOT NULL DEFAULT true,
        UNIQUE(user_id, host_id)
      );

      CREATE TABLE IF NOT EXISTS skills_catalog (
        slug TEXT NOT NULL,
        node_type TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        definition JSONB NOT NULL,
        PRIMARY KEY (slug, node_type)
      );

      CREATE TABLE IF NOT EXISTS monitors_catalog (
        slug TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        check_type TEXT NOT NULL,
        definition JSONB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reports_catalog (
        type TEXT NOT NULL,
        node_type TEXT NOT NULL,
        name TEXT NOT NULL,
        definition JSONB NOT NULL,
        PRIMARY KEY (type, node_type)
      );

      CREATE TABLE IF NOT EXISTS frameworks_catalog (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        description TEXT NOT NULL,
        definition JSONB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS host_monitors (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
        monitor_slug TEXT NOT NULL,
        name TEXT NOT NULL,
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        enabled BOOLEAN NOT NULL DEFAULT true,
        last_status TEXT NOT NULL DEFAULT 'pending',
        last_value TEXT,
        last_checked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS scan_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
        report_type TEXT NOT NULL,
        summary JSONB NOT NULL DEFAULT '{}'::jsonb,
        raw_results JSONB NOT NULL DEFAULT '{}'::jsonb,
        findings JSONB NOT NULL DEFAULT '[]'::jsonb,
        score INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS file_snapshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
        session_id UUID,
        file_path TEXT NOT NULL,
        previous_content TEXT,
        new_content TEXT,
        existed_before BOOLEAN NOT NULL DEFAULT true,
        reverted BOOLEAN NOT NULL DEFAULT false,
        reverted_at TIMESTAMPTZ,
        created_by TEXT NOT NULL DEFAULT 'ai-agent',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ai_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'claude-sub',
        model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
        target_scope TEXT NOT NULL DEFAULT '@all',
        safety_tier TEXT NOT NULL DEFAULT 'supervised',
        created_by TEXT NOT NULL DEFAULT 'admin',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ai_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
        snapshots JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pending_approvals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID REFERENCES ai_sessions(id) ON DELETE CASCADE,
        host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
        hostname TEXT NOT NULL,
        action_type TEXT NOT NULL,
        command_or_path TEXT NOT NULL,
        proposed_content TEXT,
        diff_preview TEXT,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        execution_output TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS terminal_recordings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
        hostname TEXT NOT NULL,
        username TEXT NOT NULL,
        protocol TEXT NOT NULL DEFAULT 'ssh',
        duration_sec INTEGER NOT NULL DEFAULT 0,
        events JSONB NOT NULL DEFAULT '[]'::jsonb,
        markers JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS managed_credentials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        cred_type TEXT NOT NULL DEFAULT 'password',
        target_user TEXT NOT NULL,
        target_host_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        secret_enc TEXT NOT NULL,
        rotation_days INTEGER NOT NULL DEFAULT 30,
        last_rotated_at TIMESTAMPTZ,
        last_status TEXT NOT NULL DEFAULT 'ready',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS keystore_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        handle TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        algorithm TEXT NOT NULL DEFAULT 'EC-P256',
        public_material TEXT,
        private_material_enc TEXT NOT NULL,
        allowed_clients JSONB NOT NULL DEFAULT '[]'::jsonb,
        usage_count INTEGER NOT NULL DEFAULT 0,
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        actor TEXT NOT NULL,
        category TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        severity TEXT NOT NULL DEFAULT 'info',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS mcp_plugins_catalog (
        slug TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        package_name TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '1.0.0',
        badge TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        installed BOOLEAN NOT NULL DEFAULT false,
        enabled BOOLEAN NOT NULL DEFAULT false,
        target_host_id UUID REFERENCES hosts(id) ON DELETE SET NULL,
        custom_env JSONB NOT NULL DEFAULT '{}'::jsonb,
        definition JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ai_providers_config (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        vendor TEXT NOT NULL,
        auth_mode TEXT NOT NULL DEFAULT 'api_key',
        base_url TEXT NOT NULL DEFAULT '',
        default_model TEXT NOT NULL DEFAULT '',
        models JSONB NOT NULL DEFAULT '[]'::jsonb,
        api_key_enc TEXT,
        oauth_profile_json TEXT,
        enabled BOOLEAN NOT NULL DEFAULT false,
        status TEXT NOT NULL DEFAULT 'unconfigured',
        description TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS environment_profile (
        id TEXT PRIMARY KEY DEFAULT 'default',
        org_name TEXT NOT NULL DEFAULT 'My Infrastructure Fleet',
        primary_site TEXT NOT NULL DEFAULT 'Main Datacenter',
        subnets JSONB NOT NULL DEFAULT '["192.168.1.0/24", "10.0.0.0/24"]'::jsonb,
        enabled_platforms JSONB NOT NULL DEFAULT '["kubernetes", "docker", "linux", "windows", "network"]'::jsonb,
        agent_decision_mode TEXT NOT NULL DEFAULT 'supervised',
        auto_append_rules BOOLEAN NOT NULL DEFAULT true,
        auto_onboard_discovered BOOLEAN NOT NULL DEFAULT false,
        require_approval_restarts BOOLEAN NOT NULL DEFAULT true,
        require_approval_firewall BOOLEAN NOT NULL DEFAULT true,
        mandatory_config_snapshots BOOLEAN NOT NULL DEFAULT true,
        default_ai_provider TEXT NOT NULL DEFAULT 'claude-sub',
        default_ai_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
        fallback_ai_provider TEXT NOT NULL DEFAULT 'local-llm',
        snmp_community_enc TEXT,
        onboarding_completed BOOLEAN NOT NULL DEFAULT false,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      INSERT INTO environment_profile (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

      ALTER TABLE environment_profile ADD COLUMN IF NOT EXISTS snmp_communities JSONB NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE environment_profile ADD COLUMN IF NOT EXISTS credential_presets JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);

    await seedDefaultUserAndKey(client);
    await seedCatalogs(client);
    await seedAIProviders(client);
    await seedExternalConfigIfPresent(client);
  } finally {
    client.release();
  }
}

async function seedDefaultUserAndKey(client: pg.PoolClient): Promise<void> {
  const userCount = await client.query(`SELECT COUNT(*)::int AS c FROM users`);
  if (userCount.rows[0].c === 0) {
    const defaultPass = process.env.ADMIN_INITIAL_PASSWORD || "fleetops-admin";
    await client.query(
      `INSERT INTO users (username, email, display_name, password_hash, role, system_username)
       VALUES ($1, $2, $3, $4, 'owner', 'root')`,
      ["admin", "admin@localhost", "Fleet Administrator", hashPassword(defaultPass)]
    );
  }

  const keyCount = await client.query(`SELECT COUNT(*)::int AS c FROM ssh_keys`);
  if (keyCount.rows[0].c === 0) {
    let pubKey = "";
    let privKey = "";
    let fp = "";
    const importPrivPath = process.env.IMPORT_SSH_PRIVATE_KEY_PATH;
    if (importPrivPath && fs.existsSync(importPrivPath)) {
      privKey = fs.readFileSync(importPrivPath, "utf8");
      const pubPath = `${importPrivPath}.pub`;
      if (fs.existsSync(pubPath)) {
        pubKey = fs.readFileSync(pubPath, "utf8").trim();
      }
      fp = "SHA256:imported-default-key";
    } else {
      const generated = generateSSHKeyPair("fleetops-default@control-plane", "ed25519");
      pubKey = generated.publicKey;
      privKey = generated.privateKey;
      fp = generated.fingerprint;
    }

    await client.query(
      `INSERT INTO ssh_keys (name, key_type, public_key, private_key_enc, fingerprint, is_default)
       VALUES ($1, 'ed25519', $2, $3, $4, true)`,
      ["FleetOps Default Ed25519 Key", pubKey, encryptSecret(privKey), fp]
    );
  }
}

async function seedCatalogs(client: pg.PoolClient): Promise<void> {
  const skillsDir = path.join(CATALOG_DIR, "skills");
  if (fs.existsSync(skillsDir)) {
    for (const file of fs.readdirSync(skillsDir).filter((f) => f.endsWith(".json"))) {
      const raw = JSON.parse(fs.readFileSync(path.join(skillsDir, file), "utf8"));
      await client.query(
        `INSERT INTO skills_catalog (slug, node_type, name, category, description, definition)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (slug, node_type) DO UPDATE SET
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           description = EXCLUDED.description,
           definition = EXCLUDED.definition`,
        [
          raw.slug || file.replace(/\.json$/, ""),
          raw.node_type || (file.includes("windows") ? "windows" : "linux"),
          raw.name || raw.slug,
          raw.category || "General",
          raw.description || "",
          JSON.stringify(raw),
        ]
      );
    }
  }

  const monitorsDir = path.join(CATALOG_DIR, "monitors");
  if (fs.existsSync(monitorsDir)) {
    for (const file of fs.readdirSync(monitorsDir).filter((f) => f.endsWith(".json"))) {
      const raw = JSON.parse(fs.readFileSync(path.join(monitorsDir, file), "utf8"));
      await client.query(
        `INSERT INTO monitors_catalog (slug, name, category, check_type, definition)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           check_type = EXCLUDED.check_type,
           definition = EXCLUDED.definition`,
        [
          raw.slug || file.replace(/\.json$/, ""),
          raw.name || raw.slug,
          raw.category || "Infrastructure",
          raw.check_type || "tcp",
          JSON.stringify(raw),
        ]
      );
    }
  }

  const reportsDir = path.join(CATALOG_DIR, "reports");
  if (fs.existsSync(reportsDir)) {
    for (const file of fs.readdirSync(reportsDir).filter((f) => f.endsWith(".json"))) {
      const raw = JSON.parse(fs.readFileSync(path.join(reportsDir, file), "utf8"));
      await client.query(
        `INSERT INTO reports_catalog (type, node_type, name, definition)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (type, node_type) DO UPDATE SET
           name = EXCLUDED.name,
           definition = EXCLUDED.definition`,
        [
          raw.type || file.split("_")[0],
          raw.node_type || (file.includes("windows") ? "windows" : "linux"),
          raw.name || raw.type,
          JSON.stringify(raw),
        ]
      );
    }
  }

  const frameworksDir = path.join(CATALOG_DIR, "frameworks");
  if (fs.existsSync(frameworksDir)) {
    for (const file of fs.readdirSync(frameworksDir).filter((f) => f.endsWith(".json"))) {
      const raw = JSON.parse(fs.readFileSync(path.join(frameworksDir, file), "utf8"));
      await client.query(
        `INSERT INTO frameworks_catalog (id, name, version, description, definition)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           version = EXCLUDED.version,
           description = EXCLUDED.description,
           definition = EXCLUDED.definition`,
        [
          raw.id || file.replace(/\.json$/, ""),
          raw.name || raw.id,
          raw.version || "1.0",
          raw.description || "",
          JSON.stringify(raw),
        ]
      );
    }
  }

  const mcpPluginsFile = path.join(CATALOG_DIR, "mcp-plugins", "index.json");
  if (fs.existsSync(mcpPluginsFile)) {
    const plugins = JSON.parse(fs.readFileSync(mcpPluginsFile, "utf8"));
    if (Array.isArray(plugins)) {
      for (const p of plugins) {
        const installedByDefault = Boolean(p.installed_by_default);
        await client.query(
          `INSERT INTO mcp_plugins_catalog (
             slug, name, category, package_name, version, badge, description, installed, enabled, definition
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (slug) DO UPDATE SET
             name = EXCLUDED.name,
             category = EXCLUDED.category,
             package_name = EXCLUDED.package_name,
             version = EXCLUDED.version,
             badge = EXCLUDED.badge,
             description = EXCLUDED.description,
             definition = EXCLUDED.definition`,
          [
            p.slug,
            p.name,
            p.category || "linux",
            p.package_name || p.slug,
            p.version || "1.0.0",
            p.badge || "MCP Plugin",
            p.description || "",
            installedByDefault,
            installedByDefault,
            JSON.stringify(p),
          ]
        );
      }
    }
  }
}

async function seedAIProviders(client: pg.PoolClient): Promise<void> {
  const defaultProviders = [
    {
      id: "claude-sub",
      name: "Anthropic Claude Subscription (CLI OAuth)",
      vendor: "Anthropic",
      authMode: "cli_oauth",
      baseUrl: "claude-cli://local",
      defaultModel: "claude-sonnet-4-6",
      models: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"],
      enabled: true,
      description: "Connect your personal or team Claude Pro / Max / Team subscription via Claude Code CLI OAuth profile (~/.claude).",
    },
    {
      id: "gemini-sub",
      name: "Google Gemini Subscription (CLI OAuth)",
      vendor: "Google",
      authMode: "cli_oauth",
      baseUrl: "gemini-cli://local",
      defaultModel: "gemini-2.5-pro",
      models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
      enabled: true,
      description: "Connect your Google AI Pro / Ultra / Workspace subscription via official Gemini CLI OAuth profile (~/.gemini).",
    },
    {
      id: "codex-sub",
      name: "OpenAI ChatGPT / Codex Subscription (CLI OAuth)",
      vendor: "OpenAI",
      authMode: "cli_oauth",
      baseUrl: "codex-cli://local",
      defaultModel: "gpt-5",
      models: ["gpt-5", "gpt-4.1", "o3", "o4-mini"],
      enabled: false,
      description: "Connect your ChatGPT Plus / Pro / Team subscription via OpenAI Codex CLI OAuth profile (~/.codex).",
    },
    {
      id: "anthropic-api",
      name: "Anthropic Claude Messages API",
      vendor: "Anthropic",
      authMode: "api_key",
      baseUrl: "https://api.anthropic.com/v1",
      defaultModel: "claude-sonnet-4-6",
      models: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"],
      enabled: Boolean(process.env.ANTHROPIC_API_KEY),
      description: "Direct Anthropic API key integration for high-concurrency enterprise agent operations.",
    },
    {
      id: "openai-api",
      name: "OpenAI Platform API (GPT-5 / o3 / GPT-4.1)",
      vendor: "OpenAI",
      authMode: "api_key",
      baseUrl: "https://api.openai.com/v1",
      defaultModel: "gpt-4.1",
      models: ["gpt-5", "gpt-4.1", "gpt-4o", "o3", "o4-mini"],
      enabled: Boolean(process.env.OPENAI_API_KEY),
      description: "Direct OpenAI Platform API key integration supporting GPT-5, GPT-4.1, and o3 reasoning models.",
    },
    {
      id: "gemini-api",
      name: "Google Gemini / Vertex AI Studio API",
      vendor: "Google",
      authMode: "api_key",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      defaultModel: "gemini-2.5-pro",
      models: ["gemini-2.5-pro", "gemini-2.5-flash"],
      enabled: Boolean(process.env.GEMINI_API_KEY),
      description: "Google AI Studio / Vertex AI API key endpoint using the OpenAI-compatible chat completions adapter.",
    },
    {
      id: "xai-grok",
      name: "xAI Grok API (Grok 3 & Grok 3 Mini)",
      vendor: "xAI",
      authMode: "api_key",
      baseUrl: "https://api.x.ai/v1",
      defaultModel: "grok-3",
      models: ["grok-3", "grok-3-mini", "grok-2-latest"],
      enabled: false,
      description: "Connect xAI Grok-3 and Grok-3-Mini reasoning models for real-time infrastructure troubleshooting.",
    },
    {
      id: "deepseek",
      name: "DeepSeek AI (DeepSeek R1 Reasoner & V3)",
      vendor: "DeepSeek",
      authMode: "api_key",
      baseUrl: "https://api.deepseek.com/v1",
      defaultModel: "deepseek-chat",
      models: ["deepseek-chat", "deepseek-reasoner"],
      enabled: false,
      description: "DeepSeek V3 and R1 reasoning models via official DeepSeek API or self-hosted vLLM endpoint.",
    },
    {
      id: "mistral",
      name: "Mistral AI & Codestral API",
      vendor: "Mistral",
      authMode: "api_key",
      baseUrl: "https://api.mistral.ai/v1",
      defaultModel: "mistral-large-latest",
      models: ["mistral-large-latest", "codestral-latest", "ministral-8b-latest"],
      enabled: false,
      description: "European sovereign AI via Mistral Large and Codestral for shell/Ansible/Terraform generation.",
    },
    {
      id: "openrouter",
      name: "OpenRouter / Groq LPU / Together AI (300+ Models)",
      vendor: "OpenRouter / Groq",
      authMode: "api_key",
      baseUrl: "https://openrouter.ai/api/v1",
      defaultModel: "meta-llama/llama-3.3-70b-instruct",
      models: [
        "meta-llama/llama-3.3-70b-instruct",
        "qwen/qwen-2.5-coder-32b-instruct",
        "anthropic/claude-3.7-sonnet",
        "google/gemini-2.5-pro",
        "deepseek/deepseek-r1",
      ],
      enabled: false,
      description: "Universal gateway to 300+ cloud and open-weights models (Llama 3.3, Qwen 2.5 Coder, Groq LPU).",
    },
    {
      id: "github-models",
      name: "GitHub Copilot Models & Azure OpenAI",
      vendor: "Microsoft / GitHub",
      authMode: "api_key",
      baseUrl: "https://models.inference.ai.azure.com",
      defaultModel: "gpt-4o",
      models: ["gpt-4o", "gpt-4o-mini", "o3-mini", "Llama-3.3-70B-Instruct"],
      enabled: false,
      description: "Authenticate with your GitHub Personal Access Token (GitHub Models / Copilot) or Azure OpenAI endpoint.",
    },
    {
      id: "local-llm",
      name: "Local / Self-Hosted AI (Ollama, llama.cpp, vLLM, LM Studio)",
      vendor: "Self-Hosted",
      authMode: "local",
      baseUrl: process.env.LOCAL_LLM_BASE_URL || "http://localhost:11434/v1",
      defaultModel: process.env.LOCAL_LLM_MODEL || "qwen2.5-coder:14b",
      models: ["qwen2.5-coder:14b", "llama3.3:70b", "deepseek-r1:14b", "mistral-nemo:12b", "gemma3:12b"],
      enabled: true,
      description: "100% air-gapped local LLM execution via Ollama, llama-server, vLLM, LocalAI, or LM Studio.",
    },
  ];

  for (const p of defaultProviders) {
    await client.query(
      `INSERT INTO ai_providers_config (
         id, name, vendor, auth_mode, base_url, default_model, models, enabled, status, description
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         vendor = EXCLUDED.vendor,
         auth_mode = EXCLUDED.auth_mode,
         models = EXCLUDED.models,
         description = EXCLUDED.description`,
      [
        p.id,
        p.name,
        p.vendor,
        p.authMode,
        p.baseUrl,
        p.defaultModel,
        JSON.stringify(p.models),
        p.enabled,
        p.enabled ? "ready" : "unconfigured",
        p.description,
      ]
    );
  }
}

async function seedExternalConfigIfPresent(client: pg.PoolClient): Promise<void> {
  const seedPath = process.env.SEED_CONFIG_PATH;
  if (!seedPath || !fs.existsSync(seedPath)) return;

  try {
    const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
    const defaultKeyRes = await client.query(`SELECT id FROM ssh_keys WHERE is_default = true LIMIT 1`);
    let defaultKeyId: string | null = defaultKeyRes.rows[0]?.id || null;

    if (Array.isArray(seed.sshKeys)) {
      for (const k of seed.sshKeys) {
        if (!k.name || !k.privateKey) continue;
        const existing = await client.query(`SELECT id FROM ssh_keys WHERE name = $1`, [k.name]);
        if (existing.rows.length === 0) {
          const ins = await client.query(
            `INSERT INTO ssh_keys (name, key_type, public_key, private_key_enc, fingerprint, is_default)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [
              k.name,
              k.keyType || "ed25519",
              k.publicKey || "",
              encryptSecret(k.privateKey),
              k.fingerprint || "SHA256:seeded",
              Boolean(k.isDefault),
            ]
          );
          if (k.isDefault) defaultKeyId = ins.rows[0].id;
        } else if (k.isDefault) {
          defaultKeyId = existing.rows[0].id;
        }
      }
    }

    if (Array.isArray(seed.groups)) {
      for (const g of seed.groups) {
        await client.query(
          `INSERT INTO host_groups (name, site_name, description, read_only_ai)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (name) DO UPDATE SET
             site_name = EXCLUDED.site_name,
             description = EXCLUDED.description`,
          [g.name, g.siteName || "Default Site", g.description || "", Boolean(g.readOnlyAi)]
        );
      }
    }

    if (Array.isArray(seed.hosts)) {
      for (const h of seed.hosts) {
        await client.query(
          `INSERT INTO hosts (
             hostname, display_name, ip_address, ssh_port, ssh_user, ssh_key_id,
             connection_mode, os_type, os_info, group_name, site_name, tags,
             safety_tier, read_only_ai
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (hostname) DO NOTHING`,
          [
            h.hostname,
            h.displayName || h.hostname,
            h.ipAddress,
            h.sshPort || 22,
            h.sshUser || "root",
            defaultKeyId,
            h.connectionMode || "ssh",
            h.osType || "linux",
            h.osInfo || "",
            h.groupName || "default",
            h.siteName || "Main Datacenter",
            JSON.stringify(h.tags || []),
            h.safetyTier || "supervised",
            Boolean(h.readOnlyAi),
          ]
        );
      }
    }
  } catch (err) {
    console.error("Failed to apply SEED_CONFIG_PATH:", err);
  }
}

export async function logAudit(
  actor: string,
  category: string,
  action: string,
  target?: string,
  details: Record<string, unknown> = {},
  severity: "info" | "warning" | "critical" = "info"
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor, category, action, target, details, severity)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actor, category, action, target || null, JSON.stringify(details), severity]
    );
  } catch (e) {
    console.error("Audit log error:", e);
  }
}
