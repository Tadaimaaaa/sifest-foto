import { NextRequest, NextResponse } from 'next/server';
import { printQueue } from '@/lib/print-queue';
import { getSessionManager } from '@/lib/get-session-manager';
import path from 'path';
import fs from 'fs';

export async function POST(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const { sessionId } = params;

  // Basic validation
  if (!sessionId.match(/^[a-zA-Z0-9-]+$/)) {
    return new NextResponse('Invalid Session ID', { status: 400 });
  }

  // Cek apakah file foto hasil akhir sudah tersimpan di storage
  const storagePath = process.env.STORAGE_PATH || '../storage';
  const absoluteStoragePath = path.resolve(process.cwd(), storagePath);
  const finalPath = path.join(absoluteStoragePath, 'sessions', sessionId, 'final', 'photobooth-final.jpg');
  const fileExists = fs.existsSync(finalPath);

  const sm = getSessionManager();
  const session = sm.getActiveSession();

  // Izinkan cetak jika file foto sudah ada di disk ATAU sesi aktif berstatus completed
  if (!fileExists && (!session || session.status !== 'completed')) {
    return new NextResponse('Foto belum selesai diproses atau tidak ditemukan', { status: 400 });
  }

  let slots = '1';
  try {
    const body = await req.json();
    if (body?.slots) {
      slots = String(body.slots);
    }
  } catch {}

  try {
    // Add to print queue. The queue handles double-taps naturally via UNIQUE constraint logic.
    printQueue.addJob(sessionId, 1, slots);
    
    // Trigger worker
    import('@/lib/print-worker').then(m => m.processPrintQueue().catch(console.error));
    
    return NextResponse.json({ success: true, message: 'Print job added' });
  } catch (error: any) {
    console.error(`Failed to enqueue print job for ${sessionId}:`, error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const { sessionId } = params;
  
  if (!sessionId.match(/^[a-zA-Z0-9-]+$/)) {
    return new NextResponse('Invalid Session ID', { status: 400 });
  }

  const job = printQueue.getJobBySession(sessionId);
  if (!job) {
    return NextResponse.json({ status: 'NOT_FOUND' });
  }

  return NextResponse.json({ status: job.status, errorMessage: job.error_message });
}
