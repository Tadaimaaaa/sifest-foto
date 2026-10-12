import { NextRequest, NextResponse } from 'next/server';
import { getPaymentRecord } from '@/lib/doku';

export async function GET(
  req: NextRequest,
  { params }: { params: { invoice: string } }
) {
  const invoiceNumber = params.invoice;
  const record = getPaymentRecord(invoiceNumber);

  if (!record) {
    return NextResponse.json({
      status: 'PENDING',
      message: 'Transaction not found or still pending',
    });
  }

  return NextResponse.json({
    status: record.status,
    invoiceNumber: record.invoiceNumber,
    amount: record.amount,
  });
}
