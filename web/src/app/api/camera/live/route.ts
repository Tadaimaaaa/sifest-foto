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
    const req1 = http.get('http://127.0.0.1:5513/?CMD=LiveViewWnd_Show', (res) => res.resume());
    req1.on('error', () => {});
    req1.setTimeout(1500, () => req1.destroy());

    setTimeout(() => {
      try {
        const req2 = http.get('http://127.0.0.1:5513/?CMD=LiveView_Start', (res) => res.resume());
        req2.on('error', () => {});
        req2.setTimeout(1500, () => req2.destroy());
      } catch {}
    }, 150);
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

  // 2. Wake up digiCamControl live view
  wakeUpLiveView();

  // 3. Quick check: Is digiCamControl responding?
  const initialFrame = await getLiveFrame();
  if (!initialFrame || initialFrame.length < 500) {
    if (activeAbortController === currentAbort) {
      activeAbortController = null;
    }
    return new Response(
      JSON.stringify({
        error: 'digicam_unavailable',
        message: 'digiCamControl web server is not responding on port 5513. Pastikan aplikasi digiCamControl dibuka dan DSLR terhubung.',
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store',
        },
      }
    );
  }

  let isClosed = false;
  req.signal.addEventListener('abort', () => {
    isClosed = true;
    currentAbort.abort();
  });

  const stream = new ReadableStream({
    async start(controller) {
      const boundary = 'frame';

      // Send initial frame immediately
      try {
        const header = `--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${initialFrame.length}\r\n\r\n`;
        controller.enqueue(
          Buffer.concat([
            Buffer.from(header),
            initialFrame,
            Buffer.from('\r\n'),
          ])
        );
      } catch {
        return;
      }

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
            // ~20 FPS interval — seimbang: tampilan sangat mulus & tidak membebani server port 5513
            await new Promise((r) => setTimeout(r, 50));
          } else {
            consecutiveMisses++;
            // Kamera sedang membuka rana untuk mengambil foto; jangan memutus stream agar tampilan browser tidak freeze!
            if (consecutiveMisses % 12 === 0) {
              wakeUpLiveView();
            }
            // Jika digiCamControl terputus lebih dari 30 detik, barulah akhiri stream
            if (consecutiveMisses > 300) {
              console.warn('[CameraLive] digiCamControl tidak merespons >30 detik, terminating stream.');
              break;
            }
            await new Promise((r) => setTimeout(r, 80));
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
