import { NextRequest, NextResponse } from 'next/server';
import { markPaymentSuccess } from '@/lib/doku';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('[DOKU Notification] Received webhook:', JSON.stringify(body));

    const invoiceNumber =
      body.transaction?.invoice_number ||
      body.order?.invoice_number ||
      body.invoice_number;

    const status =
      body.transaction?.status ||
      body.status ||
      (body.message && body.message[0]);

    if (invoiceNumber && (status === 'SUCCESS' || status === 'success')) {
      console.log(`[DOKU Notification] Payment SUCCESS for invoice: ${invoiceNumber}`);
      markPaymentSuccess(invoiceNumber);

      // Broadcast event via Socket.IO to photobooth kiosk
      const io = (global as any).io;
      if (io) {
        io.to('kiosk').emit('payment:success', {
          invoiceNumber,
          status: 'SUCCESS',
          amount: body.order?.amount || body.transaction?.amount,
        });
        console.log(`[DOKU Notification] Broadcasted payment:success to kiosk room.`);
      }
    }

    // Always respond 200 OK to acknowledge receipt from DOKU
    return NextResponse.json({ status: 'OK' }, { status: 200 });
  } catch (error: any) {
    console.error('[DOKU Notification] Error processing webhook:', error);
    // Return 200 so DOKU does not retry indefinitely
    return NextResponse.json({ status: 'ERROR', message: error.message }, { status: 200 });
  }
}
