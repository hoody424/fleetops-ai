# AI Brains & Decision Governance

FleetOps AI integrates existing paid AI subscriptions, sovereign cloud APIs, and air-gapped local models into a single operational interface.

---

## Supported AI Providers (12 Brains)

### 1. Subscription CLI OAuth (No Double Billing)
Utilize your existing monthly user subscriptions without API per-token charges:
- **Anthropic Claude CLI (`claude`):** Supports Claude Pro, Team, and Max tiers.
- **Google Gemini CLI (`gemini`):** Supports Google AI Pro, Ultra, and Workspace subscriptions.
- **OpenAI Codex / ChatGPT CLI (`codex`):** Supports ChatGPT Plus, Pro, and Team accounts.

### 2. Commercial Cloud APIs
- **Anthropic API:** Claude 3.5 Sonnet, Claude 3.7 Sonnet (Thinking), Claude 3 Opus.
- **OpenAI Platform:** GPT-4.5, GPT-4o, o1, o3-mini.
- **Google Gemini API / Vertex AI:** Gemini 2.0 Flash, Gemini 1.5 Pro.
- **DeepSeek Platform:** DeepSeek-R1 (Reasoning), DeepSeek-V3.
- **xAI Grok:** Grok 2, Grok 3.
- **Mistral AI:** Mistral Large, Codestral.
- **OpenRouter & Groq:** Low-latency inference across 300+ open-source and proprietary models.
- **Azure OpenAI & GitHub Copilot Models:** Enterprise Microsoft deployments.

### 3. Air-Gapped Local LLMs
- **Ollama:** `http://localhost:11434` (Llama 3, Qwen 2.5 Coder, DeepSeek-R1 distills).
- **llama.cpp (`llama-server`):** High-throughput GGUF execution.
- **vLLM / LM Studio / LocalAI:** OpenAI-compatible local endpoints.

---

## 4-Mode AI Decision Governance

FleetOps AI ensures that AI models do not execute destructive actions without proper administrative boundaries:

1. **Strict Read-Only:**
   - AI can only run non-mutating diagnostics (`uname`, `uptime`, `systemctl status`, `docker ps`, `kubectl get`, `ip addr`).
   - All mutating commands, file writes, and package changes are blocked.

2. **Supervised Approval (Human-in-the-Loop):**
   - Read-only diagnostics run automatically.
   - Mutating commands require explicit admin approval with unified diff previews before execution.

3. **Smart Auto-Append:**
   - Safe append operations (`authorized_keys`, non-conflicting monitor configs, read-only diagnostic rules) apply automatically.
   - Restarts, deletions, package removals, and firewall modifications require administrator authorization.

4. **Autonomous SRE:**
   - Full autonomous troubleshooting and remediation.
   - **Mandatory Pre-Change Snapshots:** Before modifying any configuration file, the system creates an atomic rollback snapshot, allowing 1-click revert from the UI or via SFTP.
