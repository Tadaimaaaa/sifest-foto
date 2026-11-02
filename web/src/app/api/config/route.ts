import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function getStorageDir() {
  if (process.env.STORAGE_PATH) {
    return path.resolve(process.cwd(), process.env.STORAGE_PATH);
  }
  const candidate1 = path.resolve(process.cwd(), '../storage');
  if (fs.existsSync(candidate1)) return candidate1;

  const candidate2 = path.resolve(process.cwd(), 'storage');
  if (fs.existsSync(candidate2)) return candidate2;

  let current = process.cwd();
  for (let i = 0; i < 3; i++) {
    const candidate = path.join(current, 'storage');
    if (fs.existsSync(candidate)) return candidate;
    current = path.dirname(current);
  }
  return path.resolve(process.cwd(), '../storage');
}

export async function GET() {
  let tunnelUrl = process.env.NEXT_PUBLIC_PHOTO_BASE_URL || '';
  if (tunnelUrl.includes('api.trycloudflare.com')) {
    tunnelUrl = '';
  }

  // Check if tunnel-url.txt exists in storage directory
  try {
    const storageDir = getStorageDir();
    const filePath = path.join(storageDir, 'tunnel-url.txt');
    if (fs.existsSync(filePath)) {
      const saved = fs.readFileSync(filePath, 'utf-8').trim();
      if (saved && saved.startsWith('http') && !saved.includes('api.trycloudflare.com')) {
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
