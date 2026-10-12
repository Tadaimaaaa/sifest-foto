"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const config_1 = require("./config");
const camera_manager_1 = require("./camera-manager");
const camera_routes_1 = require("./routes/camera-routes");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const cameraManager = new camera_manager_1.CameraManager();
const cameraRoutes = (0, camera_routes_1.createCameraRoutes)(cameraManager);
app.use('/', cameraRoutes);
let server;
async function startServer() {
    server = app.listen(config_1.config.port, config_1.config.host, () => {
        console.log(`[CameraService] Server started on http://${config_1.config.host}:${config_1.config.port}`);
    });
    // Graceful shutdown handling
    const shutdown = async (signal) => {
        console.log(`\n[CameraService] Received ${signal}, shutting down gracefully...`);
        // Stop receiving new connections
        server.close(async () => {
            console.log('[CameraService] HTTP server closed.');
            // Disconnect camera adapter
            try {
                await cameraManager.disconnect();
                console.log('[CameraService] Camera disconnected.');
            }
            catch (err) {
                console.error('[CameraService] Error during camera disconnect:', err);
            }
            console.log('[CameraService] Exiting process.');
            process.exit(0);
        });
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}
startServer().catch(err => {
    console.error('[CameraService] Failed to start server:', err);
    process.exit(1);
});
//# sourceMappingURL=server.js.map