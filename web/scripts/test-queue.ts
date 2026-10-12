import { uploadQueue } from '../src/lib/upload-queue';
import assert from 'assert';
import fs from 'fs';
import path from 'path';

function runQueueTests() {
  console.log('--- OFFLINE-FIRST UPLOAD QUEUE TESTS ---');

  // Test 1: Add a job
  const session1 = 'TEST-SESSION-QUEUE-1';
  const token1 = uploadQueue.addJob(session1);
  assert(token1 && typeof token1 === 'string' && token1.length > 10, 'Should generate a valid token');
  console.log('✅ Test 1: Add job successfully');

  // Test 2: Double add should return the same token and not crash
  const token1_duplicate = uploadQueue.addJob(session1);
  assert(token1_duplicate === token1, 'Duplicate job should return existing token');
  console.log('✅ Test 2: No duplicate queue records');

  // Test 3: Get pending jobs
  const pending = uploadQueue.getPendingJobs();
  assert(pending.some(job => job.session_id === session1), 'Job should be in pending list');
  console.log('✅ Test 3: Get pending jobs correctly');

  // Test 4: Get job by token
  const job = uploadQueue.getJobByToken(token1);
  assert(job && job.session_id === session1, 'Should retrieve correct job by token');
  console.log('✅ Test 4: Retrieve job by token');

  // Test 5: Update status
  uploadQueue.updateStatus(session1, 'COMPLETED');
  const jobUpdated = uploadQueue.getJobBySession(session1);
  assert(jobUpdated?.status === 'COMPLETED', 'Status should update to COMPLETED');
  
  // Verify it's no longer pending
  const pendingAfter = uploadQueue.getPendingJobs();
  assert(!pendingAfter.some(j => j.session_id === session1), 'Completed job should not be pending');
  console.log('✅ Test 5: Update job status');

  console.log('\nAll Upload Queue tests PASSED!');
}

try {
  runQueueTests();
} catch (err) {
  console.error('TEST FAILED:', err);
  process.exit(1);
}
