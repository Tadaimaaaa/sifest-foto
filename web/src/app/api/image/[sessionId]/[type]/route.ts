import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

function getStorageDir() {
  if (process.env.STORAGE_PATH) {
    return path.resolve(process.cwd(), process.env.STORAGE_PATH);
  }
  const candidate1 = path.resolve(process.cwd(), '../storage');
  if (existsSync(candidate1)) return candidate1;

  const candidate2 = path.resolve(process.cwd(), 'storage');
  if (existsSync(candidate2)) return candidate2;

  let current = process.cwd();
  for (let i = 0; i < 3; i++) {
    const candidate = path.join(current, 'storage');
    if (existsSync(candidate)) return candidate;
    current = path.dirname(current);
  }
  return path.resolve(process.cwd(), '../storage');
}

export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string; type: string } }
) {
  const { sessionId, type } = params;

  // Basic validation
  if (!sessionId.match(/^[a-zA-Z0-9-]+$/)) {
    return new NextResponse('Invalid Session ID', { status: 400 });
  }

  // Determine the file path
  let fileName = '';
  let subDir = '';
  
  if (type === 'preview') {
    subDir = 'final';
    fileName = 'photobooth-preview.jpg';
  } else if (type === 'final') {
    subDir = 'final';
    fileName = 'photobooth-final.jpg';
  } else if (type.startsWith('photo-')) {
    subDir = 'original';
    fileName = `${type}.jpg`;
  } else {
    return new NextResponse('Invalid image type', { status: 400 });
  }

  const absoluteStoragePath = getStorageDir();
  const filePath = path.join(absoluteStoragePath, 'sessions', sessionId, subDir, fileName);

  // Security check: ensure normalized path is within storage directory
  const normalizedFile = path.normalize(filePath).toLowerCase();
  const normalizedRoot = path.normalize(absoluteStoragePath).toLowerCase();
  if (!normalizedFile.startsWith(normalizedRoot)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    if (!existsSync(filePath)) {
      return new NextResponse('File not found', { status: 404 });
    }

    const fileBuffer = await fs.readFile(filePath);
    
    const isDownload = req.nextUrl.searchParams.get('download') === '1' || type === 'final';
    const headers: Record<string, string> = {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    };

    if (isDownload) {
      headers['Content-Disposition'] = `attachment; filename="SI-FEST-2026-${sessionId}.jpg"`;
    }

    return new NextResponse(fileBuffer, { headers });
  } catch (error) {
    console.error(`Error serving image ${filePath}:`, error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
