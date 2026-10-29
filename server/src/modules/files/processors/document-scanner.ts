import sharp from 'sharp';
import { scanDocument, rectifiedSize } from './docscan';

/**
 * Document scanner, in three composable steps so the upload flow can put a
 * real review step between capture and storage:
 *
 *   1. detectDocumentCorners() — finds the page's 4 corners. Implemented in
 *      ./docscan (v2): several independent methods (Canny, colour distance,
 *      brightness, saturation and an ONNX AI segmentation model) each
 *      propose a quadrilateral for the specific photo, the candidates are
 *      scored from evidence in that photo, the best one wins and its sides
 *      are then snapped to the real paper edge with sub-pixel accuracy.
 *
 *   2. warpDocument() — perspective-corrects given corners (detected, or
 *      dragged by the user) into a flat page. The output proportions are
 *      measured from the perspective itself (not guessed), snapping to
 *      A4 only when the measurement agrees.
 *
 *   3. applyFilters() — brightness/contrast/shadow-removal/B&W-vs-colour,
 *      independent of cropping.
 */

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface Point { x: number; y: number; }

/** Corners are ordered [top-left, top-right, bottom-right, bottom-left],
 * in the ORIGINAL (full-resolution, already EXIF-rotated) image's pixel
 * coordinates. */
export type Quad = [Point, Point, Point, Point];

export interface DetectedDocument {
  corners: Quad;
  /** Legacy (v1) traced boundary curves — no longer produced by detection;
   * only present on old scan sessions. Meaningful when passed back into warpDocument() alongside the *same,
   * unmodified* corners; a manually-edited quad should omit these and
   * get a plain 4-point transform instead. top/bottom are indexed by
   * full-resolution x (column), left/right by full-resolution y (row). */
  topCurve?: number[];
  bottomCurve?: number[];
  leftCurve?: number[];
  rightCurve?: number[];
  /** Which detection method won and its 0..1 confidence (v2 detector). */
  method?: string;
  score?: number;
  imageWidth: number;
  imageHeight: number;
}

export type FilterMode = 'original' | 'bw';

export interface FilterOptions {
  mode: FilterMode;
  /** -100..100, default 0 */
  brightness?: number;
  /** -100..100, default 0 */
  contrast?: number;
  removeShadows?: boolean;
}

// ---------------------------------------------------------------------
// Basic image ops
// ---------------------------------------------------------------------

function boxBlur(gray: Buffer | Uint8ClampedArray | Float32Array, width: number, height: number, radius: number, passes: number): Float32Array {
  let src: Buffer | Uint8ClampedArray | Float32Array = gray;
  for (let p = 0; p < passes; p++) {
    const tmp = new Float32Array(src.length);
    for (let y = 0; y < height; y++) {
      let acc = 0;
      const rowStart = y * width;
      for (let x = -radius; x <= radius; x++) acc += src[rowStart + Math.min(width - 1, Math.max(0, x))];
      for (let x = 0; x < width; x++) {
        tmp[rowStart + x] = acc / (radius * 2 + 1);
        const addX = Math.min(width - 1, x + radius + 1);
        const subX = Math.max(0, x - radius);
        acc += src[rowStart + addX] - src[rowStart + subX];
      }
    }
    const tmp2 = new Float32Array(src.length);
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let y = -radius; y <= radius; y++) acc += tmp[Math.min(height - 1, Math.max(0, y)) * width + x];
      for (let y = 0; y < height; y++) {
        tmp2[y * width + x] = acc / (radius * 2 + 1);
        const addY = Math.min(height - 1, y + radius + 1);
        const subY = Math.max(0, y - radius);
        acc += tmp[addY * width + x] - tmp[subY * width + x];
      }
    }
    src = tmp2;
  }
  return src as Float32Array;
}

/**
 * Locates the document's 4 corners (full-resolution coordinates). Returns
 * null if no confident document was found. `imageBuffer` should already be
 * EXIF-rotated. SCANNER_AI_ENABLED=false turns off only the AI method.
 */
export async function detectDocumentCorners(imageBuffer: Buffer): Promise<DetectedDocument | null> {
  const meta = await sharp(imageBuffer).metadata();
  const found = await scanDocument(imageBuffer);
  if (!found) return null;
  return {
    corners: found.corners,
    imageWidth: meta.width!,
    imageHeight: meta.height!,
    method: found.method,
    score: found.score,
  };
}

