import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as http from 'node:http';
import { CameraAdapter } from './camera-adapter';
import { CameraStatus, CaptureResult } from '../types/camera-types';
import { config } from '../config';

const dccAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 3,
  keepAliveMsecs: 5000,
});

interface PreviewDetails {
  buffer: Buffer;
  filename?: string | undefined;
  length: number;
}

function httpGetDetails(url: string, timeoutMs: number = 2500): Promise<PreviewDetails | null> {
  return new Promise((resolve) => {
    const req = http.get(url, { agent: dccAgent }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      const disposition = (res.headers['content-disposition'] as string) || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match ? match[1] : undefined;

      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          buffer,
          filename,
          length: buffer.length,
        });
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
  });
}

function httpHead(url: string, timeoutMs: number = 1000): Promise<{ filename?: string | undefined } | null> {
  return new Promise((resolve) => {
    const req = http.request(url, { method: 'HEAD', agent: dccAgent }, (res) => {
      res.resume();
      if (res.statusCode !== 200) return resolve(null);
      const disposition = (res.headers['content-disposition'] as string) || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      resolve({ filename: match ? match[1] : undefined });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

function triggerCapture(attempt: number = 1): Promise<{ ok: boolean; status?: number | undefined; data?: string | undefined }> {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:5513/?CMD=Capture', (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        console.log(`[RealCameraAdapter] Shutter trigger #${attempt} response: status=${res.statusCode} ${body.trim()}`);
        resolve({ ok: res.statusCode === 200, status: res.statusCode, data: body.trim() });
      });
    });
    req.on('error', (err) => {
      console.warn(`[RealCameraAdapter] Shutter trigger #${attempt} error: ${err.message}`);
      resolve({ ok: false, data: err.message });
    });
    req.setTimeout(2500, () => {
      req.destroy();
      resolve({ ok: false, data: 'TIMEOUT' });
    });
  });
}

