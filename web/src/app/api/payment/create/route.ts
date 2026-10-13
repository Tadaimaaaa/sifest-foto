import { NextRequest, NextResponse } from 'next/server';
import { createDokuCheckout } from '@/lib/doku';

import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const rawOrigin = req.headers.get('origin') || '';
    let publicUrl = process.env.NEXT_PUBLIC_PHOTO_BASE_URL || '';

    // Check storage/tunnel-url.txt if available
    try {
      const storagePath = process.env.STORAGE_PATH || '../storage';
      const filePath = path.resolve(process.cwd(), storagePath, 'tunnel-url.txt');
      if (fs.existsSync(filePath)) {
        const saved = fs.readFileSync(filePath, 'utf-8').trim();
        if (saved && saved.startsWith('http')) {
          publicUrl = saved;
        }
      }
    } catch (e) {
      // ignore
    }

    // Determine effective public URL for DOKU webhook callback
    const isLocal = !rawOrigin || rawOrigin.includes('localhost') || rawOrigin.includes('127.0.0.1');
    const effectivePublicUrl = (isLocal && publicUrl && publicUrl.startsWith('http')) 
      ? publicUrl 
      : (rawOrigin || publicUrl || 'http://localhost:3000');

    const callbackUrl = `${effectivePublicUrl}/photobooth`;
    const notifyUrl = `${effectivePublicUrl}/api/payment/doku/notify`;

    const result = await createDokuCheckout({
      callbackUrl,
      notifyUrl,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('[API/payment/create] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal membuat pembayaran' },
      { status: 500 }
    );
  }
}
