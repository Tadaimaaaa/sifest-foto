import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';

// Ukuran standar kanvas Ultra-HD Strip Photobooth SI-FEST (2x6 inch @ 600 DPI)
export const TEMPLATE_WIDTH = 1200;
export const TEMPLATE_HEIGHT = 3600;

export interface HoleBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Deteksi koordinat 3 lubang transparan pada template secara dinamis
 */
export function detectTransparentHoles(data: Buffer, width: number, height: number): HoleBounds[] {
  const transRows: number[] = [];
  for (let y = 0; y < height; y++) {
    let hasTrans = false;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 50) {
        hasTrans = true;
        break;
      }
    }
    if (hasTrans) transRows.push(y);
  }

  if (transRows.length === 0) return [];

  const gaps: Array<[number, number]> = [];
  let start = transRows[0];
  for (let i = 1; i < transRows.length; i++) {
    if (transRows[i] > transRows[i - 1] + 2) {
      gaps.push([start, transRows[i - 1]]);
      start = transRows[i];
    }
  }
  gaps.push([start, transRows[transRows.length - 1]]);

  // Filter lubang dengan tinggi minimal 150px agar noise terabaikan
  const validGaps = gaps.filter(([s, e]) => e - s > 150);

  return validGaps.map(([startY, endY]) => {
    let minX = width;
    let maxX = 0;
    const stepY = Math.max(1, Math.floor((endY - startY) / 10));
    for (let y = startY + 20; y < endY - 20; y += stepY) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] < 50) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }
    if (minX > maxX) {
      minX = 100;
      maxX = 1100;
    }
    return {
      x: minX,
      y: startY,
      width: maxX - minX + 1,
      height: endY - startY + 1,
    };
  });
}

/**
 * Deteksi apakah template menggunakan tata letak:
 * - 'bottom-title': Judul di bawah, 3 foto di atas & tengah (Y = 190, 1060, 1940) -> seperti SI FEST
 * - 'top-title': Judul di atas, 3 foto di tengah & bawah (Y = 908, 1746, 2582) -> seperti Classic
 */
export function detectLayoutType(data: Buffer, width: number, height: number): 'bottom-title' | 'top-title' {
  // Cek sampel area atas (Y = 250..800) dan area bawah (Y = 2700..3400)
  // Di 'top-title', area atas (Y = 0..850) memiliki logo/teks judul besar (bukan frame foto).
  // Di 'bottom-title' (SI FEST), area atas (Y = 190..890) adalah FRAME FOTO 1.
  let topFrameScore = 0;
  const sampleXs = [300, 600, 900];

  for (let y = 300; y <= 750; y += 30) {
    for (const x of sampleXs) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      // Jika transparan, pasti lubang frame
      if (a < 50) {
        topFrameScore += 2;
        continue;
      }

      // Ciri khas Canva placeholder:
      // 1. Rumput hijau (G lebih tinggi dari R & B)
      const isGrass = g > 110 && g > r + 15 && g > b + 25;
      // 2. Langit biru muda / awan putih
      const isSky = (b > 180 && b >= g && g >= r) || (r > 200 && g > 200 && b > 200);
      if (isGrass || isSky) {
        topFrameScore++;
      }
    }
  }

  // Jika di area atas (Y = 300..750) terdeteksi konten frame foto, gunakan bottom-title (SI FEST)
  if (topFrameScore >= 8) {
    return 'bottom-title';
  }

  // Default untuk photobooth SI-FEST: bottom-title (Foto di atas, judul di bawah)
  return 'bottom-title';
}

export interface ProcessTemplateResult {
  width: number;
  height: number;
  punched: boolean;
  outputPath: string;
}

/**
 * Otomatis menyesuaikan ukuran frame/template ke ukuran standar 1200x3600
 * dan melubangi 3 frame foto secara transparan (PNG Alpha).
 * Jika template SUDAH memiliki lubang transparan, lubang aslinya TIDAK AKAN DIUBAH!
 */
export async function autoStandardizeAndPunchTemplate(
  input: Buffer | string,
  outputPath: string,
  options?: { forcePunch?: boolean; layout?: 'bottom-title' | 'top-title' }
): Promise<ProcessTemplateResult> {
  // 1. Baca metadata & standarisasi ukuran ke 1200 x 3600 format RGBA
  const resizedRaw = await sharp(input)
    .resize(TEMPLATE_WIDTH, TEMPLATE_HEIGHT, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const data = resizedRaw.data;

  // 2. Cek apakah gambar SUDAH memiliki 3 lubang transparan asli
  const existingHoles = detectTransparentHoles(data, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);

  // Jika sudah memiliki 3 lubang transparan dan layout tidak dipaksa secara spesifik, pertahankan lubang aslinya!
  if (existingHoles.length === 3 && !options?.layout) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await sharp(data, {
      raw: { width: TEMPLATE_WIDTH, height: TEMPLATE_HEIGHT, channels: 4 }
    }).png({ compressionLevel: 8 }).toFile(outputPath);

    return {
      width: TEMPLATE_WIDTH,
      height: TEMPLATE_HEIGHT,
      punched: false,
      outputPath,
    };
  }

  // 3. Tentukan tata letak 3 lubang foto
  const layout = options?.layout || detectLayoutType(data, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);

  let holeW = 1000;
  let holeH = 700;
  let holeX = 100;
  let rx = 36;
  let holesY = [190, 1060, 1940];

  if (layout === 'top-title') {
    // Model Classic / Y2K: Judul di atas (Y=0..900), 3 foto di bawah
    holeW = 960;
    holeH = 750;
    holeX = 120;
    rx = 28;
    holesY = [908, 1746, 2582];
  } else {
    // Model SI FEST: Judul di bawah (Y=2700..3600), 3 foto di atas & tengah
    holeW = 1000;
    holeH = 700;
    holeX = 100;
    rx = 36;
    holesY = [190, 1060, 1940];
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
  const maskData = maskRaw.data;

  for (let i = 0; i < TEMPLATE_WIDTH * TEMPLATE_HEIGHT; i++) {
    if (maskData[i * maskRaw.info.channels] < 128) {
      data[i * 4 + 3] = 0; // Transparan sempurna tepat di 3 kotak foto
    }
  }

  // 4. Simpan ke PNG
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(data, {
    raw: { width: TEMPLATE_WIDTH, height: TEMPLATE_HEIGHT, channels: 4 }
  }).png({ compressionLevel: 8 }).toFile(outputPath);

  return {
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
    punched: true,
    outputPath,
  };
}
