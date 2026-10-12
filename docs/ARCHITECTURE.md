# ARCHITECTURE — SI-FEST 2026 Photobooth

> **Last Updated:** Phase 0 Revision  
> **Status:** Final for Phase 0 — Approved before Phase 1 begins

---

## 1. SYSTEM OVERVIEW

```
                    DSLR Camera
                        │
                    USB Cable
                        │
            ┌───────────▼───────────────────────────────┐
            │                  LAPTOP                    │
            │                                            │
            │  ┌──────────────────────────────────────┐  │
            │  │         Camera Service               │  │
            │  │         (Node.js daemon)             │  │
            │  │                                      │  │
            │  │  - CameraAdapter (interface)         │  │
            │  │  - MockCameraAdapter (dev/test)      │  │
            │  │  - [RealAdapter] (Phase 3, TBD)      │  │
            │  │  - Camera state machine              │  │
            │  │  - Internal HTTP API (:3001)         │  │
            │  └──────────────┬───────────────────────┘  │
            │                 │ Internal HTTP / WS        │
            │  ┌──────────────▼───────────────────────┐  │
            │  │            Web Server                 │  │
            │  │         (Next.js :3000)               │  │
            │  │                                       │  │
            │  │  - Kiosk UI (iPad frontend)           │  │
            │  │  - Admin UI                           │  │
            │  │  - REST API routes                    │  │
            │  │  - Socket.IO server                   │  │
            │  │  - Session orchestration              │  │
            │  │  - Processing orchestration           │  │
            │  │  - Print queue                        │  │
            │  │  - Supabase upload queue              │  │
            │  │  - camera-client.ts ← talks to       │  │
            │  │    Camera Service, NOT to DSLR        │  │
            │  └──────────────┬───────────────────────┘  │
            │                 │                           │
            │  ┌──────────────▼───────────────────────┐  │
            │  │          Local Storage               │  │
            │  │       (Filesystem / SQLite)          │  │
            │  └──────────────────────────────────────┘  │
            └─────────────────┬──────────────────────────┘
                              │
                          Local Wi-Fi
                         (192.168.x.x)
                              │
              ┌───────────────▼───────────────┐
              │              iPad             │
              │                               │
              │   Safari — Kiosk Mode         │
              │   http://192.168.1.10:3000     │
              │                               │
              │   Kiosk UI (Next.js frontend) │
              └───────────────────────────────┘
                              │
                   (Async — Internet required)
                              │
              ┌───────────────▼───────────────┐
              │           Supabase            │
              │  - Storage (photo files)      │
              │  - Database (session mirror)  │
              └───────────────────────────────┘
```

---

## 2. COMPONENT RESPONSIBILITIES

### Camera Service (`camera-service/`)
| Responsibility | Notes |
|---|---|
| DSLR connection via USB | Manages adapter lifecycle |
| Camera state machine | `DISCONNECTED → READY → CAPTURING` |
| Trigger capture | On command from Web Server |
| Download photo from camera | Save to `storage/sessions/` |
| Report camera status | Via internal HTTP polling or WebSocket |
| Auto-reconnect on USB disconnect | Retry loop with backoff |

**Does NOT:**
- Serve the kiosk UI
- Process photos
- Manage sessions
- Handle print

### Web Server (`web/`)
| Responsibility | Notes |
|---|---|
| Serve kiosk UI to iPad | via Next.js |
| Serve admin UI | `/admin` |
| Socket.IO server | Realtime events to iPad |
| Session management | Create, read, update, lock |
| Single-session kiosk lock | One active session at a time |
| Countdown orchestration | Server is clock authority |
| Command camera-service | via `camera-client.ts` (HTTP) |
| Photo processing | Sharp + ffmpeg (runs on laptop) |
| Print queue | Sequential, non-blocking |
| QR code generation | After processing complete |
| Supabase upload queue | Async, retry on reconnect |
| Download page | `/download/[sessionId]` |
| SQLite (local DB) | Offline-first session store |

**Does NOT:**
- Control DSLR directly
- Import camera-service code directly (only communicates via HTTP)

### `web/lib/camera-client.ts`
- Thin HTTP client that calls Camera Service internal API
- Maps responses to typed `CameraStatus` / `CaptureResult`
- Named `camera-client` (not `camera-service`) to avoid confusion

---

