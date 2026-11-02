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
function triggerCapture() {
    try {
        // 1. Kirim CaptureNoAf SEKETIKA — langsung membunyikan rana (cekrek) tanpa jeda motor fokus
        const req1 = http.get('http://127.0.0.1:5513/?CMD=CaptureNoAf', (res) => res.resume());
        req1.on('error', () => { });
        req1.setTimeout(3000, () => req1.destroy());
        // 2. Cadangan Capture standar jika kamera membutuhkan sinyal shutter kedua
        setTimeout(() => {
            try {
                const req2 = http.get('http://127.0.0.1:5513/?CMD=Capture', (res) => res.resume());
                req2.on('error', () => { });
                req2.setTimeout(3000, () => req2.destroy());
            }
            catch { }
        }, 100);
    }
    catch { }
}
class RealCameraAdapter {
    status = 'disconnected';
    lastPhotoLen = 0;
    lastPhotoHead = null;
    async connect() {
        this.status = 'connecting';
        const isAlive = await this.checkHttpServer();
        if (isAlive) {
            this.status = 'ready';
            console.log('[RealCameraAdapter] Connected to digiCamControl Web Server at port 5513');
            // Catat baseline awal foto yang sedang ada di digiCamControl saat connect
            this.prepareCapture().catch(() => { });
        }
        else {
            this.status = 'ready';
            console.log('[RealCameraAdapter] digiCamControl port 5513 not yet open, standing by');
        }
    }
    async disconnect() {
        this.status = 'disconnected';
        this.lastPhotoLen = 0;
        this.lastPhotoHead = null;
        console.log('[RealCameraAdapter] Disconnected');
    }
    // Dipanggil otomatis di background saat countdown 5 detik berjalan
    // Ini mengunci ukuran foto lama ke memori SEBELUM shutter ditekan, tanpa jeda sama sekali
    async prepareCapture() {
        try {
            const current = await httpGet('http://127.0.0.1:5513/preview.jpg', 2000);
            if (current && current.length > 10000 && current[0] === 0xFF && current[1] === 0xD8) {
                this.lastPhotoLen = current.length;
                this.lastPhotoHead = current.subarray(0, 64);
                console.log(`[RealCameraAdapter] Baseline photo locked during countdown: ${this.lastPhotoLen} bytes`);
            }
            // Kirim sinyal LiveView_Focus agar kamera mengunci fokus ke orang saat berpose
            http.get('http://127.0.0.1:5513/?CMD=LiveView_Focus', (res) => res.resume()).on('error', () => { });
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
            // Kunci nilai baseline sebelum tombol jepret ditekan
            const initialBaselineLen = this.lastPhotoLen;
            const initialBaselineHead = this.lastPhotoHead;
            // 1. TRIGGER CEKREK SEKETIKA pada milidetik 0!
            triggerCapture();
            // 2. Beri waktu kamera Canon 700D membuka rana dan mentransfer file via USB
            // (Kamera DSLR butuh ~1.5 detik untuk menyelesaikan transfer USB ke laptop)
            await new Promise((r) => setTimeout(r, 1400));
            // 3. Polling sampai foto BARU benar-benar selesai ditransfer oleh digiCamControl
            let imageBuffer = null;
            const pollStart = Date.now();
            while (Date.now() - pollStart < 9000) {
                const current = await httpGet('http://127.0.0.1:5513/preview.jpg', 2500);
                if (current &&
                    current.length > 10000 &&
                    current[0] === 0xFF &&
                    current[1] === 0xD8) {
                    // Bandingkan dengan baseline foto sebelum shutter ditekan
                    if (initialBaselineLen > 0 && initialBaselineHead) {
                        // Foto BARU pasti memiliki ukuran atau byte header yang berbeda dari foto lama
                        if (current.length !== initialBaselineLen || !current.subarray(0, 64).equals(initialBaselineHead)) {
                            imageBuffer = current;
                            this.lastPhotoLen = current.length;
                            this.lastPhotoHead = current.subarray(0, 64);
                            console.log(`[RealCameraAdapter] New photo confirmed: ${current.length} bytes (was ${initialBaselineLen})`);
                            break;
                        }
                    }
                    else {
                        // Jika baseline awal kosong, tunggu minimal 2.5 detik agar transfer foto yang baru jepret selesai
                        if (Date.now() - pollStart > 2500) {
                            imageBuffer = current;
                            this.lastPhotoLen = current.length;
                            this.lastPhotoHead = current.subarray(0, 64);
                            console.log(`[RealCameraAdapter] First photo confirmed without prior baseline: ${current.length} bytes`);
                            break;
                        }
                    }
                }
                await new Promise((r) => setTimeout(r, 300));
            }
            // Safety fallback
            if (!imageBuffer) {
                const lastCheck = await httpGet('http://127.0.0.1:5513/preview.jpg', 2500);
                if (lastCheck && lastCheck.length > 10000 && lastCheck[0] === 0xFF && lastCheck[1] === 0xD8) {
                    imageBuffer = lastCheck;
                    this.lastPhotoLen = imageBuffer.length;
                    this.lastPhotoHead = imageBuffer.subarray(0, 64);
                }
            }
            if (!imageBuffer || imageBuffer.length < 5000) {
                throw new Error('FAILED_TO_DOWNLOAD_PHOTO_FROM_DIGICAMCONTROL');
            }
            // 4. Simpan foto asli baru ke storage sesi
            await fs.writeFile(filePath, imageBuffer);
            console.log(`[RealCameraAdapter] Saved ${filePath} (${imageBuffer.length} bytes) in ${Date.now() - startTime}ms`);
            // 5. Buka kembali cermin LiveView untuk pose berikutnya
            this.ensureLiveView();
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
            this.ensureLiveView();
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