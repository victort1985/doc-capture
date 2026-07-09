import sharp from 'sharp';

const MAX_BYTES = 1 * 1024 * 1024; // 1 MB per spec — minimal/no visible quality loss at that budget

/**
 * Photo pipeline: light/contrast enhancement, then finds the smallest
 * possible quality loss that still fits under MAX_BYTES.
 *
 * Two techniques, in order, before ever touching the image's actual
 * dimensions:
 *  1. mozjpeg encoding — a meaningfully better quality-per-byte encoder
 *     than the default libjpeg one sharp otherwise uses; often gets a
 *     visually-lossless result at a smaller size than default encoding
 *     would at the same JPEG quality number.
 *  2. Binary search over the quality parameter (rather than fixed -10
 *     steps) — finds the *highest* quality that still fits the budget,
 *     instead of overshooting straight past it into a lower quality
 *     than necessary.
 *
 * Only if quality alone can't reach 1MB without dropping below a
 * reasonable floor (meaning the photo's native resolution is just too
 * high for that budget at acceptable quality) does this fall back to
 * modestly downscaling — a slightly smaller but crisp photo looks
 * better than a full-resolution but visibly blocky one, which is the
 * actual failure mode pure quality reduction hits on a large modern
 * phone photo.
 */
export async function processPhoto(buffer: Buffer): Promise<Buffer> {
  const enhanced = await sharp(buffer).rotate().normalize().toBuffer();

  const encode = async (input: Buffer, quality: number): Promise<Buffer> =>
    sharp(input).jpeg({ quality, mozjpeg: true }).toBuffer();

  // Binary search for the highest quality (in [floor, ceiling]) whose
  // encoded size is still <= MAX_BYTES. Returns null if even the floor
  // quality doesn't fit — the caller then falls back to downscaling.
  const findBestQuality = async (input: Buffer, floor: number, ceiling: number): Promise<Buffer | null> => {
    const atFloor = await encode(input, floor);
    if (atFloor.length > MAX_BYTES) return null;

    let lo = floor, hi = ceiling, best = atFloor;
    while (lo <= hi && hi - lo > 3) {
      const mid = Math.round((lo + hi) / 2);
      const candidate = await encode(input, mid);
      if (candidate.length <= MAX_BYTES) {
        best = candidate;
        lo = mid + 1; // this quality fits — try to go higher
      } else {
        hi = mid - 1; // too big — back off
      }
    }
    return best;
  };

  const atFullSize = await findBestQuality(enhanced, 40, 95);
  if (atFullSize) return atFullSize;

  // Still over budget even at the quality floor — progressively
  // downscale and retry. Each step keeps aspect ratio and re-runs the
  // same quality search, so the result is always "best quality
  // achievable at this size", not an arbitrary fixed quality.
  const meta = await sharp(enhanced).metadata();
  const originalWidth = meta.width ?? 4000;

  for (const scale of [0.85, 0.7, 0.55, 0.4, 0.3]) {
    const resized = await sharp(enhanced)
      .resize({ width: Math.round(originalWidth * scale) })
      .toBuffer();
    const result = await findBestQuality(resized, 40, 95);
    if (result) return result;
  }

  // Extreme fallback (shouldn't realistically be reached): smallest
  // scale and floor quality, whatever the size — better to deliver
  // something than nothing.
  const smallest = await sharp(enhanced).resize({ width: Math.round(originalWidth * 0.3) }).toBuffer();
  return encode(smallest, 40);
}