// ---------------------------------------------------------------------
// Warping
// ---------------------------------------------------------------------

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col] / M[col][col];
      for (let c = col; c <= n; c++) M[row][c] -= factor * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

function getPerspectiveTransform(src: Point[], dst: Point[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i];
    const { x: dx, y: dy } = dst[i];
    A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]); b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]); b.push(dy);
  }
  const h = solveLinearSystem(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function bilinearSample(rgba: Buffer, srcWidth: number, srcHeight: number, sx: number, sy: number, out: Buffer, outIdx: number) {
  if (sx < 0 || sy < 0 || sx >= srcWidth - 1 || sy >= srcHeight - 1) {
    out[outIdx] = out[outIdx + 1] = out[outIdx + 2] = 255;
    out[outIdx + 3] = 255;
    return;
  }
  const x0 = Math.floor(sx), y0 = Math.floor(sy);
  const fx = sx - x0, fy = sy - y0;
  for (let ch = 0; ch < 4; ch++) {
    const p00 = rgba[(y0 * srcWidth + x0) * 4 + ch];
    const p10 = rgba[(y0 * srcWidth + x0 + 1) * 4 + ch];
    const p01 = rgba[((y0 + 1) * srcWidth + x0) * 4 + ch];
    const p11 = rgba[((y0 + 1) * srcWidth + x0 + 1) * 4 + ch];
    const top = p00 * (1 - fx) + p10 * fx;
    const bottom = p01 * (1 - fx) + p11 * fx;
    out[outIdx + ch] = Math.round(top * (1 - fy) + bottom * fy);
  }
}

function warpStraight(rgba: Buffer, srcWidth: number, srcHeight: number, quad: Quad, outWidth: number, outHeight: number): Buffer {
  const dstCorners: Point[] = [
    { x: 0, y: 0 }, { x: outWidth, y: 0 },
    { x: outWidth, y: outHeight }, { x: 0, y: outHeight },
  ];
  const H = getPerspectiveTransform(dstCorners, quad);
  const out = Buffer.alloc(outWidth * outHeight * 4);

  for (let oy = 0; oy < outHeight; oy++) {
    for (let ox = 0; ox < outWidth; ox++) {
      const w = H[6] * ox + H[7] * oy + H[8];
      const sx = (H[0] * ox + H[1] * oy + H[2]) / w;
      const sy = (H[3] * ox + H[4] * oy + H[5]) / w;
      bilinearSample(rgba, srcWidth, srcHeight, sx, sy, out, (oy * outWidth + ox) * 4);
    }
  }
  return out;
}

/**
 * Warps by blending all 4 traced boundary curves (a Coons patch) rather
 * than just following top/bottom curves for vertical position and a
 * straight line for horizontal. A real photographed page can be
 * distorted along either axis — a slight physical curl top-to-bottom,
 * but also sometimes left-to-right (the camera not held quite
 * perpendicular, or the page itself bowing sideways) — and correcting
 * only one axis leaves the other's distortion in the output. The Coons
 * patch is the standard way to interpolate a deformed rectangle's
 * *interior* from its 4 *boundary* curves: blend what the top and
 * bottom curves say your vertical position should be, blend what the
 * left and right curves say your horizontal position should be, then
 * subtract the double-counted corner contribution.
 *
 * Each curve is clamped against what a straight line between the
 * relevant 2 corners would predict, capped at a fraction of the page's
 * size — genuine physical curvature deviates mildly and gradually; a
 * broken or noisy region mask (a real failure mode on a difficult,
 * low-contrast photo) can instead produce wild jumps that would
 * scramble the warp into nonsense if trusted outright.
 */
function warpGrid(
  rgba: Buffer, srcWidth: number, srcHeight: number, quad: Quad, outWidth: number, outHeight: number,
  curves: { topCurve: number[]; bottomCurve: number[]; leftCurve: number[]; rightCurve: number[] },
): Buffer {
  const [tl, tr, br, bl] = quad;
  const avgWidth = (Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(br.x - bl.x, br.y - bl.y)) / 2;
  const avgHeight = (Math.hypot(bl.x - tl.x, bl.y - tl.y) + Math.hypot(br.x - tr.x, br.y - tr.y)) / 2;
  const maxDevY = avgHeight * 0.06;
  const maxDevX = avgWidth * 0.06;

  // Pre-clamp each curve, indexed by its natural axis, against the
  // straight-line prediction between its 2 corners.
  const topClamped = new Float64Array(srcWidth);
  const bottomClamped = new Float64Array(srcWidth);
  for (let x = 0; x < srcWidth; x++) {
    const frac = Math.max(0, Math.min(1, (x - tl.x) / Math.max(1, tr.x - tl.x)));
    const straightTop = tl.y + (tr.y - tl.y) * frac;
    const straightBottom = bl.y + (br.y - bl.y) * frac;
    const rawTop = curves.topCurve[x] ?? straightTop;
    const rawBottom = curves.bottomCurve[x] ?? straightBottom;
    topClamped[x] = Math.max(straightTop - maxDevY, Math.min(straightTop + maxDevY, rawTop));
    bottomClamped[x] = Math.max(straightBottom - maxDevY, Math.min(straightBottom + maxDevY, rawBottom));
  }
  const leftClamped = new Float64Array(srcHeight);
  const rightClamped = new Float64Array(srcHeight);
  for (let y = 0; y < srcHeight; y++) {
    const frac = Math.max(0, Math.min(1, (y - tl.y) / Math.max(1, bl.y - tl.y)));
    const straightLeft = tl.x + (bl.x - tl.x) * frac;
    const straightRight = tr.x + (br.x - tr.x) * frac;
    const rawLeft = curves.leftCurve[y] ?? straightLeft;
    const rawRight = curves.rightCurve[y] ?? straightRight;
    leftClamped[y] = Math.max(straightLeft - maxDevX, Math.min(straightLeft + maxDevX, rawLeft));
    rightClamped[y] = Math.max(straightRight - maxDevX, Math.min(straightRight + maxDevX, rawRight));
  }

  const out = Buffer.alloc(outWidth * outHeight * 4);
  for (let oy = 0; oy < outHeight; oy++) {
    const v = oy / (outHeight - 1 || 1);
    for (let ox = 0; ox < outWidth; ox++) {
      const u = ox / (outWidth - 1 || 1);

      // Top/bottom curves are indexed by x — approximate which source x
      // this column corresponds to via the straight corner blend first.
      const approxTopX = tl.x + (tr.x - tl.x) * u;
      const approxBottomX = bl.x + (br.x - bl.x) * u;
      const cTopX = Math.max(0, Math.min(srcWidth - 1, Math.round(approxTopX)));
      const cBottomX = Math.max(0, Math.min(srcWidth - 1, Math.round(approxBottomX)));
      const cTop = { x: approxTopX, y: topClamped[cTopX] };
      const cBottom = { x: approxBottomX, y: bottomClamped[cBottomX] };

      // Left/right curves are indexed by y — approximate which source y
      // this row corresponds to via the straight corner blend.
      const approxLeftY = tl.y + (bl.y - tl.y) * v;
      const approxRightY = tr.y + (br.y - tr.y) * v;
      const cLeftY = Math.max(0, Math.min(srcHeight - 1, Math.round(approxLeftY)));
      const cRightY = Math.max(0, Math.min(srcHeight - 1, Math.round(approxRightY)));
      const cLeft = { x: leftClamped[cLeftY], y: approxLeftY };
      const cRight = { x: rightClamped[cRightY], y: approxRightY };

      // Coons patch: blend the 4 boundary curves, subtract the
      // double-counted bilinear corner term.
      const sx =
        (1 - v) * cTop.x + v * cBottom.x + (1 - u) * cLeft.x + u * cRight.x -
        ((1 - u) * (1 - v) * tl.x + u * (1 - v) * tr.x + (1 - u) * v * bl.x + u * v * br.x);
      const sy =
        (1 - v) * cTop.y + v * cBottom.y + (1 - u) * cLeft.y + u * cRight.y -
        ((1 - u) * (1 - v) * tl.y + u * (1 - v) * tr.y + (1 - u) * v * bl.y + u * v * br.y);

      bilinearSample(rgba, srcWidth, srcHeight, sx, sy, out, (oy * outWidth + ox) * 4);
    }
  }
  return out;
}

/**
 * Crops and straightens the document given its 4 corners. If `curves`
 * is supplied, follows the traced boundary shape on all 4 edges
 * (corrects physical page curvature/distortion on either axis);
 * otherwise (e.g. the corners were manually dragged by the user) does a
 * plain 4-point perspective transform.
 *
 * `imageBuffer` should already be EXIF-rotated.
 */
export async function warpDocument(
  imageBuffer: Buffer,
  quad: Quad,
  curves?: { topCurve: number[]; bottomCurve: number[]; leftCurve: number[]; rightCurve: number[] },
  targetRatio?: number,
): Promise<Buffer> {
  const { data: rgba, info } = await sharp(imageBuffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const [tl, tr, br, bl] = quad;

  let outWidth: number, outHeight: number;
  if (curves) {
    // legacy curved-page path (old sessions only): keep its original sizing
    outWidth = Math.max(10, Math.round(Math.max(Math.hypot(tr.x - tl.x, tr.y - tl.y), Math.hypot(br.x - bl.x, br.y - bl.y))));
    outHeight = Math.max(10, Math.round(Math.max(Math.hypot(bl.x - tl.x, bl.y - tl.y), Math.hypot(br.x - tr.x, br.y - tr.y))));
    if (targetRatio) {
      const naturalRatio = Math.max(outWidth, outHeight) / Math.min(outWidth, outHeight);
      if (Math.abs(naturalRatio - targetRatio) / targetRatio < 0.12) {
        if (outHeight >= outWidth) outHeight = Math.round(outWidth * targetRatio);
        else outWidth = Math.round(outHeight * targetRatio);
      }
    }
  } else {
    // true proportions of the page, measured from the perspective itself
    const longSide = Math.max(10, Math.round(Math.max(
      Math.hypot(tr.x - tl.x, tr.y - tl.y), Math.hypot(br.x - bl.x, br.y - bl.y),
      Math.hypot(bl.x - tl.x, bl.y - tl.y), Math.hypot(br.x - tr.x, br.y - tr.y))));
    const size = rectifiedSize(quad, width, height, targetRatio, longSide);
    outWidth = Math.max(10, size.width);
    outHeight = Math.max(10, size.height);
  }

  const warped = curves
    ? warpGrid(rgba, width, height, quad, outWidth, outHeight, curves)
    : warpStraight(rgba, width, height, quad, outWidth, outHeight);

  return sharp(warped, { raw: { width: outWidth, height: outHeight, channels: 4 } }).png().toBuffer();
}

// ---------------------------------------------------------------------
// Filters: white balance, shadow removal, brightness/contrast, B&W
// ---------------------------------------------------------------------

function grayWorldWhiteBalance(rgba: Buffer, width: number, height: number): Buffer {
  let sumR = 0, sumG = 0, sumB = 0;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    sumR += rgba[i * 4];
    sumG += rgba[i * 4 + 1];
    sumB += rgba[i * 4 + 2];
  }
  const avgR = sumR / n, avgG = sumG / n, avgB = sumB / n;
  const avgGray = (avgR + avgG + avgB) / 3;
  const scaleR = avgGray / Math.max(1, avgR);
  const scaleG = avgGray / Math.max(1, avgG);
  const scaleB = avgGray / Math.max(1, avgB);

  const out = Buffer.from(rgba);
  for (let i = 0; i < n; i++) {
    out[i * 4] = Math.max(0, Math.min(255, Math.round(rgba[i * 4] * scaleR)));
    out[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(rgba[i * 4 + 1] * scaleG)));
    out[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(rgba[i * 4 + 2] * scaleB)));
  }
  return out;
}

