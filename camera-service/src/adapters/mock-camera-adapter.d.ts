import { CameraAdapter } from './camera-adapter';
import { CameraStatus, CaptureResult } from '../types/camera-types';
export declare class MockCameraAdapter implements CameraAdapter {
    private status;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    getStatus(): Promise<CameraStatus>;
    isReady(): Promise<boolean>;
    capture(sessionId: string, photoIndex: number): Promise<CaptureResult>;
}
//# sourceMappingURL=mock-camera-adapter.d.ts.map