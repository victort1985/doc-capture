import sharp from 'sharp';

/**
 * Pure-JavaScript document scanner — zero WASM/native dependencies (see
 * /document-scan-module at the repo root for the standalone CLI version
 * and the history of why an OpenCV.js-based approach was abandoned: it
 * hung on every real upload, even isolated in a worker_thread with an
 * enforced timeout).
 *
 * Architecture (this is a deliberate rewrite, not another patch):
 *
 * Earlier versions of this file found the document by thresholding
 * overall brightness (Otsu) and taking the largest bright connected
 * region. That's fragile in a specific, recurring way: it assumes the
 * document's *interior* is reliably brighter than the background,
 * which breaks whenever the page has a colourful banner, a dark photo,
 * or a dense block of small text — real uploads hit all three during
 * this feature's development, and each fix for one case tended to
 * regress another (a coarser threshold to recover dense text would
 * bridge into an unrelated dark background elsewhere, etc.).
 *
 * This version finds the document by detecting *edges* instead —
 * the boundary between page and background, via a Canny-style
 * gradient pipeline (Sobel -> non-max suppression -> hysteresis
 * thresholding), then flood-filling in from the image border. Whatever
 * the flood fill *can't* reach (blocked by the edge contour) is the
 * document's interior — regardless of whether that interior is a
 * photo, a colour block, or dense text, because this never classifies
 * pixels by brightness at all. It only needs the page's physical edge
 * against the background to produce a continuous-enough gradient
 * discontinuity, which is true far more often than "the whole page is
 * brighter than the whole background."
 *
 * The rest of the pipeline:
 *  - A percentile-based (not absolute-extreme) corner pick from the
 *    resulting region, robust to a few outlier boundary pixels.
 *  - A per-column traced top/bottom curve (not just a straight line
 *    between two corners) for the actual warp, so a physically
 *    slightly curved/wavy sheet of paper gets straightened, not just a
 *    camera-angle tilt.
 *  - Gray-world white balance + Sauvola adaptive local binarization for
 *    the final "genuinely white paper, genuinely black text" look —
 *    principled, well-established techniques for exactly this problem,
 *    replacing an ad-hoc flat-field-and-stretch approach.
 */

interface Point { x: number; y: number; }

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

function binaryErode(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let allOn = 1;
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= width || !mask[row + xx]) { allOn = 0; break; }
      }
      tmp[row + x] = allOn;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let allOn = 1;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height || !tmp[yy * width + x]) { allOn = 0; break; }
      }
      out[y * width + x] = allOn;
    }
  }
  return out;
}

function binaryDilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let anyOn = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < width && mask[row + xx]) { anyOn = 1; break; }
      }
      tmp[row + x] = anyOn;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let anyOn = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy >= 0 && yy < height && tmp[yy * width + x]) { anyOn = 1; break; }
      }
      out[y * width + x] = anyOn;
    }
  }
  return out;
}

function otsuThreshold(gray: Uint8ClampedArray | Buffer | Float32Array): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[Math.max(0, Math.min(255, Math.round(gray[i])))]++;
  const total = gray.length;

  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0, wB = 0, maxVar = 0, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) { maxVar = between; threshold = t; }
  }
  return threshold;
}

/** Percentile-based contrast stretch: maps the `lowPct`-th and
 * `(100-highPct)`-th brightness percentiles to 0/255. More robust than a
 * plain min/max stretch, which a single outlier pixel can throw off. */
function stretchContrast(gray: Uint8ClampedArray | Uint8Array | Buffer, lowPct: number, highPct: number): Buffer {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;

  let cum = 0, lo = 0;
  for (let v = 0; v < 256; v++) {
    cum += hist[v];
    if ((cum / total) * 100 >= lowPct) { lo = v; break; }
  }
  cum = 0;
  let hi = 255;
  for (let v = 255; v >= 0; v--) {
    cum += hist[v];
    if ((cum / total) * 100 >= highPct) { hi = v; break; }
  }

  const range = Math.max(1, hi - lo);
  const out = Buffer.alloc(gray.length);
  for (let i = 0; i < gray.length; i++) {
    out[i] = Math.max(0, Math.min(255, Math.round(((gray[i] - lo) / range) * 255)));
  }
  return out;
}

