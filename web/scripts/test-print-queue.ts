import { printQueue } from '../src/lib/print-queue';
import { getPrintAdapter, MockPrintAdapter } from '../src/lib/print-adapter';
import assert from 'assert';

async function runPrintQueueTests() {
  console.log('--- PRINT QUEUE & ADAPTER TESTS ---');

  // Test 1: Add a print job
  const session1 = 'TEST-PRINT-SESSION-1';
  const job1 = printQueue.addJob(session1, 2);
  assert(job1 && job1.session_id === session1 && job1.copies === 2, 'Should create print job with 2 copies');
  console.log('✅ Test 1: Add print job successfully');

  // Test 2: Double add should return existing job
  const job1_duplicate = printQueue.addJob(session1, 5);
  assert(job1_duplicate.id === job1.id, 'Duplicate job should return existing job');
  console.log('✅ Test 2: Double tap prevented (No duplicate records)');

  // Test 3: Get pending jobs
  const pending = printQueue.getPendingJobs();
  assert(pending.some(job => job.session_id === session1), 'Job should be in pending list');
  console.log('✅ Test 3: Get pending print jobs');

  // Test 4: Mock Adapter
  const adapter = getPrintAdapter();
  assert(adapter instanceof MockPrintAdapter || process.env.NODE_ENV === 'production', 'Adapter should be mocked in dev');
  const isReady = await adapter.isPrinterReady();
  assert(isReady, 'Mock adapter should always be ready');
  console.log('✅ Test 4: Mock Adapter initialized and ready');

  // Test 5: Simulate printing
  printQueue.updateStatus(session1, 'PRINTING');
  let currentJob = printQueue.getJobBySession(session1);
  assert(currentJob?.status === 'PRINTING', 'Status should update to PRINTING');
  
  await adapter.print(`Job-${currentJob!.id}`, '/fake/path/photobooth-final.jpg', currentJob!.copies);
  
  printQueue.updateStatus(session1, 'COMPLETED');
  currentJob = printQueue.getJobBySession(session1);
  assert(currentJob?.status === 'COMPLETED', 'Status should update to COMPLETED');
  console.log('✅ Test 5: Print status updated and simulated');

  console.log('\nAll Print Queue tests PASSED!');
}

runPrintQueueTests().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
