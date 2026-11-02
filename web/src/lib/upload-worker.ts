import fs from 'fs/promises';
import path from 'path';
import { uploadQueue } from './upload-queue';
import { getSupabaseServerClient, isSupabaseConfigured } from './supabase-server';

let isProcessingQueue = false;

export async function processUploadQueue() {
  if (isProcessingQueue) return;
  if (!isSupabaseConfigured) {
    console.warn('[UploadWorker] Supabase is not configured. Queue will remain pending.');
    return;
  }

  isProcessingQueue = true;

  try {
    const supabase = getSupabaseServerClient();
    const storagePath = process.env.STORAGE_PATH || '../storage';
    const absoluteStoragePath = path.resolve(process.cwd(), storagePath);
    
    // We should ensure the bucket exists, but for safety, we assume it's created manually
    const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'photobooth';

    while (true) {
      const jobs = uploadQueue.getPendingJobs();
      if (jobs.length === 0) break;

      for (const job of jobs) {
        uploadQueue.updateStatus(job.session_id, 'UPLOADING');
        
        try {
          const finalPath = path.join(absoluteStoragePath, 'sessions', job.session_id, 'final', 'photobooth-final.jpg');
          const previewPath = path.join(absoluteStoragePath, 'sessions', job.session_id, 'final', 'photobooth-preview.jpg');

          // Check if files exist
          await fs.access(finalPath);
          await fs.access(previewPath);

          const finalBuffer = await fs.readFile(finalPath);
          const previewBuffer = await fs.readFile(previewPath);

          // Upload final
          const finalRes = await supabase.storage
            .from(bucketName)
            .upload(`sessions/${job.session_id}/photobooth-final.jpg`, finalBuffer, {
              contentType: 'image/jpeg',
              upsert: true, // We allow overwrite in case of retry
            });

          if (finalRes.error) throw finalRes.error;

          // Upload preview
          const previewRes = await supabase.storage
            .from(bucketName)
            .upload(`sessions/${job.session_id}/photobooth-preview.jpg`, previewBuffer, {
              contentType: 'image/jpeg',
              upsert: true,
            });

          if (previewRes.error) throw previewRes.error;

          uploadQueue.updateStatus(job.session_id, 'COMPLETED');
          console.log(`[UploadWorker] Successfully uploaded session ${job.session_id}`);
          
        } catch (error: any) {
          console.warn(`[UploadWorker] Cloud upload skipped for ${job.session_id} (${error.message}). Foto tetap aman & langsung diunduh dari lokal.`);
          uploadQueue.updateStatus(job.session_id, 'FAILED');
        }
      }
      
      // Jika tidak ada job pending lagi, langsung akhiri worker (tidak looping tanpa henti)
      const remainingJobs = uploadQueue.getPendingJobs();
      if (remainingJobs.length === 0) break;
      
      await new Promise(res => setTimeout(res, 3000));
    }
  } finally {
    isProcessingQueue = false;
  }
}