## 3. INTERNAL COMMUNICATION: WEB ↔ CAMERA SERVICE

```
Web Server (port 3000)          Camera Service (port 3001)
        │                                │
        │──── GET /status ──────────────►│
        │◄─── { status: "ready" } ───────│
        │                                │
        │──── POST /capture ────────────►│
        │     { sessionId, photoIndex }   │
        │                                │──── CameraAdapter.capture()
        │                                │◄─── CaptureResult
        │◄─── { success, filePath } ─────│
        │                                │
        │──── GET /health ──────────────►│
        │◄─── { ok: true } ─────────────│
```

The Camera Service exposes a **local-only HTTP API** on `localhost:3001`.  
The iPad and external clients **cannot** reach port 3001.

---

## 4. SESSION LIFECYCLE

### Session States
```
         ┌─────────┐
         │ (none)  │
         └────┬────┘
              │ session:start
              ▼
         ┌─────────┐
         │ ACTIVE  │◄─── Only one allowed at a time
         └────┬────┘
         ┌────┴──────────────────────┐
         │                           │
         ▼                           ▼
    ┌──────────┐              ┌──────────────┐
    │COMPLETED │              │  ABANDONED   │
    │          │              │  (on restart │
    │ (normal) │              │   or error)  │
    └────┬─────┘              └──────────────┘
         │ processing error
         ▼
    ┌──────────┐
    │  ERROR   │  ← Photos preserved, UI recovers
    └──────────┘
```

### Single Kiosk Lock
- Only ONE session can have `state = 'active'` at any time
- `POST /api/session/start` returns `SESSION_ALREADY_ACTIVE` if lock is held
- Lock is stored in SQLite (persists across server restart)
- On server startup: any `active` session is marked `abandoned`

### Session Recovery on Restart
```
Server restarts
      │
      ▼
Check SQLite for active sessions
      │
      ├── Found active session?
      │       │
      │       ▼
      │   Mark as "abandoned"
      │   Preserve captured photos
      │   Log: how many photos were captured
      │       │
      │       ▼
      │   Kiosk returns to WELCOME screen
      │   New session can start immediately
      │
      └── No active session → Normal startup
```

> Photos from abandoned sessions are NOT deleted automatically.
> Admin can view them in the gallery.

---

## 5. PHOTO SESSION FLOW (3-PHOTO SEQUENCE)

```
iPad (Kiosk)                    Web Server (Laptop)          Camera Service
     │                               │                            │
     │── socket: session:start ─────►│                            │
     │   { templateId }              │ create session (SQLite)    │
     │                               │ lock single-session        │
     │◄─ socket: session:created ────│                            │
     │                               │                            │
     │── socket: countdown:ready ───►│                            │
     │   { photoIndex: 1 }           │ check camera status ──────►│
     │                               │◄── { status: "ready" } ───│
     │◄─ socket: countdown:start ────│                            │
     │   { photoIndex:1, seconds:10} │                            │
     │                               │ ← server controls clock    │
     │◄─ countdown:tick { rem: 9 } ──│                            │
     │◄─ countdown:tick { rem: 8 } ──│                            │
     │   ...                         │                            │
     │◄─ countdown:tick { rem: 1 } ──│                            │
     │◄─ countdown:capture ──────────│── POST /capture ──────────►│
     │   (flash animation)           │                            │ *click*
     │                               │◄── { success, filePath } ──│
     │                               │ save photo-1 to storage    │
     │◄─ countdown:captured ─────────│                            │
     │   { photoIndex:1, thumbUrl }  │                            │
     │                               │ wait camera READY ────────►│
     │                               │◄── { status: "ready" } ───│
     │                               │                            │
     │── countdown:ready ───────────►│                            │
     │   { photoIndex: 2 }           │  (repeat for photo 2)      │
     │   ...                         │                            │
     │◄─ countdown:captured ─────────│                            │
     │   { photoIndex: 2 }           │                            │
     │                               │                            │
     │── countdown:ready ───────────►│                            │
     │   { photoIndex: 3 }           │  (repeat for photo 3)      │
     │◄─ countdown:captured ─────────│                            │
     │   { photoIndex: 3 }           │                            │
     │                               │                            │
     │◄─ processing:started ─────────│                            │
     │   (show processing screen)    │ run Sharp compositor       │
     │                               │ generate GIF               │
     │                               │ generate MP4               │
     │                               │ generate QR                │
     │◄─ processing:complete ────────│ async: upload queue        │
     │   { session }                 │ async: print queue         │
     │                               │                            │
     │   (show result screen)        │                            │
```

