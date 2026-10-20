# Outbound Go Client Agent (`fleetops-agent`)

The `fleetops-agent` is an ultra-lightweight, zero-dependency Go binary designed for environments where inbound SSH access is restricted or firewall policies block direct management ports.

---

## Technical Specifications

- **Language:** Pure Go (Go 1.22+ standard library + `gorilla/websocket`).
- **Binary Size:** ~4.2 MB (statically linked, `CGO_ENABLED=0`).
- **Memory Footprint:** ~8 MB RSS idle.
- **Connection Type:** Outbound WebSocket (`ws://` or `wss://`) on standard HTTP/HTTPS ports.
- **Inbound Ports Required:** Zero (`0`).
- **Operating Systems:** Linux (`amd64`, `arm64`, `armv7`), Windows (`amd64`).

---

## Compilation

Build the static binary from `packages/agent-go`:

```bash
cd packages/agent-go

# Linux amd64
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bin/fleetops-agent-linux-amd64 .

# Linux arm64 (Raspberry Pi / AWS Graviton)
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o bin/fleetops-agent-linux-arm64 .

# Windows amd64
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o bin/fleetops-agent-windows-amd64.exe .
```

---

## Deployment on Linux Target

1. Copy the binary to `/usr/local/bin/fleetops-agent`:
   ```bash
   chmod +x /usr/local/bin/fleetops-agent
   ```

2. Create a systemd service `/etc/systemd/system/fleetops-agent.service`:
   ```ini
   [Unit]
   Description=FleetOps AI Outbound Client Agent
   After=network-online.target
   Wants=network-online.target

   [Service]
   Type=simple
   ExecStart=/usr/local/bin/fleetops-agent \
     --server="wss://fleetops.yourdomain.com/ws/agent" \
     --token="YOUR_HOST_AGENT_TOKEN" \
     --hostname="prod-app-01"
   Restart=always
   RestartSec=5s
   LimitNOFILE=65536

   [Install]
   WantedBy=multi-user.target
   ```

3. Enable and start the agent:
   ```bash
   systemctl daemon-reload
   systemctl enable --now fleetops-agent
   ```

The node will immediately appear as **ONLINE** in the FleetOps AI console.