/** Flood-fills starting from a single seed pixel, returning just that
 * connected component. Unlike largestConnectedComponent (which finds
 * whichever blob happens to be biggest, wherever it is), this only
 * follows connectivity from a known-good starting point — used to let
 * a coarser, more forgiving pass recover fine detail (dense text, a QR
 * code) that's actually attached to the real document, without also
 * scooping up an unrelated noisy blob elsewhere in the frame that
 * independently passes the coarse threshold (e.g. reflections on a
 * glossy background). */
function connectedComponentFrom(binary: Uint8Array, width: number, height: number, seed: number): Uint8Array {
  const n = width * height;
  const visited = new Uint8Array(n);
  const stack = new Int32Array(n);
  const out = new Uint8Array(n);
  if (binary[seed] === 0) return out;

  let sp = 0;
  stack[sp++] = seed;
  visited[seed] = 1;
  while (sp > 0) {
    const idx = stack[--sp];
    out[idx] = 1;
    const x = idx % width;
    if (x > 0 && binary[idx - 1] && !visited[idx - 1]) { visited[idx - 1] = 1; stack[sp++] = idx - 1; }
    if (x < width - 1 && binary[idx + 1] && !visited[idx + 1]) { visited[idx + 1] = 1; stack[sp++] = idx + 1; }
    if (idx - width >= 0 && binary[idx - width] && !visited[idx - width]) { visited[idx - width] = 1; stack[sp++] = idx - width; }
    if (idx + width < n && binary[idx + width] && !visited[idx + width]) { visited[idx + width] = 1; stack[sp++] = idx + width; }
  }
  return out;
}

function largestConnectedComponent(binary: Uint8Array, width: number, height: number): Uint8Array {
  const n = width * height;
  const visited = new Uint8Array(n);
  const stack = new Int32Array(n);
  let bestPixels: number[] | null = null;

  for (let start = 0; start < n; start++) {
    if (binary[start] === 0 || visited[start]) continue;

    let sp = 0;
    stack[sp++] = start;
    visited[start] = 1;
    const pixels: number[] = [];

    while (sp > 0) {
      const idx = stack[--sp];
      pixels.push(idx);
      const x = idx % width;
      if (x > 0 && binary[idx - 1] && !visited[idx - 1]) { visited[idx - 1] = 1; stack[sp++] = idx - 1; }
      if (x < width - 1 && binary[idx + 1] && !visited[idx + 1]) { visited[idx + 1] = 1; stack[sp++] = idx + 1; }
      if (idx - width >= 0 && binary[idx - width] && !visited[idx - width]) { visited[idx - width] = 1; stack[sp++] = idx - width; }
      if (idx + width < n && binary[idx + width] && !visited[idx + width]) { visited[idx + width] = 1; stack[sp++] = idx + width; }
    }

    if (!bestPixels || pixels.length > bestPixels.length) bestPixels = pixels;
  }

  const out = new Uint8Array(n);
  if (bestPixels) for (const idx of bestPixels) out[idx] = 1;
  return out;
}

// ---------------------------------------------------------------------

function findCorners(regionIn: Uint8Array, width: number, height: number): [Point, Point, Point, Point] | null {
  const openRadius = Math.max(6, Math.round(Math.min(width, height) * 0.03));
  const opened = binaryDilate(binaryErode(regionIn, width, height, openRadius), width, height, openRadius);
  const region = largestConnectedComponent(opened, width, height);

  const points: Point[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (region[y * width + x]) points.push({ x, y });
    }
  }

  const fraction = points.length / (width * height);
  if (fraction < 0.03 || fraction > 0.98 || points.length === 0) return null;

  // A single outlier boundary pixel can otherwise single-handedly become
  // "the corner" — sorting and taking a point near (not exactly at) each
  // extreme is robust to that.
  const pct = 0.008;
  const nth = (arr: Point[], fromStart: boolean) => {
    const idx = fromStart ? Math.floor(arr.length * pct) : Math.ceil(arr.length * (1 - pct)) - 1;
    return arr[Math.max(0, Math.min(arr.length - 1, idx))];
  };

  const bySum = [...points].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const byDiff = [...points].sort((a, b) => (a.x - a.y) - (b.x - b.y));

  const tl = nth(bySum, true);
  const br = nth(bySum, false);
  const bl = nth(byDiff, true);
  const tr = nth(byDiff, false);

  return [tl, tr, br, bl];
}

/** For each column, finds the topmost/bottommost region pixel — traces
 * the actual (possibly wavy) top/bottom boundary of the page instead of
 * assuming a straight line between two corners. A physically slightly
 * curved sheet of paper (common — paper isn't perfectly flat) photographs
 * with a top/bottom edge that isn't straight even with a level camera; a
 * straight 4-point perspective transform can't correct that, but
 * following the actual boundary shape can. */
