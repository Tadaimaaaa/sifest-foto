"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CameraManager = void 0;
const mock_camera_adapter_1 = require("./adapters/mock-camera-adapter");
const real_camera_adapter_1 = require("./adapters/real-camera-adapter");
const config_1 = require("./config");
class CameraManager {
    adapter;
    isCapturing = false;
    constructor() {
        if (config_1.config.adapter === 'real') {
            this.adapter = new real_camera_adapter_1.RealCameraAdapter();
        }
        else if (config_1.config.adapter === 'mock') {
            this.adapter = new mock_camera_adapter_1.MockCameraAdapter();
        }
        else {
            console.warn(`[CameraManager] Adapter '${config_1.config.adapter}' unknown. Falling back to mock.`);
            this.adapter = new mock_camera_adapter_1.MockCameraAdapter();
        }
    }
    async connect() {
        await this.adapter.connect();
    }
    async disconnect() {
        await this.adapter.disconnect();
    }
    async getStatus() {
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
        const isReady = await this.adapter.isReady();
        if (!isReady) {
            throw new Error('CAMERA_NOT_READY');
        }
        this.isCapturing = true;
        try {
            const result = await this.adapter.capture(sessionId, photoIndex);
            return result;
        }
        finally {
            this.isCapturing = false;
        }
    }
}
exports.CameraManager = CameraManager;
//# sourceMappingURL=camera-manager.js.map