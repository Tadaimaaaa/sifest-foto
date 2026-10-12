import path from 'path';
import { printQueue } from './print-queue';
import { getPrintAdapter } from './print-adapter';

let isProcessingPrintQueue = false;

export async function processPrintQueue() {
  if (isProcessingPrintQueue) return;
  isProcessingPrintQueue = true;

  try {
    const adapter = getPrintAdapter();
    const isReady = await adapter.isPrinterReady();
    
    if (!isReady) {
      console.warn('[PrintWorker] Printer is not ready. Queue will remain pending.');
      return;
    }

    const storagePath = process.env.STORAGE_PATH || '../storage';
    const absoluteStoragePath = path.resolve(process.cwd(), storagePath);

    while (true) {
      const jobs = printQueue.getPendingJobs();
      if (jobs.length === 0) break;

      for (const job of jobs) {
        printQueue.updateStatus(job.session_id, 'PRINTING');
        
        try {
          // Security: Validate sessionId against path traversal
          if (!job.session_id.match(/^[a-zA-Z0-9-]+$/)) {
            throw new Error('Invalid Session ID format');
          }

          const finalPath = path.join(absoluteStoragePath, 'sessions', job.session_id, 'final', 'photobooth-final.jpg');

          await adapter.print(`Job-${job.id}`, finalPath, job.copies);

          printQueue.updateStatus(job.session_id, 'COMPLETED');
          console.log(`[PrintWorker] Successfully printed session ${job.session_id}`);
          
        } catch (error: any) {
          console.error(`[PrintWorker] Failed to print session ${job.session_id}:`, error.message);
          printQueue.updateStatus(job.session_id, 'FAILED', error.message);
        }
      }
      
      // Prevent tight loop
      await new Promise(res => setTimeout(res, 5000));
    }
  } catch (error: any) {
     console.error('[PrintWorker] Error running queue:', error.message);
  } finally {
    isProcessingPrintQueue = false;
  }
}
