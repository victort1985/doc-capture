import sharp from 'sharp';

/**
 * Pure-JavaScript document scanner — zero WASM/native dependencies (see
 * /document-scan-module at the repo root for the standalone CLI version
 * and the history of why an OpenCV.js-based approach was abandoned: it
 * hung on every real upload, even isolated in a worker_thread with an
 * enforced timeout).
 *
 * This module is deliberately split into three composable steps, rather
 * than one do-everything function, so the upload flow can put a real
 * review step in between capture and finalizing to storage (auto-detect
 * -> let the user drag corners / pick a filter / adjust brightness and
 * contrast / toggle shadow removal, previewing each change -> only then
 * commit):
 *
 *   1. detectDocumentCorners() — finds the page's 4 corners (plus the
 *      traced top/bottom boundary curve, for correcting genuine physical
 *      page curvature, not just camera-angle tilt).
 *
 *   2. warpDocument() — given corners (either the detected ones, or
 *      whatever the user dragged them to), performs the perspective
 *      correction. Only trusts the traced curves for genuine curvature
 *      correction when they're supplied; manual corner edits get a
 *      plain 4-point transform.
 *
 *   3. applyFilters() — brightness/contrast/shadow-removal/B&W-vs-colour,
 *      independent of cropping, so the client can flip between filter
 *      options without re-running detection or re-warping.
 *
 * On detection approach: an earlier version of this module tried actual
 * edge detection (Sobel -> non-max suppression -> hysteresis, i.e. a
 * Canny-style pipeline) with flood-fill-from-border closure, which is
 * the textbook "proper" way to do this and is indifferent to what's
 * *inside* the document. It passed every synthetic test but failed
 * outright on 2 of 3 real photos this project has actually needed to
 * handle — real-world JPEG noise/texture produces far more spurious
 * gradient edges than clean synthetic images do, and tuning around that
 * reliably needs much more real-world data than was available. The
 * brightness + seeded dual-pass approach below is less elegant but is
 * what's actually been verified against every real photo encountered
 * during this feature's development.
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
  /** Traced boundary curves for all 4 edges (not just top/bottom) — only
   * meaningful when passed back into warpDocument() alongside the *same,
   * unmodified* corners; a manually-edited quad should omit these and
   * get a plain 4-point transform instead. top/bottom are indexed by
   * full-resolution x (column), left/right by full-resolution y (row). */
  topCurve: number[];
  bottomCurve: number[];
  leftCurve: number[];
  rightCurve: number[];
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

/** Flood-fills starting from a single seed pixel — used to let a
 * coarser, more forgiving detection pass recover fine detail (dense
 * text, a QR code) that's actually attached to the real document,
 * without also scooping up an unrelated noisy blob elsewhere in the
 * frame that independently passes the coarse threshold (e.g.
 * reflections on a glossy background). */
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
 * `highPct`-th brightness percentiles to 0/255. More robust than a
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

// ---------------------------------------------------------------------
// Corner / boundary detection
// ---------------------------------------------------------------------

function findCorners(regionIn: Uint8Array, width: number, height: number): Quad | null {
  const openRadius = Math.max(6, Math.round(Math.min(width, height) * 0.05));
  const opened = binaryDilate(binaryErode(regionIn, width, height, openRadius), width, height, openRadius);
  const region = largestConnectedComponent(opened, width, height);

  const points: Point[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (region[y * width + x]) points.push({ x, y });
    }
  }

  const fraction = points.length / (width * height);
  if (fraction < 0.03 || fraction > 0.97 || points.length === 0) return null;

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

/** Traces one boundary edge as a curve — e.g. for the top edge, the
 * topmost region pixel in each column (y as a function of x); for the
 * left edge, the leftmost region pixel in each row (x as a function of
 * y). `axis` picks which way to scan (by column or by row), `pick`
 * picks which extreme along that scan to record. */
