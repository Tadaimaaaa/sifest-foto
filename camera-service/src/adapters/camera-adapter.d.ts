import { CameraStatus, CaptureResult } from '../types/camera-types';
export interface CameraAdapter {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    getStatus(): Promise<CameraStatus>;
    capture(sessionId: string, photoIndex: number): Promise<CaptureResult>;
    isReady(): Promise<boolean>;
}
//# sourceMappingURL=camera-adapter.d.ts.map