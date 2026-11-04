import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';

// Ukuran standar kanvas Ultra-HD Strip Photobooth SI-FEST (2x6 inch @ 600 DPI)
export const TEMPLATE_WIDTH = 1200;
export const TEMPLATE_HEIGHT = 3600;

// Ukuran & koordinat 3 lubang frame foto standar
export const HOLE_WIDTH = 960;
export const HOLE_HEIGHT = 750;
export const HOLE_X = 120;
export const HOLE_Y1 = 908;
export const HOLE_Y2 = 1746;
export const HOLE_Y3 = 2582;
export const HOLE_RADIUS = 28;

export interface ProcessTemplateResult {
  width: number;
  height: number;
  punched: boolean;
  outputPath: string;
}

/**
 * Otomatis menyesuaikan ukuran frame/template ke ukuran standar 1200x3600
 * dan melubangi 3 frame foto secara transparan (PNG Alpha) jika masih tertutup.
 */
export async function autoStandardizeAndPunchTemplate(
  input: Buffer | string,
  outputPath: string,
  options?: { forcePunch?: boolean; cornerRadius?: number }
): Promise<ProcessTemplateResult> {
  const rx = options?.cornerRadius ?? HOLE_RADIUS;

  // 1. Baca metadata & ubah ukuran ke 1200 x 3600 dengan format RGBA 4 channels
  const resizedRaw = await sharp(input)
    .resize(TEMPLATE_WIDTH, TEMPLATE_HEIGHT, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const data = resizedRaw.data;

  // 2. Deteksi apakah 3 area foto masih tertutup (opaque) atau sudah transparan
  let needsPunch = Boolean(options?.forcePunch);
  if (!needsPunch) {
    const samplePoints = [
      { x: HOLE_X + Math.floor(HOLE_WIDTH / 2), y: HOLE_Y1 + Math.floor(HOLE_HEIGHT / 2) },
      { x: HOLE_X + Math.floor(HOLE_WIDTH / 2), y: HOLE_Y2 + Math.floor(HOLE_HEIGHT / 2) },
      { x: HOLE_X + Math.floor(HOLE_WIDTH / 2), y: HOLE_Y3 + Math.floor(HOLE_HEIGHT / 2) },
    ];

    for (const pt of samplePoints) {
      const idx = (pt.y * TEMPLATE_WIDTH + pt.x) * 4;
      const alpha = data[idx + 3];
      // Jika salah satu dari 3 titik tengah frame memiliki alpha > 80 (tertutup gambar/warna), wajib dilubangi
      if (alpha > 80) {
        needsPunch = true;
        break;
      }
    }
  }

  // 3. Buat lubang transparan pada 3 posisi foto
  if (needsPunch) {
    const maskSvg = Buffer.from(`
      <svg width="${TEMPLATE_WIDTH}" height="${TEMPLATE_HEIGHT}">
        <rect width="100%" height="100%" fill="white" />
        <rect x="${HOLE_X}" y="${HOLE_Y1}" width="${HOLE_WIDTH}" height="${HOLE_HEIGHT}" rx="${rx}" ry="${rx}" fill="black" />
        <rect x="${HOLE_X}" y="${HOLE_Y2}" width="${HOLE_WIDTH}" height="${HOLE_HEIGHT}" rx="${rx}" ry="${rx}" fill="black" />
        <rect x="${HOLE_X}" y="${HOLE_Y3}" width="${HOLE_WIDTH}" height="${HOLE_HEIGHT}" rx="${rx}" ry="${rx}" fill="black" />
      </svg>
    `);
    const maskRaw = await sharp(maskSvg).raw().toBuffer({ resolveWithObject: true });
    const maskData = maskRaw.data;

    for (let i = 0; i < TEMPLATE_WIDTH * TEMPLATE_HEIGHT; i++) {
      if (maskData[i * maskRaw.info.channels] < 128) {
        data[i * 4 + 3] = 0; // Transparan sempurna
      }
    }
  }

  // 4. Pastikan direktori tujuan ada dan simpan sebagai PNG berkualitas tinggi
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(data, {
    raw: { width: TEMPLATE_WIDTH, height: TEMPLATE_HEIGHT, channels: 4 }
  }).png({ compressionLevel: 8 }).toFile(outputPath);

  return {
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
    punched: needsPunch,
    outputPath,
  };
}