/** Removes shadows/uneven lighting while preserving colour: computes a
 * per-pixel brightening ratio from the *luminance* channel only (via
 * flat-fielding), then applies that same ratio to all 3 colour channels
 * so hue/saturation stay intact instead of collapsing to grayscale. */
function removeShadowsColor(rgba: Buffer, width: number, height: number): Buffer {
  const n = width * height;
  const luminance = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    luminance[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  }
  const radius = Math.max(15, Math.round(Math.min(width, height) * 0.04));
  const background = boxBlur(luminance, width, height, radius, 2);

  const out = Buffer.from(rgba);
  for (let i = 0; i < n; i++) {
    const bg = Math.max(background[i], 30);
    const ratio = Math.min(255 / bg, 1.6);
    out[i * 4] = Math.max(0, Math.min(255, Math.round(rgba[i * 4] * ratio)));
    out[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(rgba[i * 4 + 1] * ratio)));
    out[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(rgba[i * 4 + 2] * ratio)));
  }
  return out;
}

function applyBrightnessContrastRgb(rgba: Buffer, width: number, height: number, brightness: number, contrast: number): Buffer {
  const b = Math.max(-100, Math.min(100, brightness)) * 1.27;
  const contrastFactor = (100 + Math.max(-100, Math.min(100, contrast))) / 100;
  const n = width * height;
  const out = Buffer.from(rgba);
  for (let i = 0; i < n; i++) {
    for (let ch = 0; ch < 3; ch++) {
      const idx = i * 4 + ch;
      const v = (rgba[idx] - 128) * contrastFactor + 128 + b;
      out[idx] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return out;
}

function integralImage(values: Float64Array, width: number, height: number): Float64Array {
  const sat = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += values[y * width + x];
      sat[(y + 1) * (width + 1) + (x + 1)] = sat[y * (width + 1) + (x + 1)] + rowSum;
    }
  }
  return sat;
}