**Server-Authority Rules:**
1. Countdown ticks are emitted by server (not client-side timer)
2. Camera readiness gate checked BEFORE each countdown starts
3. No manual capture button exposed to visitor
4. If camera fails: emit `camera:error`, retry up to 2x, then show staff error

---

## 6. OUTPUTS PER SESSION

| Output | Source | Purpose |
|---|---|---|
| `original/photo-1.jpg` | DSLR | Archive — never overwrite |
| `original/photo-2.jpg` | DSLR | Archive — never overwrite |
| `original/photo-3.jpg` | DSLR | Archive — never overwrite |
| `processed/thumb-1.jpg` | Sharp resize (400px) | Preview in UI |
| `processed/thumb-2.jpg` | Sharp resize (400px) | Preview in UI |
| `processed/thumb-3.jpg` | Sharp resize (400px) | Preview in UI |
| `processed/final.jpg` | Sharp composite (template) | Print + download |
| `processed/animation.gif` | Individual photos loop | Download |
| `processed/animation.mp4` | Individual photos + ffmpeg | Download |
| `processed/qr.png` | qrcode npm | Scan to download |

### GIF/MP4 Frame Sequence
```
photo-1 → photo-2 → photo-3 → photo-2 → photo-1 → (loop)

GIF delay: 800ms per frame
MP4: ~2s per photo, freeze-frame style, H.264 CRF 28, 800px wide
```

> GIF and MP4 use **individual original photos**, NOT the final composite.

---

## 7. POST-PROCESSING PIPELINE

```
3 Original Photos
      │
      ▼
[STEP 1] Generate thumbnails (Sharp, 400px, JPEG 85%)
      │
      ▼
[STEP 2] Composite final photo
         - Load template frame PNG
         - Crop/resize each photo to slot dimensions
         - Overlay on frame (Sharp composite)
         - Save final.jpg (JPEG 90%)
      │
      ▼
[STEP 3] Generate GIF
         - Resize originals to 800px wide
         - Encode sequence with 800ms delay
         - gifencoder / sharp-gif2
      │
      ▼
[STEP 4] Generate MP4
         - ffmpeg with freeze-frame per photo (~2s each)
         - H.264, CRF 28, scale=800:-2
         - Output: animation.mp4
      │
      ▼
[STEP 5] Generate QR
         - Determine URL (online → Supabase URL, offline → local URL)
         - qrcode npm → PNG → qr.png
      │
      ▼
[STEP 6 — Async] Supabase upload queue
         - Upload all processed files
         - Update session.supabase_uploaded = true
         - Update session.download_url = Supabase public URL
      │
      ▼
[STEP 7 — Async] Print queue
         - If print requested: enqueue print job
         - PrintAdapter processes sequentially
```

---

## 8. QR & DOWNLOAD ARCHITECTURE

### URL Priority
```
Online (internet available):
  QR → Supabase public URL (or signed URL if bucket is private)
  e.g. https://xxxx.supabase.co/storage/v1/object/public/sifest/sessions/ID/...

Offline (no internet):
  QR → http://192.168.1.10:3000/download/SIFEST-20261008-0001
  (Visitors must be on the same Wi-Fi)
```

### Online/Offline Detection
- Server pings a reliable endpoint (e.g. `https://www.google.com`) every 30s
- Result stored as `system.internet = 'online' | 'offline'`
- Broadcast to admin dashboard via `system:status` socket event
- QR generation waits for Supabase upload if online; uses local URL if offline
- If offline at QR gen time: session queued for upload later
- On internet restore: upload queue drains automatically

### Offline Guarantees
| Feature | Offline behavior |
|---|---|
| Start session | ✅ Works |
| Countdown | ✅ Works |
| DSLR capture | ✅ Works |
| Local file save | ✅ Works |
| Processing | ✅ Works |
| QR (local URL) | ✅ Works (on same Wi-Fi) |
| Print | ✅ Works |
| Supabase upload | ⏸ Queued, retried on restore |
| Supabase QR URL | ❌ Not available, local fallback used |

---

## 9. PRINT QUEUE

