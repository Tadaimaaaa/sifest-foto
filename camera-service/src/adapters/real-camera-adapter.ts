import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as http from 'node:http';
import { CameraAdapter } from './camera-adapter';
import { CameraStatus, CaptureResult } from '../types/camera-types';
import { config } from '../config';

export class RealCameraAdapter implements CameraAdapter {
  private status: CameraStatus = 'disconnected';

  async connect(): Promise<void> {
    this.status = 'connecting';
    try {
      // Just to verify if the executable exists
      await fs.access(config.digicamcontrolCmdPath);
      // We assume the camera is ready if GUI is running. A real check could be sending a dummy command.
      this.status = 'ready';
      console.log(`[RealCameraAdapter] Connected (Executable found at ${config.digicamcontrolCmdPath})`);
    } catch (err) {
      this.status = 'error';
      console.error(`[RealCameraAdapter] Failed to locate digiCamControl Remote Cmd at ${config.digicamcontrolCmdPath}`);
      throw new Error('CAMERA_COMMAND_NOT_FOUND');
    }
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
    console.log('[RealCameraAdapter] Disconnected');
  }

  async getStatus(): Promise<CameraStatus> {
    if (this.status === 'capturing') return 'capturing';

    try {
      // 1. Fast HTTP probe: verify digiCamControl web server is active on port 5513 first (<100ms)
      const isHttpAlive = await new Promise<boolean>((resolve) => {
        const req = http.get('http://127.0.0.1:5513/', { timeout: 300 }, (res) => {
          resolve(true);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
      });

      if (!isHttpAlive) {
        this.status = 'disconnected';
        return 'disconnected';
      }

      // 2. digiCamControl is running, check if camera is connected via remote cmd
      const isConnected = await new Promise<boolean>((resolve) => {
        const child = spawn(config.digicamcontrolCmdPath, ['/c', 'list', 'cameras'], { windowsHide: true });
        let out = '';
        child.stdout?.on('data', d => out += d);
        child.on('close', () => {
          const hasCamera = !out.includes('no camera') && !out.includes('error') && out.includes('["') && !out.includes('[]');
          resolve(hasCamera);
        });
        child.on('error', () => resolve(false));
        setTimeout(() => {
          try { child.kill(); } catch {}
          resolve(false);
        }, 1500);
      });

      if (!isConnected) {
        this.status = 'disconnected';
      } else {
        this.status = 'ready';
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
    if (this.status !== 'ready') {
      return this.createErrorResult(sessionId, photoIndex, 'CAMERA_NOT_READY');
    }

    this.status = 'capturing';
    const startTime = Date.now();

    try {
      // Ensure storage path is absolute before using it
      const absoluteStoragePath = path.resolve(process.cwd(), config.storagePath);
      const sessionDir = path.join(absoluteStoragePath, 'sessions', sessionId, 'original');
      await fs.mkdir(sessionDir, { recursive: true });

      const fileName = `photo-${photoIndex}.jpg`;
      const filePath = path.join(sessionDir, fileName);

      // Check if file already exists
      try {
        await fs.access(filePath);
        throw new Error('FILE_ALREADY_EXISTS');
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          if (err.message === 'FILE_ALREADY_EXISTS') throw err;
          throw new Error('FILE_ACCESS_ERROR');
        }
      }

      console.log(`[RealCameraAdapter] Capturing ${fileName} to ${filePath}...`);

      // Run digiCamControl remote cmd
      // Example: CameraControlRemoteCmd.exe /clean /c CaptureNoAf "C:\path\to\photo.jpg"
      const commandPath = config.digicamcontrolCmdPath;
      
      // We prioritize CaptureNoAf to avoid Canon's autofocus locking shutter (Err 8D01 / 81)
      try {
        await this.runCommand(commandPath, ['/clean', '/c', 'CaptureNoAf', filePath], config.captureTimeoutMs);
      } catch (cmdErr: any) {
        console.warn(`[RealCameraAdapter] CaptureNoAf failed (${cmdErr.message}), trying standard capture...`);
        await this.runCommand(commandPath, ['/clean', '/c', 'capture', filePath], config.captureTimeoutMs);
      }

      // Poll for file to be completely written
      await this.waitForFile(filePath, config.captureTimeoutMs);

      // Verify JPEG header
      await this.verifyJpeg(filePath);

      // Re-trigger live view in digiCamControl to ensure mirror returns to live view immediately
      this.ensureLiveView();

      console.log(`[RealCameraAdapter] Capture successful in ${Date.now() - startTime}ms`);
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
      this.status = 'error';
      setTimeout(() => {
        // Attempt to recover status if camera is still connected. For now we just reset to ready.
        if (this.status === 'error') this.status = 'ready';
      }, 3000);

      let errorCode = 'CAMERA_COMMAND_FAILED';
      if (err.message === 'CAMERA_DISCONNECTED') errorCode = 'CAMERA_DISCONNECTED';
      if (err.message === 'CANON_AF_FAILED') errorCode = 'CANON_AF_FAILED';
      if (err.message === 'CANON_ERROR_81') errorCode = 'CANON_ERROR_81';
      if (err.message === 'FILE_ALREADY_EXISTS') errorCode = 'FILE_ALREADY_EXISTS';
      if (err.message === 'TIMEOUT') errorCode = 'CAMERA_CAPTURE_TIMEOUT';
      if (err.message === 'INVALID_JPEG') errorCode = 'CAMERA_INVALID_IMAGE';

      return this.createErrorResult(sessionId, photoIndex, errorCode);
    }
  }

  private runCommand(command: string, args: string[], timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timeoutId = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('TIMEOUT'));
      }, timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        const out = stdout.trim();
        if (out.includes('no camera is connected')) {
          console.error('[RealCameraAdapter] digiCamControl reports: no camera is connected');
          this.status = 'disconnected';
          reject(new Error('CAMERA_DISCONNECTED'));
        } else if (out.includes('Canon error code: 8D01') || out.includes('Canon error code: 81')) {
          console.warn(`[RealCameraAdapter] digiCamControl reports Canon autofocus lock / busy: ${out}`);
          reject(new Error('CANON_AF_FAILED'));
        } else if (out.includes('Canon error code') || out.includes(':;response:error') || out.includes('error ')) {
          console.error(`[RealCameraAdapter] digiCamControl command error: ${out}`);
          reject(new Error(`CAMERA_ERROR: ${out}`));
        } else if (code !== 0) {
          console.error(`[RealCameraAdapter] Command exited with code ${code}. Stdout: ${out}, Stderr: ${stderr.trim()}`);
          reject(new Error(`COMMAND_FAILED_WITH_CODE_${code}`));
        } else {
          resolve();
        }
      });
      
