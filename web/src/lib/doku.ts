import crypto from 'crypto';

export interface PaymentRecord {
  invoiceNumber: string;
  status: 'PENDING' | 'SUCCESS' | 'EXPIRED';
  amount: number;
  paymentUrl: string;
  createdAt: number;
  paidAt?: number;
}

// In-memory payment ledger for active kiosk sessions
const paymentsStore = new Map<string, PaymentRecord>();

export function getPaymentRecord(invoiceNumber: string): PaymentRecord | undefined {
  return paymentsStore.get(invoiceNumber);
}

export function setPaymentRecord(invoiceNumber: string, record: PaymentRecord): void {
  paymentsStore.set(invoiceNumber, record);
}

export function markPaymentSuccess(invoiceNumber: string): PaymentRecord | null {
  const existing = paymentsStore.get(invoiceNumber);
  if (existing) {
    existing.status = 'SUCCESS';
    existing.paidAt = Date.now();
    paymentsStore.set(invoiceNumber, existing);
    return existing;
  }
  // If not tracked yet, create a success record
  const newRecord: PaymentRecord = {
    invoiceNumber,
    status: 'SUCCESS',
    amount: Number(process.env.PHOTO_PRICE_IDR || '5000'),
    paymentUrl: '',
    createdAt: Date.now(),
    paidAt: Date.now(),
  };
  paymentsStore.set(invoiceNumber, newRecord);
  return newRecord;
}

export function generateDokuSignature(
  clientId: string,
  requestId: string,
  requestTimestamp: string,
  requestTarget: string,
  requestBody: string,
  secretKey: string
): string {
  const digestHash = crypto.createHash('sha256').update(requestBody).digest('base64');
  const digestHeader = `Digest:${digestHash}`;

  const components = [
    `Client-Id:${clientId}`,
    `Request-Id:${requestId}`,
    `Request-Timestamp:${requestTimestamp}`,
    `Request-Target:${requestTarget}`,
    digestHeader,
  ].join('\n');

  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(components);
  const signatureBuffer = hmac.digest('base64');

  return `HMACSHA256=${signatureBuffer}`;
}

export async function createDokuCheckout(params: {
  amount?: number;
  invoiceNumber?: string;
  callbackUrl?: string;
  notifyUrl?: string;
}) {
  const clientId = process.env.DOKU_CLIENT_ID;
  const secretKey = process.env.DOKU_SECRET_KEY;
  const price = params.amount || Number(process.env.PHOTO_PRICE_IDR || '5000');
  const invoiceNumber = params.invoiceNumber || `SIFEST-${Date.now()}`;
  const requestId = `REQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const requestTimestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const requestTarget = '/checkout/v1/payment';

  if (!clientId || !secretKey) {
    throw new Error('DOKU credentials missing in environment variables');
  }

  const payload: any = {
    order: {
      amount: price,
      invoice_number: invoiceNumber,
      currency: 'IDR',
    },
    payment: {
      payment_due_date: 30, // 30 minutes
      payment_method_types: ['QRIS'],
    },
  };

  if (params.callbackUrl) {
    payload.order.callback_url = params.callbackUrl;
  }

  if (params.notifyUrl) {
    payload.additional_info = {
      override_notification_url: params.notifyUrl,
    };
  }

  const bodyStr = JSON.stringify(payload);
  const signature = generateDokuSignature(
    clientId,
    requestId,
    requestTimestamp,
    requestTarget,
    bodyStr,
    secretKey
  );

  const res = await fetch(`https://api.doku.com${requestTarget}`, {
    method: 'POST',
    headers: {
      'Client-Id': clientId,
      'Request-Id': requestId,
      'Request-Timestamp': requestTimestamp,
      Signature: signature,
      'Content-Type': 'application/json',
    },
    body: bodyStr,
  });

  const data = await res.json();
  if (!res.ok || (data.message && data.message[0] !== 'SUCCESS')) {
    throw new Error(`DOKU error: ${JSON.stringify(data)}`);
  }

  const paymentUrl = data.response?.payment?.url;
  const record: PaymentRecord = {
    invoiceNumber,
    status: 'PENDING',
    amount: price,
    paymentUrl,
    createdAt: Date.now(),
  };

  setPaymentRecord(invoiceNumber, record);

  return {
    invoiceNumber,
    paymentUrl,
    amount: price,
    expiredDatetime: data.response?.payment?.expired_datetime,
  };
}