```
Print request (from result screen or auto-print)
      │
      ▼
PrintQueue.enqueue(sessionId, filePath)
      │
      ▼
SQLite: print_status = 'queued'
      │
      ▼
Queue processor (single worker)
      │
      ├── Printer READY?
      │       │
      │       ├── YES → PrintAdapter.print(filePath)
      │       │         → SQLite: print_status = 'printing'
      │       │         → On success: print_status = 'printed'
      │       │         → On fail: retry once after 30s
      │       │                   → print_status = 'error'
      │       │
      │       └── NO (offline) → job stays 'queued'
      │                          retry when printer online
      │
Session is NEVER failed due to print failure.
Digital outputs remain available regardless.
```

---

## 10. WEBSOCKET EVENTS

### Rooms
| Room | Members | Purpose |
|---|---|---|
| `kiosk` | iPad client | Session flow events |
| `admin` | Admin dashboard | System status, gallery |
| `broadcast` | All clients | System health updates |

### Client → Server
| Event | Payload | Description |
|---|---|---|
| `session:start` | `{ templateId }` | Begin new session |
| `session:abort` | `{ sessionId }` | Cancel active session |
| `countdown:ready` | `{ sessionId, photoIndex }` | Client ready for countdown |
| `print:request` | `{ sessionId }` | Request print job |
| `admin:test_camera` | `{}` | Admin: test camera connection |
| `admin:test_capture` | `{}` | Admin: test capture |
| `admin:test_print` | `{}` | Admin: test print |
| `admin:restart_camera` | `{}` | Admin: restart camera service |

### Server → Client
| Event | Payload | Description |
|---|---|---|
| `session:created` | `{ session }` | New session created |
| `session:error` | `{ code, message }` | Session rejected (e.g. lock) |
| `countdown:start` | `{ photoIndex, seconds }` | Begin countdown |
| `countdown:tick` | `{ photoIndex, remaining }` | Each second tick |
| `countdown:capture` | `{ photoIndex }` | Shutter moment → flash |
| `countdown:captured` | `{ photoIndex, thumbUrl }` | Photo received |
| `camera:status` | `{ status: CameraStatus }` | Camera state change |
| `camera:error` | `{ message, retrying }` | Camera error |
| `processing:started` | `{ sessionId }` | Processing begins |
| `processing:progress` | `{ step, percent }` | Processing step update |
| `processing:complete` | `{ session }` | All outputs ready |
| `processing:error` | `{ message }` | Processing failure |
| `print:status` | `{ sessionId, status }` | Print state change |
| `upload:status` | `{ sessionId, uploaded, url }` | Upload state change |
| `system:status` | `{ camera, printer, internet, supabase }` | Health broadcast |

---

## 11. REST API ENDPOINTS

### Session
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/session/start` | Create session (respects single-kiosk lock) |
| `GET` | `/api/session/:id` | Get session by ID |
| `GET` | `/api/session/list` | List all sessions (admin) |
| `PATCH` | `/api/session/:id` | Update session fields |

### Camera (proxied through web → camera-service)
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/camera/status` | Get camera status |
| `POST` | `/api/camera/test` | Test camera connection |

### Files (API-served, no direct FS access)
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/files/:sessionId/final` | Final composite photo |
| `GET` | `/api/files/:sessionId/gif` | Animated GIF |
| `GET` | `/api/files/:sessionId/mp4` | MP4 video |
| `GET` | `/api/files/:sessionId/original/:n` | Original photo (1, 2, 3) |
| `GET` | `/api/files/:sessionId/thumb/:n` | Thumbnail photo |
| `GET` | `/api/files/:sessionId/qr` | QR code PNG |

### Print
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/print/queue` | Add print job |
| `GET` | `/api/print/status` | Printer + queue status |

### Admin
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/system-status` | Full system health |
| `POST` | `/api/admin/restart-camera` | Restart camera service client |

---

## 12. SESSION SCHEMA

```typescript
interface Session {
  // Identity
  id: string;                      // "SIFEST-20261008-0001"
  created_at: string;              // ISO 8601
  updated_at: string;              // ISO 8601

  // Configuration
  template_id: string;             // "template-01"
  camera_mode: 'mock' | 'real';

  // State
  state: SessionState;
  photos_captured: number;         // 0, 1, 2, 3

