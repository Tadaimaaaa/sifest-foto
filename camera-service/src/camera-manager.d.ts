import { CameraStatus, CaptureResult } from './types/camera-types';
export declare class CameraManager {
    private adapter;
    private isCapturing;
    constructor();
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    getStatus(): Promise<CameraStatus>;
    capture(sessionId: string, photoIndex: number): Promise<CaptureResult>;
}
//# sourceMappingURL=camera-manager.d.ts.map