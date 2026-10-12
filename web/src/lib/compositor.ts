import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';

// Prevent sharp on Windows from holding memory-mapped file locks
sharp.cache(false);

// Template Dimensions: 2x6 inches at 600 DPI Ultra-HD (1200x3600)
const TEMPLATE_WIDTH = 1200;
const TEMPLATE_HEIGHT = 3600;

// Default bleed coordinates (covers transparent photo frame openings with 10px bleed)
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
}

export async function processSession(options: CompositorOptions): Promise<void> {
  const { sessionId, storagePath, templateId } = options;

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

  // Ensure we don't overwrite completed final image silently
  try {
    await fs.access(finalPath);
    throw new Error('FINAL_ALREADY_EXISTS');
  } catch (err: any) {
    if (err.message === 'FINAL_ALREADY_EXISTS') throw err;
  }

  console.log(`[Compositor] Starting compositing for ${sessionId}...`);

  try {
    // Generate Y2K Dreamy Sky Background SVG
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
        
        <!-- Y2K Grid Pattern -->
        <g stroke="#ffffff" stroke-width="1" stroke-opacity="0.2">
          ${Array.from({ length: 40 }).map((_, i) => `<line x1="0" y1="${i * 50}" x2="${TEMPLATE_WIDTH}" y2="${i * 50}" />`).join('')}
          ${Array.from({ length: 15 }).map((_, i) => `<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="${TEMPLATE_HEIGHT}" />`).join('')}
        </g>
        
        <!-- Bright Yellow Stars -->
        <g fill="#ffe066" filter="url(#glow)">
          <path d="M100 80 L110 110 L140 120 L110 130 L100 160 L90 130 L60 120 L90 110 Z" />
          <path d="M480 1350 L485 1365 L500 1370 L485 1375 L480 1390 L475 1375 L460 1370 L475 1365 Z" />
          <path d="M120 1600 L125 1615 L140 1620 L125 1625 L120 1640 L115 1625 L100 1620 L115 1615 Z" />
        </g>
        
        <!-- Header Text -->
        <text x="${TEMPLATE_WIDTH / 2}" y="120" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="55" fill="#ffffff" text-anchor="middle" letter-spacing="4" filter="url(#glow)">SI-FEST</text>
        <text x="${TEMPLATE_WIDTH / 2}" y="180" font-family="Courier New, monospace" font-weight="bold" font-size="28" fill="#ffe066" text-anchor="middle" letter-spacing="8">2026</text>

        <!-- Footer Text -->
        <text x="${TEMPLATE_WIDTH / 2}" y="1450" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="24" fill="#ffffff" text-anchor="middle" letter-spacing="2">HMJ SISTEM INFORMASI</text>
        <text x="${TEMPLATE_WIDTH / 2}" y="1490" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#e0f7fa" text-anchor="middle" letter-spacing="1">UPI YPTK PADANG</text>

        <!-- Futuristic Decorative Elements -->
        <circle cx="${TEMPLATE_WIDTH / 2}" cy="1650" r="40" fill="none" stroke="#ffffff" stroke-width="4" stroke-opacity="0.5" />
        <circle cx="${TEMPLATE_WIDTH / 2}" cy="1650" r="30" fill="none" stroke="#ffe066" stroke-width="2" stroke-opacity="0.8" />
        <circle cx="${TEMPLATE_WIDTH / 2}" cy="1650" r="10" fill="#ffffff" />
        <line x1="50" y1="1650" x2="200" y2="1650" stroke="#ffffff" stroke-width="2" stroke-opacity="0.5" />
        <line x1="400" y1="1650" x2="550" y2="1650" stroke="#ffffff" stroke-width="2" stroke-opacity="0.5" />

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

    // Determine photo placement coordinates
    let pWidth = PHOTO_WIDTH;
    let pHeight = PHOTO_HEIGHT;
    let pX = PHOTO_X;
    let p1Y = PHOTO_1_Y;
    let p2Y = PHOTO_2_Y;
    let p3Y = PHOTO_3_Y;

    if (customTemplatePath) {
      // 1200x3600 Ultra-HD coordinates with 10px bleed beyond frame cutouts
      // Ensures complete photo coverage with zero white border leakage
      pWidth = 980;
      pHeight = 770;
      pX = 110;
      p1Y = 898;
      p2Y = 1736;
      p3Y = 2572;
    }

    // Process and resize photos safely
    const getPhotoBuffer = async (filePath: string) => {
      return sharp(filePath)
        .rotate() // Auto-orient based on EXIF
        .resize(pWidth, pHeight, {
          fit: 'cover',
          position: 'center'
        })
        .toBuffer();
    };

    const [img1, img2, img3] = await Promise.all([
      getPhotoBuffer(photo1Path),
      getPhotoBuffer(photo2Path),
      getPhotoBuffer(photo3Path)
    ]);

    const tempFinalPath = `${finalPath}.tmp`;

    if (customTemplatePath) {
      console.log(`[Compositor] Using custom template file: ${customTemplatePath}`);
      const isPng = customTemplatePath.toLowerCase().endsWith('.png');

      let templateBuffer: Buffer;
      const meta = await sharp(customTemplatePath).metadata();

      if (isPng && !meta.hasAlpha) {
        // Auto-punch the 3 boxes if uploaded without transparency from Canva
        console.log('[Compositor] Auto-punching transparent holes for opaque Canva template...');
        const maskSvg = Buffer.from(`
          <svg width="${TEMPLATE_WIDTH}" height="${TEMPLATE_HEIGHT}">
            <rect width="100%" height="100%" fill="white" />
            <rect x="${pX}" y="${p1Y}" width="${pWidth}" height="${pHeight}" rx="48" ry="48" fill="black" />
            <rect x="${pX}" y="${p2Y}" width="${pWidth}" height="${pHeight}" rx="48" ry="48" fill="black" />
            <rect x="${pX}" y="${p3Y}" width="${pWidth}" height="${pHeight}" rx="48" ry="48" fill="black" />
          </svg>
        `);
        const maskRaw = await sharp(maskSvg).raw().toBuffer({ resolveWithObject: true });
        const imgWithAlpha = await sharp(customTemplatePath)
          .resize(TEMPLATE_WIDTH, TEMPLATE_HEIGHT)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        const d = imgWithAlpha.data;
        const md = maskRaw.data;
        for (let i = 0; i < TEMPLATE_WIDTH * TEMPLATE_HEIGHT; i++) {
          if (md[i * maskRaw.info.channels] < 128) {
            d[i * 4 + 3] = 0; // Transparent hole
          }
        }
        templateBuffer = await sharp(d, {
          raw: { width: TEMPLATE_WIDTH, height: TEMPLATE_HEIGHT, channels: 4 }
        }).png().toBuffer();
      } else {
        templateBuffer = await sharp(customTemplatePath)
          .resize(TEMPLATE_WIDTH, TEMPLATE_HEIGHT)
          .toBuffer();
      }

      if (isPng) {
        // Transparent frame overlay: photos placed underneath, custom PNG overlay on top
        const baseCanvas = await sharp({
          create: {
            width: TEMPLATE_WIDTH,
            height: TEMPLATE_HEIGHT,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          }
        }).png().toBuffer();

        await sharp(baseCanvas)
          .composite([
            { input: img1, left: pX, top: p1Y },
            { input: img2, left: pX, top: p2Y },
            { input: img3, left: pX, top: p3Y },
            { input: templateBuffer, left: 0, top: 0 }
          ])
          .jpeg({ quality: 98, chromaSubsampling: '4:4:4' })
          .toFile(tempFinalPath);
      } else {
        // Solid JPG background
        await sharp(templateBuffer)
          .composite([
            { input: img1, left: pX, top: p1Y },
            { input: img2, left: pX, top: p2Y },
            { input: img3, left: pX, top: p3Y }
          ])
          .jpeg({ quality: 98, chromaSubsampling: '4:4:4' })
          .toFile(tempFinalPath);
      }
    } else {
      // Fallback: Built-in SVG Y2K Dreamy background
      await sharp(Buffer.from(svgBackground))
        .composite([
          { input: img1, left: pX, top: p1Y },
          { input: img2, left: pX, top: p2Y },
          { input: img3, left: pX, top: p3Y }
        ])
        .jpeg({ quality: 98, chromaSubsampling: '4:4:4' })
        .toFile(tempFinalPath);
    }

    // Atomic rename for final
    await fs.rename(tempFinalPath, finalPath);

    // Create a high-res preview version (600x1800, quality 90)
    const tempPreviewPath = `${previewPath}.tmp`;
    await sharp(finalPath)
      .resize(600, 1800, { fit: 'inside' })
      .jpeg({ quality: 90 })
      .toFile(tempPreviewPath);
      
    await fs.rename(tempPreviewPath, previewPath);

    console.log(`[Compositor] Success for ${sessionId}`);
  } catch (err: any) {
    console.error(`[Compositor] Error: ${err.message}`);
    throw new Error(`COMPOSITING_FAILED: ${err.message}`);
  }
}