  // Local file paths (relative from STORAGE_PATH)
  photo_1_path: string | null;
  photo_2_path: string | null;
  photo_3_path: string | null;
  final_photo_path: string | null;
  gif_path: string | null;
  mp4_path: string | null;
  qr_path: string | null;

  // Cloud
  supabase_uploaded: boolean;
  download_url: string | null;     // Supabase URL or local fallback URL

  // Status
  processing_status: ProcessingStatus;
  print_status: PrintStatus;
  upload_status: UploadStatus;
}

type SessionState = 'active' | 'completed' | 'abandoned' | 'error';

type ProcessingStatus =
  | 'pending' | 'processing' | 'complete' | 'error';

type PrintStatus =
  | 'none' | 'queued' | 'printing' | 'printed' | 'error' | 'skipped';

type UploadStatus =
  | 'pending' | 'uploading' | 'uploaded' | 'error' | 'offline';
```

---

## 13. CAMERA ADAPTER INTERFACE

```typescript
// camera-service/src/adapters/CameraAdapter.ts
export interface CameraAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): CameraStatus;
  capture(sessionId: string, photoIndex: number): Promise<CaptureResult>;
  downloadLatestPhoto(destinationPath: string): Promise<string>;
}

export type CameraStatus =
  | 'disconnected'
  | 'connecting'
  | 'ready'
  | 'capturing'
  | 'error';

export interface CaptureResult {
  success: boolean;
  filePath?: string;
  error?: string;
  timestamp: string;
}
```

### Implemented Adapters (Phase 0 Revision)
| Adapter | Status | Notes |
|---|---|---|
| `MockCameraAdapter` | ✅ Will implement Phase 1 | Generates test JPEG with Sharp |
| `[RealAdapter]` | ⏸ Phase 3 | Requires: camera brand, model, OS |

> Real adapter will only be implemented AFTER hardware is specified.
> Do NOT implement DigiCamControl or gphoto2 until Phase 3.

---

## 14. ENVIRONMENT VARIABLES

```env
# ── Server ─────────────────────────────────────────────
NEXT_PUBLIC_SERVER_URL=http://192.168.1.10:3000
STORAGE_PATH=../storage

# ── Camera Service ──────────────────────────────────────
CAMERA_SERVICE_URL=http://localhost:3001
CAMERA_ADAPTER=mock            # 'mock' | [real adapter name — Phase 3]
CAMERA_READY_TIMEOUT_MS=8000   # Wait for camera ready before capture
CAMERA_CAPTURE_TIMEOUT_MS=10000
CAMERA_RECONNECT_INTERVAL_MS=5000

# ── Print ───────────────────────────────────────────────
PRINT_ADAPTER=mock             # 'mock' | 'cups'
PRINTER_NAME=PHOTOBOOTH_PRINTER
PRINT_RETRY_DELAY_MS=30000

# ── Supabase ────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   # Safe for browser
SUPABASE_SERVICE_ROLE_KEY=eyJ...       # SERVER ONLY — never NEXT_PUBLIC_

# ── Session ─────────────────────────────────────────────
SESSION_PREFIX=SIFEST
SESSION_COUNTER_RESET=daily    # 'daily' | 'event'

# ── Processing ──────────────────────────────────────────
FFMPEG_PATH=ffmpeg             # Full path or 'ffmpeg' if on PATH
GIF_WIDTH=800
FINAL_PHOTO_QUALITY=90
MP4_CRF=28

