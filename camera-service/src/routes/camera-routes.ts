import { Router, Request, Response } from 'express';
import { CameraManager } from '../camera-manager';

export function createCameraRoutes(cameraManager: CameraManager): Router {
  const router = Router();

  router.get('/health', (req: Request, res: Response) => {
    res.json({
      ok: true,
      service: 'camera-service'
    });
  });

  router.get('/status', async (req: Request, res: Response) => {
    try {
      const status = await cameraManager.getStatus();
      res.json({
        status,
        connected: status !== 'disconnected'
      });
    } catch (error: any) {
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
  });

  router.post('/connect', async (req: Request, res: Response) => {
    try {
      await cameraManager.connect();
      res.json({ success: true, message: 'Camera connecting/connected' });
    } catch (error: any) {
      res.status(500).json({ error: 'CAMERA_CONNECTION_FAILED', message: error.message });
    }
  });

  router.post('/disconnect', async (req: Request, res: Response) => {
    try {
      await cameraManager.disconnect();
      res.json({ success: true, message: 'Camera disconnected' });
    } catch (error: any) {
      res.status(500).json({ error: 'CAMERA_DISCONNECT_FAILED', message: error.message });
    }
  });

  router.post('/capture', async (req: Request, res: Response) => {
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
    } catch (error: any) {
      const errorMessage = error.message || 'CAPTURE_FAILED';
      let statusCode = 500;

      if (errorMessage === 'CAMERA_BUSY') statusCode = 409;
      if (errorMessage === 'CAMERA_NOT_READY') statusCode = 503;
      if (errorMessage === 'INVALID_SESSION_ID' || errorMessage === 'INVALID_PHOTO_INDEX') statusCode = 400;

      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
    }
  });

  return router;
}
