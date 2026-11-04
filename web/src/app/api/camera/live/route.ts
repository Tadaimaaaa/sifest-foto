import { NextRequest } from 'next/server';
import http from 'http';

export const dynamic = 'force-dynamic';

// Gunakan keepAlive agent agar koneksi TCP ke digiCamControl tetap terbuka (pooling)
// Ini menghilangkan 100% lag, stutter, dan patah-patah pada live view!
const keepAliveAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 5,
  keepAliveMsecs: 10000,
});

function getLiveFrame(timeoutMs: number = 600): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:5513/liveview.jpg', { agent: keepAliveAgent }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
  });
}

function wakeUpLiveView(): void {
  try {
    const req1 = http.get('http://127.0.0.1:5513/?CMD=LiveViewWnd_Show', { agent: keepAliveAgent }, (res) => res.resume());
    req1.on('error', () => {});
    req1.setTimeout(1500, () => req1.destroy());

    setTimeout(() => {
      try {
        const req2 = http.get('http://127.0.0.1:5513/?CMD=LiveView_Start', { agent: keepAliveAgent }, (res) => res.resume());
        req2.on('error', () => {});
        req2.setTimeout(1500, () => req2.destroy());
      } catch {}
    }, 150);
  } catch {}
}

export async function GET(req: NextRequest) {
  const currentAbort = new AbortController();

  // 1. Bangunkan LiveView di digiCamControl
  wakeUpLiveView();

  // 2. Beri toleransi waktu hingga 5 detik bagi cermin kamera DSLR untuk membuka dan mengirim frame pertama
  let initialFrame: Buffer | null = null;
  const startWait = Date.now();
  while (Date.now() - startWait < 5000 && !currentAbort.signal.aborted && !req.signal.aborted) {
    initialFrame = await getLiveFrame(800);
    if (initialFrame && initialFrame.length > 500) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  // Jika setelah 5 detik belum ada respon sama sekali, kembalikan 503
  if (!initialFrame || initialFrame.length < 500) {
    return new Response(
      JSON.stringify({
        error: 'digicam_unavailable',
        message: 'digiCamControl belum mengirimkan frame video di port 5513. Pastikan aplikasi digiCamControl dibuka dan DSLR terhubung.',
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

      // Kirim frame pertama seketika
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

      while (!isClosed && !currentAbort.signal.aborted && !req.signal.aborted) {
        // Jika sedang proses jepret shutter DSLR, jeda penarikan frame liveview
        // agar jalur USB dan port 5513 100% bebas untuk perintah Capture!
        const globalSm = (global as any).sessionManager;
        if (globalSm && globalSm.isCapturingPhoto) {
          await new Promise((r) => setTimeout(r, 120));
          continue;
        }

        try {
          const frame = await getLiveFrame(500);
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
            // ~25 FPS interval (40ms) — tampilan mulus, stabil tanpa lag
            await new Promise((r) => setTimeout(r, 40));
          } else {
            consecutiveMisses++;
            // JANGAN panggil wakeUpLiveView di sini karena frame kosong wajar terjadi saat shutter jepret foto!
            // Jika digiCamControl benar-benar macet >40 detik baru hentikan stream
            if (consecutiveMisses > 500) {
              console.warn('[CameraLive] digiCamControl tidak merespons >40 detik, terminating stream.');
              break;
            }
            await new Promise((r) => setTimeout(r, 80));
          }
        } catch {
          await new Promise((r) => setTimeout(r, 80));
        }
      }

      try {
        controller.close();
      } catch {}
    },
    cancel() {
      isClosed = true;
      currentAbort.abort();
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
