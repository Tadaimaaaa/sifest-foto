import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  host: process.env.CAMERA_SERVICE_HOST || '127.0.0.1',
  port: parseInt(process.env.CAMERA_SERVICE_PORT || '3001', 10),
  adapter: process.env.CAMERA_ADAPTER || 'mock',
  storagePath: process.env.STORAGE_PATH || path.resolve(__dirname, '../../storage'),
  digicamcontrolCmdPath: process.env.DIGICAMCONTROL_REMOTE_CMD_PATH || 'C:\\Program Files (x86)\\digiCamControl\\CameraControlRemoteCmd.exe',
  captureTimeoutMs: parseInt(process.env.CAMERA_CAPTURE_TIMEOUT_MS || '15000', 10),
  filePollIntervalMs: parseInt(process.env.CAMERA_FILE_POLL_INTERVAL_MS || '250', 10),
};
