import sharp from 'sharp';

const MAX_BYTES = 1 * 1024 * 1024; // 1 MB per spec

/**
 * Photo pipeline: light/contrast enhancement, then iteratively reduce JPEG
 * quality (and if needed, dimensions) until the output is under MAX_BYTES.
 */
export async function processPhoto(buffer: Buffer): Promise<Buffer> {
  let pipeline = sharp(buffer).rotate().normalize();
  let quality = 85;
  let output = await pipeline.clone().jpeg({ quality }).toBuffer();

  while (output.length > MAX_BYTES && quality > 30) {
    quality -= 10;
    output = await pipeline.clone().jpeg({ quality }).toBuffer();
  }

  if (output.length > MAX_BYTES) {
    // Still too big — scale down dimensions as a last resort.
    const metadata = await sharp(buffer).metadata();
    const scale = Math.sqrt(MAX_BYTES / output.length);
    const width = Math.round((metadata.width || 1600) * scale);
    output = await pipeline.clone().resize({ width }).jpeg({ quality: 70 }).toBuffer();
  }

  return output;
}
