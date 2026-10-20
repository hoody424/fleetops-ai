# Compliance Frameworks & Scheduled Runbooks

FleetOps AI provides built-in compliance evaluations and runbook automation across all managed nodes.

---

## 13 Supported Compliance Frameworks

FleetOps AI evaluates nodes against 13 industry standards and security benchmarks:

1. **CIS Linux Level 1 (Workstation & Server):** Basic system hardening, SSH configuration, password aging, kernel sysctl parameters.
2. **CIS Linux Level 2:** Advanced defense-in-depth security, strict auditd rules, encrypted storage enforcement.
3. **CIS Docker Benchmark:** Container host isolation, daemon socket permissions, user namespace remapping.
4. **CIS Windows Server Benchmark:** Group Policy baselines, SMBv1 deprecation, PowerShell execution policies.
5. **NIS2 (EU Directive on Network and Information Systems):** Supply-chain risk checks, vulnerability management, backup verification.
6. **ISO/IEC 27001 (Annex A Controls):** Access control, cryptographic controls, logging and monitoring compliance.
7. **GDPR Art. 32 (Security of Processing):** Data encryption at rest and in transit, pseudonymization safeguards.
8. **DORA (Digital Operational Resilience Act for Financial Entities):** ICT risk management and operational continuity checks.
9. **SOC 2 Type II (Trust Services Criteria):** Security, Availability, and Confidentiality controls.
10. **PCI-DSS v4.0:** Payment card data protection, TLS 1.3 requirements, audit log retention.
11. **NIST SP 800-53 Rev. 5:** Federal security and privacy control baselines.
12. **HIPAA Security Rule:** Technical safeguards, ePHI access auditing, transmission encryption.
13. **BSI IT-Grundschutz:** German Federal Office for Information Security baseline security standards.

### 1-Click AI Fix
When a compliance scan yields findings, administrators can click **"Fix Finding with AI"**:
- Generates a targeted remediation script or patch command.
- Shows a unified diff before applying.
- Subject to the active AI Governance Policy (approval vs auto-append).

---

## Scheduled Runbooks & ChatOps

- **Cron-based Automation:**
  - Nightly security and patch posture sweeps.
  - Weekly TLS certificate expiry and SAN validity audits.
  - Nightly GitOps backup snapshot generation.
  - Automated printer toner level and maintenance alerts.
- **Incident Notifications:** Native webhook integration with Slack, Microsoft Teams, Discord, ntfy.sh, and PagerDuty.
