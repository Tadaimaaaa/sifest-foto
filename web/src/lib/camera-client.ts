export type CameraStatus = 'disconnected' | 'connecting' | 'ready' | 'capturing' | 'error';

export interface CaptureResult {
  success: boolean;
  sessionId: string;
  photoIndex: number;
  filePath: string;
  capturedAt: string;
  error?: string;
}

const CAMERA_SERVICE_URL = process.env.CAMERA_SERVICE_URL || 'http://127.0.0.1:3001';

export class CameraClient {
  async getStatus(): Promise<CameraStatus> {
    try {
      const res = await fetch(`${CAMERA_SERVICE_URL}/status`);
      if (!res.ok) return 'disconnected';
      const data = await res.json();
      return data.status || 'disconnected';
    } catch {
      return 'disconnected';
    }
  }

  async connect(): Promise<boolean> {
    try {
      const res = await fetch(`${CAMERA_SERVICE_URL}/connect`, { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<boolean> {
    try {
      const res = await fetch(`${CAMERA_SERVICE_URL}/disconnect`, { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async capture(sessionId: string, photoIndex: number): Promise<CaptureResult> {
    try {
      const res = await fetch(`${CAMERA_SERVICE_URL}/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId, photoIndex }),
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          sessionId,
          photoIndex,
          filePath: '',
          capturedAt: new Date().toISOString(),
          error: data.error || 'CAPTURE_FAILED',
        };
      }
      return data;
    } catch (err: any) {
      return {
        success: false,
        sessionId,
        photoIndex,
        filePath: '',
        capturedAt: new Date().toISOString(),
        error: 'NETWORK_ERROR',
      };
    }
  }
}

export const cameraClient = new CameraClient();
