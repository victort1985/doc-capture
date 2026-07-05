import sharp from 'sharp';

/**
 * Pure-JavaScript document edge-detection + perspective correction —
 * zero WASM/native dependencies. Ported from /document-scan-module at
 * the repo root (kept there as a standalone CLI tool for testing against
 * real photos in isolation — see its README for why this replaced an
 * OpenCV.js-based approach that hung on every real upload, even after
 * being isolated in a worker_thread with an enforced timeout).
 *
 * Approach: grayscale + heavy blur (suppresses background texture),
 * Otsu's method for an automatic light/dark threshold, the four
 * "extreme" bright pixels approximate the document's corners, then a
 * manually-computed homography + bilinear-sampled inverse warp performs
 * the perspective correction.
 */

interface Point { x: number; y: number; }

function otsuThreshold(gray: Uint8ClampedArray | Buffer): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
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

function boxBlur(gray: Buffer | Uint8ClampedArray, width: number, height: number, radius: number, passes: number): Uint8ClampedArray {
  let src: Uint8ClampedArray | Buffer = gray;
  for (let p = 0; p < passes; p++) {
    const tmp = new Uint8ClampedArray(src.length);
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
    const tmp2 = new Uint8ClampedArray(src.length);
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
  return src as Uint8ClampedArray;
}

/** Isolates the single largest connected blob of "bright" pixels,
 * zeroing out everything else. Real photos never have a perfectly
 * uniform dark background — camera sensor noise and JPEG compression
 * artifacts reliably produce scattered isolated bright pixels/blocks in
 * shadowed areas, and without this step those noise specks can get
 * picked as "extreme corner" points, producing a wildly wrong quad. */
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

function findCorners(binaryIn: Uint8Array, width: number, height: number): [Point, Point, Point, Point] | null {
  const binary = largestConnectedComponent(binaryIn, width, height);
  let minSum = Infinity, maxSum = -Infinity, minDiff = Infinity, maxDiff = -Infinity;
  let tl: Point | null = null, br: Point | null = null, tr: Point | null = null, bl: Point | null = null;
  let brightCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (binary[y * width + x] === 0) continue;
      brightCount++;
      const s = x + y, d = x - y;
      if (s < minSum) { minSum = s; tl = { x, y }; }
      if (s > maxSum) { maxSum = s; br = { x, y }; }
      if (d > maxDiff) { maxDiff = d; tr = { x, y }; }
      if (d < minDiff) { minDiff = d; bl = { x, y }; }
    }
  }

  const fraction = brightCount / (width * height);
  if (fraction < 0.03 || fraction > 0.97 || !tl || !tr || !br || !bl) return null;
  return [tl, tr, br, bl];
}

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

function warpPerspective(rgba: Buffer, srcWidth: number, srcHeight: number, quad: Point[], outWidth: number, outHeight: number): Buffer {
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

      const outIdx = (oy * outWidth + ox) * 4;
      if (sx < 0 || sy < 0 || sx >= srcWidth - 1 || sy >= srcHeight - 1) {
        out[outIdx] = out[outIdx + 1] = out[outIdx + 2] = 255;
        out[outIdx + 3] = 255;
        continue;
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
  }
  return out;
}

function shrinkQuadInward(quad: Point[], fraction: number): Point[] {
  const cx = quad.reduce((s, p) => s + p.x, 0) / quad.length;
  const cy = quad.reduce((s, p) => s + p.y, 0) / quad.length;
  return quad.map((p) => ({
    x: p.x + (cx - p.x) * fraction,
    y: p.y + (cy - p.y) * fraction,
  }));
}

/** Percentile-based contrast stretch: maps the `lowPct`-th and
 * `(100-highPct)`-th brightness percentiles to 0/255. More robust than a
 * plain min/max stretch, which a single outlier pixel can throw off. */
/** Min-filter (morphological erosion): each pixel becomes the darkest
 * value in its neighborhood. Thickens and darkens thin/faint ink
 * strokes — exactly what's needed when a printed original has partial
 * ink coverage (worn toner, dot-matrix-style fonts, an average phone
 * camera not resolving fine strokes at full density) and simply
 * stretching contrast isn't enough to make text read as solid black. */
function erode(gray: Uint8ClampedArray | Buffer, width: number, height: number, radius: number): Uint8ClampedArray {
  const tmp = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let m = 255;
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = Math.min(width - 1, Math.max(0, x + dx));
        const v = gray[row + xx];
        if (v < m) m = v;
      }
      tmp[row + x] = m;
    }
  }
  const out = new Uint8ClampedArray(gray.length);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let m = 255;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = Math.min(height - 1, Math.max(0, y + dy));
        const v = tmp[yy * width + x];
        if (v < m) m = v;
      }
      out[y * width + x] = m;
    }
  }
  return out;
}

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
    if ((cum / total) * 100 >= 100 - highPct) { hi = v; break; }
  }

  const range = Math.max(1, hi - lo);
  const out = Buffer.alloc(gray.length);
  for (let i = 0; i < gray.length; i++) {
    out[i] = Math.max(0, Math.min(255, Math.round(((gray[i] - lo) / range) * 255)));
  }
  return out;
}

