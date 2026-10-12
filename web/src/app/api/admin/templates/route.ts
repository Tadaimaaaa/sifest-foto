import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const TEMPLATE_CONFIG = [
  { id: 'y2k-dreamy', name: 'Y2K Dreamy', icon: '✨' },
  { id: 'classic', name: 'Classic', icon: '📸' },
  { id: 'futuristic', name: 'Futuristic', icon: '🚀' },
  { id: 'fun', name: 'Fun', icon: '🎈' },
];

export async function GET() {
  try {
    const templatesDir = path.join(process.cwd(), 'public', 'templates');
    await fs.mkdir(templatesDir, { recursive: true });

    const templates = await Promise.all(
      TEMPLATE_CONFIG.map(async (tpl) => {
        const pngPath = path.join(templatesDir, `${tpl.id}.png`);
        const jpgPath = path.join(templatesDir, `${tpl.id}.jpg`);

        let hasCustom = false;
        let ext = 'png';
        let updatedAt = null;

        try {
          const stat = await fs.stat(pngPath);
          hasCustom = true;
          ext = 'png';
          updatedAt = stat.mtime.toISOString();
        } catch {
          try {
            const stat = await fs.stat(jpgPath);
            hasCustom = true;
            ext = 'jpg';
            updatedAt = stat.mtime.toISOString();
          } catch {
            hasCustom = false;
          }
        }

        return {
          ...tpl,
          hasCustom,
          url: hasCustom ? `/templates/${tpl.id}.${ext}?t=${Date.now()}` : null,
          updatedAt,
        };
      })
    );

    return NextResponse.json({ success: true, templates });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const templateId = formData.get('templateId') as string;
    const file = formData.get('file') as File | null;

    if (!templateId || !file) {
      return NextResponse.json({ success: false, error: 'templateId dan file wajib diisi' }, { status: 400 });
    }

    const templatesDir = path.join(process.cwd(), 'public', 'templates');
    await fs.mkdir(templatesDir, { recursive: true });

    // Determine extension
    const originalName = file.name.toLowerCase();
    const isJpg = originalName.endsWith('.jpg') || originalName.endsWith('.jpeg');
    const ext = isJpg ? 'jpg' : 'png';
    const filePath = path.join(templatesDir, `${templateId}.${ext}`);

    // If uploading png, clean up old jpg if any (and vice versa)
    const altExt = isJpg ? 'png' : 'jpg';
    try {
      await fs.unlink(path.join(templatesDir, `${templateId}.${altExt}`));
    } catch {}

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await fs.writeFile(filePath, buffer);

    return NextResponse.json({
      success: true,
      message: `Template ${templateId} berhasil diunggah!`,
      url: `/templates/${templateId}.${ext}?t=${Date.now()}`,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const templateId = searchParams.get('templateId');

    if (!templateId) {
      return NextResponse.json({ success: false, error: 'templateId wajib dicantumkan' }, { status: 400 });
    }

    const templatesDir = path.join(process.cwd(), 'public', 'templates');
    const pngPath = path.join(templatesDir, `${templateId}.png`);
    const jpgPath = path.join(templatesDir, `${templateId}.jpg`);

    let deleted = false;
    try {
      await fs.unlink(pngPath);
      deleted = true;
    } catch {}

    try {
      await fs.unlink(jpgPath);
      deleted = true;
    } catch {}

    return NextResponse.json({
      success: true,
      message: deleted ? `Template ${templateId} berhasil direset ke bawaan` : 'File template tidak ditemukan',
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
