import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { processSession } from '../src/lib/compositor';
import assert from 'assert';

const storagePath = path.resolve(__dirname, '../../storage');

async function createDummyPhoto(sessionPath: string, index: number, color: string, rotate = 0, isCorrupt = false) {
  const filePath = path.join(sessionPath, 'original', `photo-${index}.jpg`);
  
  if (isCorrupt) {
    await fs.writeFile(filePath, 'this is not a valid image');
    return filePath;
  }

  // Create a 3:2 dummy photo
  const buf = await sharp({
    create: { width: 900, height: 600, channels: 3, background: color }
  })
  .jpeg()
  .toBuffer();

  // If testing orientation, we can't easily forge EXIF with sharp create, 
  // but we can rotate the image and verify it doesn't crash.
  let finalBuf = buf;
  if (rotate > 0) {
    finalBuf = await sharp(buf).rotate(rotate).jpeg().toBuffer();
  }

  await fs.writeFile(filePath, finalBuf);
  return filePath;
}

async function runTests() {
  console.log('--- COMPOSITOR TESTS ---');
  await fs.mkdir(storagePath, { recursive: true });

  // Cleanup any old test runs
  for (const t of ['TEST-COMP-1', 'TEST-COMP-2', 'TEST-COMP-3']) {
    try { await fs.rm(path.join(storagePath, 'sessions', t), { recursive: true, force: true }); } catch {}
  }

  // TEST 1: Happy Path
  console.log('Test 1: Happy Path (Valid Inputs)');
  const session1 = 'TEST-COMP-1';
  const s1Dir = path.join(storagePath, 'sessions', session1);
  await fs.mkdir(path.join(s1Dir, 'original'), { recursive: true });
  
  await createDummyPhoto(s1Dir, 1, 'red');
  await createDummyPhoto(s1Dir, 2, 'green');
  await createDummyPhoto(s1Dir, 3, 'blue');

  await processSession({ sessionId: session1, storagePath });
  
  const finalPath1 = path.join(s1Dir, 'final', 'photobooth-final.jpg');
  const previewPath1 = path.join(s1Dir, 'final', 'photobooth-preview.jpg');
  
  const finalStat1 = await fs.stat(finalPath1);
  const prevStat1 = await fs.stat(previewPath1);
  assert(finalStat1.size > 0, 'Final image should be created');
  assert(prevStat1.size > 0, 'Preview image should be created');
  
  // Verify colors are present in final image (crude pixel check or just metadata)
  const meta = await sharp(finalPath1).metadata();
  assert(meta.width === 1200, 'Template width should be 1200 (Ultra-HD)');
  assert(meta.height === 3600, 'Template height should be 3600 (Ultra-HD)');
  console.log('✅ Test 1 Passed');

  // TEST 2: Missing Input
  console.log('\nTest 2: Missing Input Rejection');
  const session2 = 'TEST-COMP-2';
  const s2Dir = path.join(storagePath, 'sessions', session2);
  await fs.mkdir(path.join(s2Dir, 'original'), { recursive: true });
  await createDummyPhoto(s2Dir, 1, 'yellow');
  await createDummyPhoto(s2Dir, 2, 'orange');
  // omit 3
  try {
    await processSession({ sessionId: session2, storagePath });
    assert.fail('Should have thrown on missing input');
  } catch (err: any) {
    assert(err.message.includes('MISSING_INPUT_FILE'), 'Expected missing input error');
  }
  console.log('✅ Test 2 Passed');

  // TEST 3: Corrupt JPEG
  console.log('\nTest 3: Corrupt JPEG Rejection');
  const session3 = 'TEST-COMP-3';
  const s3Dir = path.join(storagePath, 'sessions', session3);
  await fs.mkdir(path.join(s3Dir, 'original'), { recursive: true });
  await createDummyPhoto(s3Dir, 1, 'cyan');
  await createDummyPhoto(s3Dir, 2, 'magenta');
  await createDummyPhoto(s3Dir, 3, 'black', 0, true); // Corrupt

  try {
    await processSession({ sessionId: session3, storagePath });
    assert.fail('Should have thrown on corrupt input');
  } catch (err: any) {
    assert(err.message.includes('COMPOSITING_FAILED'), 'Expected compositing failure');
  }
  console.log('✅ Test 3 Passed');

  // TEST 4: No Silent Overwrite
  console.log('\nTest 4: No Silent Overwrite');
  try {
    await processSession({ sessionId: session1, storagePath });
    assert.fail('Should have thrown on existing final output');
  } catch (err: any) {
    assert(err.message === 'FINAL_ALREADY_EXISTS', 'Expected FINAL_ALREADY_EXISTS error');
  }
  console.log('✅ Test 4 Passed');
  
  console.log('\nAll tests PASSED!');
}

runTests().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
