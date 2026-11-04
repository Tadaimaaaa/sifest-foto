import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { autoStandardizeAndPunchTemplate, detectTransparentHoles } from '@/lib/template-processor';

interface TemplateItem {
  id: string;
  name: string;
  icon: string;
  isBuiltin?: boolean;
}

const DEFAULT_TEMPLATES: TemplateItem[] = [
  { id: 'y2k-dreamy', name: 'Y2K Dreamy', icon: '✨', isBuiltin: true },
  { id: 'classic', name: 'Classic', icon: '📸', isBuiltin: true },
  { id: 'futuristic', name: 'Futuristic', icon: '🚀', isBuiltin: true },
  { id: 'fun', name: 'Fun', icon: '🎈', isBuiltin: true },
];

async function getTemplatesList(): Promise<TemplateItem[]> {
  const templatesDir = path.join(process.cwd(), 'public', 'templates');
  const jsonPath = path.join(templatesDir, 'templates.json');
  try {
    const raw = await fs.readFile(jsonPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {}

  // Initialize with DEFAULT_TEMPLATES if missing
  try {
    await fs.mkdir(templatesDir, { recursive: true });
    await fs.writeFile(jsonPath, JSON.stringify(DEFAULT_TEMPLATES, null, 2), 'utf-8');
  } catch {}
  return DEFAULT_TEMPLATES;
}

async function saveTemplatesList(list: TemplateItem[]) {
  const templatesDir = path.join(process.cwd(), 'public', 'templates');
  const jsonPath = path.join(templatesDir, 'templates.json');
  await fs.mkdir(templatesDir, { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(list, null, 2), 'utf-8');
}

export async function GET() {
  try {
    const templatesDir = path.join(process.cwd(), 'public', 'templates');
    await fs.mkdir(templatesDir, { recursive: true });

    const templateList = await getTemplatesList();

    const templates = await Promise.all(
      templateList.map(async (tpl) => {
        const pngPath = path.join(templatesDir, `${tpl.id}.png`);
        const jpgPath = path.join(templatesDir, `${tpl.id}.jpg`);

        let hasCustom = false;
        let ext = 'png';
        let updatedAt: string | null = null;
        let isHolesReady = false;
        let detectedHoles: Array<{ top: string; left: string; width: string; height: string }> = [];

        try {
          const stat = await fs.stat(pngPath);
          hasCustom = true;
          ext = 'png';
          updatedAt = stat.mtime.toISOString();

          // Deteksi apakah sudah memiliki 3 lubang transparan & koordinatnya
          try {
            const { data, info } = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true });
            const holes = detectTransparentHoles(data, info.width, info.height);
            isHolesReady = holes.length === 3;
            if (isHolesReady) {
              detectedHoles = holes.map(h => ({
                top: `${((h.y / info.height) * 100).toFixed(2)}%`,
                left: `${((h.x / info.width) * 100).toFixed(2)}%`,
                width: `${((h.width / info.width) * 100).toFixed(2)}%`,
                height: `${((h.height / info.height) * 100).toFixed(2)}%`,
              }));
            }
          } catch {}
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
          isBuiltin: Boolean(tpl.isBuiltin),
          hasCustom,
          isHolesReady,
          holes: detectedHoles,
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
    const action = formData.get('action') as string | null;
    let templateId = (formData.get('templateId') as string | null)?.trim();
    const layout = (formData.get('layout') as string | null)?.trim();
    const name = (formData.get('name') as string | null)?.trim();
    const icon = (formData.get('icon') as string | null)?.trim() || '🎨';
    const file = formData.get('file') as File | null;

    const templatesDir = path.join(process.cwd(), 'public', 'templates');
    await fs.mkdir(templatesDir, { recursive: true });

    const currentList = await getTemplatesList();

    // Case 0: Action 'punch' - Melubangi template yang sudah ada secara otomatis ke ukuran standar
    if (action === 'punch' && templateId) {
      const pngPath = path.join(templatesDir, `${templateId}.png`);
      const jpgPath = path.join(templatesDir, `${templateId}.jpg`);

      let srcPath = pngPath;
      try {
        await fs.access(pngPath);
      } catch {
        srcPath = jpgPath;
        await fs.access(jpgPath);
      }

      await autoStandardizeAndPunchTemplate(srcPath, pngPath, { 
        forcePunch: true,
        layout: (layout === 'top-title' || layout === 'bottom-title') ? layout : undefined,
      });

      // Hapus file jpg lama jika ada agar bersih
      try {
        if (srcPath === jpgPath) await fs.unlink(jpgPath);
      } catch {}

      return NextResponse.json({
        success: true,
        message: `Template "${templateId}" berhasil distandarkan ke 1200x3600 dan 3 lubang foto berhasil dilubangi transparan!`,
        url: `/templates/${templateId}.png?t=${Date.now()}`,
      });
    }

    // Case 1: Tambah Template Baru (action === 'create' atau tidak ada templateId tapi ada name & file)
    if (action === 'create' || (!templateId && name)) {
      if (!name) {
        return NextResponse.json({ success: false, error: 'Nama template wajib diisi' }, { status: 400 });
      }
      if (!file) {
        return NextResponse.json({ success: false, error: 'File gambar template wajib diunggah' }, { status: 400 });
      }

      // Generate unique slug
      let baseSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (!baseSlug) baseSlug = `template-${Date.now()}`;

      let uniqueSlug = baseSlug;
      let counter = 1;
      while (currentList.some((t) => t.id === uniqueSlug)) {
        uniqueSlug = `${baseSlug}-${counter}`;
        counter++;
      }

      // Selalu simpan sebagai format PNG standar 1200x3600 Ultra-HD dengan 3 lubang transparan
      const targetPngPath = path.join(templatesDir, `${uniqueSlug}.png`);
      const bytes = await file.arrayBuffer();

      await autoStandardizeAndPunchTemplate(Buffer.from(bytes), targetPngPath, { forcePunch: true });

      const newTemplate: TemplateItem = {
        id: uniqueSlug,
        name,
        icon,
        isBuiltin: false,
      };

      currentList.push(newTemplate);
      await saveTemplatesList(currentList);

      return NextResponse.json({
        success: true,
        message: `Template "${name}" berhasil diunggah, otomatis diubah ke 1200x3600, dan 3 lubang foto langsung transparan!`,
        template: {
          ...newTemplate,
          hasCustom: true,
          url: `/templates/${uniqueSlug}.png?t=${Date.now()}`,
        },
      });
    }

    // Case 2: Update Desain Template yang Sudah Ada
    if (!templateId || !file) {
      return NextResponse.json({ success: false, error: 'templateId dan file wajib diisi' }, { status: 400 });
    }

    const targetPngPath = path.join(templatesDir, `${templateId}.png`);
    const oldJpgPath = path.join(templatesDir, `${templateId}.jpg`);

    const bytes = await file.arrayBuffer();
    // Otomatis standarisasi ke 1200x3600 & lubangi 3 frame foto transparan
    await autoStandardizeAndPunchTemplate(Buffer.from(bytes), targetPngPath, { forcePunch: true });

    // Hapus file jpg lama jika ada
    try {
      await fs.unlink(oldJpgPath);
    } catch {}

    // Update name / icon in templates.json if provided
    let listChanged = false;
    const updatedList = currentList.map((tpl) => {
      if (tpl.id === templateId) {
        listChanged = true;
        return {
          ...tpl,
          name: name || tpl.name,
          icon: icon || tpl.icon,
        };
      }
      return tpl;
    });

    if (listChanged) {
      await saveTemplatesList(updatedList);
    }

    return NextResponse.json({
      success: true,
      message: `Desain template "${templateId}" berhasil diperbarui, ukuran disesuaikan ke 1200x3600, dan 3 lubang foto langsung bolong!`,
      url: `/templates/${templateId}.png?t=${Date.now()}`,
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

    const currentList = await getTemplatesList();
    const existing = currentList.find((t) => t.id === templateId);

    // Delete image files on disk
    let fileDeleted = false;
    try {
      await fs.unlink(pngPath);
      fileDeleted = true;
    } catch {}
    try {
      await fs.unlink(jpgPath);
      fileDeleted = true;
    } catch {}

    if (existing && !existing.isBuiltin) {
      // Custom user-added template: remove from registry completely
      const filtered = currentList.filter((t) => t.id !== templateId);
      await saveTemplatesList(filtered);
      return NextResponse.json({
        success: true,
        message: `Template "${existing.name}" berhasil dihapus secara permanen.`,
      });
    }

    // Built-in template: reset custom design file back to default
    return NextResponse.json({
      success: true,
      message: fileDeleted
        ? `Desain template "${existing?.name || templateId}" berhasil direset ke bawaan sistem.`
        : 'Desain template sudah menggunakan bawaan sistem.',
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