function traceEdgeCurve(
  region: Uint8Array, width: number, height: number,
  axis: 'byColumn' | 'byRow', pick: 'first' | 'last',
): Float64Array {
  const outer = axis === 'byColumn' ? width : height;
  const inner = axis === 'byColumn' ? height : width;
  const curve = new Float64Array(outer).fill(-1);

  for (let o = 0; o < outer; o++) {
    let found = -1;
    for (let i = 0; i < inner; i++) {
      const idx = axis === 'byColumn' ? i * width + o : o * width + i;
      if (region[idx]) {
        found = i;
        if (pick === 'first') break;
      }
    }
    curve[o] = found;
  }

  // Fill any gaps (an outer index with no region pixels at all) from the
  // nearest valid neighbor, then smooth to remove per-index jaggedness
  // from the mask's own edge noise while still tracking genuine,
  // gradual curvature.
  let lastValid = -1;
  for (let o = 0; o < outer; o++) {
    if (curve[o] !== -1) lastValid = curve[o];
    else if (lastValid !== -1) curve[o] = lastValid;
  }
  lastValid = -1;
  for (let o = outer - 1; o >= 0; o--) {
    if (curve[o] !== -1) lastValid = curve[o];
    else if (lastValid !== -1 && curve[o] === -1) curve[o] = lastValid;
  }

  const radius = Math.max(3, Math.round(outer * 0.04));
  const smoothed = new Float64Array(outer);
  let acc = 0;
  for (let o = -radius; o <= radius; o++) acc += curve[Math.min(outer - 1, Math.max(0, o))];
  for (let o = 0; o < outer; o++) {
    smoothed[o] = acc / (radius * 2 + 1);
    const add = Math.min(outer - 1, o + radius + 1);
    const sub = Math.max(0, o - radius);
    acc += curve[add] - curve[sub];
  }

  // Small inward safety margin — detection tends to catch a thin sliver
  // of background/shadow right at the true edge. 'first' (top/left)
  // moves inward by increasing the index; 'last' (bottom/right) moves
  // inward by decreasing it.
  const margin = inner * 0.012;
  for (let o = 0; o < outer; o++) {
    smoothed[o] += pick === 'first' ? margin : -margin;
  }

  return smoothed;
}

/** Traces all 4 edges of the document region — not just top/bottom.
 * Earlier versions of this only corrected vertical curvature (a
 * straight line for left/right); tracing all four sides and blending
 * them (see warpGrid's Coons patch) corrects genuine distortion along
 * either axis instead of just one. */
function traceAllBoundaryCurves(region: Uint8Array, width: number, height: number) {
  return {
    top: traceEdgeCurve(region, width, height, 'byColumn', 'first'),
    bottom: traceEdgeCurve(region, width, height, 'byColumn', 'last'),
    left: traceEdgeCurve(region, width, height, 'byRow', 'first'),
    right: traceEdgeCurve(region, width, height, 'byRow', 'last'),
  };
}

/**
 * Locates the document's 4 corners plus the traced top/bottom boundary
 * curve (for correcting genuine physical page curvature). Returns null
 * if no confident document region was found.
 *
 * `imageBuffer` should already be EXIF-rotated (e.g. via sharp's
 * `.rotate()`) before being passed in.
 */
export async function detectDocumentCorners(imageBuffer: Buffer): Promise<DetectedDocument | null> {
  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width!, height = meta.height!;

  const scale = Math.min(1, 900 / Math.max(width, height));
  const smallW = Math.round(width * scale), smallH = Math.round(height * scale);
  const graySmall = await sharp(imageBuffer).resize(smallW, smallH).greyscale().raw().toBuffer();

  const stretchedSmall = stretchContrast(graySmall, 2, 2);

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
    region = openedFine;
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

  const curvesSmall = traceAllBoundaryCurves(region, smallW, smallH);
  const topCurveFull = new Array<number>(width);
  const bottomCurveFull = new Array<number>(width);
  for (let x = 0; x < width; x++) {
    const sx = Math.min(smallW - 1, Math.max(0, Math.round(x * scale)));
    topCurveFull[x] = curvesSmall.top[sx] / scale;
    bottomCurveFull[x] = curvesSmall.bottom[sx] / scale;
  }
  const leftCurveFull = new Array<number>(height);
  const rightCurveFull = new Array<number>(height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(smallH - 1, Math.max(0, Math.round(y * scale)));
    leftCurveFull[y] = curvesSmall.left[sy] / scale;
    rightCurveFull[y] = curvesSmall.right[sy] / scale;
  }

  const corners = smallCorners.map((p) => ({ x: p.x / scale, y: p.y / scale })) as Quad;

  return {
    corners,
    topCurve: topCurveFull, bottomCurve: bottomCurveFull,
    leftCurve: leftCurveFull, rightCurve: rightCurveFull,
    imageWidth: width, imageHeight: height,
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

  let outWidth = Math.round(Math.max(Math.hypot(tr.x - tl.x, tr.y - tl.y), Math.hypot(br.x - bl.x, br.y - bl.y)));
  let outHeight = Math.round(Math.max(Math.hypot(bl.x - tl.x, bl.y - tl.y), Math.hypot(br.x - tr.x, br.y - tr.y)));
  outWidth = Math.max(10, outWidth);
  outHeight = Math.max(10, outHeight);

  if (targetRatio) {
    const naturalRatio = Math.max(outWidth, outHeight) / Math.min(outWidth, outHeight);
    if (Math.abs(naturalRatio - targetRatio) / targetRatio < 0.12) {
      if (outHeight >= outWidth) outHeight = Math.round(outWidth * targetRatio);
      else outWidth = Math.round(outHeight * targetRatio);
    }
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
