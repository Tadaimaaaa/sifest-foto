import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

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

function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  const candidates: Array<{ ip: string; isWifi: boolean }> = [];

  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('virtual') || lowerName.includes('vbox') || lowerName.includes('vmware') || lowerName.includes('wsl')) {
      continue;
    }

    const ifaces = interfaces[name] || [];
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('192.168.56.') || iface.address.startsWith('169.254.')) continue;
        const isWifi = lowerName.includes('wi-fi') || lowerName.includes('wifi') || lowerName.includes('wireless') || lowerName.includes('wlan');
        candidates.push({ ip: iface.address, isWifi });
      }
    }
  }

  const wifi = candidates.find(c => c.isWifi);
  if (wifi) return wifi.ip;
  if (candidates.length > 0) return candidates[0].ip;
  return 'localhost';
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
  const localIp = getLocalIp();

  return NextResponse.json({
    tunnelUrl,
    localIp,
    price,
  });
}
