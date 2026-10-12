import express from 'express';
import cors from 'cors';
import { config } from './config';
import { CameraManager } from './camera-manager';
import { createCameraRoutes } from './routes/camera-routes';

const app = express();

app.use(cors());
app.use(express.json());

const cameraManager = new CameraManager();
const cameraRoutes = createCameraRoutes(cameraManager);

app.use('/', cameraRoutes);

let server: any;

async function startServer() {
  server = app.listen(config.port, config.host, async () => {
    console.log(`[CameraService] Server started on http://${config.host}:${config.port}`);
    try {
      await cameraManager.connect();
    } catch (e) {
      console.error('[CameraService] Initial connect failed:', e);
    }
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    console.log(`\n[CameraService] Received ${signal}, shutting down gracefully...`);
    
    // Stop receiving new connections
    server.close(async () => {
      console.log('[CameraService] HTTP server closed.');
      
      // Disconnect camera adapter
      try {
        await cameraManager.disconnect();
        console.log('[CameraService] Camera disconnected.');
      } catch (err) {
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