function windowSum(sat: Float64Array, width: number, height: number, x0: number, y0: number, x1: number, y1: number): number {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0);
  x1 = Math.min(width - 1, x1); y1 = Math.min(height - 1, y1);
  const w = width + 1;
  return sat[(y1 + 1) * w + (x1 + 1)] - sat[y0 * w + (x1 + 1)] - sat[(y1 + 1) * w + x0] + sat[y0 * w + x0];
}

/**
 * Sauvola adaptive binarization: compares each pixel against a threshold
 * computed from the *local* mean/stddev (windowRadius neighborhood)
 * rather than one global value, so uneven lighting gets handled
 * region-by-region. Standard, well-established technique for document
 * image binarization — genuinely crisp black ink / white paper.
 */
function sauvolaBinarize(gray: Uint8ClampedArray | Buffer, width: number, height: number, windowRadius: number, k: number, R: number): Buffer {
  const values = new Float64Array(width * height);
  const sqValues = new Float64Array(width * height);
  for (let i = 0; i < values.length; i++) { values[i] = gray[i]; sqValues[i] = gray[i] * gray[i]; }

  const sat = integralImage(values, width, height);
  const satSq = integralImage(sqValues, width, height);

  const out = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x0 = x - windowRadius, y0 = y - windowRadius, x1 = x + windowRadius, y1 = y + windowRadius;
      const cx0 = Math.max(0, x0), cy0 = Math.max(0, y0), cx1 = Math.min(width - 1, x1), cy1 = Math.min(height - 1, y1);
      const count = (cx1 - cx0 + 1) * (cy1 - cy0 + 1);

      const sum = windowSum(sat, width, height, x0, y0, x1, y1);
      const sumSq = windowSum(satSq, width, height, x0, y0, x1, y1);
      const mean = sum / count;
      const variance = Math.max(0, sumSq / count - mean * mean);
      const stddev = Math.sqrt(variance);

      const threshold = mean * (1 + k * (stddev / R - 1));
      const i = y * width + x;
      out[i] = gray[i] > threshold ? 255 : 0;
    }
  }
  return out;
}

/**
 * Applies the chosen look to an already-cropped document image:
 * gray-world white balance, optional shadow removal, brightness/
 * contrast, and either "original" (colour) or "bw" (Sauvola-binarized
 * black ink / white paper).
 */
export async function applyFilters(imageBuffer: Buffer, opts: FilterOptions): Promise<Buffer> {
  const { data: rgbaIn, info } = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  let rgba = grayWorldWhiteBalance(rgbaIn, width, height);
  if (opts.removeShadows) rgba = removeShadowsColor(rgba, width, height);
  rgba = applyBrightnessContrastRgb(rgba, width, height, opts.brightness ?? 0, opts.contrast ?? 0);

  if (opts.mode === 'original') {
    return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
  }

  const gray = await sharp(rgba, { raw: { width, height, channels: 4 } }).greyscale().raw().toBuffer();
  const windowRadius = Math.max(10, Math.round(Math.min(width, height) * 0.02));
  const binarized = sauvolaBinarize(gray, width, height, windowRadius, 0.28, 128);
  return sharp(binarized, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

export const A4_RATIO = Math.SQRT2; // 297mm / 210mm
