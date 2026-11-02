import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as http from 'node:http';
import { CameraAdapter } from './camera-adapter';
import { CameraStatus, CaptureResult } from '../types/camera-types';
import { config } from '../config';

function httpGet(url: string, timeoutMs: number = 3000): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
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

function triggerCapture(): void {
  try {
    // 1. SLC capturenoaf (Single Command System: Cekrek seketika tanpa jeda motor autofocus)
    const req1 = http.get('http://127.0.0.1:5513/?slc=capturenoaf', (res) => res.resume());
    req1.on('error', () => {});
    req1.setTimeout(3000, () => req1.destroy());

    // 2. Kirim juga ?CMD=Capture sebagai cadangan setelah jeda 250ms jika SLC tidak didukung
    setTimeout(() => {
      try {
        const req2 = http.get('http://127.0.0.1:5513/?CMD=Capture', (res) => res.resume());
        req2.on('error', () => {});
        req2.setTimeout(3000, () => req2.destroy());
      } catch {}
    }, 250);
  } catch {}
}

export class RealCameraAdapter implements CameraAdapter {
  private status: CameraStatus = 'disconnected';
  private lastPhotoLen: number = 0;
  private lastPhotoHead: Buffer | null = null;

  async connect(): Promise<void> {
    this.status = 'connecting';
    const isAlive = await this.checkHttpServer();
    if (isAlive) {
      this.status = 'ready';
      console.log('[RealCameraAdapter] Connected to digiCamControl Web Server at port 5513');
      // Catat baseline awal foto yang sedang ada di digiCamControl saat connect
      this.prepareCapture().catch(() => {});
    } else {
      this.status = 'ready';
      console.log('[RealCameraAdapter] digiCamControl port 5513 not yet open, standing by');
    }
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
    this.lastPhotoLen = 0;
    this.lastPhotoHead = null;
    console.log('[RealCameraAdapter] Disconnected');
  }

  // Dipanggil otomatis di background saat countdown 5 detik berjalan
  // Mengunci ukuran foto lama ke memori SEBELUM shutter ditekan
  async prepareCapture(): Promise<void> {
    try {
      const current = await httpGet('http://127.0.0.1:5513/preview.jpg', 2000);
      if (current && current.length > 10000 && current[0] === 0xFF && current[1] === 0xD8) {
        this.lastPhotoLen = current.length;
        this.lastPhotoHead = current.subarray(0, 64);
        console.log(`[RealCameraAdapter] Baseline photo locked during countdown: ${this.lastPhotoLen} bytes`);
      }
      // PENTING: JANGAN kirim LiveView_Focus di sini!
      // Autofokus kamera di tempat redup/malam hari membuat motor lensa berputar mencari fokus dan mengunci rana kamera.
    } catch {}
  }

  private async checkHttpServer(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const req = http.get('http://127.0.0.1:5513/', { timeout: 1000 }, (res) => {
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

      console.log(`[RealCameraAdapter] Triggering capture for ${fileName} INSTANTLY...`);

      // Kunci nilai baseline sebelum tombol jepret ditekan
      const initialBaselineLen = this.lastPhotoLen;
      const initialBaselineHead = this.lastPhotoHead;

      // 1. TRIGGER CEKREK SEKETIKA pada milidetik 0!
      triggerCapture();

      // 2. Beri waktu kamera Canon 700D membuka rana dan mentransfer file via USB
      await new Promise((r) => setTimeout(r, 1200));

      // 3. Polling sampai foto BARU benar-benar selesai ditransfer oleh digiCamControl
      let imageBuffer: Buffer | null = null;
      const pollStart = Date.now();
      let retryTriggerSent = false;

      while (Date.now() - pollStart < 12000) {
        const current = await httpGet('http://127.0.0.1:5513/preview.jpg', 2000);
        if (
          current &&
          current.length > 10000 &&
          current[0] === 0xFF &&
          current[1] === 0xD8
        ) {
          // Bandingkan dengan baseline foto sebelum shutter ditekan
          if (initialBaselineLen > 0 && initialBaselineHead) {
            // Foto BARU pasti memiliki ukuran atau byte header yang berbeda dari foto lama
            if (current.length !== initialBaselineLen || !current.subarray(0, 64).equals(initialBaselineHead)) {
              imageBuffer = current;
              this.lastPhotoLen = current.length;
              this.lastPhotoHead = current.subarray(0, 64);
              console.log(`[RealCameraAdapter] New photo confirmed: ${current.length} bytes (was ${initialBaselineLen})`);
              break;
            }
          } else {
            // Jika baseline awal kosong, tunggu transfer foto yang baru jepret selesai minimal 2 detik
            if (Date.now() - pollStart > 2000) {
              imageBuffer = current;
              this.lastPhotoLen = current.length;
              this.lastPhotoHead = current.subarray(0, 64);
              console.log(`[RealCameraAdapter] First photo confirmed without prior baseline: ${current.length} bytes`);
              break;
            }
          }
        }

        // Jika setelah 4 detik kamera belum merespons, picu trigger capture ulang 1 kali
        if (Date.now() - pollStart > 4000 && !retryTriggerSent) {
          retryTriggerSent = true;
          console.warn(`[RealCameraAdapter] Foto ${fileName} belum terdeteksi setelah 4s, mengirim sinyal rana ulang...`);
          triggerCapture();
        }

        await new Promise((r) => setTimeout(r, 250));
      }

      // ATURAN MUTLAK: JANGAN PERNAH mengambil foto lama jika kamera gagal jepret!
      // Mengambil foto lama menyebabkan foto pose 1 terduplikasi ke pose 2.
      if (!imageBuffer || imageBuffer.length < 5000) {
        throw new Error('CAMERA_SHUTTER_FAILED: Kamera DSLR tidak merespons jepretan foto baru.');
      }

      // 4. Simpan foto asli baru ke storage sesi
      await fs.writeFile(filePath, imageBuffer);
      console.log(`[RealCameraAdapter] Saved ${filePath} (${imageBuffer.length} bytes) in ${Date.now() - startTime}ms`);

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
      const req1 = http.get('http://127.0.0.1:5513/?CMD=LiveViewWnd_Show', (res) => res.resume());
      req1.on('error', () => {});
      req1.setTimeout(1500, () => req1.destroy());

      setTimeout(() => {
        try {
          const req2 = http.get('http://127.0.0.1:5513/?CMD=LiveView_Start', (res) => res.resume());
          req2.on('error', () => {});
          req2.setTimeout(1500, () => req2.destroy());
        } catch {}
      }, 200);
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
