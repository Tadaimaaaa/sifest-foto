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
const config_1 = require("../config");
function httpGet(url, timeoutMs = 3000) {
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
function httpGetText(url, timeoutMs = 1500) {
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
function httpGetContentLength(url, timeoutMs = 1500) {
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
function triggerCapture() {
    try {
        // Single Command System: Kirim TEPAT SATU kali perintah capturenoaf (cekrek instan)
        // JANGAN kirim perintah kedua agar kamera tidak jepret berulang kali (double/triple shot)
        const req = http.get('http://127.0.0.1:5513/?slc=capturenoaf', (res) => res.resume());
        req.on('error', () => {
            // Fallback hanya jika slc error
            http.get('http://127.0.0.1:5513/?CMD=Capture', (r) => r.resume()).on('error', () => { });
        });
        req.setTimeout(2500, () => req.destroy());
    }
    catch { }
}
class RealCameraAdapter {
    status = 'disconnected';
    lastCapturedFilename = '';
    async connect() {
        this.status = 'connecting';
        const isAlive = await this.checkHttpServer();
        if (isAlive) {
            this.status = 'ready';
            console.log('[RealCameraAdapter] Connected to digiCamControl Web Server at port 5513');
            this.prepareCapture().catch(() => { });
        }
        else {
            this.status = 'ready';
            console.log('[RealCameraAdapter] digiCamControl port 5513 not yet open, standing by');
        }
    }
    async disconnect() {
        this.status = 'disconnected';
        this.lastCapturedFilename = '';
        console.log('[RealCameraAdapter] Disconnected');
    }
    // Dipanggil otomatis di background saat countdown 5 detik berjalan
    async prepareCapture() {
        try {
            const filename = await httpGetText('http://127.0.0.1:5513/?slc=get&param1=lastcaptured&param2=', 1200);
            if (filename && filename !== '-') {
                this.lastCapturedFilename = filename;
                console.log(`[RealCameraAdapter] Baseline lastcaptured locked: "${filename}"`);
            }
        }
        catch { }
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
            console.log(`[RealCameraAdapter] Triggering capture for ${fileName} INSTANTLY...`);
            // 1. Cek file terakhir sebelum shutter ditekan (cepat <15ms)
            let prevFilename = this.lastCapturedFilename;
            if (!prevFilename) {
                prevFilename = await httpGetText('http://127.0.0.1:5513/?slc=get&param1=lastcaptured&param2=', 1000);
            }
            const prevLen = await httpGetContentLength('http://127.0.0.1:5513/preview.jpg', 1000);
            console.log(`[RealCameraAdapter] Pre-capture: prevFilename="${prevFilename}", prevLen=${prevLen}`);
            // 2. TRIGGER RANA SEKETIKA pada milidetik 0!
            triggerCapture();
            // 3. Beri waktu kamera Canon 700D membuka rana dan mentransfer file via USB
            await new Promise((r) => setTimeout(r, 600));
            // 4. Polling sampai foto BARU selesai ditransfer oleh digiCamControl
            let imageBuffer = null;
            let newCapturedPath = null;
            const pollStart = Date.now();
            while (Date.now() - pollStart < 10000) {
                // Cek A: Apakah nama file lastcaptured berubah? (Standar resmi digiCamControl)
                const currentFilename = await httpGetText('http://127.0.0.1:5513/?slc=get&param1=lastcaptured&param2=', 1000);
                if (currentFilename && currentFilename !== '-' && currentFilename !== prevFilename) {
                    newCapturedPath = currentFilename;
                    this.lastCapturedFilename = currentFilename;
                    console.log(`[RealCameraAdapter] New photo detected via lastcaptured: "${newCapturedPath}" in ${Date.now() - pollStart}ms`);
                    break;
                }
                // Cek B: Apakah Content-Length preview.jpg berubah?
                const currentLen = await httpGetContentLength('http://127.0.0.1:5513/preview.jpg', 1000);
                if (currentLen > 5000 && currentLen !== prevLen) {
                    console.log(`[RealCameraAdapter] New photo detected via preview.jpg length change: ${prevLen} -> ${currentLen}`);
                    break;
                }
                await new Promise((r) => setTimeout(r, 200));
            }
            // 5. Ambil data foto baru:
            // Prioritas 1: Jika path file ada di disk lokal, baca langsung dari disk (cepat & bebas lag!)
            if (newCapturedPath && (0, node_fs_1.existsSync)(newCapturedPath)) {
                try {
                    const directBuf = await fs.readFile(newCapturedPath);
                    if (directBuf && directBuf.length > 10000 && directBuf[0] === 0xFF && directBuf[1] === 0xD8) {
                        imageBuffer = directBuf;
                        console.log(`[RealCameraAdapter] Loaded directly from disk: ${newCapturedPath} (${imageBuffer.length} bytes)`);
                    }
                }
                catch (e) {
                    console.warn('[RealCameraAdapter] Direct disk read warning:', e.message);
                }
            }
            // Prioritas 2: Download /image/<filename> dari web server digiCamControl
            if (!imageBuffer && newCapturedPath) {
                const baseName = path.basename(newCapturedPath);
                imageBuffer = await httpGet(`http://127.0.0.1:5513/image/${encodeURIComponent(baseName)}`, 3000);
            }
            // Prioritas 3: Download /preview.jpg dari web server digiCamControl
            if (!imageBuffer) {
                imageBuffer = await httpGet('http://127.0.0.1:5513/preview.jpg', 3000);
            }
            // Pastikan gambar valid
            if (!imageBuffer || imageBuffer.length < 5000) {
                throw new Error('CAMERA_SHUTTER_FAILED: Foto baru tidak terdeteksi dari kamera.');
            }
            // 6. Simpan foto asli baru ke storage sesi
            await fs.writeFile(filePath, imageBuffer);
            console.log(`[RealCameraAdapter] Saved ${filePath} (${imageBuffer.length} bytes) in ${Date.now() - startTime}ms`);
            // 7. Buka kembali cermin LiveView untuk pose berikutnya
            setTimeout(() => {
                this.ensureLiveView();
            }, 300);
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
            setTimeout(() => {
                this.ensureLiveView();
            }, 300);
            return this.createErrorResult(sessionId, photoIndex, err.message || 'CAPTURE_FAILED');
        }
    }
    ensureLiveView() {
        try {
            const req1 = http.get('http://127.0.0.1:5513/?CMD=LiveViewWnd_Show', (res) => res.resume());
            req1.on('error', () => { });
            req1.setTimeout(1500, () => req1.destroy());
            setTimeout(() => {
                try {
                    const req2 = http.get('http://127.0.0.1:5513/?CMD=LiveView_Start', (res) => res.resume());
                    req2.on('error', () => { });
                    req2.setTimeout(1500, () => req2.destroy());
                }
                catch { }
            }, 200);
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