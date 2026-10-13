import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  let tunnelUrl = process.env.NEXT_PUBLIC_PHOTO_BASE_URL || '';

  // Check if tunnel-url.txt exists in storage directory
  try {
    const storagePath = process.env.STORAGE_PATH || '../storage';
    const filePath = path.resolve(process.cwd(), storagePath, 'tunnel-url.txt');
    if (fs.existsSync(filePath)) {
      const saved = fs.readFileSync(filePath, 'utf-8').trim();
      if (saved && saved.startsWith('http')) {
        tunnelUrl = saved;
      }
    }
  } catch (err) {
    // ignore
  }

  const price = Number(process.env.PHOTO_PRICE_IDR || '5000');

  return NextResponse.json({
    tunnelUrl,
    price,
  });
}
