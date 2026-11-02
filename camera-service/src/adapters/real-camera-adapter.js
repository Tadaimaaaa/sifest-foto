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
const fs = __importStar(require("node:fs/promises"));
const node_fs_1 = require("node:fs");
const path = __importStar(require("node:path"));
const http = __importStar(require("node:http"));
const node_child_process_1 = require("node:child_process");
const config_1 = require("../config");
function httpGet(url, timeoutMs = 5000) {
    return new Promise((resolve) => {
        const req = http.get(url, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                return resolve(null);
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', () => resolve(null));
        req.setTimeout(timeoutMs, () => {
            req.destroy();
            resolve(null);
        });
    });
}
function httpGetText(url, timeoutMs = 2000) {
    return new Promise((resolve) => {
        const req = http.get(url, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8').trim()));
        });
        req.on('error', () => resolve(''));
        req.setTimeout(timeoutMs, () => {
            req.destroy();
            resolve('');
        });
    });
}
function httpGetContentLength(url, timeoutMs = 2000) {
    return new Promise((resolve) => {
        const req = http.request(url, { method: 'HEAD', timeout: timeoutMs }, (res) => {
            res.resume();
            const len = parseInt(res.headers['content-length'] || '0', 10);
            resolve(len);
        });
        req.on('error', () => resolve(0));
        req.on('timeout', () => {
            req.destroy();
            resolve(0);
        });
        req.end();
    });
}
async function triggerShutter() {
    // Method 1: HTTP ?CMD=Capture (standard digiCamControl web server command)
    const httpSuccess = await new Promise((resolve) => {
        const req = http.get('http://127.0.0.1:5513/?CMD=Capture', (res) => {
            res.resume();
            resolve(res.statusCode === 200);
        });
        req.on('error', (err) => {
            console.warn('[RealCameraAdapter] HTTP Capture error:', err.message);
            resolve(false);
        });
        req.setTimeout(5000, () => {
            req.destroy();
            console.warn('[RealCameraAdapter] HTTP Capture timed out after 5s');
            resolve(false);
        });
    });
    if (httpSuccess) {
        console.log('[RealCameraAdapter] Shutter command (?CMD=Capture) accepted by digiCamControl');
        return true;
    }
    // Method 2: CLI fallback using CameraControlCmd.exe
    const cliPaths = [
        'C:\\Program Files (x86)\\digiCamControl\\CameraControlCmd.exe',
        'C:\\Program Files\\digiCamControl\\CameraControlCmd.exe'
    ];
    const cliPath = cliPaths.find(p => (0, node_fs_1.existsSync)(p));
    if (cliPath) {
        try {
            console.log(`[RealCameraAdapter] Triggering via CLI: ${cliPath} /capturenoaf`);
            await new Promise((resolve) => {
                (0, node_child_process_1.exec)(`"${cliPath}" /capturenoaf`, { timeout: 5000 }, (err) => {
                    if (err)
                        console.warn('[RealCameraAdapter] CLI capture warning:', err.message);
                    resolve();
                });
            });
            return true;
        }
        catch (e) {
            console.warn('[RealCameraAdapter] CLI capture failed:', e.message);
        }
    }
    return false;
}
class RealCameraAdapter {
    status = 'disconnected';
    async connect() {
        this.status = 'connecting';
        const isAlive = await this.checkHttpServer();
        if (isAlive) {
            this.status = 'ready';
            console.log('[RealCameraAdapter] Connected to digiCamControl Web Server at port 5513');
        }
        else {
            this.status = 'ready'; // ready for capture attempt or fallback
            console.log('[RealCameraAdapter] digiCamControl port 5513 not yet open, standing by');
        }
    }
    async disconnect() {
        this.status = 'disconnected';
        console.log('[RealCameraAdapter] Disconnected');
    }
    async checkHttpServer() {
        return new Promise((resolve) => {
            const req = http.get('http://127.0.0.1:5513/', { timeout: 1000 }, (res) => {
                res.resume();
                resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => {
                req.destroy();
                resolve(false);
            });
        });
    }
    async getStatus() {
        if (this.status === 'capturing')
            return 'capturing';
        try {
            const isAlive = await this.checkHttpServer();
            if (isAlive) {
                this.status = 'ready';
            }
            else {
                this.status = 'disconnected';
            }
        }
        catch {
            this.status = 'disconnected';
        }
        return this.status;
    }
    async isReady() {
        const s = await this.getStatus();
        return s === 'ready';
    }
    async capture(sessionId, photoIndex) {
        this.status = 'capturing';
        const startTime = Date.now();
        try {
            const absoluteStoragePath = path.resolve(process.cwd(), config_1.config.storagePath);
            const sessionDir = path.join(absoluteStoragePath, 'sessions', sessionId, 'original');
            await fs.mkdir(sessionDir, { recursive: true });
            const fileName = `photo-${photoIndex}.jpg`;
            const filePath = path.join(sessionDir, fileName);
            console.log(`[RealCameraAdapter] Triggering capture for ${fileName}...`);
            // 1. Cek file terakhir sebelum shutter ditekan (menggunakan SLC ringan / HEAD - instant <10ms)
            const prevFilename = await httpGetText('http://127.0.0.1:5513/?slc=get&param1=lastcaptured&param2=', 1500);
            const prevLen = await httpGetContentLength('http://127.0.0.1:5513/preview.jpg', 1500);
            console.log(`[RealCameraAdapter] Pre-capture: lastcaptured="${prevFilename}", previewLen=${prevLen}`);
            // 2. Kirim perintah shutter ke digiCamControl
            await triggerShutter();
            // Beri jeda kamera melakukan eksposur shutter
            await new Promise((r) => setTimeout(r, 800));
            // 3. Polling sampai foto baru berhasil dideteksi
            let imageBuffer = null;
            let newCapturedPath = null;
            const pollStart = Date.now();
            while (Date.now() - pollStart < 12000) {
                // Cek A: Apakah path lastcaptured berubah?
                const currentFilename = await httpGetText('http://127.0.0.1:5513/?slc=get&param1=lastcaptured&param2=', 1500);
                if (currentFilename && currentFilename !== prevFilename && currentFilename !== '-') {
                    newCapturedPath = currentFilename;
                    console.log(`[RealCameraAdapter] New photo detected via lastcaptured: ${newCapturedPath}`);
                    break;
                }
                // Cek B: Apakah Content-Length preview.jpg berubah?
                const currentLen = await httpGetContentLength('http://127.0.0.1:5513/preview.jpg', 1500);
                if (currentLen > 5000 && currentLen !== prevLen) {
                    console.log(`[RealCameraAdapter] New photo detected via preview.jpg length change: ${prevLen} -> ${currentLen}`);
                    break;
                }
                await new Promise((r) => setTimeout(r, 350));
            }
            // 4. Ambil data foto baru:
            // Prioritas 1: Jika lastcaptured mengembalikan path file lokal yang valid di disk, baca langsung dari disk (cepat & bebas lag!)
            if (newCapturedPath && (0, node_fs_1.existsSync)(newCapturedPath)) {
                try {
                    const directBuf = await fs.readFile(newCapturedPath);
                    if (directBuf && directBuf.length > 10000 && directBuf[0] === 0xFF && directBuf[1] === 0xD8) {
                        imageBuffer = directBuf;
                        console.log(`[RealCameraAdapter] Loaded directly from disk: ${newCapturedPath} (${imageBuffer.length} bytes)`);
                    }
                }
                catch (e) {
                    console.warn('[RealCameraAdapter] Failed reading direct disk file, falling back to HTTP preview.jpg:', e.message);
                }
            }
            // Prioritas 2: Download /preview.jpg dari web server digiCamControl
            if (!imageBuffer) {
                imageBuffer = await httpGet('http://127.0.0.1:5513/preview.jpg', 6000);
            }
            if (!imageBuffer || imageBuffer.length < 5000) {
                throw new Error('FAILED_TO_DOWNLOAD_PHOTO_FROM_DIGICAMCONTROL');
            }
            // 5. Simpan foto asli baru ke storage sesi
            await fs.writeFile(filePath, imageBuffer);
            console.log(`[RealCameraAdapter] Saved ${filePath} (${imageBuffer.length} bytes) in ${Date.now() - startTime}ms`);
            // 6. Buka kembali cermin LiveView untuk pose berikutnya
            await this.ensureLiveView();
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
            this.status = 'ready';
            await this.ensureLiveView();
            return this.createErrorResult(sessionId, photoIndex, err.message || 'CAPTURE_FAILED');
        }
    }
    async ensureLiveView() {
        try {
            http.get('http://127.0.0.1:5513/?CMD=LiveViewWnd_Show', (res) => res.resume()).on('error', () => { });
            await new Promise(r => setTimeout(r, 200));
            http.get('http://127.0.0.1:5513/?CMD=LiveView_Start', (res) => res.resume()).on('error', () => { });
        }
        catch { }
    }
    createErrorResult(sessionId, photoIndex, errorMsg) {
        return {
            success: false,
            sessionId,
            photoIndex,
            filePath: '',
            capturedAt: new Date().toISOString(),
            error: errorMsg,
        };
    }
}
exports.RealCameraAdapter = RealCameraAdapter;
//# sourceMappingURL=real-camera-adapter.js.map