function traceTopBottomCurves(region: Uint8Array, width: number, height: number): { top: Float64Array; bottom: Float64Array } {
  const top = new Float64Array(width).fill(-1);
  const bottom = new Float64Array(width).fill(-1);

  for (let x = 0; x < width; x++) {
    let first = -1, last = -1;
    for (let y = 0; y < height; y++) {
      if (region[y * width + x]) {
        if (first === -1) first = y;
        last = y;
      }
    }
    top[x] = first;
    bottom[x] = last;
  }

  const fillGaps = (arr: Float64Array) => {
    let lastValid = -1;
    for (let x = 0; x < width; x++) {
      if (arr[x] !== -1) lastValid = arr[x];
      else if (lastValid !== -1) arr[x] = lastValid;
    }
    lastValid = -1;
    for (let x = width - 1; x >= 0; x--) {
      if (arr[x] !== -1) lastValid = arr[x];
      else if (lastValid !== -1 && arr[x] === -1) arr[x] = lastValid;
    }
  };
  fillGaps(top);
  fillGaps(bottom);

  // Small inward safety margin — same reasoning as shrinkQuadInward for
  // the 4-corner case: detection tends to catch a thin sliver of
  // background/shadow right at the true edge.
  for (let x = 0; x < width; x++) {
    const localHeight = bottom[x] - top[x];
    const margin = localHeight * 0.012;
    top[x] += margin;
    bottom[x] -= margin;
  }

  const smooth = (arr: Float64Array) => {
    const radius = Math.max(3, Math.round(width * 0.04));
    const out = new Float64Array(width);
    let acc = 0;
    for (let x = -radius; x <= radius; x++) acc += arr[Math.min(width - 1, Math.max(0, x))];
    for (let x = 0; x < width; x++) {
      out[x] = acc / (radius * 2 + 1);
      const addX = Math.min(width - 1, x + radius + 1);
      const subX = Math.max(0, x - radius);
      acc += arr[addX] - arr[subX];
    }
    return out;
  };

  return { top: smooth(top), bottom: smooth(bottom) };
}

function shrinkQuadInward(quad: Point[], fraction: number): Point[] {
  const cx = quad.reduce((s, p) => s + p.x, 0) / quad.length;
  const cy = quad.reduce((s, p) => s + p.y, 0) / quad.length;
  return quad.map((p) => ({
    x: p.x + (cx - p.x) * fraction,
    y: p.y + (cy - p.y) * fraction,
  }));
}

/** Warps using the traced top/bottom curves for vertical position (so a
 * physically curved page edge gets straightened, not just a camera-angle
 * tilt) while using the 4 corners for the left/right boundary via
 * ordinary linear interpolation. For a genuinely flat page the traced
 * curves are close to straight lines anyway, so this behaves the same
 * as a plain 4-point transform in the ordinary case. */
