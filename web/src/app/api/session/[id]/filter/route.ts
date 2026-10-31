import { NextRequest, NextResponse } from 'next/server';
import { getSessionManager } from '@/lib/get-session-manager';
import { processSession } from '@/lib/compositor';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { filterId = 'normal' } = await req.json();
    const sessionId = params.id;
    const sessionManager = getSessionManager();
    const activeSession = sessionManager.getActiveSession();

    // If currently in interactive filter selection state, advance session
    if (activeSession && activeSession.id === sessionId && sessionManager.getState() === 'FILTER_SELECTION') {
      sessionManager.applyFilter(filterId);
      return NextResponse.json({ success: true, filterId, mode: 'session_advance' });
    }

    // If session is already completed, re-process final image with the new filter
    const templateId = activeSession?.templateId || 'y2k-dreamy';
    await processSession({
      sessionId,
      templateId,
      filterId,
      allowOverwrite: true,
      storagePath: process.env.STORAGE_PATH || '../storage'
    });

    if (activeSession && activeSession.id === sessionId) {
      activeSession.filterId = filterId;
      activeSession.updatedAt = new Date().toISOString();
      const broadcast = (global as any).broadcast;
      if (broadcast) {
        broadcast('session:updated', { session: activeSession });
      }
    }

    return NextResponse.json({ success: true, filterId, mode: 'reprocessed' });
  } catch (err: any) {
    console.error('[API Filter] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
