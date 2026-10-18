// FleetOps AI — Ultra-Lightweight Outbound Client Agent
// Pure Go standard library (zero external dependencies, ~2 MiB RSS, single static binary).
package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha1"
	"crypto/tls"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

type wsClient struct {
	conn net.Conn
	r    *bufio.Reader
	mu   sync.Mutex
}

func dialWebSocket(rawURL string, hostname string) (*wsClient, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	host := u.Host
	if !strings.Contains(host, ":") {
		if u.Scheme == "wss" {
			host += ":443"
		} else {
			host += ":80"
		}
	}

	var conn net.Conn
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	if u.Scheme == "wss" {
		conn, err = tls.DialWithDialer(dialer, "tcp", host, &tls.Config{InsecureSkipVerify: false})
	} else {
		conn, err = dialer.Dial("tcp", host)
	}
	if err != nil {
		return nil, err
	}

	keyBytes := make([]byte, 16)
	_, _ = rand.Read(keyBytes)
	wsKey := base64.StdEncoding.EncodeToString(keyBytes)

	path := u.RequestURI()
	if path == "" {
		path = "/"
	}
	req := fmt.Sprintf(
		"GET %s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\nX-Agent-Hostname: %s\r\n\r\n",
		path, u.Host, wsKey, hostname,
	)
	if _, err := conn.Write([]byte(req)); err != nil {
		_ = conn.Close()
		return nil, err
	}

	br := bufio.NewReaderSize(conn, 8192)
	statusLine, err := br.ReadString('\n')
	if err != nil || !strings.Contains(statusLine, "101") {
		_ = conn.Close()
		return nil, fmt.Errorf("websocket handshake failed: %s (%v)", strings.TrimSpace(statusLine), err)
	}
	for {
		line, err := br.ReadString('\n')
		if err != nil || line == "\r\n" {
			break
		}
	}

	h := sha1.New()
	h.Write([]byte(wsKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	_ = base64.StdEncoding.EncodeToString(h.Sum(nil))

	return &wsClient{conn: conn, r: br}, nil
}

func (c *wsClient) writeJSON(v any) error {
	payload, err := json.Marshal(v)
	if err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()

	var frame bytes.Buffer
	frame.WriteByte(0x81) // FIN + text frame
	maskKey := make([]byte, 4)
	_, _ = rand.Read(maskKey)

	n := len(payload)
	switch {
	case n < 126:
		frame.WriteByte(byte(0x80 | n))
	case n <= 65535:
		frame.WriteByte(0x80 | 126)
		var lenBuf [2]byte
		binary.BigEndian.PutUint16(lenBuf[:], uint16(n))
		frame.Write(lenBuf[:])
	default:
		frame.WriteByte(0x80 | 127)
		var lenBuf [8]byte
		binary.BigEndian.PutUint64(lenBuf[:], uint64(n))
		frame.Write(lenBuf[:])
	}
	frame.Write(maskKey)
	masked := make([]byte, n)
	for i := 0; i < n; i++ {
		masked[i] = payload[i] ^ maskKey[i%4]
	}
	frame.Write(masked)
	_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	_, err = c.conn.Write(frame.Bytes())
	return err
}

func (c *wsClient) readMessage() ([]byte, error) {
	hdr := make([]byte, 2)
	if _, err := io.ReadFull(c.r, hdr); err != nil {
		return nil, err
	}
	opcode := hdr[0] & 0x0f
	if opcode == 0x8 {
		return nil, errors.New("websocket closed by peer")
	}
	masked := (hdr[1] & 0x80) != 0
	length := uint64(hdr[1] & 0x7f)
	if length == 126 {
		var ext [2]byte
		if _, err := io.ReadFull(c.r, ext[:]); err != nil {
			return nil, err
		}
		length = uint64(binary.BigEndian.Uint16(ext[:]))
	} else if length == 127 {
		var ext [8]byte
		if _, err := io.ReadFull(c.r, ext[:]); err != nil {
			return nil, err
		}
		length = binary.BigEndian.Uint64(ext[:])
	}
	var maskKey [4]byte
	if masked {
		if _, err := io.ReadFull(c.r, maskKey[:]); err != nil {
			return nil, err
		}
	}
	data := make([]byte, length)
	if _, err := io.ReadFull(c.r, data); err != nil {
		return nil, err
	}
	if masked {
		for i := uint64(0); i < length; i++ {
			data[i] ^= maskKey[i%4]
		}
	}
	return data, nil
}

func collectMetrics() (map[string]any, string) {
	metrics := map[string]any{
		"cpu_percent":    2.0,
		"memory_percent": 15.0,
		"disk_percent":   20.0,
	}
	osInfo := runtime.GOOS + "/" + runtime.GOARCH

	if runtime.GOOS == "linux" {
		if b, err := os.ReadFile("/proc/loadavg"); err == nil {
			fields := strings.Fields(string(b))
			if len(fields) > 0 {
				if load, err := strconv.ParseFloat(fields[0], 64); err == nil {
					metrics["load_avg"] = load
					metrics["cpu_percent"] = float64(int(load*150)) / 10.0
				}
			}
		}
		if b, err := os.ReadFile("/proc/meminfo"); err == nil {
			var total, avail float64
			for _, line := range strings.Split(string(b), "\n") {
				if strings.HasPrefix(line, "MemTotal:") {
					_, _ = fmt.Sscanf(line, "MemTotal: %f", &total)
				} else if strings.HasPrefix(line, "MemAvailable:") {
					_, _ = fmt.Sscanf(line, "MemAvailable: %f", &avail)
				}
			}
			if total > 0 {
				metrics["memory_percent"] = float64(int(((total-avail)/total)*1000)) / 10.0
			}
		}
		if b, err := os.ReadFile("/etc/os-release"); err == nil {
			for _, line := range strings.Split(string(b), "\n") {
				if strings.HasPrefix(line, "PRETTY_NAME=") {
					osInfo = strings.Trim(strings.TrimPrefix(line, "PRETTY_NAME="), `"`)
					break
				}
			}
		}
	}
	return metrics, osInfo
}

func runShellCommand(command string, timeoutMs int) (string, string, int, int64) {
	if timeoutMs <= 0 || timeoutMs > 120000 {
		timeoutMs = 30000
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()

	start := time.Now()
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "powershell", "-NoProfile", "-NonInteractive", "-Command", command)
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", command)
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	exitCode := 0
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			exitCode = ee.ExitCode()
		} else {
			exitCode = 1
		}
	}
	return stdout.String(), stderr.String(), exitCode, time.Since(start).Milliseconds()
}

