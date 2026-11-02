import { cameraClient } from './camera-client';
import http from 'http';

function wakeUpLiveView(): void {
  try {
    const req1 = http.get('http://127.0.0.1:5513/?CMD=LiveViewWnd_Show', (res) => res.resume());
    req1.on('error', () => {});
    req1.setTimeout(1500, () => req1.destroy());

    setTimeout(() => {
      try {
        const req2 = http.get('http://127.0.0.1:5513/?CMD=LiveView_Start', (res) => res.resume());
        req2.on('error', () => {});
        req2.setTimeout(1500, () => req2.destroy());
      } catch {}
    }, 150);
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
  | 'FILTER_SELECTION'
  | 'PROCESSING'
  | 'COMPLETE'
  | 'ABORTED'
  | 'ERROR';

export interface PhotoboothSession {
  id: string;
  templateId: string;
  filterId?: string;
  status: 'active' | 'completed' | 'abandoned' | 'error';
  currentPhoto: number;
  photo1Path?: string;
  photo2Path?: string;
  photo3Path?: string;
  hasRetaken?: boolean;
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
  private filterOrRetakeResolver: ((action: { action: 'filter'; filterId: string } | { action: 'retake'; photoIndex: number }) => void) | null = null;

  constructor(broadcast: EventCallback) {
    this.broadcast = broadcast;
  }

  public getActiveSession(): PhotoboothSession | null {
    return this.activeSession;
  }

  public applyFilter(filterId: string) {
    if (this.filterOrRetakeResolver) {
      console.log(`[Session] Filter selected by client: ${filterId}`);
      this.filterOrRetakeResolver({ action: 'filter', filterId });
      this.filterOrRetakeResolver = null;
    }
  }

  public retakePhoto(photoIndex: number) {
    if (!this.activeSession || this.activeSession.status !== 'active') return;
    if (this.activeSession.hasRetaken) {
      console.warn(`[Session] Retake already used for session ${this.activeSession.id}`);
      return;
    }
    const idx = Math.min(3, Math.max(1, photoIndex));
    if (this.filterOrRetakeResolver) {
      console.log(`[Session] Retake requested by client for photo ${idx}`);
      this.filterOrRetakeResolver({ action: 'retake', photoIndex: idx });
      this.filterOrRetakeResolver = null;
    }
  }

  public getState(): SessionState {
    return this.state;
  }

  public async startSession(templateId: string): Promise<PhotoboothSession> {
    if (this.activeSession) {
      console.log(`[Session] Existing session (${this.activeSession.id}, state: ${this.state}) detected. Auto-resetting for new session...`);
      if (this.abortController) {
        try {
          this.abortController.abort();
        } catch {}
      }
      if (this.autoResetTimeout) {
        clearTimeout(this.autoResetTimeout);
        this.autoResetTimeout = null;
      }
      if (this.filterOrRetakeResolver) {
        this.filterOrRetakeResolver({ action: 'filter', filterId: 'normal' });
        this.filterOrRetakeResolver = null;
      }
      this.activeSession = null;
      this.state = 'IDLE';
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
    cameraClient.prepareCapture().catch(() => {});

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
    if (this.filterOrRetakeResolver) {
      this.filterOrRetakeResolver({ action: 'filter', filterId: 'normal' });
      this.filterOrRetakeResolver = null;
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
    let retries = 0;
    let status = await cameraClient.getStatus();
    while (status !== 'ready') {
      if (signal.aborted) throw new Error('ABORTED');
      
      retries++;
      if (retries >= 3) {
        // If not ready after retries, proceed anyway because camera-service handles fallback
        console.warn('[Session] Camera status not ready after retries, proceeding with capture.');
        break;
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
        cameraClient.prepareCapture().catch(() => {});
        await this.runCountdown(i, signal);

        // Capture
        this.state = `PHOTO_${i}_CAPTURE` as SessionState;
        this.broadcast('countdown:capture', { photoIndex: i });
        console.log(`[Session] Photo ${i} captured trigger`);

        let result = await cameraClient.capture(session.id, i);
        if (!result.success) {
          console.warn(`[Session] Photo ${i} capture failed, attempting immediate 1x retry...`);
          await this.sleep(800, signal);
          result = await cameraClient.capture(session.id, i);
        }
        if (!result.success) {
          throw new Error((result as any).error || 'CAPTURE_FAILED');
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

      let chosenFilter = 'normal';

      while (true) {
        if (signal.aborted) throw new Error('ABORTED');

        // Enter Filter Selection State
        this.state = 'FILTER_SELECTION';
        console.log(`[Session] Waiting for user filter selection or retake (hasRetaken: ${Boolean(session.hasRetaken)})...`);
        this.broadcast('session:filter_selection', { sessionId: session.id, hasRetaken: Boolean(session.hasRetaken) });
        this.broadcast('session:updated', { session });

        type FilterOrRetakeAction = 
          | { action: 'filter'; filterId: string }
          | { action: 'retake'; photoIndex: number };

        let filterTimer: NodeJS.Timeout | null = null;

        const choice = await new Promise<FilterOrRetakeAction>((resolve) => {
          this.filterOrRetakeResolver = resolve;
          // Auto-advance with 'normal' if user doesn't pick in 35 seconds
          filterTimer = setTimeout(() => {
            console.log(`[Session] Filter selection timed out after 35s, defaulting to normal`);
            resolve({ action: 'filter', filterId: 'normal' });
          }, 35000);
          signal.addEventListener('abort', () => {
            if (filterTimer) clearTimeout(filterTimer);
            resolve({ action: 'filter', filterId: 'normal' });
          });
        });

        if (filterTimer) clearTimeout(filterTimer);
        this.filterOrRetakeResolver = null;

        if (choice.action === 'retake') {
          const k = Math.min(3, Math.max(1, choice.photoIndex));
          console.log(`[Session] Executing single-frame retake for photo ${k}...`);
          session.hasRetaken = true;
          session.currentPhoto = k;
          this.broadcast('session:updated', { session });

          // Wait ready
          this.state = `PHOTO_${k}_WAIT_READY` as SessionState;
          console.log(`[Session] Retake: Waiting camera ready`);
          await this.waitForCameraReady(signal);

          // Countdown
          this.state = `PHOTO_${k}_COUNTDOWN` as SessionState;
          console.log(`[Session] Retake: Photo ${k} countdown started`);
          cameraClient.prepareCapture().catch(() => {});
          this.broadcast('countdown:start', { photoIndex: k, duration: 5, remaining: 5, isRetake: true });

          for (let s = 5; s >= 1; s--) {
            if (signal.aborted) throw new Error('ABORTED');
            this.broadcast('countdown:tick', { photoIndex: k, remaining: s, isRetake: true });
            await this.sleep(1000, signal);
          }

          // Capture
          this.state = `PHOTO_${k}_CAPTURE` as SessionState;
          this.broadcast('countdown:capture', { photoIndex: k, isRetake: true });
          console.log(`[Session] Retake: Photo ${k} captured trigger`);

          let captureResult = await cameraClient.capture(session.id, k);
          if (!captureResult.success) {
            console.warn(`[Session] Retake photo ${k} capture failed, attempting immediate 1x retry...`);
            await this.sleep(800, signal);
            captureResult = await cameraClient.capture(session.id, k);
          }
          if (!captureResult.success) {
            throw new Error((captureResult as any).error || 'CAPTURE_FAILED');
          }

          const photoUrl = `/api/image/${session.id}/photo-${k}?t=${Date.now()}`;
          console.log(`[Session] Retake: Photo ${k} captured successfully: ${photoUrl}`);
          this.broadcast('countdown:captured', { photoIndex: k, success: true, photoUrl, isRetake: true });

          if (k === 1) session.photo1Path = captureResult.filePath;
          if (k === 2) session.photo2Path = captureResult.filePath;
          if (k === 3) session.photo3Path = captureResult.filePath;

          session.updatedAt = new Date().toISOString();
          this.broadcast('session:updated', { session });

          await this.sleep(1000, signal);
          continue; // Re-enter FILTER_SELECTION with updated single photo!
        }

        // Choice was 'filter'
        chosenFilter = choice.filterId;
        session.filterId = chosenFilter;
        session.updatedAt = new Date().toISOString();
        break;
      }

      this.state = 'PROCESSING';
      console.log(`[Session] Processing with filter: ${chosenFilter}`);
      this.broadcast('processing:started', { sessionId: session.id, filterId: chosenFilter });
      
      try {
        delete require.cache[require.resolve('./compositor')];
      } catch {}
      const { processSession } = await import('./compositor');
      
      try {
        await processSession({
          sessionId: session.id,
          templateId: session.templateId,
          filterId: chosenFilter,
          allowOverwrite: true,
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
