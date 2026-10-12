import { NextRequest, NextResponse } from 'next/server';
import { getSessionManager } from '../../../../lib/get-session-manager';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sessionManager = getSessionManager();
    const session = sessionManager.getActiveSession();
    
    if (!session || session.id !== params.id) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sessionManager = getSessionManager();
    const session = sessionManager.getActiveSession();
    
    if (!session || session.id !== params.id) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 });
    }

    sessionManager.abortSession();

    return NextResponse.json({ success: true, message: 'Session aborted' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
