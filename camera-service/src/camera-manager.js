"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CameraManager = void 0;
const mock_camera_adapter_1 = require("./adapters/mock-camera-adapter");
const real_camera_adapter_1 = require("./adapters/real-camera-adapter");
const config_1 = require("./config");
class CameraManager {
    adapter;
    mockAdapter;
    isCapturing = false;
    constructor() {
        this.mockAdapter = new mock_camera_adapter_1.MockCameraAdapter();
        if (config_1.config.adapter === 'real') {
            this.adapter = new real_camera_adapter_1.RealCameraAdapter();
        }
        else if (config_1.config.adapter === 'mock') {
            this.adapter = this.mockAdapter;
        }
        else {
            console.warn(`[CameraManager] Adapter '${config_1.config.adapter}' unknown. Falling back to mock.`);
            this.adapter = this.mockAdapter;
        }
    }
    async connect() {
        try {
            await this.adapter.connect();
        }
        catch (e) {
            console.warn('[CameraManager] Real adapter connect warning:', e?.message);
        }
    }
    async disconnect() {
        try {
            await this.adapter.disconnect();
        }
        catch { }
    }
    async getStatus() {
        if (config_1.config.adapter === 'real') {
            try {
                const s = await this.adapter.getStatus();
                if (s === 'ready' || s === 'capturing') {
                    return s;
                }
            }
            catch { }
            // Fallback: report ready so kiosk testing/session doesn't freeze when testing without DSLR
            return 'ready';
        }
        return this.adapter.getStatus();
    }
    async capture(sessionId, photoIndex) {
        if (this.isCapturing) {
            throw new Error('CAMERA_BUSY');
        }
        if (!sessionId || sessionId.trim() === '') {
            throw new Error('INVALID_SESSION_ID');
        }
        if (![1, 2, 3].includes(photoIndex)) {
            throw new Error('INVALID_PHOTO_INDEX');
        }
        this.isCapturing = true;
        try {
            if (config_1.config.adapter === 'real') {
                const isReady = await this.adapter.isReady();
                if (isReady) {
                    try {
                        const result = await this.adapter.capture(sessionId, photoIndex);
                        if (result.success)
                            return result;
                        console.warn(`[CameraManager] Real capture attempt 1 failed (${result.error}), retrying...`);
                        const retryResult = await this.adapter.capture(sessionId, photoIndex);
                        if (retryResult.success)
                            return retryResult;
                    }
                    catch (realErr) {
                        console.warn(`[CameraManager] Real capture exception (${realErr?.message}), retrying...`);
                        try {
                            const retryResult = await this.adapter.capture(sessionId, photoIndex);
                            if (retryResult.success)
                                return retryResult;
                        }
                        catch { }
                    }
                }
                console.log(`[CameraManager] DSLR offline or capture unavailable. Capturing photo ${photoIndex} via mock fallback...`);
                return await this.mockAdapter.capture(sessionId, photoIndex);
            }
            else {
                return await this.adapter.capture(sessionId, photoIndex);
            }
        }
        finally {
            this.isCapturing = false;
        }
    }
}
exports.CameraManager = CameraManager;
//# sourceMappingURL=camera-manager.js.map