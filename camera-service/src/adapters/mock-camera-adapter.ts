import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { CameraAdapter } from './camera-adapter';
import { CameraStatus, CaptureResult } from '../types/camera-types';
import { config } from '../config';

export class MockCameraAdapter implements CameraAdapter {
  private status: CameraStatus = 'disconnected';

  async connect(): Promise<void> {
    if (this.status !== 'disconnected') {
      return;
    }
    this.status = 'connecting';
    console.log('[MockCameraAdapter] Connecting...');
    
    // Simulate connection delay
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    this.status = 'ready';
    console.log('[MockCameraAdapter] Connected and ready');
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
    console.log('[MockCameraAdapter] Disconnected');
  }

  async getStatus(): Promise<CameraStatus> {
    return this.status;
  }

  async isReady(): Promise<boolean> {
    return this.status === 'ready';
  }

  async capture(sessionId: string, photoIndex: number): Promise<CaptureResult> {
    if (this.status !== 'ready') {
      throw new Error('CAMERA_NOT_READY');
    }

    this.status = 'capturing';
    console.log(`[MockCameraAdapter] Capturing photo ${photoIndex} for session ${sessionId}...`);

    try {
      // Simulate capture delay (shutter + download)
      await new Promise((resolve) => setTimeout(resolve, 800));

      const absoluteStoragePath = path.resolve(process.cwd(), config.storagePath);
      const sessionDir = path.join(absoluteStoragePath, 'sessions', sessionId, 'original');
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }

      const filename = `photo-${photoIndex}.jpg`;
      const filePath = path.join(sessionDir, filename);

      if (fs.existsSync(filePath)) {
        throw new Error('FILE_ALREADY_EXISTS');
      }

      // Generate a mock JPEG using sharp
      const width = 1920;
      const height = 1280;
      
      const svgText = `
        <svg width="${width}" height="${height}">
          <rect width="100%" height="100%" fill="#0EA5E9" />
          <text x="50%" y="40%" font-family="sans-serif" font-size="80" fill="white" text-anchor="middle">SI-FEST 2026</text>
          <text x="50%" y="55%" font-family="sans-serif" font-size="60" fill="white" text-anchor="middle">Session: ${sessionId}</text>
          <text x="50%" y="65%" font-family="sans-serif" font-size="60" fill="white" text-anchor="middle">Photo: ${photoIndex} / 3</text>
          <text x="50%" y="80%" font-family="sans-serif" font-size="40" fill="white" text-anchor="middle">${new Date().toISOString()}</text>
        </svg>
      `;

      await sharp(Buffer.from(svgText))
        .jpeg({ quality: 90 })
        .toFile(filePath);

      console.log(`[MockCameraAdapter] Photo saved to ${filePath}`);

      this.status = 'ready';

      return {
        success: true,
        sessionId,
        photoIndex,
        filePath,
        capturedAt: new Date().toISOString()
      };
    } catch (error: any) {
      this.status = 'ready';
      console.error(`[MockCameraAdapter] Capture error:`, error);
      
      return {
        success: false,
        sessionId,
        photoIndex,
        filePath: '',
        capturedAt: new Date().toISOString(),
        error: error.message || 'CAPTURE_FAILED'
      };
    }
  }
}
