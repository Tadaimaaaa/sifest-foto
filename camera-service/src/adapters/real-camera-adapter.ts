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
    // 1. Kirim CaptureNoAf SEKETIKA — langsung membunyikan rana (cekrek) tanpa jeda motor fokus
    const req1 = http.get('http://127.0.0.1:5513/?CMD=CaptureNoAf', (res) => res.resume());
    req1.on('error', () => {});
    req1.setTimeout(3000, () => req1.destroy());

    // 2. Cadangan Capture standar jika kamera membutuhkan sinyal shutter kedua
    setTimeout(() => {
      try {
        const req2 = http.get('http://127.0.0.1:5513/?CMD=Capture', (res) => res.resume());
        req2.on('error', () => {});
        req2.setTimeout(3000, () => req2.destroy());
      } catch {}
    }, 100);
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
  // Ini mengunci ukuran foto lama ke memori SEBELUM shutter ditekan, tanpa jeda sama sekali
  async prepareCapture(): Promise<void> {
    try {
      const current = await httpGet('http://127.0.0.1:5513/preview.jpg', 2000);
      if (current && current.length > 10000 && current[0] === 0xFF && current[1] === 0xD8) {
        this.lastPhotoLen = current.length;
        this.lastPhotoHead = current.subarray(0, 64);
        console.log(`[RealCameraAdapter] Baseline photo locked during countdown: ${this.lastPhotoLen} bytes`);
      }
      // Kirim sinyal LiveView_Focus agar kamera mengunci fokus ke orang saat berpose
      http.get('http://127.0.0.1:5513/?CMD=LiveView_Focus', (res) => res.resume()).on('error', () => {});
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
      // (Kamera DSLR butuh ~1.5 detik untuk menyelesaikan transfer USB ke laptop)
      await new Promise((r) => setTimeout(r, 1400));

      // 3. Polling sampai foto BARU benar-benar selesai ditransfer oleh digiCamControl
      let imageBuffer: Buffer | null = null;
      const pollStart = Date.now();

      while (Date.now() - pollStart < 9000) {
        const current = await httpGet('http://127.0.0.1:5513/preview.jpg', 2500);
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
            // Jika baseline awal kosong, tunggu minimal 2.5 detik agar transfer foto yang baru jepret selesai
            if (Date.now() - pollStart > 2500) {
              imageBuffer = current;
              this.lastPhotoLen = current.length;
              this.lastPhotoHead = current.subarray(0, 64);
              console.log(`[RealCameraAdapter] First photo confirmed without prior baseline: ${current.length} bytes`);
              break;
            }
          }
        }
        await new Promise((r) => setTimeout(r, 300));
      }

      // Safety fallback
      if (!imageBuffer) {
        const lastCheck = await httpGet('http://127.0.0.1:5513/preview.jpg', 2500);
        if (lastCheck && lastCheck.length > 10000 && lastCheck[0] === 0xFF && lastCheck[1] === 0xD8) {
          imageBuffer = lastCheck;
          this.lastPhotoLen = imageBuffer.length;
          this.lastPhotoHead = imageBuffer.subarray(0, 64);
        }
      }

      if (!imageBuffer || imageBuffer.length < 5000) {
        throw new Error('FAILED_TO_DOWNLOAD_PHOTO_FROM_DIGICAMCONTROL');
      }

      // 4. Simpan foto asli baru ke storage sesi
      await fs.writeFile(filePath, imageBuffer);
      console.log(`[RealCameraAdapter] Saved ${filePath} (${imageBuffer.length} bytes) in ${Date.now() - startTime}ms`);

      // 5. Buka kembali cermin LiveView untuk pose berikutnya
      this.ensureLiveView();

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
      this.ensureLiveView();
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
