# CAMERA — Camera Service Documentation

> **Phase:** 0 Revision  
> **Status:** MockCameraAdapter only. Real adapter pending hardware specification.

---

## 1. OVERVIEW

The Camera Service is a **standalone Node.js daemon** that runs on the laptop.

It is the **only** component that communicates with the DSLR.  
The Web Server does NOT import or directly control the camera.  
Instead, the Web Server uses `camera-client.ts` to call the Camera Service over HTTP.

```
DSLR
 │ USB
 ▼
Camera Service (localhost:3001)
 │ HTTP
 ▼
Web Server (localhost:3000)
 │ Socket.IO
 ▼
iPad Kiosk
```

---

## 2. CAMERA SERVICE API (Internal)

Port: `3001`  
Accessible: **Localhost only** — iPad/external clients cannot reach this port.

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `GET` | `/status` | Current camera status |
| `POST` | `/capture` | Trigger capture |
| `POST` | `/connect` | Connect camera adapter |
| `POST` | `/disconnect` | Disconnect camera adapter |

### `GET /status` Response
```json
{
  "status": "ready",
  "adapter": "mock",
  "timestamp": "2026-10-08T16:00:00.000Z"
}
```

### `POST /capture` Request
```json
{
  "sessionId": "SIFEST-20261008-0001",
  "photoIndex": 1
}
```

### `POST /capture` Response (success)
```json
{
  "success": true,
  "filePath": "/absolute/path/to/storage/sessions/SIFEST-20261008-0001/original/photo-1.jpg",
  "timestamp": "2026-10-08T16:00:05.123Z"
}
```

### `POST /capture` Response (error)
```json
{
  "success": false,
  "error": "CAPTURE_FAILED",
  "message": "Camera returned error code AF_FAIL",
  "timestamp": "2026-10-08T16:00:05.123Z"
}
```

---

## 3. CAMERA STATE MACHINE

```
                  ┌──────────────────┐
                  │   DISCONNECTED   │ ◄────────────────────────────┐
                  └────────┬─────────┘                              │
                           │ connect()                              │
                           ▼                                        │
                  ┌──────────────────┐                              │
                  │   CONNECTING     │──── timeout / USB fail ─────►│
                  └────────┬─────────┘                              │
                           │ success                                │
                           ▼                                        │
      ┌────────────────────────────────────┐                        │
      │           READY                    │ ◄─────────┐            │
      └────────────────┬───────────────────┘           │            │
                       │ capture()                     │            │
                       ▼                               │            │
      ┌────────────────────────────────────┐           │            │
      │           CAPTURING                │─ done ───►│            │
      └────────────────┬───────────────────┘           │            │
                       │ error                         │            │
                       ▼                               │            │
      ┌────────────────────────────────────┐           │            │
      │           ERROR                    │─ retry ──►│            │
      └────────────────┬───────────────────┘           │            │
                       │ fatal / USB removed            │            │
                       └────────────────────────────────────────────┘
                         → DISCONNECTED
```

### Status Broadcast
Camera Service broadcasts status changes to Web Server immediately.  
Web Server then emits `camera:status` via Socket.IO to admin dashboard.

---

## 4. CAMERAADAPTER INTERFACE

```typescript
// camera-service/src/adapters/CameraAdapter.ts

export type CameraStatus =
  | 'disconnected'
  | 'connecting'
  | 'ready'
  | 'capturing'
  | 'error';

export interface CaptureResult {
  success: boolean;
  filePath?: string;   // Absolute path where photo was saved
  error?: string;      // Error code if failed
  message?: string;    // Human-readable error
  timestamp: string;   // ISO 8601
}

export interface CameraAdapter {
  /**
   * Connect to the camera. Resolves when ready.
   * Rejects if connection fails.
   */
  connect(): Promise<void>;

  /**
   * Disconnect and clean up.
   */
  disconnect(): Promise<void>;

  /**
   * Current camera status. Must be synchronous.
   */
  getStatus(): CameraStatus;

  /**
   * Trigger a capture. Camera must be in READY state.
   * Saves photo to destinationPath.
   */
  capture(sessionId: string, photoIndex: number, destinationPath: string): Promise<CaptureResult>;

  /**
   * Download the last captured photo to destinationPath.
   * Returns the final saved file path.
   * (Some adapters download automatically in capture(); this is a fallback.)
   */
  downloadLatestPhoto(destinationPath: string): Promise<string>;
}
```

