import sharp from 'sharp';

/**
 * Shared first step for every phone photo that goes through the scanner:
 * decode tolerantly, apply EXIF rotation and cap the size in ONE pass.
 * 3000px on the long side is plenty for OCR/edge detection, while 100–200 MP
 * Android photos would otherwise be decoded at full size (memory spike / timeout).
 */
export async function normalizePhoto(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: 'none', limitInputPixels: false })
    .rotate()
    .resize({ width: 3000, height: 3000, fit: 'inside', withoutEnlargement: true })
    .toBuffer();
}
