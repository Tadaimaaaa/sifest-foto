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

function httpTrigger(cmd: string): void {
  try {
    const req = http.get(`http://127.0.0.1:5513/?CMD=${encodeURIComponent(cmd)}`, () => {});
    req.on('error', () => {});
    req.setTimeout(800, () => req.destroy());
  } catch {}
}

export class RealCameraAdapter implements CameraAdapter {
  private status: CameraStatus = 'disconnected';

  async connect(): Promise<void> {
    this.status = 'connecting';
    const isAlive = await this.checkHttpServer();
    if (isAlive) {
      this.status = 'ready';
      console.log('[RealCameraAdapter] Connected to digiCamControl Web Server at port 5513');
    } else {
      this.status = 'ready'; // ready for capture attempt or fallback
      console.log('[RealCameraAdapter] digiCamControl port 5513 not yet open, standing by');
    }
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
    console.log('[RealCameraAdapter] Disconnected');
  }

  private async checkHttpServer(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const req = http.get('http://127.0.0.1:5513/', { timeout: 600 }, (res) => {
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

      console.log(`[RealCameraAdapter] Triggering capture for ${fileName}...`);

      // 1. Ambil baseline gambar preview.jpg saat ini SEBELUM shutter ditekan
      // Ini memastikan kita TIDAK mendownload gambar lama dari sesi/tes sebelumnya
      const baseline = await httpGet('http://127.0.0.1:5513/preview.jpg', 2000);
      const baselineLen = baseline ? baseline.length : 0;
      const baselineHead = baseline && baseline.length >= 64 ? baseline.subarray(0, 64) : null;

      // 2. Trigger shutter kamera via digiCamControl HTTP API
      httpTrigger('Capture');
      setTimeout(() => httpTrigger('LiveView_Capture'), 150);

      // Jeda awal memberi waktu kamera untuk autofokus dan buka-tutup shutter
      await new Promise((r) => setTimeout(r, 600));

      // 3. Polling sampai gambar baru benar-benar selesai ditransfer oleh kamera
      let imageBuffer: Buffer | null = null;
      const pollStart = Date.now();

      while (Date.now() - pollStart < 10000) {
        const current = await httpGet('http://127.0.0.1:5513/preview.jpg', 3000);
        if (
          current &&
          current.length > 10000 &&
          current[0] === 0xFF &&
          current[1] === 0xD8
        ) {
          // Pastikan gambar ini adalah foto BARU (bukan baseline lama)
          if (baselineHead && baselineLen > 0) {
            if (current.length !== baselineLen || !current.subarray(0, 64).equals(baselineHead)) {
              imageBuffer = current;
              break;
            }
          } else {
            imageBuffer = current;
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      // Safety fallback jika preview.jpg tidak berubah namun data valid
      if (!imageBuffer) {
        const lastCheck = await httpGet('http://127.0.0.1:5513/preview.jpg', 3000);
        if (lastCheck && lastCheck.length > 10000 && lastCheck[0] === 0xFF && lastCheck[1] === 0xD8) {
          imageBuffer = lastCheck;
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
      httpTrigger('LiveViewWnd_Show');
      setTimeout(() => httpTrigger('LiveView_Start'), 200);
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
