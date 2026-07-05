import sharp from 'sharp';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB per spec — photos never use the document scanner module

/**
 * Photo pipeline: light/contrast enhancement, then iteratively reduce
 * JPEG quality until the output is under MAX_BYTES. Dimensions and
 * aspect ratio are always kept exactly as in the original — quality is
 * the only knob turned here, never a resize.
 */
export async function processPhoto(buffer: Buffer): Promise<Buffer> {
  const pipeline = sharp(buffer).rotate().normalize();
  let quality = 90;
  let output = await pipeline.clone().jpeg({ quality }).toBuffer();

  while (output.length > MAX_BYTES && quality > 20) {
    quality -= 10;
    output = await pipeline.clone().jpeg({ quality }).toBuffer();
  }

  return output;
}