---

## 5. MOCKCAMERAADAPTER

Used for all development and testing until real hardware is specified.

**IMPORTANT: This is a simulation. It does NOT control a real camera.**  
The mock is clearly labeled in admin dashboard as `[MOCK MODE]`.

### Behavior

| Method | Behavior |
|---|---|
| `connect()` | Resolves immediately. Sets status to `ready`. |
| `disconnect()` | Resolves immediately. Sets status to `disconnected`. |
| `getStatus()` | Returns current simulated status. |
| `capture()` | Waits 600–1000ms (random, simulating shutter). Generates test JPEG using Sharp. Returns success. |
| `downloadLatestPhoto()` | Returns path to last generated test image. |

### Generated Test Image
- Size: 1920×1280 (simulating DSLR crop)
- Content: Solid gradient background + centered text:
  ```
  [MOCK CAMERA]
  Session: SIFEST-20261008-0001
  Photo: 1 / 3
  2026-10-08 16:00:00
  ```
- Format: JPEG, quality 90

### Error Simulation
Set environment variable `MOCK_CAMERA_ERROR_RATE=0.1` to simulate 10% failure rate for testing error handling.

---

## 6. REAL ADAPTER — PHASE 3

Real DSLR adapter will be implemented in **Phase 3**.

**Required information before Phase 3:**

| Requirement | Status |
|---|---|
| Camera brand (Canon / Nikon / Sony) | ⏸ Not yet specified |
| Camera model (e.g. Canon EOS 90D) | ⏸ Not yet specified |
| Laptop OS (Windows / macOS / Linux) | ⏸ Not yet specified |

**Possible adapters based on hardware:**

| Setup | Adapter Approach |
|---|---|
| Canon + Windows | DigiCamControl (free, Windows-only) via CLI or HTTP API |
| Canon/Nikon + macOS/Linux | gphoto2 via CLI (`gphoto2 --capture-image-and-download`) |
| Sony + Any | Sony Imaging Edge (CLI) or libsony |
| Any + tethered | DSLR tethering via PTP/IP library (node-usb or digiCamControl) |

> **Do NOT implement any real adapter until Phase 3 is authorized.**

---

## 7. ERROR HANDLING STRATEGY

### Capture Failure
1. Web Server receives `success: false` from Camera Service
2. Emit `camera:error` to kiosk socket
3. Retry capture once after 2 seconds
4. If still fails: retry one more time
5. If 3 consecutive failures: emit `session:error`, mark session `error`
6. Show "Contact Booth Staff" message on iPad

### USB Disconnect (during event)
1. Camera Service detects disconnect (polling or USB event)
2. Set status to `disconnected`
3. Emit status to Web Server via polling
4. Web Server emits `camera:status { status: 'disconnected' }` to admin room
5. Camera Service begins reconnect loop (every 5 seconds)
6. If session was `active` during disconnect:
   - Session is NOT marked `abandoned` immediately
   - Kiosk shows "Camera reconnecting..." state
   - Timeout after 30 seconds: mark session `abandoned` if still disconnected

### Auto-Reconnect Loop
```
Camera Service startup
      │
      ▼
connect() → success → READY
      │
      │ USB disconnect detected
      ▼
status = DISCONNECTED
      │
      └── retry loop (every CAMERA_RECONNECT_INTERVAL_MS = 5000)
              │
              ├── connect() success → READY
              └── connect() fail → stay DISCONNECTED, keep retrying
```

---

## 8. TIMING CONSTRAINTS

| Operation | Timeout | Action on timeout |
|---|---|---|
| `connect()` | 10s | Mark `DISCONNECTED`, retry |
| `capture()` | 15s | Mark `ERROR`, retry |
| Wait for `READY` before countdown | 8s | Emit `camera:error` to kiosk |
| Camera reconnect during session | 30s | Mark session `abandoned` |

---

*See also: [ARCHITECTURE.md](./ARCHITECTURE.md), [SETUP.md](./SETUP.md)*
