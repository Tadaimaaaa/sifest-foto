import { cameraClient } from './camera-client';
import http from 'http';

function wakeUpLiveView(): void {
  try {
    const req = http.get('http://127.0.0.1:5513/api?CMD=LiveView_Start', () => {});
    req.on('error', () => {});
    req.setTimeout(500, () => req.destroy());
  } catch {}
}

export type SessionState = 
  | 'IDLE'
  | 'SESSION_STARTED'
  | 'PHOTO_1_COUNTDOWN'
  | 'PHOTO_1_CAPTURE'
  | 'PHOTO_1_WAIT_READY'
  | 'PHOTO_2_COUNTDOWN'
  | 'PHOTO_2_CAPTURE'
  | 'PHOTO_2_WAIT_READY'
  | 'PHOTO_3_COUNTDOWN'
  | 'PHOTO_3_CAPTURE'
  | 'PHOTO_3_WAIT_READY'
  | 'PROCESSING'
  | 'COMPLETE'
  | 'ABORTED'
  | 'ERROR';

export interface PhotoboothSession {
  id: string;
  templateId: string;
  status: 'active' | 'completed' | 'abandoned' | 'error';
  currentPhoto: number;
  photo1Path?: string;
  photo2Path?: string;
  photo3Path?: string;
  createdAt: string;
  updatedAt: string;
}

type EventCallback = (event: string, payload?: any) => void;

export class SessionManager {
  private activeSession: PhotoboothSession | null = null;
  private state: SessionState = 'IDLE';
  private broadcast: EventCallback;
  private abortController: AbortController | null = null;
  private autoResetTimeout: NodeJS.Timeout | null = null;

  constructor(broadcast: EventCallback) {
    this.broadcast = broadcast;
  }

  public getActiveSession(): PhotoboothSession | null {
    return this.activeSession;
  }

  public getState(): SessionState {
    return this.state;
  }

  public async startSession(templateId: string): Promise<PhotoboothSession> {
    if (this.activeSession && this.state !== 'IDLE') {
      throw new Error('SESSION_ALREADY_ACTIVE');
    }

    const dateStr = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 8);
    const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const sessionId = `SIFEST-${dateStr}-${randomNum}`;

    this.activeSession = {
      id: sessionId,
      templateId,
      status: 'active',
      currentPhoto: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.state = 'SESSION_STARTED';
    this.broadcast('session:created', { session: this.activeSession });

    console.log(`[Session] Created ${sessionId}`);
    wakeUpLiveView();

    // Start flow asynchronously
    this.runSessionFlow().catch((err) => {
      console.error(`[Session] Flow error:`, err);
      this.handleError(err.message);
    });

    return this.activeSession;
  }

  public abortSession() {
    if (!this.activeSession) return;
    
    console.log(`[Session] Aborting ${this.activeSession.id}`);
    
    if (this.abortController) {
      this.abortController.abort();
    }
    
    this.activeSession.status = 'abandoned';
    this.state = 'ABORTED';
    this.broadcast('session:updated', { session: this.activeSession });
    this.broadcast('session:error', { error: 'SESSION_ABORTED' });
    
    setTimeout(() => this.reset(), 1000);
  }

  public resetSession() {
    console.log('[Session] Reset requested by client');
    this.reset();
  }

  private reset() {
    if (this.autoResetTimeout) {
      clearTimeout(this.autoResetTimeout);
      this.autoResetTimeout = null;
    }
    this.activeSession = null;
    this.state = 'IDLE';
    this.abortController = null;
    wakeUpLiveView();
    this.broadcast('session:reset');
    this.broadcast('session:updated', { session: null });
  }

  private handleError(message: string) {
    if (!this.activeSession) return;
    this.activeSession.status = 'error';
    this.state = 'ERROR';
    this.broadcast('session:updated', { session: this.activeSession });
    this.broadcast('session:error', { error: message });
    setTimeout(() => this.reset(), 5000);
  }