# ── Internet Check ──────────────────────────────────────
INTERNET_CHECK_URL=https://www.google.com
INTERNET_CHECK_INTERVAL_MS=30000
```

---

## 15. PROJECT STRUCTURE

```
sifest-foto/
│
├── web/                              ← Next.js (Kiosk UI + Admin + API)
│   ├── app/
│   │   ├── (kiosk)/
│   │   │   ├── page.tsx              ← Welcome screen
│   │   │   ├── template/page.tsx     ← Template selection
│   │   │   ├── shoot/page.tsx        ← Countdown + capture
│   │   │   ├── processing/page.tsx
│   │   │   └── result/page.tsx
│   │   ├── admin/
│   │   │   ├── page.tsx              ← Admin dashboard
│   │   │   └── gallery/page.tsx
│   │   ├── download/[sessionId]/page.tsx
│   │   └── api/
│   │       ├── session/
│   │       ├── camera/               ← Proxy to camera-service
│   │       ├── files/
│   │       ├── processing/
│   │       ├── print/
│   │       └── admin/
│   ├── components/
│   │   ├── kiosk/
│   │   ├── admin/
│   │   └── shared/
│   ├── hooks/
│   │   ├── useSocket.ts
│   │   ├── useSession.ts
│   │   └── useCountdown.ts
│   └── lib/
│       ├── camera-client.ts          ← HTTP client → camera-service
│       ├── session-store.ts          ← SQLite operations
│       ├── processing/
│       │   ├── compositor.ts         ← Sharp composite
│       │   ├── gif-generator.ts
│       │   └── mp4-generator.ts
│       ├── print/
│       │   ├── print-adapter.ts      ← Interface
│       │   ├── MockPrintAdapter.ts
│       │   └── CupsPrintAdapter.ts   ← Phase 7
│       ├── upload-queue.ts           ← Supabase async upload
│       ├── qr-generator.ts
│       ├── supabase-client.ts        ← Browser-safe (anon key)
│       ├── supabase-admin.ts         ← Server-only (service role)
│       └── internet-monitor.ts       ← Online/offline detection
│
├── camera-service/                   ← Standalone camera daemon
│   ├── src/
│   │   ├── index.ts                  ← Entry point, HTTP server :3001
│   │   ├── adapters/
│   │   │   ├── CameraAdapter.ts      ← Interface
│   │   │   └── MockCameraAdapter.ts  ← Dev/test (generates JPEG)
│   │   ├── state-machine.ts          ← Camera state machine
│   │   └── server.ts                 ← Express HTTP API
│   └── package.json
│
├── storage/                          ← Local file storage (gitignored)
│   └── sessions/
│       └── SIFEST-YYYYMMDD-NNNN/
│           ├── original/
│           │   ├── photo-1.jpg
│           │   ├── photo-2.jpg
│           │   └── photo-3.jpg
│           └── processed/
│               ├── thumb-1.jpg
│               ├── thumb-2.jpg
│               ├── thumb-3.jpg
│               ├── final.jpg
│               ├── animation.gif
│               ├── animation.mp4
│               └── qr.png
│
├── frames/                           ← Source template assets
│   ├── template-01/
│   │   ├── frame.png                 ← Overlay PNG (transparent slots)
│   │   ├── preview.jpg               ← Thumbnail for selection UI
│   │   └── meta.json                 ← Slot coordinates + sizing
│   ├── template-02/
│   ├── template-03/
│   └── template-04/
│
├── docs/
│   ├── ARCHITECTURE.md               ← This file
│   ├── CAMERA.md
│   ├── NETWORK.md
│   ├── PRINTING.md
│   ├── PHOTO-PROCESSING.md
│   ├── SETUP.md
│   └── KIOSK-IPAD.md
│
├── .env.example
├── .gitignore
└── README.md
```

---

## 16. HARDWARE RISK REGISTER

| Risk | Severity | Mitigation |
|---|---|---|
| DSLR USB disconnect during event | HIGH | Camera Service auto-reconnect loop; kiosk shows "Contact Staff" |
| Capture fails (shutter/AF error) | HIGH | Retry up to 2x; if still fails, abort photo (not session) |
| Server/laptop restart mid-session | HIGH | On startup: mark active sessions `abandoned`; kiosk resets to Welcome |
| Wi-Fi drop (iPad ↔ Laptop) | HIGH | Socket.IO auto-reconnect; kiosk shows "Reconnecting..." banner |
| Printer offline | MEDIUM | Print job queued; session still completes; digital output unaffected |
| Internet drops | MEDIUM | Offline-first; Supabase queued; local URL QR used |
| ffmpeg not installed | MEDIUM | Startup check; MP4 generation gracefully skipped |
| Disk full | MEDIUM | Monitor disk on admin panel; alert at 85% used |
| iPad browser crash | LOW | Session state on server; refresh recovers to current state |
| Memory leak from Sharp streams | MEDIUM | Explicit cleanup after each processing job |
| Real DSLR adapter unknown | HIGH (Phase 3) | Hardware spec must be provided before Phase 3 begins |

---

*See also: [CAMERA.md](./CAMERA.md), [NETWORK.md](./NETWORK.md), [SETUP.md](./SETUP.md)*
