import { CameraAdapter } from './camera-adapter';
import { CameraStatus, CaptureResult } from '../types/camera-types';
export declare class RealCameraAdapter implements CameraAdapter {
    private status;
    private baselineLen;
    private baselineHead;
    private baselineFilename;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    prepareCapture(): Promise<void>;
    private checkHttpServer;
    getStatus(): Promise<CameraStatus>;
    isReady(): Promise<boolean>;
    capture(sessionId: string, photoIndex: number): Promise<CaptureResult>;
    private ensureLiveView;
    private createErrorResult;
}
//# sourceMappingURL=real-camera-adapter.d.ts.map