  private async sleep(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('ABORTED'));
      const timeout = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new Error('ABORTED'));
        });
      }
    });
  }

  private async waitForCameraReady(signal: AbortSignal) {
    let status = await cameraClient.getStatus();
    while (status !== 'ready') {
      if (signal.aborted) throw new Error('ABORTED');
      
      if (status === 'disconnected') {
        throw new Error('CAMERA_DISCONNECTED');
      }
      if (status === 'error') {
        throw new Error('CAMERA_ERROR');
      }
      
      await this.sleep(500, signal);
      status = await cameraClient.getStatus();
    }
  }

  private async runCountdown(photoIndex: number, signal: AbortSignal) {
    this.broadcast('countdown:start', { photoIndex, duration: 5, remaining: 5 });
    
    for (let i = 5; i >= 1; i--) {
      if (signal.aborted) throw new Error('ABORTED');
      this.broadcast('countdown:tick', { photoIndex, remaining: i });
      await this.sleep(1000, signal);
    }
  }

  private async runSessionFlow() {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const session = this.activeSession!;

    try {
      for (let i = 1; i <= 3; i++) {
        session.currentPhoto = i;
        this.broadcast('session:updated', { session });

        // Wait ready
        this.state = `PHOTO_${i}_WAIT_READY` as SessionState;
        console.log(`[Session] Waiting camera ready`);
        await this.waitForCameraReady(signal);

        // Countdown
        this.state = `PHOTO_${i}_COUNTDOWN` as SessionState;
        console.log(`[Session] Photo ${i} countdown started`);
        await this.runCountdown(i, signal);

        // Capture
        this.state = `PHOTO_${i}_CAPTURE` as SessionState;
        this.broadcast('countdown:capture', { photoIndex: i });
        console.log(`[Session] Photo ${i} captured trigger`);

        const result = await cameraClient.capture(session.id, i);
        if (!result.success) {
          throw new Error('CAPTURE_FAILED');
        }

        const photoUrl = `/api/image/${session.id}/photo-${i}?t=${Date.now()}`;
        console.log(`[Session] Photo ${i} captured successfully: ${photoUrl}`);
        this.broadcast('countdown:captured', { photoIndex: i, success: true, photoUrl });
        
        if (i === 1) session.photo1Path = result.filePath;
        if (i === 2) session.photo2Path = result.filePath;
        if (i === 3) session.photo3Path = result.filePath;
        
        session.currentPhoto = i;
        session.updatedAt = new Date().toISOString();
        this.broadcast('session:updated', { session });
      }

      this.state = 'PROCESSING';
      console.log(`[Session] Processing`);
      this.broadcast('processing:started', { sessionId: session.id });
      
      try {
        delete require.cache[require.resolve('./compositor')];
      } catch {}
      const { processSession } = await import('./compositor');
      
      try {
        await processSession({
          sessionId: session.id,
          templateId: session.templateId,
          storagePath: process.env.STORAGE_PATH || '../storage'
        });
      } catch (compErr: any) {
        throw new Error(`COMPOSITING_ERROR: ${compErr.message}`);
      }
      
      // Add to offline-first upload queue
      const { uploadQueue } = await import('./upload-queue');
      const token = uploadQueue.addJob(session.id);
      
      // Trigger worker in background without awaiting
      import('./upload-worker').then(m => m.processUploadQueue().catch(console.error));
      
      session.status = 'completed';
      session.updatedAt = new Date().toISOString();
      (session as any).downloadToken = token; // attach token for UI to generate QR
      
      this.state = 'COMPLETE';
      console.log(`[Session] Complete. Token: ${token}`);
      
      this.broadcast('processing:complete', { session });
      this.broadcast('session:updated', { session });

      if (this.autoResetTimeout) {
        clearTimeout(this.autoResetTimeout);
      }
      this.autoResetTimeout = setTimeout(() => {
        console.log(`[Session] Completed session timed out after 120s, resetting automatically`);
        this.reset();
      }, 120000);

    } catch (error: any) {
      if (error.message !== 'ABORTED') {
        this.handleError(error.message);
      }
    }
  }
}