      child.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
    });
  }

  private async waitForFile(filePath: string, timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    const pollInterval = config.filePollIntervalMs || 250;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const stats = await fs.stat(filePath);
        if (stats.size > 0) {
          // Additional slight delay to ensure the file is completely flushed to disk by digiCamControl
          await new Promise(r => setTimeout(r, 500)); 
          const finalStats = await fs.stat(filePath);
          if (finalStats.size === stats.size) {
            return;
          }
        }
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }
      await new Promise(r => setTimeout(r, pollInterval));
    }

    throw new Error('TIMEOUT');
  }

  private async verifyJpeg(filePath: string): Promise<void> {
    const fileHandle = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(2);
      await fileHandle.read(buffer, 0, 2, 0);
      if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
        throw new Error('INVALID_JPEG');
      }
    } finally {
      await fileHandle.close();
    }
  }

  private ensureLiveView(): void {
    try {
      const req = http.get('http://127.0.0.1:5513/api?CMD=LiveView_Start', () => {});
      req.on('error', () => {});
      req.setTimeout(500, () => req.destroy());
    } catch {}
  }

  private createErrorResult(sessionId: string, photoIndex: number, errorMsg: string): CaptureResult {
    return {
      success: false,
      sessionId,
      photoIndex,
      filePath: '',
      capturedAt: new Date().toISOString(),
      error: errorMsg
    };
  }
}
