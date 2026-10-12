import { NextRequest, NextResponse } from 'next/server';
import { printQueue } from '@/lib/print-queue';
import { getSessionManager } from '@/lib/get-session-manager';

export async function POST(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const { sessionId } = params;

  // Basic validation
  if (!sessionId.match(/^[a-zA-Z0-9-]+$/)) {
    return new NextResponse('Invalid Session ID', { status: 400 });
  }

  const sm = getSessionManager();
  const session = sm.getActiveSession();

  // Validate that the request matches the current active session
  if (!session || session.id !== sessionId) {
    return new NextResponse('Session not found or not active', { status: 404 });
  }

  if (session.status !== 'completed') {
    return new NextResponse('Session is not completed yet', { status: 400 });
  }

  try {
    // Add to print queue. The queue handles double-taps naturally via UNIQUE constraint logic.
    printQueue.addJob(sessionId, 1);
    
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