function fetchLiveViewSnapshot(): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:5513/liveview.jpg', (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length > 5000 && buf[0] === 0xFF && buf[1] === 0xD8) {
          resolve(buf);
        } else {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

export class RealCameraAdapter implements CameraAdapter {
  private status: CameraStatus = 'disconnected';
  private baselineLen: number = 0;
  private baselineHead: Buffer | null = null;
  private baselineFilename: string | null = null;

  async connect(): Promise<void> {
    this.status = 'connecting';
    const isAlive = await this.checkHttpServer();
    if (isAlive) {
      this.status = 'ready';
      console.log('[RealCameraAdapter] Connected to digiCamControl Web Server at port 5513');
      this.prepareCapture().catch(() => {});
    } else {
      this.status = 'ready';
      console.log('[RealCameraAdapter] digiCamControl port 5513 not yet open, standing by');
    }
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
    this.baselineLen = 0;
    this.baselineHead = null;
    this.baselineFilename = null;
    console.log('[RealCameraAdapter] Disconnected');
  }

  // Dipanggil otomatis di background saat countdown berjalan
  // Mengunci ukuran, header, dan filename foto lama SEBELUM shutter ditekan
  async prepareCapture(): Promise<void> {
    try {
      const current = await httpGetDetails('http://127.0.0.1:5513/preview.jpg', 2000);
      if (current && current.length > 10000 && current.buffer[0] === 0xFF && current.buffer[1] === 0xD8) {
        this.baselineLen = current.length;
        this.baselineHead = current.buffer.subarray(0, 64);
        this.baselineFilename = current.filename || null;
        console.log(`[RealCameraAdapter] Baseline locked during countdown: filename=${this.baselineFilename}, len=${this.baselineLen}`);
      }
    } catch {}
  }

  private async checkHttpServer(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const req = http.get('http://127.0.0.1:5513/', { agent: dccAgent, timeout: 1000 }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  async getStatus(): Promise<CameraStatus> {
    if (this.status === 'capturing') return 'capturing';

    try {
      const isAlive = await this.checkHttpServer();
      if (isAlive) {
        this.status = 'ready';
      } else {
        this.status = 'disconnected';
      }
    } catch {
      this.status = 'disconnected';
    }

    return this.status;
  }

  async isReady(): Promise<boolean> {
    const s = await this.getStatus();
    return s === 'ready';
  }

  async capture(sessionId: string, photoIndex: number): Promise<CaptureResult> {
    this.status = 'capturing';
    const startTime = Date.now();

    try {
      const absoluteStoragePath = path.resolve(process.cwd(), config.storagePath);
      const sessionDir = path.join(absoluteStoragePath, 'sessions', sessionId, 'original');
      await fs.mkdir(sessionDir, { recursive: true });

      const fileName = `photo-${photoIndex}.jpg`;
      const filePath = path.join(sessionDir, fileName);

      // Pastikan baseline foto lama diketahui sebelum shutter ditekan
      if (!this.baselineFilename && this.baselineLen === 0) {
        const quickHead = await httpHead('http://127.0.0.1:5513/preview.jpg', 800);
        if (quickHead?.filename) {
          this.baselineFilename = quickHead.filename;
        }
      }

      const initialBaselineLen = this.baselineLen;
      const initialBaselineHead = this.baselineHead;
      const initialBaselineFilename = this.baselineFilename;

      console.log(`[RealCameraAdapter] Triggering capture for ${fileName} INSTANTLY... (prior baseline: ${initialBaselineFilename || initialBaselineLen})`);

      // 1. Matikan LiveView terlebih dahulu agar cermin kamera turun dan jalur USB Canon 100% bebas!
      try {
        const stopReq = http.get('http://127.0.0.1:5513/?CMD=LiveView_Stop', (res) => res.resume());
        stopReq.on('error', () => {});
      } catch {}
      await new Promise((r) => setTimeout(r, 150));

      // 2. TRIGGER SHUTTER TUNGGAL (Hanya kirim 1 perintah agar kamera tidak antre jepret ganda)
      triggerCapture(1).catch(() => {});

      // 3. Polling sampai foto BARU selesai ditransfer
      let imageBuffer: Buffer | null = null;
      let newFilename: string | null = null;
      const pollStart = Date.now();
      let retriggered = false;

      while (Date.now() - pollStart < 8500) {
        const elapsed = Date.now() - pollStart;

        // Re-trigger HANYA jika sudah lewat 5.5 detik (karena transfer normal Canon butuh 3.2 - 3.8s)
        // Ini mencegah trigger ganda yang membuat kamera jepret sendiri di tengah countdown pose berikutnya!
        if (elapsed > 5500 && !retriggered) {
          retriggered = true;
          console.warn(`[RealCameraAdapter] ⚠️ Belum ada foto baru setelah 5.5 detik. Mengirim ulang trigger shutter cadangan...`);
          triggerCapture(2).catch(() => {});
        }

        const current = await httpGetDetails('http://127.0.0.1:5513/preview.jpg', 1200);
        if (
          current &&
          current.length > 10000 &&
          current.buffer[0] === 0xFF &&
          current.buffer[1] === 0xD8
        ) {
          let isNewPhoto = false;

          // Metode 1 (Paling Akurat): Jika filename berubah dari baseline foto sebelumnya
          if (initialBaselineFilename && current.filename) {
            if (current.filename !== initialBaselineFilename) {
              isNewPhoto = true;
            }
          }
          // Metode 2: Jika ukuran atau byte header JPEG berubah dari baseline foto sebelumnya
          else if (initialBaselineLen > 0 && initialBaselineHead) {
            if (current.length !== initialBaselineLen || !current.buffer.subarray(0, 64).equals(initialBaselineHead)) {
              isNewPhoto = true;
            }
          }
          // Metode 3: Jika belum pernah ada foto sama sekali di digiCamControl
          else if (!initialBaselineFilename && initialBaselineLen === 0) {
            if (elapsed > 1800) {
              isNewPhoto = true;
            }
          }

          if (isNewPhoto) {
            imageBuffer = current.buffer;
            newFilename = current.filename || null;
            this.baselineLen = current.length;
            this.baselineHead = current.buffer.subarray(0, 64);
            this.baselineFilename = current.filename || null;
            console.log(`[RealCameraAdapter] New photo confirmed: ${current.filename || current.length + ' bytes'} in ${Date.now() - startTime}ms`);
            break;
          }
        }

        await new Promise((r) => setTimeout(r, 150));
      }

      // FAILSAFE: Jika shutter fisik kamera DSLR macet (misal lensa AF gagal mengunci fokus di tempat gelap),
      // gunakan snapshot LiveView / preview kamera DSLR sebagai penyelamat agar photobooth TIDAK PERNAH CRASH!
      if (!imageBuffer || imageBuffer.length < 5000) {
        console.warn(`[RealCameraAdapter] ⚠️ Shutter DSLR fisik macet setelah 8.5s. Mengaktifkan LiveView darurat untuk snapshot failsafe...`);
        try {
          http.get('http://127.0.0.1:5513/?CMD=LiveView_Start', (res) => res.resume()).on('error', () => {});
        } catch {}
        await new Promise(r => setTimeout(r, 500));

        const liveFrame = await fetchLiveViewSnapshot();
        if (liveFrame && liveFrame.length > 5000) {
          imageBuffer = liveFrame;
          newFilename = 'liveview-failsafe.jpg';
          console.log(`[RealCameraAdapter] ✅ Berhasil menyelamatkan pose menggunakan snapshot LiveView DSLR (${liveFrame.length} bytes). Sesi Kiosk tetap sukses!`);
        } else {
          const lastCurrent = await httpGetDetails('http://127.0.0.1:5513/preview.jpg', 1500);
          if (lastCurrent && lastCurrent.length > 5000) {
            imageBuffer = lastCurrent.buffer;
            newFilename = 'last-preview-fallback.jpg';
            console.log(`[RealCameraAdapter] ✅ Berhasil menggunakan preview terakhir sebagai fallback.`);
          }
        }
      }

      if (!imageBuffer || imageBuffer.length < 5000) {
        throw new Error('CAMERA_SHUTTER_FAILED: Kamera DSLR tidak merespons jepretan foto baru dan LiveView offline.');
      }

      // 4. Simpan foto asli baru ke storage sesi
      await fs.writeFile(filePath, imageBuffer);
      console.log(`[RealCameraAdapter] Saved ${filePath} (${imageBuffer.length} bytes, file: ${newFilename || 'ok'}) in ${Date.now() - startTime}ms`);

      // 5. Beri jeda 300ms agar buffer kamera bersih, lalu buka kembali cermin LiveView
      setTimeout(() => {
        this.ensureLiveView();
      }, 300);

      this.status = 'ready';
      return {
        success: true,
        sessionId,
        photoIndex,
        filePath,
        capturedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      console.error(`[RealCameraAdapter] Capture error: ${err.message}`);
      this.status = 'ready';
      setTimeout(() => {
        this.ensureLiveView();
      }, 300);
      return this.createErrorResult(sessionId, photoIndex, err.message || 'CAPTURE_FAILED');
    }
  }

  private ensureLiveView(): void {
    try {
      const req = http.get('http://127.0.0.1:5513/?CMD=LiveView_Start', { agent: dccAgent }, (res) => res.resume());
      req.on('error', () => {});
      req.setTimeout(1500, () => req.destroy());
    } catch {}
  }

  private createErrorResult(sessionId: string, photoIndex: number, errorMsg: string): CaptureResult {
    return {
      success: false,
      sessionId,
      photoIndex,
      filePath: '',
      capturedAt: new Date().toISOString(),
      error: errorMsg,
    };
  }
}
