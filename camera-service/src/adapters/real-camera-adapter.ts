import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';
import { exec } from 'node:child_process';
import { CameraAdapter } from './camera-adapter';
import { CameraStatus, CaptureResult } from '../types/camera-types';
import { config } from '../config';

function httpGet(url: string, timeoutMs: number = 5000): Promise<Buffer | null> {
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

function httpGetText(url: string, timeoutMs: number = 2000): Promise<string> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8').trim()));
    });
    req.on('error', () => resolve(''));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve('');
    });
  });
}

function httpGetContentLength(url: string, timeoutMs: number = 2000): Promise<number> {
  return new Promise((resolve) => {
    const req = http.request(url, { method: 'HEAD', timeout: timeoutMs }, (res) => {
      res.resume();
      const len = parseInt(res.headers['content-length'] || '0', 10);
      resolve(len);
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => {
      req.destroy();
      resolve(0);
    });
    req.end();
  });
}

async function triggerShutter(): Promise<boolean> {
  // Method 1: HTTP ?CMD=Capture (standard digiCamControl web server command)
  const httpSuccess = await new Promise<boolean>((resolve) => {
    const req = http.get('http://127.0.0.1:5513/?CMD=Capture', (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', (err) => {
      console.warn('[RealCameraAdapter] HTTP Capture error:', err.message);
      resolve(false);
    });
    req.setTimeout(5000, () => {
      req.destroy();
      console.warn('[RealCameraAdapter] HTTP Capture timed out after 5s');
      resolve(false);
    });
  });

  if (httpSuccess) {
    console.log('[RealCameraAdapter] Shutter command (?CMD=Capture) accepted by digiCamControl');
    return true;
  }

  // Method 2: CLI fallback using CameraControlCmd.exe
  const cliPaths = [
    'C:\\Program Files (x86)\\digiCamControl\\CameraControlCmd.exe',
    'C:\\Program Files\\digiCamControl\\CameraControlCmd.exe'
  ];
  const cliPath = cliPaths.find(p => existsSync(p));

  if (cliPath) {
    try {
      console.log(`[RealCameraAdapter] Triggering via CLI: ${cliPath} /capturenoaf`);
      await new Promise<void>((resolve) => {
        exec(`"${cliPath}" /capturenoaf`, { timeout: 5000 }, (err) => {
          if (err) console.warn('[RealCameraAdapter] CLI capture warning:', err.message);
          resolve();
        });
      });
      return true;
    } catch (e: any) {
      console.warn('[RealCameraAdapter] CLI capture failed:', e.message);
    }
  }

  return false;
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

      console.log(`[RealCameraAdapter] Triggering capture for ${fileName}...`);

      // 1. Cek file terakhir sebelum shutter ditekan (menggunakan SLC ringan / HEAD - instant <10ms)
      const prevFilename = await httpGetText('http://127.0.0.1:5513/?slc=get&param1=lastcaptured&param2=', 1500);
      const prevLen = await httpGetContentLength('http://127.0.0.1:5513/preview.jpg', 1500);
      console.log(`[RealCameraAdapter] Pre-capture: lastcaptured="${prevFilename}", previewLen=${prevLen}`);

      // 2. Kirim perintah shutter ke digiCamControl
      await triggerShutter();

      // Beri jeda kamera melakukan eksposur shutter
      await new Promise((r) => setTimeout(r, 800));

      // 3. Polling sampai foto baru berhasil dideteksi
      let imageBuffer: Buffer | null = null;
      let newCapturedPath: string | null = null;
      const pollStart = Date.now();

      while (Date.now() - pollStart < 12000) {
        // Cek A: Apakah path lastcaptured berubah?
        const currentFilename = await httpGetText('http://127.0.0.1:5513/?slc=get&param1=lastcaptured&param2=', 1500);
        if (currentFilename && currentFilename !== prevFilename && currentFilename !== '-') {
          newCapturedPath = currentFilename;
          console.log(`[RealCameraAdapter] New photo detected via lastcaptured: ${newCapturedPath}`);
          break;
        }

        // Cek B: Apakah Content-Length preview.jpg berubah?
        const currentLen = await httpGetContentLength('http://127.0.0.1:5513/preview.jpg', 1500);
        if (currentLen > 5000 && currentLen !== prevLen) {
          console.log(`[RealCameraAdapter] New photo detected via preview.jpg length change: ${prevLen} -> ${currentLen}`);
          break;
        }

        await new Promise((r) => setTimeout(r, 350));
      }

      // 4. Ambil data foto baru:
      // Prioritas 1: Jika lastcaptured mengembalikan path file lokal yang valid di disk, baca langsung dari disk (cepat & bebas lag!)
      if (newCapturedPath && existsSync(newCapturedPath)) {
        try {
          const directBuf = await fs.readFile(newCapturedPath);
          if (directBuf && directBuf.length > 10000 && directBuf[0] === 0xFF && directBuf[1] === 0xD8) {
            imageBuffer = directBuf;
            console.log(`[RealCameraAdapter] Loaded directly from disk: ${newCapturedPath} (${imageBuffer.length} bytes)`);
          }
        } catch (e: any) {
          console.warn('[RealCameraAdapter] Failed reading direct disk file, falling back to HTTP preview.jpg:', e.message);
        }
      }

      // Prioritas 2: Download /preview.jpg dari web server digiCamControl
      if (!imageBuffer) {
        imageBuffer = await httpGet('http://127.0.0.1:5513/preview.jpg', 6000);
      }

      if (!imageBuffer || imageBuffer.length < 5000) {
        throw new Error('FAILED_TO_DOWNLOAD_PHOTO_FROM_DIGICAMCONTROL');
      }

      // 5. Simpan foto asli baru ke storage sesi
      await fs.writeFile(filePath, imageBuffer);
      console.log(`[RealCameraAdapter] Saved ${filePath} (${imageBuffer.length} bytes) in ${Date.now() - startTime}ms`);

      // 6. Buka kembali cermin LiveView untuk pose berikutnya
      await this.ensureLiveView();

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
      await this.ensureLiveView();
      return this.createErrorResult(sessionId, photoIndex, err.message || 'CAPTURE_FAILED');
    }
  }

  private async ensureLiveView(): Promise<void> {
    try {
      http.get('http://127.0.0.1:5513/?CMD=LiveViewWnd_Show', (res) => res.resume()).on('error', () => {});
      await new Promise(r => setTimeout(r, 200));
      http.get('http://127.0.0.1:5513/?CMD=LiveView_Start', (res) => res.resume()).on('error', () => {});
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
