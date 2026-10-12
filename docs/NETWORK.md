# NETWORK — Local Network Setup

> **Phase:** 0 Revision  
> **Status:** Architecture finalized

---

## 1. NETWORK TOPOLOGY

```
                    ┌─────────────────┐
                    │   Wi-Fi Router  │
                    │  192.168.1.1    │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
   ┌──────────▼──────────┐      ┌──────────▼──────────┐
   │        LAPTOP        │      │         iPad         │
   │   192.168.1.10       │      │   192.168.1.20       │
   │                      │      │                      │
   │  :3000 — Web Server  │      │  Safari (Kiosk)      │
   │  :3001 — Camera Svc  │      │                      │
   └──────────────────────┘      └──────────────────────┘
              │
              │ (Optional — internet)
              │
   ┌──────────▼──────────┐
   │      Supabase        │
   │   (Cloud Storage)    │
   └──────────────────────┘
```

---

## 2. PORT ASSIGNMENT

| Port | Service | Accessible From |
|---|---|---|
| `3000` | Next.js Web Server (Kiosk + Admin + API) | Laptop, iPad, any LAN device |
| `3001` | Camera Service (internal HTTP) | **Localhost only** |

> Port `3001` must be firewalled so it is NOT reachable from iPad or other devices.

---

## 3. LAPTOP NETWORK CONFIGURATION

### Set a Static IP (Recommended for event)

**Windows:**
1. Open "Network Connections" (ncpa.cpl)
2. Right-click Wi-Fi adapter → Properties
3. Select "Internet Protocol Version 4 (TCP/IPv4)" → Properties
4. Set:
   ```
   IP Address:      192.168.1.10
   Subnet Mask:     255.255.255.0
   Default Gateway: 192.168.1.1  (router IP)
   DNS:             8.8.8.8
   ```

**macOS:**
1. System Preferences → Network → Wi-Fi → Advanced → TCP/IP
2. Configure IPv4: Manually
3. Set IP: `192.168.1.10`

**Why static IP:**
- iPad must always reach the server at the same address
- QR codes will contain the static IP as fallback URL
- Avoids reconnection issues if DHCP reassigns IPs

---

## 4. FIREWALL RULES

### Windows Firewall
Allow inbound TCP on port 3000:
```powershell
New-NetFirewallRule -DisplayName "SI-FEST Photobooth" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 3000 `
  -Action Allow
```

Block external access to port 3001 (camera service — already localhost-only by default):
- No firewall change needed; Camera Service binds to `127.0.0.1:3001`

### macOS
System Preferences → Security & Privacy → Firewall → Allow "node" through firewall.

---

## 5. IPAD NETWORK CONFIGURATION

### Connect to same Wi-Fi as Laptop
1. Settings → Wi-Fi → Connect to event router (same SSID as laptop)
2. Note: iPad should receive IP via DHCP (e.g. `192.168.1.20`)

### Add Bookmark (iOS Safari)
1. Open Safari on iPad
2. Navigate to: `http://192.168.1.10:3000`
3. Tap Share → Add to Home Screen → "SI-FEST Photobooth"

### Safari Kiosk (Guided Access) — See KIOSK-IPAD.md
After testing, enable Guided Access to lock the iPad to this page.

---

## 6. ENVIRONMENT VARIABLE FOR NETWORK

In `web/.env.local`:
```env
NEXT_PUBLIC_SERVER_URL=http://192.168.1.10:3000
```

This value is embedded in QR codes as fallback URL (offline mode).  
**Update this to match your actual laptop IP before the event.**

---

## 7. CONNECTIVITY HEALTH MONITOR

The Web Server performs an internet connectivity check every 30 seconds:
```
GET https://www.google.com (5s timeout)
```

Result is stored in memory and broadcast to all clients via Socket.IO:
```json
{
  "event": "system:status",
  "data": {
    "internet": "online" | "offline",
    "supabase": "connected" | "disconnected" | "unknown",
    "camera": "ready" | "disconnected" | ...,
    "printer": "ready" | "offline"
  }
}
```

Visible on Admin Dashboard in real time.

---

## 8. OFFLINE MODE GUARANTEES

When internet is down:

| Feature | Status |
|---|---|
| New session | ✅ Works |
| Countdown | ✅ Works |
| DSLR capture | ✅ Works |
| Local file save | ✅ Works |
| Photo processing | ✅ Works |
| QR (local URL) | ✅ Works (LAN only) |
| Print | ✅ Works |
| Supabase upload | ⏸ Queued — retried when internet returns |
| Public download URL | ❌ Not available — local URL used in QR |

### Upload Queue Behavior
1. Files saved locally immediately after processing
2. Upload queue checks internet status before each attempt
3. If offline: queue persists in SQLite, retried every 60 seconds
4. If online: upload begins, session `upload_status` updated
5. Admin dashboard shows pending uploads

---

## 9. TESTING NETWORK LOCALLY (DEVELOPMENT)

If testing without a local network (just one machine):
```env
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
```

iPad simulator (browser on same machine): open `http://localhost:3000`.

---

## 10. TROUBLESHOOTING

| Problem | Check |
|---|---|
| iPad cannot reach server | Laptop and iPad on same Wi-Fi network? Port 3000 open? |
| QR code leads to unreachable page | Laptop IP changed? Update `NEXT_PUBLIC_SERVER_URL` |
| Socket.IO keeps reconnecting | Wi-Fi interference? Router isolation mode? |
| Supabase not uploading | Internet on laptop? Supabase keys correct? |

---

*See also: [ARCHITECTURE.md](./ARCHITECTURE.md), [SETUP.md](./SETUP.md), [KIOSK-IPAD.md](./KIOSK-IPAD.md)*
