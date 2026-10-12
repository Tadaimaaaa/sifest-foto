"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCameraRoutes = createCameraRoutes;
const express_1 = require("express");
function createCameraRoutes(cameraManager) {
    const router = (0, express_1.Router)();
    router.get('/health', (req, res) => {
        res.json({
            ok: true,
            service: 'camera-service'
        });
    });
    router.get('/status', async (req, res) => {
        try {
            const status = await cameraManager.getStatus();
            res.json({
                status,
                connected: status !== 'disconnected'
            });
        }
        catch (error) {
            res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
        }
    });
    router.post('/connect', async (req, res) => {
        try {
            await cameraManager.connect();
            res.json({ success: true, message: 'Camera connecting/connected' });
        }
        catch (error) {
            res.status(500).json({ error: 'CAMERA_CONNECTION_FAILED', message: error.message });
        }
    });
    router.post('/disconnect', async (req, res) => {
        try {
            await cameraManager.disconnect();
            res.json({ success: true, message: 'Camera disconnected' });
        }
        catch (error) {
            res.status(500).json({ error: 'CAMERA_DISCONNECT_FAILED', message: error.message });
        }
    });
    router.post('/capture', async (req, res) => {
        try {
            const { sessionId, photoIndex } = req.body;
            if (!sessionId) {
                return res.status(400).json({ success: false, error: 'INVALID_SESSION_ID' });
            }
            if (typeof photoIndex !== 'number' || ![1, 2, 3].includes(photoIndex)) {
                return res.status(400).json({ success: false, error: 'INVALID_PHOTO_INDEX' });
            }
            const result = await cameraManager.capture(sessionId, photoIndex);
            if (!result.success) {
                return res.status(500).json(result);
            }
            res.json(result);
        }
        catch (error) {
            const errorMessage = error.message || 'CAPTURE_FAILED';
            let statusCode = 500;
            if (errorMessage === 'CAMERA_BUSY')
                statusCode = 409;
            if (errorMessage === 'CAMERA_NOT_READY')
                statusCode = 503;
            if (errorMessage === 'INVALID_SESSION_ID' || errorMessage === 'INVALID_PHOTO_INDEX')
                statusCode = 400;
            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    });
    return router;
}
//# sourceMappingURL=camera-routes.js.map