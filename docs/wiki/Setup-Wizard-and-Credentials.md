# Setup Wizard, Subnet Discovery & Credential Options

The FleetOps AI Setup Wizard guides administrators through discovering network nodes, configuring multi-profile credentials, setting up AI providers, and establishing governance policies.

---

## 1. Network & Subnet Auto-Discovery

- Enter CIDRs (e.g., `192.168.1.0/24, 10.10.20.0/24`) or specific IP ranges.
- The built-in TCP port prober scans for responsive services:
  - Port `22`: Linux / BSD / OpenSSH
  - Port `6443`: Kubernetes API Server
  - Ports `3389` & `5985/5986`: Windows Server RDP & WinRM
  - Ports `443` & `8443`: Firewalls & Switch Web Consoles
  - Ports `9100` & `631`: JetDirect & IPP Network Printers
- Discovered devices can be added to the fleet in 1 click.

---

## 2. Multi-Profile Credential Management

Step 2 of the setup wizard organizes credentials into 4 dedicated sections:

### 🐧 Linux SSH & Sudo Profiles
Supports multiple distinct credential profiles for different server roles:
- **Authentication Modes:**
  - `Password Auth`: Standard password authentication.
  - `SSH Private Key (PEM)`: Direct paste of RSA or Ed25519 private keys with optional passphrase; automatically enrolled in the Fleet Keystore.
  - `Password + Sudo Password`: Unprivileged SSH login password plus a distinct sudo escalation password.
  - `SSH Key + Sudo Password`: Key-based SSH authentication combined with an interactive sudo escalation password.
- **Privilege Escalation:** `Direct root login`, `sudo (interactive)`, `sudo NOPASSWD`, `doas`, or `su - root`.
- **Custom Ports:** Set custom SSH ports (e.g., `2222`, `2200`).

### 🪟 Windows Server & Active Directory
- **Protocols:** WinRM HTTPS (`:5986`, TLS encrypted), WinRM HTTP (`:5985`), Windows OpenSSH (`:22`), and RDP Console (`:3389`).
- **Account Types:** Domain credentials (`CORP\Admin` or `admin@corp.local`) and local accounts (`.\Admin`).

### 🔌 Switches & Firewalls (Network Appliances)
- **Protocols:** SSH CLI, REST API Tokens (OPNsense, UniFi, pfSense), and Telnet.
- **Enable Secret:** Dedicated privileged EXEC secret field for Cisco IOS, ArubaOS, and FortiOS devices.

### 🖨️ Multiple SNMP Communities Pool
Rather than a single SNMP community string, FleetOps AI provides an extensible pool:
- **SNMP Versions:** `SNMPv2c` (standard), `SNMPv1` (legacy), and `SNMPv3` (secure USM).
- **SNMPv3 USM Support:** Configure Security Name, Auth Protocol (`SHA-1`, `SHA-256`, `MD5`), Auth Password, Privacy Protocol (`AES-128`, `AES-256`, `DES`), and Privacy Password.
- **Bulk Add:** Paste comma-separated lists (`public, private, sab-snmp, printers-ro`) to populate communities in one step.
- **Primary Community:** Mark which community string acts as the default fallback for automated topology and Printer-MIB polling.
