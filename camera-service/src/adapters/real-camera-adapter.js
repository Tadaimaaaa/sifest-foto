"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealCameraAdapter = void 0;
const node_child_process_1 = require("node:child_process");
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const config_1 = require("../config");
class RealCameraAdapter {
    status = 'disconnected';
    async connect() {
        this.status = 'connecting';
        try {
            // Just to verify if the executable exists
            await fs.access(config_1.config.digicamcontrolCmdPath);
            // We assume the camera is ready if GUI is running. A real check could be sending a dummy command.
            this.status = 'ready';
            console.log(`[RealCameraAdapter] Connected (Executable found at ${config_1.config.digicamcontrolCmdPath})`);
        }
        catch (err) {
            this.status = 'error';
            console.error(`[RealCameraAdapter] Failed to locate digiCamControl Remote Cmd at ${config_1.config.digicamcontrolCmdPath}`);
            throw new Error('CAMERA_COMMAND_NOT_FOUND');
        }
    }
    async disconnect() {
        this.status = 'disconnected';
        console.log('[RealCameraAdapter] Disconnected');
    }
    async getStatus() {
        return this.status;
    }
    async isReady() {
        return this.status === 'ready';
    }
    async capture(sessionId, photoIndex) {
        if (this.status !== 'ready') {
            return this.createErrorResult(sessionId, photoIndex, 'CAMERA_NOT_READY');
        }
        this.status = 'capturing';
        const startTime = Date.now();
        try {
            const sessionDir = path.join(config_1.config.storagePath, 'sessions', sessionId, 'original');
            await fs.mkdir(sessionDir, { recursive: true });
            const fileName = `photo-${photoIndex}.jpg`;
            const filePath = path.join(sessionDir, fileName);
            // Check if file already exists
            try {
                await fs.access(filePath);
                throw new Error('FILE_ALREADY_EXISTS');
            }
            catch (err) {
                if (err.code !== 'ENOENT') {
                    if (err.message === 'FILE_ALREADY_EXISTS')
                        throw err;
                    throw new Error('FILE_ACCESS_ERROR');
                }
            }
            console.log(`[RealCameraAdapter] Capturing ${fileName} to ${filePath}...`);
            // Run digiCamControl remote cmd
            // Example: CameraControlRemoteCmd.exe /c capture "C:\path\to\photo.jpg"
            const commandPath = config_1.config.digicamcontrolCmdPath;
            const args = ['/c', `capture ${filePath}`];
            await this.runCommand(commandPath, args, config_1.config.captureTimeoutMs);
            // Poll for file to be completely written
            await this.waitForFile(filePath, config_1.config.captureTimeoutMs);
            // Verify JPEG header
            await this.verifyJpeg(filePath);
            console.log(`[RealCameraAdapter] Capture successful in ${Date.now() - startTime}ms`);
            this.status = 'ready';
            return {
                success: true,
                sessionId,
                photoIndex,
                filePath,
                capturedAt: new Date().toISOString(),
            };
        }
        catch (err) {
            console.error(`[RealCameraAdapter] Capture error: ${err.message}`);
            this.status = 'error';
            setTimeout(() => {
                // Attempt to recover status if camera is still connected. For now we just reset to ready.
                if (this.status === 'error')
                    this.status = 'ready';
            }, 5000);
            let errorCode = 'CAMERA_COMMAND_FAILED';
            if (err.message === 'FILE_ALREADY_EXISTS')
                errorCode = 'FILE_ALREADY_EXISTS';
            if (err.message === 'TIMEOUT')
                errorCode = 'CAMERA_CAPTURE_TIMEOUT';
            if (err.message === 'INVALID_JPEG')
                errorCode = 'CAMERA_INVALID_IMAGE';
            return this.createErrorResult(sessionId, photoIndex, errorCode);
        }
    }
    runCommand(command, args, timeoutMs) {
        return new Promise((resolve, reject) => {
            const child = (0, node_child_process_1.spawn)(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            const timeoutId = setTimeout(() => {
                child.kill('SIGKILL');
                reject(new Error('TIMEOUT'));
            }, timeoutMs);
            child.on('close', (code) => {
                clearTimeout(timeoutId);
                if (code !== 0) {
                    console.error(`[RealCameraAdapter] Command exited with code ${code}. Stdout: ${stdout.trim()}, Stderr: ${stderr.trim()}`);
                    reject(new Error(`COMMAND_FAILED_WITH_CODE_${code}`));
                }
                else {
                    resolve();
                }
            });
            child.on('error', (err) => {
                clearTimeout(timeoutId);
                reject(err);
            });
        });
    }
    async waitForFile(filePath, timeoutMs) {
        const startTime = Date.now();
        const pollInterval = config_1.config.filePollIntervalMs || 250;
        while (Date.now() - startTime < timeoutMs) {
            try {
                const stats = await fs.stat(filePath);
                if (stats.size > 0) {
                    // Additional slight delay to ensure the file is completely flushed to disk by digiCamControl
                    await new Promise(r => setTimeout(r, 500));
                    const finalStats = await fs.stat(filePath);
                    if (finalStats.size === stats.size) {
                        return;
                    }
                }
            }
            catch (err) {
                if (err.code !== 'ENOENT') {
                    throw err;
                }
            }
            await new Promise(r => setTimeout(r, pollInterval));
        }
        throw new Error('TIMEOUT');
    }
    async verifyJpeg(filePath) {
        const fileHandle = await fs.open(filePath, 'r');
        try {
            const buffer = Buffer.alloc(2);
            await fileHandle.read(buffer, 0, 2, 0);
            if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
                throw new Error('INVALID_JPEG');
            }
        }
        finally {
            await fileHandle.close();
        }
    }
    createErrorResult(sessionId, photoIndex, errorMsg) {
        return {
            success: false,
            sessionId,
            photoIndex,
            filePath: '',
            capturedAt: new Date().toISOString(),
            error: errorMsg
        };
    }
}
exports.RealCameraAdapter = RealCameraAdapter;
//# sourceMappingURL=real-camera-adapter.js.map