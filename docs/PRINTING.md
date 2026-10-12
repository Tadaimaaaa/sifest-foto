# PRINTING — Print Queue & Integration

> **Phase:** 0 Revision  
> **Status:** Architecture finalized. Mock adapter specified.

---

## 1. PRINT QUEUE ARCHITECTURE

The printing system is designed to be **asynchronous and non-blocking**.
A session never fails just because the printer is offline, out of paper, or jammed.

```
iPad Kiosk
    │
    │ (Auto-print or User clicks Print)
    ▼
Web Server: /api/print/queue (POST)
    │
    ▼
SQLite `print_jobs` table
(status = 'queued')
    │
    ▼
Print Queue Processor (runs every 5 seconds)
    │
    ├── Check Printer Status
    │       │
    │       ├── OFFLINE ───────► Do nothing, leave jobs in 'queued'
    │       │
    │       └── READY ─────────► Take next 'queued' job
    │                                  │
    │                                  ▼
    │                            PrintAdapter.print()
    │                            (status = 'printing')
    │                                  │
    │                                  ├── SUCCESS ─► status = 'printed'
    │                                  │
    │                                  └── ERROR ───► status = 'error', queue for retry
    ▼
Socket.IO Event to Kiosk/Admin
(`print:status` update)
```

---

## 2. PRINT ADAPTER INTERFACE

The web server interacts with printing hardware via an adapter interface to support multiple OS types and mock environments.

```typescript
// web/lib/print/print-adapter.ts

export type PrinterStatus = 'ready' | 'printing' | 'offline' | 'error' | 'unknown';

export interface PrintJobResult {
  success: boolean;
  jobId?: string;
  error?: string;
}

export interface PrintAdapter {
  /**
   * Get current printer status.
   * Returns 'offline' if printer is disconnected or paper out.
   */
  getStatus(): Promise<PrinterStatus>;

  /**
   * Send a file to the printer.
   * Resolves when job is sent to OS spooler successfully.
   */
  print(filePath: string, sessionId: string): Promise<PrintJobResult>;

  /**
   * Cancel a pending job in OS spooler.
   */
  cancelJob(jobId: string): Promise<void>;
}
```

---

## 3. SQLITE PRINT QUEUE

```sql
CREATE TABLE print_jobs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  status TEXT DEFAULT 'queued', -- 'queued' | 'printing' | 'printed' | 'error'
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  attempts INTEGER DEFAULT 0,
  error_message TEXT
);
```

Queue rules:
- Process sequentially (one at a time)
- Max attempts: 3 (retry every 60s on failure)
- After 3 failures: status `error` (admin can manually re-queue)

---

## 4. MOCK PRINT ADAPTER

Used during development (Phase 1-6) when real printer is unavailable.

### Behavior
- `getStatus()`: Resolves to `ready` (simulated).
- `print()`: Waits 5 seconds (simulating print time), then resolves to `success: true`. logs to console.

---

## 5. REAL PRINTER IMPLEMENTATION (Phase 7)

### Target Stack
We will use OS-native print spoolers via Node.js bindings (`node-printer` or `unix-print`).

### Windows
- Connect printer via USB.
- Install manufacturer drivers (e.g., Canon SELPHY CP1300).
- Configure exact printer name in environment variable `PRINTER_NAME`.
- The adapter will use Windows Print Spooler commands (via npm package).

### macOS / Linux (CUPS)
- Connect printer via USB.
- Add printer in System Preferences (macOS) or CUPS admin (`http://localhost:631`).
- Configure exact printer name in `PRINTER_NAME`.
- The adapter will use `lp` command or `node-printer`.

---

## 6. PRINTER ERROR HANDLING IN UI

### User Interface (iPad Kiosk)
- When user finishes session, Print button says `Print (1 Copy)`.
- If user clicks Print: Button changes to `Queued for Printing`.
- If printer is known offline: UI shows `Printer Offline. Your digital photo is saved.`
- Session finishes normally; user is dismissed. Next user can start.

### Admin Dashboard (`/admin`)
- Shows current Printer Status (Ready/Offline/Error).
- Shows Print Queue length.
- Action: "Re-queue Failed Prints" (bulk action for jobs stuck in error).
- Action: "Pause Print Queue" (e.g., changing paper/ink roll).

---

## 7. ENVIRONMENT VARIABLES

```env
# web/.env.local

PRINT_ADAPTER=mock             # 'mock' | 'windows' | 'cups'
PRINTER_NAME=Canon_SELPHY_CP1300  # Exact name in OS
PRINT_MAX_RETRIES=3
PRINT_RETRY_DELAY_MS=60000     # 1 minute
```
