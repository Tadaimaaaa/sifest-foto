import { NextRequest, NextResponse } from 'next/server';
import { getSessionManager } from '../../../../lib/get-session-manager';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const templateId = body.templateId || 'classic';
    const sessionManager = getSessionManager();

    const session = await sessionManager.startSession(templateId);

    return NextResponse.json({
      success: true,
      session
    });
  } catch (err: any) {
    if (err.message === 'SESSION_ALREADY_ACTIVE') {
      return NextResponse.json({ success: false, error: 'SESSION_ALREADY_ACTIVE' }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
