import { NextRequest, NextResponse } from 'next/server';
import { createDokuCheckout } from '@/lib/doku';

export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_PHOTO_BASE_URL || 'http://localhost:3000';
    const callbackUrl = `${origin}/photobooth`;
    const notifyUrl = `${origin}/api/payment/doku/notify`;

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
