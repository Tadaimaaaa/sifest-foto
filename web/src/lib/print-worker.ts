import path from 'path';
import fs from 'fs';
import { printQueue } from './print-queue';
import { getPrintAdapter } from './print-adapter';

let isProcessingPrintQueue = false;

function getStorageDir(): string {
  if (process.env.STORAGE_PATH) {
    return path.resolve(process.cwd(), process.env.STORAGE_PATH);
  }
  const candidate1 = path.resolve(process.cwd(), '../storage');
  if (fs.existsSync(candidate1)) return candidate1;

  const candidate2 = path.resolve(process.cwd(), 'storage');
  if (fs.existsSync(candidate2)) return candidate2;

  let current = process.cwd();
  for (let i = 0; i < 3; i++) {
    const candidate = path.join(current, 'storage');
    if (fs.existsSync(candidate)) return candidate;
    current = path.dirname(current);
  }
  return path.resolve(process.cwd(), '../storage');
}

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

    const absoluteStoragePath = getStorageDir();

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

          if (!fs.existsSync(finalPath)) {
            throw new Error(`File foto cetak belum ditemukan di: ${finalPath}`);
          }

          await adapter.print(`Job-${job.id}`, finalPath, job.copies);

          printQueue.updateStatus(job.session_id, 'COMPLETED');
          console.log(`[PrintWorker] Successfully printed session ${job.session_id}`);
          
        } catch (error: any) {
          console.error(`[PrintWorker] Failed to print session ${job.session_id}:`, error.message);
          printQueue.updateStatus(job.session_id, 'FAILED', error.message);
        }
      }
      
      const remainingJobs = printQueue.getPendingJobs();
      if (remainingJobs.length === 0) break;

      // Prevent tight loop
      await new Promise(res => setTimeout(res, 2000));
    }
  } catch (error: any) {
     console.error('[PrintWorker] Error running queue:', error.message);
  } finally {
    isProcessingPrintQueue = false;
  }
}
