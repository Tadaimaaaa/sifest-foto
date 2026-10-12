"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockCameraAdapter = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sharp_1 = __importDefault(require("sharp"));
const config_1 = require("../config");
class MockCameraAdapter {
    status = 'disconnected';
    async connect() {
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
    async disconnect() {
        this.status = 'disconnected';
        console.log('[MockCameraAdapter] Disconnected');
    }
    async getStatus() {
        return this.status;
    }
    async isReady() {
        return this.status === 'ready';
    }
    async capture(sessionId, photoIndex) {
        if (this.status !== 'ready') {
            throw new Error('CAMERA_NOT_READY');
        }
        this.status = 'capturing';
        console.log(`[MockCameraAdapter] Capturing photo ${photoIndex} for session ${sessionId}...`);
        try {
            // Simulate capture delay (shutter + download)
            await new Promise((resolve) => setTimeout(resolve, 800));
            const sessionDir = path_1.default.join(config_1.config.storagePath, 'captures', sessionId);
            if (!fs_1.default.existsSync(sessionDir)) {
                fs_1.default.mkdirSync(sessionDir, { recursive: true });
            }
            const filename = `photo-${photoIndex}.jpg`;
            const filePath = path_1.default.join(sessionDir, filename);
            if (fs_1.default.existsSync(filePath)) {
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
            await (0, sharp_1.default)(Buffer.from(svgText))
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
        }
        catch (error) {
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
exports.MockCameraAdapter = MockCameraAdapter;
//# sourceMappingURL=mock-camera-adapter.js.map