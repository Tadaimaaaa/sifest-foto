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
const fs = __importStar(require("node:fs/promises"));
const real_camera_adapter_1 = require("../src/adapters/real-camera-adapter");
const config_1 = require("../src/config");
async function runSmokeTest() {
    console.log('====================================================');
    console.log('   PHASE 3.1: REAL CAMERA HARDWARE SMOKE TEST');
    console.log('====================================================\n');
    console.log('[1/4] AUDIT CONFIGURATION');
    if (!config_1.config.digicamcontrolCmdPath) {
        console.error('❌ FAIL: DIGICAMCONTROL_REMOTE_CMD_PATH is not set in environment.');
        process.exit(1);
    }
    try {
        await fs.access(config_1.config.digicamcontrolCmdPath);
        console.log(`✅ EXECUTABLE FOUND: ${config_1.config.digicamcontrolCmdPath}`);
    }
    catch {
        console.error(`❌ FAIL: Executable NOT found at ${config_1.config.digicamcontrolCmdPath}`);
        console.log('Please verify digiCamControl is installed and the path is correct.');
        process.exit(1);
    }
    console.log('\n[2/4] PRE-FLIGHT CHECK');
    console.log('ATTENTION:');
    console.log('1. Pastikan kamera fisik Canon EOS 700D MENYALA dan terhubung ke PC via kabel USB.');
    console.log('2. GESER TOMBOL LENSA KE "MF" (Manual Focus). Jika berada di AF dan kamera gagal fokus, kamera akan menolak mengambil foto!');
    console.log('3. Pastikan aplikasi GUI "digiCamControl" SEDANG TERBUKA dan kamera terdeteksi di dalam aplikasi.');
    console.log('4. UBAH PENGATURAN "Compression" di panel kiri digiCamControl menjadi "JPEG" (JANGAN RAW!). Aplikasi web membutuhkan format .jpg.');
    console.log('5. Pastikan "Webserver plugin" AKTIF di pengaturan digiCamControl (Settings -> Webserver -> Enable).');
    console.log('6. JANGAN jalankan EOS Utility secara bersamaan.');
    console.log('7. Proses ini akan mengambil 1 foto sungguhan. Mohon tunggu...');
    // Pause a brief moment for the user to read
    await new Promise(r => setTimeout(r, 2000));
    console.log('\n[3/4] INITIALIZE ADAPTER');
    const adapter = new real_camera_adapter_1.RealCameraAdapter();
    try {
        await adapter.connect();
        const status = await adapter.getStatus();
        if (status !== 'ready') {
            console.error(`❌ FAIL: Adapter failed to reach 'ready' state. Current state: ${status}`);
            process.exit(1);
        }
        console.log('✅ ADAPTER READY.');
    }
    catch (err) {
        console.error(`❌ FAIL: Failed to connect adapter. Error: ${err.message}`);
        process.exit(1);
    }
    console.log('\n[4/4] CAPTURE SMOKE TEST');
    const timestamp = Date.now();
    const testSessionId = `SMOKE-TEST-${timestamp}`;
    console.log(`Triggering capture for session: ${testSessionId} (Photo Index: 1)`);
    console.log(`Timeout is set to: ${config_1.config.captureTimeoutMs}ms`);
    const captureStart = Date.now();
    try {
        const result = await adapter.capture(testSessionId, 1);
        if (result.success) {
            console.log(`✅ CAPTURE SUCCESS in ${Date.now() - captureStart}ms`);
            console.log(`📂 Saved to: ${result.filePath}`);
            // Perform a final independent check on the file
            try {
                const stats = await fs.stat(result.filePath);
                console.log(`✅ FILE VERIFIED: Size is ${stats.size} bytes`);
                // Final Output
                console.log('\n====================================================');
                console.log('   RESULT: PASS');
                console.log('====================================================');
                console.log('The hardware integration works perfectly end-to-end.');
                process.exit(0);
            }
            catch (fileErr) {
                console.error(`❌ FAIL: Photo result object returned success, but file could not be verified on disk: ${fileErr.message}`);
                process.exit(1);
            }
        }
        else {
            console.error(`❌ FAIL: Capture rejected by adapter. Error: ${result.error}`);
            console.log('\n====================================================');
            console.log('   RESULT: FAIL');
            console.log('====================================================');
            process.exit(1);
        }
    }
    catch (err) {
        console.error(`❌ FAIL: Unexpected exception during capture: ${err.message}`);
        console.log('\n====================================================');
        console.log('   RESULT: FAIL');
        console.log('====================================================');
        process.exit(1);
    }
}
runSmokeTest();
//# sourceMappingURL=smoke-test-real-camera.js.map