import { NextRequest } from 'next/server';
import http from 'http';

export const dynamic = 'force-dynamic';

function getLiveFrame(): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:5513/liveview.jpg', (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(null);
    });
  });
}

function wakeUpLiveView(): void {
  try {
    const req = http.get('http://127.0.0.1:5513/api?CMD=LiveView_Start', () => {});
    req.on('error', () => {});
    req.setTimeout(500, () => req.destroy());
  } catch {}
}

// Global reference to ensure only ONE active stream exists at a time, preventing socket pool exhaustion
let activeAbortController: AbortController | null = null;

export async function GET(req: NextRequest) {
  // 1. Immediately abort any prior active stream connection
  if (activeAbortController) {
    try {
      activeAbortController.abort();
    } catch {}
    activeAbortController = null;
  }

  const currentAbort = new AbortController();
  activeAbortController = currentAbort;

  // 2. Wake up digiCamControl live view immediately
  wakeUpLiveView();

  let isClosed = false;
  req.signal.addEventListener('abort', () => {
    isClosed = true;
    currentAbort.abort();
  });

  const stream = new ReadableStream({
    async start(controller) {
      const boundary = 'frame';
      let consecutiveMisses = 0;

      while (!isClosed && !currentAbort.signal.aborted) {
        try {
          const frame = await getLiveFrame();
          if (frame && frame.length > 500) {
            consecutiveMisses = 0;
            const header = `--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`;
            controller.enqueue(
              Buffer.concat([
                Buffer.from(header),
                frame,
                Buffer.from('\r\n')
              ])
            );
            // ~25-30 FPS interval
            await new Promise((r) => setTimeout(r, 35));
          } else {
            consecutiveMisses++;
            // If frames are missing for more than ~1 second, poke digiCamControl to ensure mirror is up
            if (consecutiveMisses % 15 === 0) {
              wakeUpLiveView();
            }
            await new Promise((r) => setTimeout(r, 60));
          }
        } catch {
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      try {
        controller.close();
      } catch {}

      if (activeAbortController === currentAbort) {
        activeAbortController = null;
      }
    },
    cancel() {
      isClosed = true;
      currentAbort.abort();
      if (activeAbortController === currentAbort) {
        activeAbortController = null;
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'Pragma': 'no-cache',
    },
  });
}
