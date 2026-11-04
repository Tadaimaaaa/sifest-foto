import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { 
  TEMPLATE_WIDTH, 
  TEMPLATE_HEIGHT, 
  detectTransparentHoles, 
  detectLayoutType, 
  HoleBounds 
} from './template-processor';

// Prevent sharp on Windows from holding memory-mapped file locks
sharp.cache(false);

// Default bleed coordinates for fallback SVG
const PHOTO_WIDTH = 980;
const PHOTO_HEIGHT = 770;
const PHOTO_X = 110;
const PHOTO_1_Y = 898;
const PHOTO_2_Y = 1736;
const PHOTO_3_Y = 2572;

export interface CompositorOptions {
  sessionId: string;
  storagePath: string; // The root storage path (e.g. '../storage')
  templateId?: string;
  filterId?: string;
  allowOverwrite?: boolean;
}

export async function processSession(options: CompositorOptions): Promise<void> {
  const { sessionId, storagePath, templateId, filterId = 'normal', allowOverwrite = false } = options;

  const absoluteStoragePath = path.resolve(process.cwd(), storagePath);
  const sessionDir = path.join(absoluteStoragePath, 'sessions', sessionId);
  
  const originalDir = path.join(sessionDir, 'original');
  const finalDir = path.join(sessionDir, 'final');
  
  const photo1Path = path.join(originalDir, 'photo-1.jpg');
  const photo2Path = path.join(originalDir, 'photo-2.jpg');
  const photo3Path = path.join(originalDir, 'photo-3.jpg');

  // Verify all 3 photos exist
  for (const p of [photo1Path, photo2Path, photo3Path]) {
    try {
      await fs.access(p);
    } catch {
      throw new Error(`MISSING_INPUT_FILE: ${path.basename(p)}`);
    }
  }

  await fs.mkdir(finalDir, { recursive: true });

  const finalPath = path.join(finalDir, 'photobooth-final.jpg');
  const previewPath = path.join(finalDir, 'photobooth-preview.jpg');

  // Ensure we don't overwrite completed final image silently unless explicitly allowed
  if (!allowOverwrite) {
    try {
      await fs.access(finalPath);
      throw new Error('FINAL_ALREADY_EXISTS');
    } catch (err: any) {
      if (err.message === 'FINAL_ALREADY_EXISTS') throw err;
    }
  }

  console.log(`[Compositor] Starting compositing for ${sessionId}...`);

  try {
    // Generate Y2K Dreamy Sky Background SVG (fallback)
    const svgBackground = `
      <svg width="${TEMPLATE_WIDTH}" height="${TEMPLATE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#4facfe" />
            <stop offset="100%" stop-color="#00f2fe" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        
        <!-- Base Background -->
        <rect width="${TEMPLATE_WIDTH}" height="${TEMPLATE_HEIGHT}" fill="url(#skyGrad)" />
        
        <!-- Header Text -->
        <text x="${TEMPLATE_WIDTH / 2}" y="120" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="55" fill="#ffffff" text-anchor="middle" letter-spacing="4" filter="url(#glow)">SI-FEST</text>
        <text x="${TEMPLATE_WIDTH / 2}" y="180" font-family="Courier New, monospace" font-weight="bold" font-size="28" fill="#ffe066" text-anchor="middle" letter-spacing="8">2026</text>

        <!-- Photo Frames (White Border for Photos) -->
        <rect x="${PHOTO_X - 10}" y="${PHOTO_1_Y - 10}" width="${PHOTO_WIDTH + 20}" height="${PHOTO_HEIGHT + 20}" fill="#ffffff" rx="5" ry="5" />
        <rect x="${PHOTO_X - 10}" y="${PHOTO_2_Y - 10}" width="${PHOTO_WIDTH + 20}" height="${PHOTO_HEIGHT + 20}" fill="#ffffff" rx="5" ry="5" />
        <rect x="${PHOTO_X - 10}" y="${PHOTO_3_Y - 10}" width="${PHOTO_WIDTH + 20}" height="${PHOTO_HEIGHT + 20}" fill="#ffffff" rx="5" ry="5" />
      </svg>
    `;

    // Check if custom template file exists in public/templates
    const normalizedTemplateId = (templateId || 'y2k-dreamy').toLowerCase().trim();
    const slugTemplateId = normalizedTemplateId.replace(/\s+/g, '-');
    const templatesDir = path.join(process.cwd(), 'public', 'templates');

    const candidateFiles = [
      path.join(templatesDir, `${slugTemplateId}.png`),
      path.join(templatesDir, `${slugTemplateId}.jpg`),
      path.join(templatesDir, `${normalizedTemplateId}.png`),
      path.join(templatesDir, `${normalizedTemplateId}.jpg`),
    ];

    let customTemplatePath: string | null = null;
    for (const candidate of candidateFiles) {
      try {
        await fs.access(candidate);
        customTemplatePath = candidate;
        break;
      } catch {}
    }

    // Helper untuk memproses foto sesuai filter
    const processPhoto = async (filePath: string, width: number, height: number) => {
      let pipeline = sharp(filePath)
        .rotate()
        .resize(width, height, {
          fit: 'cover',
          position: 'center'
        });

      if (filterId === 'bw' || filterId === 'black-white') {
        pipeline = pipeline.grayscale().linear(1.15, -15);
      } else if (filterId === 'vintage' || filterId === 'sepia') {
        pipeline = pipeline
          .modulate({ brightness: 1.05, saturation: 1.15 })
          .tint({ r: 255, g: 235, b: 205 })
          .linear(1.05, -5);
      } else if (filterId === 'cool' || filterId === 'cyber') {
        pipeline = pipeline
          .modulate({ brightness: 1.03, saturation: 0.95 })
          .tint({ r: 210, g: 230, b: 255 });
      } else if (filterId === 'dreamy' || filterId === 'soft') {
        pipeline = pipeline
          .modulate({ brightness: 1.12, saturation: 1.25 })
          .gamma(1.1);
      }

      return pipeline.toBuffer();
    };

    const tempFinalPath = `${finalPath}.tmp`;

    if (customTemplatePath) {
      console.log(`[Compositor] Using custom template file: ${customTemplatePath}`);

      // Standarisasi ukuran template ke TEMPLATE_WIDTH x TEMPLATE_HEIGHT (1200 x 3600)
      const resizedTemplate = await sharp(customTemplatePath)
        .resize(TEMPLATE_WIDTH, TEMPLATE_HEIGHT, { fit: 'fill' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const d = resizedTemplate.data;

      // 1. Deteksi apakah sudah ada 3 lubang transparan asli pada template
      let holes = detectTransparentHoles(d, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);

      // Jika belum ada 3 lubang transparan (misal masih opaque Canva), buat lubang otomatis sesuai tata letak
      if (holes.length !== 3) {
        const layout = detectLayoutType(d, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
        console.log(`[Compositor] Template opaque. Auto-punching 3 holes with layout '${layout}'...`);

        let holeW = 1000;
        let holeH = 700;
        let holeX = 100;
        let rx = 36;
        let holesY = [190, 1060, 1940];

        if (layout === 'top-title') {
          holeW = 960;
          holeH = 750;
          holeX = 120;
          rx = 28;
          holesY = [908, 1746, 2582];
        }

        const maskSvg = Buffer.from(`
          <svg width="${TEMPLATE_WIDTH}" height="${TEMPLATE_HEIGHT}">
            <rect width="100%" height="100%" fill="white" />
            <rect x="${holeX}" y="${holesY[0]}" width="${holeW}" height="${holeH}" rx="${rx}" ry="${rx}" fill="black" />
            <rect x="${holeX}" y="${holesY[1]}" width="${holeW}" height="${holeH}" rx="${rx}" ry="${rx}" fill="black" />
            <rect x="${holeX}" y="${holesY[2]}" width="${holeW}" height="${holeH}" rx="${rx}" ry="${rx}" fill="black" />
          </svg>
        `);
        const maskRaw = await sharp(maskSvg).raw().toBuffer({ resolveWithObject: true });
        const md = maskRaw.data;
        for (let i = 0; i < TEMPLATE_WIDTH * TEMPLATE_HEIGHT; i++) {
          if (md[i * maskRaw.info.channels] < 128) {
            d[i * 4 + 3] = 0;
          }
        }
        holes = detectTransparentHoles(d, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
      }

      // Pastikan ada 3 slot lubang
      if (holes.length < 3) {
        holes = [
          { x: 100, y: 190, width: 1000, height: 700 },
          { x: 100, y: 1060, width: 1000, height: 700 },
          { x: 100, y: 1940, width: 1000, height: 700 },
        ];
      }

      console.log(`[Compositor] Positioning photos into 3 detected holes:`, holes.map(h => `Y=${h.y}..${h.y+h.height}`));

      // 2. Resize tiap foto dengan bleed 10px agar pas menutupi seluruh batas lubang tanpa celah
      const [img1, img2, img3] = await Promise.all([
        processPhoto(photo1Path, holes[0].width + 20, holes[0].height + 20),
        processPhoto(photo2Path, holes[1].width + 20, holes[1].height + 20),
        processPhoto(photo3Path, holes[2].width + 20, holes[2].height + 20),
      ]);

      const templateBuffer = await sharp(d, {
        raw: { width: TEMPLATE_WIDTH, height: TEMPLATE_HEIGHT, channels: 4 }
      }).png().toBuffer();

      // Kanvas dasar putih bersih 1200 x 3600
      const baseCanvas = await sharp({
        create: {
          width: TEMPLATE_WIDTH,
          height: TEMPLATE_HEIGHT,
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      }).jpeg().toBuffer();

      // Composite: foto di layer bawah, template transparan di layer atas
      await sharp(baseCanvas)
        .composite([
          { input: img1, left: Math.max(0, holes[0].x - 10), top: Math.max(0, holes[0].y - 10) },
          { input: img2, left: Math.max(0, holes[1].x - 10), top: Math.max(0, holes[1].y - 10) },
          { input: img3, left: Math.max(0, holes[2].x - 10), top: Math.max(0, holes[2].y - 10) },
          { input: templateBuffer, left: 0, top: 0 }
        ])
        .jpeg({ quality: 98, chromaSubsampling: '4:4:4' })
        .toFile(tempFinalPath);
    } else {
      // Fallback: Built-in SVG background
      const [img1, img2, img3] = await Promise.all([
        processPhoto(photo1Path, PHOTO_WIDTH, PHOTO_HEIGHT),
        processPhoto(photo2Path, PHOTO_WIDTH, PHOTO_HEIGHT),
        processPhoto(photo3Path, PHOTO_WIDTH, PHOTO_HEIGHT),
      ]);

      await sharp(Buffer.from(svgBackground))
        .composite([
          { input: img1, left: PHOTO_X, top: PHOTO_1_Y },
          { input: img2, left: PHOTO_X, top: PHOTO_2_Y },
          { input: img3, left: PHOTO_X, top: PHOTO_3_Y }
        ])
        .jpeg({ quality: 98, chromaSubsampling: '4:4:4' })
        .toFile(tempFinalPath);
    }

    // Atomic rename for final (safely handle Windows overwrite)
    try {
      await fs.unlink(finalPath);
    } catch {}
    await fs.rename(tempFinalPath, finalPath);

    // Create a high-res preview version (600x1800, quality 90)
    const tempPreviewPath = `${previewPath}.tmp`;
    await sharp(finalPath)
      .resize(600, 1800, { fit: 'inside' })
      .jpeg({ quality: 90 })
      .toFile(tempPreviewPath);
      
    try {
      await fs.unlink(previewPath);
    } catch {}
    await fs.rename(tempPreviewPath, previewPath);

    console.log(`[Compositor] Success for ${sessionId}`);
  } catch (err: any) {
    console.error(`[Compositor] Error: ${err.message}`);
    throw new Error(`COMPOSITING_FAILED: ${err.message}`);
  }
}