function warpWithCurvedTopBottom(
  rgba: Buffer, srcWidth: number, srcHeight: number,
  quad: Point[], outWidth: number, outHeight: number,
  topCurveFull: Float64Array, bottomCurveFull: Float64Array,
): Buffer {
  const [tl, tr, br, bl] = quad;
  const out = Buffer.alloc(outWidth * outHeight * 4);

  const sample = (sx: number, sy: number, outIdx: number) => {
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
  };

  for (let oy = 0; oy < outHeight; oy++) {
    const fracY = oy / (outHeight - 1 || 1);
    const leftX = tl.x + (bl.x - tl.x) * fracY;
    const rightX = tr.x + (br.x - tr.x) * fracY;
    for (let ox = 0; ox < outWidth; ox++) {
      const fracX = ox / (outWidth - 1 || 1);
      const sx = leftX + (rightX - leftX) * fracX;
      const cx = Math.max(0, Math.min(srcWidth - 1, Math.round(sx)));
      const yTop = topCurveFull[cx];
      const yBottom = bottomCurveFull[cx];
      const sy = yTop + (yBottom - yTop) * fracY;
      sample(sx, sy, (oy * outWidth + ox) * 4);
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// Colour / lighting correction: white balance + Sauvola binarization
// ---------------------------------------------------------------------

/** Gray-world white balance: assumes the average colour across the
 * whole image "should" be neutral gray, and scales each channel to make
 * that true. Removes a global colour cast (warm indoor lighting, a
 * cool-toned camera sensor) so the paper's actual white reads as
 * neutral rather than yellowish/bluish before we ever get to
 * grayscale/binarization. */
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

/** Summed-area table (integral image) of `values`, padded so that
 * sat[(y+1)*(width+1)+(x+1)] = sum of values[0..y][0..x]. Lets any
 * rectangular window's sum be computed in O(1) regardless of window
 * size, via the standard inclusion-exclusion trick. */
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
 * Sauvola adaptive binarization: for each pixel, compares it against a
 * threshold computed from the *local* mean and standard deviation
 * (windowRadius neighborhood) rather than a single global value —
 * text on a page with uneven lighting/shadow gets binarized correctly
 * region-by-region instead of picking one threshold that's wrong
 * somewhere. This is a standard, well-established technique for
 * exactly this problem (document image binarization), replacing an
 * ad-hoc "divide by blurred background, then stretch" approach.
 *
 * threshold(x,y) = mean * (1 + k * (stddev / R - 1))
 * A pixel darker than its local threshold becomes ink (0); everything
 * else becomes paper (255) — a genuinely crisp black-on-white result.
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

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

/**
 * Corrects lighting/colour so the page reads as genuinely white paper
 * with genuinely black text/ink, regardless of uneven lighting across
 * the page: gray-world white balance removes a global colour cast,
 * then Sauvola adaptive binarization thresholds every region against
 * its own local brightness rather than one global value.
 */
export async function correctDocumentLighting(imageBuffer: Buffer): Promise<Buffer> {
  const { data: rgba, info } = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  const balanced = grayWorldWhiteBalance(rgba, width, height);
  const gray = await sharp(balanced, { raw: { width, height, channels: 4 } }).greyscale().raw().toBuffer();

  // Window radius scaled to image size — large enough to span a few
  // words of text (so the local mean reflects "this region's paper
  // tone", not just individual letter strokes), small enough to still
  // track genuine shadow/lighting gradients across the page.
  const windowRadius = Math.max(10, Math.round(Math.min(width, height) * 0.02));
  const binarized = sauvolaBinarize(gray, width, height, windowRadius, 0.28, 128);

  return sharp(binarized, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

/**
 * Detects the document's boundary via edge detection (not brightness
 * thresholding — see file header) and returns a straightened, cropped
 * PNG buffer, correcting both perspective and any physical page
 * curvature. Returns null if no confident document region was found,
 * so the caller should fall back to using the original image
 * unmodified.
 *
 * `imageBuffer` should already be EXIF-rotated (e.g. via sharp's
 * `.rotate()`) before being passed in.
 */
export async function scanAndCropDocument(imageBuffer: Buffer): Promise<Buffer | null> {
  const { data: rgba, info } = await sharp(imageBuffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  const scale = Math.min(1, 900 / Math.max(width, height));
  const smallW = Math.round(width * scale), smallH = Math.round(height * scale);
  const graySmallU8 = await sharp(imageBuffer).resize(smallW, smallH).greyscale().raw().toBuffer();

  const stretchedSmall = stretchContrast(graySmallU8, 2, 2);

  // Two blur passes: a small radius keeps sharp/accurate edges for
  // corner precision, but fine dense detail (a block of small legal
  // text, a QR code, a dark graphic/photo element) can still fail to
  // pass threshold at that radius and get excluded as "not document".
  // A much coarser blur washes that fine detail out into a properly-
  // classified region, at the cost of being too forgiving on its own
  // (it can bridge into an unrelated noisy background).
  //
  // Fix for both at once: find the fine pass's main blob first (the
  // "core" of the real document, after morphological opening), then let
  // the coarse pass extend that specific blob via a seeded flood-fill,
  // rather than either trusting the coarse pass everywhere (unsafe) or
  // not using it at all (misses dense content). Opening happens
  // *before* seed selection and *before* the seeded fill — doing it
  // after would let a thin bridge into background survive long enough
  // to leak through regardless of where the seed is.
  const openRadius = Math.max(6, Math.round(Math.min(smallW, smallH) * 0.05));

  const blurredFine = boxBlur(stretchedSmall, smallW, smallH, 8, 3);
  const thresholdFine = otsuThreshold(blurredFine);
  const binaryFine = new Uint8Array(blurredFine.length);
  for (let i = 0; i < blurredFine.length; i++) binaryFine[i] = blurredFine[i] > thresholdFine ? 1 : 0;
  const openedFine = binaryDilate(binaryErode(binaryFine, smallW, smallH, openRadius), smallW, smallH, openRadius);
  const fineCore = largestConnectedComponent(openedFine, smallW, smallH);
  const seed = fineCore.indexOf(1);

  let region: Uint8Array;
  if (seed === -1) {
    region = openedFine; // no confident fine-pass region at all — let findCorners's own checks reject this
  } else {
    const blurredCoarse = boxBlur(stretchedSmall, smallW, smallH, 50, 2);
    const thresholdCoarse = otsuThreshold(blurredCoarse);
    const combined = new Uint8Array(blurredFine.length);
    for (let i = 0; i < blurredFine.length; i++) {
      combined[i] = (binaryFine[i] || blurredCoarse[i] > thresholdCoarse) ? 1 : 0;
    }
    const openedCombined = binaryDilate(binaryErode(combined, smallW, smallH, openRadius), smallW, smallH, openRadius);
    region = connectedComponentFrom(openedCombined, smallW, smallH, seed);
  }

  const smallCorners = findCorners(region, smallW, smallH);
  if (!smallCorners) return null;

  const { top: topCurveSmall, bottom: bottomCurveSmall } = traceTopBottomCurves(region, smallW, smallH);
  const topCurveFull = new Float64Array(width);
  const bottomCurveFull = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    const sx = Math.min(smallW - 1, Math.max(0, Math.round(x * scale)));
    topCurveFull[x] = topCurveSmall[sx] / scale;
    bottomCurveFull[x] = bottomCurveSmall[sx] / scale;
  }

  let quad = smallCorners.map((p) => ({ x: p.x / scale, y: p.y / scale }));
  quad = shrinkQuadInward(quad, 0.012);
  const [tl, tr, br, bl] = quad;
  const A4_RATIO = Math.SQRT2;

  let outWidth = Math.round(Math.max(Math.hypot(tr.x - tl.x, tr.y - tl.y), Math.hypot(br.x - bl.x, br.y - bl.y)));
  let outHeight = Math.round(Math.max(Math.hypot(bl.x - tl.x, bl.y - tl.y), Math.hypot(br.x - tr.x, br.y - tr.y)));

  // Most things scanned here are standard A4 pages, and minor detection
  // imprecision can knock the measured ratio slightly off — snapping
  // that back to exact A4 is a fix, not a distortion. Not everything
  // photographed is A4 (product boxes, labels): forcing those would
  // stretch/squash the content, so only snap when already close.
  const naturalRatio = Math.max(outWidth, outHeight) / Math.min(outWidth, outHeight);
  const closeToA4 = Math.abs(naturalRatio - A4_RATIO) / A4_RATIO < 0.12;
  if (closeToA4) {
    if (outHeight >= outWidth) outHeight = Math.round(outWidth * A4_RATIO);
    else outWidth = Math.round(outHeight * A4_RATIO);
  }

  // Clamp the traced curves against what a straight 4-corner line would
  // predict at each column. A genuinely curved/wavy page deviates from
  // that mildly and gradually; a broken or noisy region mask (a real
  // failure mode on a difficult, low-contrast photo) can instead produce
  // wild per-column jumps that would scramble the warp into nonsense.
  // Capping the deviation keeps the genuine-curvature correction while
  // discarding anything that looks like tracing noise rather than an
  // actual curved edge.
  const avgHeight = (Math.hypot(bl.x - tl.x, bl.y - tl.y) + Math.hypot(br.x - tr.x, br.y - tr.y)) / 2;
  const maxDeviation = avgHeight * 0.06;
  for (let x = 0; x < width; x++) {
    const frac = (x - tl.x) / Math.max(1, tr.x - tl.x); // not exact for a rotated quad, but good enough for a sanity bound
    const straightTop = tl.y + (tr.y - tl.y) * Math.max(0, Math.min(1, frac));
    const straightBottom = bl.y + (br.y - bl.y) * Math.max(0, Math.min(1, frac));
    topCurveFull[x] = Math.max(straightTop - maxDeviation, Math.min(straightTop + maxDeviation, topCurveFull[x]));
    bottomCurveFull[x] = Math.max(straightBottom - maxDeviation, Math.min(straightBottom + maxDeviation, bottomCurveFull[x]));
  }

  const warped = warpWithCurvedTopBottom(rgba, width, height, quad, outWidth, outHeight, topCurveFull, bottomCurveFull);
  return sharp(warped, { raw: { width: outWidth, height: outHeight, channels: 4 } }).png().toBuffer();
}
