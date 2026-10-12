import { CameraAdapter } from './adapters/camera-adapter';
import { MockCameraAdapter } from './adapters/mock-camera-adapter';
import { RealCameraAdapter } from './adapters/real-camera-adapter';
import { CameraStatus, CaptureResult } from './types/camera-types';
import { config } from './config';

export class CameraManager {
  private adapter: CameraAdapter;
  private isCapturing: boolean = false;

  constructor() {
    if (config.adapter === 'real') {
      this.adapter = new RealCameraAdapter();
    } else if (config.adapter === 'mock') {
      this.adapter = new MockCameraAdapter();
    } else {
      console.warn(`[CameraManager] Adapter '${config.adapter}' unknown. Falling back to mock.`);
      this.adapter = new MockCameraAdapter();
    }
  }

  async connect(): Promise<void> {
    await this.adapter.connect();
  }

  async disconnect(): Promise<void> {
    await this.adapter.disconnect();
  }

  async getStatus(): Promise<CameraStatus> {
    return this.adapter.getStatus();
  }

  async capture(sessionId: string, photoIndex: number): Promise<CaptureResult> {
    if (this.isCapturing) {
      throw new Error('CAMERA_BUSY');
    }

    if (!sessionId || sessionId.trim() === '') {
      throw new Error('INVALID_SESSION_ID');
    }

    if (![1, 2, 3].includes(photoIndex)) {
      throw new Error('INVALID_PHOTO_INDEX');
    }

    const isReady = await this.adapter.isReady();
    if (!isReady) {
      throw new Error('CAMERA_NOT_READY');
    }

    this.isCapturing = true;

    try {
      const result = await this.adapter.capture(sessionId, photoIndex);
      return result;
    } finally {
      this.isCapturing = false;
    }
  }
}
