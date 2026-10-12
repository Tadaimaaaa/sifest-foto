export type CameraStatus = 'disconnected' | 'connecting' | 'ready' | 'capturing' | 'error';
export interface CaptureResult {
    success: boolean;
    sessionId: string;
    photoIndex: number;
    filePath: string;
    capturedAt: string;
    error?: string;
}
//# sourceMappingURL=camera-types.d.ts.map