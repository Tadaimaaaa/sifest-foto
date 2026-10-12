import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

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

  const storagePath = process.env.STORAGE_PATH || '../storage';
  const absoluteStoragePath = path.resolve(process.cwd(), storagePath);
  const filePath = path.join(absoluteStoragePath, 'sessions', sessionId, subDir, fileName);

  // Security check: ensure path is within storage directory
  if (!filePath.startsWith(absoluteStoragePath)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    if (!existsSync(filePath)) {
      return new NextResponse('File not found', { status: 404 });
    }

    const fileBuffer = await fs.readFile(filePath);
    
    // Set caching headers aggressively for immutable photos
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error(`Error serving image ${filePath}:`, error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