/**
 * Flat-field lighting correction: removes shadows and uneven lighting by
 * normalizing every pixel against an estimate of the *local* background
 * brightness around it, rather than a single global contrast stretch.
 *
 * A shadow across part of a page darkens a whole region gradually — both
 * the paper and the ink in that region get darker together. A single
 * global brightness/contrast adjustment can't fix that (it would need to
 * brighten the shadowed area without also blowing out the already-lit
 * area). Dividing each pixel by a heavily-blurred version of itself
 * (which approximates "what the background would be at this point,
 * ignoring small dark text strokes") cancels that gradual variation out:
 * paper-under-shadow and paper-in-light both end up close to the same
 * brightness, since each is being compared to its own local surroundings.
 *
 * This is the standard "flat-fielding" technique scanning software uses
 * for exactly this problem.
 */
export async function correctDocumentLighting(imageBuffer: Buffer): Promise<Buffer> {
  const { data: gray, info } = await sharp(imageBuffer).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  // Radius large enough that text strokes (thin) get blurred away into
  // the surrounding paper tone, but small enough to still track gradual
  // shadow gradients across the page.
  const radius = Math.max(15, Math.round(Math.min(width, height) * 0.04));
  const background = boxBlur(gray, width, height, radius, 2);

  const flattened = Buffer.alloc(gray.length);
  for (let i = 0; i < gray.length; i++) {
    const bg = Math.max(background[i], 30); // floor: dividing by a near-zero background (dark/noisy
                                             // regions) would otherwise amplify per-pixel noise catastrophically
    const ratio = Math.min(gray[i] / bg, 1.4); // clamp: a genuine document's ink/paper ratio never needs more than this
    flattened[i] = Math.max(0, Math.min(255, Math.round(ratio * 168)));
  }

  // Bolden/darken faint or thin ink strokes (worn print, dot-matrix-style
  // fonts, or just a camera not resolving fine strokes at full density)
  // before deciding what's "text" vs "paper" — otherwise contrast
  // stretching alone leaves partially-inked pixels a soft gray instead
  // of a crisp black.
  const eroded = erode(flattened, width, height, 1);

  // Light smoothing pass to knock down whatever speckle noise the
  // division still amplified, and to soften the harder edges erosion
  // just introduced, before the final contrast stretch makes it all
  // maximally visible as pure black/white.
  const smoothed = boxBlur(eroded, width, height, 1, 1);

  const stretched = stretchContrast(smoothed, 6, 12);
  return sharp(stretched, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

/**
 * Detects the document's four corners and returns a straightened,
 * cropped PNG buffer — or null if no confident document region was
 * found (too little or too much light/dark contrast), so the caller
 * should fall back to using the original image unmodified.
 *
 * `imageBuffer` should already be EXIF-rotated (e.g. via sharp's
 * `.rotate()`) before being passed in.
 */
export async function scanAndCropDocument(imageBuffer: Buffer): Promise<Buffer | null> {
  const { data: rgba, info } = await sharp(imageBuffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  const scale = Math.min(1, 900 / Math.max(width, height));
  const smallW = Math.round(width * scale), smallH = Math.round(height * scale);
  const small = await sharp(imageBuffer).resize(smallW, smallH).greyscale().raw().toBuffer();

  const blurred = boxBlur(small, smallW, smallH, 6, 3);
  const threshold = otsuThreshold(blurred);

  const binary = new Uint8Array(blurred.length);
  for (let i = 0; i < blurred.length; i++) binary[i] = blurred[i] > threshold ? 1 : 0;

  const smallCorners = findCorners(binary, smallW, smallH);
  if (!smallCorners) return null;

  let quad = smallCorners.map((p) => ({ x: p.x / scale, y: p.y / scale }));
  quad = shrinkQuadInward(quad, 0.012); // trim ~1.2% inward — corner detection tends to catch a thin sliver of background/shadow right at the edge
  const [tl, tr, br, bl] = quad;
  const outWidth = Math.round(Math.max(Math.hypot(tr.x - tl.x, tr.y - tl.y), Math.hypot(br.x - bl.x, br.y - bl.y)));
  const outHeight = Math.round(Math.max(Math.hypot(bl.x - tl.x, bl.y - tl.y), Math.hypot(br.x - tr.x, br.y - tr.y)));

  const warped = warpPerspective(rgba, width, height, quad, outWidth, outHeight);
  return sharp(warped, { raw: { width: outWidth, height: outHeight, channels: 4 } }).png().toBuffer();
}