func main() {
	serverURL := flag.String("server", "ws://localhost:3000/ws/agent", "FleetOps AI Portal WebSocket URL")
	hostnameFlag := flag.String("hostname", "", "Override agent hostname")
	flag.Parse()

	hn := *hostnameFlag
	if hn == "" {
		hn, _ = os.Hostname()
	}

	q := url.Values{}
	q.Set("hostname", hn)
	q.Set("os", runtime.GOOS)
	sep := "?"
	if strings.Contains(*serverURL, "?") {
		sep = "&"
	}
	fullURL := *serverURL + sep + q.Encode()

	for {
		ws, err := dialWebSocket(fullURL, hn)
		if err != nil {
			time.Sleep(5 * time.Second)
			continue
		}

		stopCh := make(chan struct{})
		go func() {
			ticker := time.NewTicker(20 * time.Second)
			defer ticker.Stop()
			sendHB := func() {
				m, osInfo := collectMetrics()
				_ = ws.writeJSON(map[string]any{
					"type":    "heartbeat",
					"os_info": osInfo,
					"metrics": m,
				})
			}
			sendHB()
			for {
				select {
				case <-ticker.C:
					sendHB()
				case <-stopCh:
					return
				}
			}
		}()

		for {
			raw, err := ws.readMessage()
			if err != nil {
				break
			}
			var msg map[string]any
			if err := json.Unmarshal(raw, &msg); err != nil {
				continue
			}
			if msg["type"] == "exec" {
				reqID, _ := msg["requestId"].(string)
				command, _ := msg["command"].(string)
				timeoutF, _ := msg["timeoutMs"].(float64)
				go func(id, cmdStr string, tms int) {
					out, errOut, code, dur := runShellCommand(cmdStr, tms)
					_ = ws.writeJSON(map[string]any{
						"type":       "exec_result",
						"requestId":  id,
						"stdout":     out,
						"stderr":     errOut,
						"exitCode":   code,
						"durationMs": dur,
					})
				}(reqID, command, int(timeoutF))
			}
		}

		close(stopCh)
		_ = ws.conn.Close()
		time.Sleep(3 * time.Second)
	}
}
