import sharp from 'sharp';

/**
 * Pure-JavaScript document edge-detection + perspective correction —
 * zero WASM/native dependencies (see /document-scan-module at the repo
 * root for the standalone CLI version of this and the history of why
 * an OpenCV.js-based approach was abandoned: it hung on every real
 * upload, even isolated in a worker_thread with an enforced timeout).
 *
 * Approach: grayscale + blur, Otsu's method for an automatic light/dark
 * threshold, isolate the largest connected bright region, take a
 * percentile-based (not absolute-extreme) corner from each side, then a
 * manually-computed homography + bilinear-sampled inverse warp performs
 * the perspective correction.
 *
 * This is a deliberately simplified rewrite. Several narrower fixes for
 * specific one-off photos (a saturation-aware brightness metric for
 * colourful banners; a second, coarser blur pass to recover dense-text
 * regions) were dropped after they caused new regressions elsewhere
 * (misclassifying a colourful background as document content;
 * bridging into unrelated noisy regions via an overly forgiving coarse
 * pass). What's kept below has been re-verified against a full
 * regression suite. If a specific document type needs one of those
 * behaviors again, re-add it deliberately and re-test the whole suite,
 * rather than layering another special case on top.
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

/** Flood-fills starting from a single seed pixel, returning just that
 * connected component. Unlike largestConnectedComponent (which finds
 * whichever blob happens to be biggest, wherever it is), this only
 * follows connectivity from a known-good starting point — used to let
 * a coarser, more forgiving pass recover fine detail (dense text, a
 * QR code) that's actually attached to the real document, without also
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

function findCorners(binaryIn: Uint8Array, width: number, height: number): [Point, Point, Point, Point] | null {
  const openRadius = Math.max(6, Math.round(Math.min(width, height) * 0.05));
  const opened = binaryDilate(binaryErode(binaryIn, width, height, openRadius), width, height, openRadius);
  const binary = largestConnectedComponent(opened, width, height);

  const points: Point[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (binary[y * width + x]) points.push({ x, y });
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

/**
 * Flat-field lighting correction: removes shadows and uneven lighting by
 * normalizing every pixel against an estimate of the *local* background
 * brightness around it, rather than a single global contrast stretch.
 */
export async function correctDocumentLighting(imageBuffer: Buffer): Promise<Buffer> {
  const { data: gray, info } = await sharp(imageBuffer).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  const radius = Math.max(15, Math.round(Math.min(width, height) * 0.04));
  const background = boxBlur(gray, width, height, radius, 2);

  const flattened = Buffer.alloc(gray.length);
  for (let i = 0; i < gray.length; i++) {
    const bg = Math.max(background[i], 30);
    const ratio = Math.min(gray[i] / bg, 1.4);
    flattened[i] = Math.max(0, Math.min(255, Math.round(ratio * 200)));
  }

  const smoothed = boxBlur(flattened, width, height, 1, 1);
  const stretched = stretchContrast(smoothed, 15, 25);
  return sharp(stretched, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

/**
 * Detects the document's four corners and returns a straightened,
 * cropped PNG buffer — or null if no confident document region was
 * found, so the caller should fall back to using the original image
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
  const graySmall = await sharp(imageBuffer).resize(smallW, smallH).greyscale().raw().toBuffer();

  const stretchedSmall = stretchContrast(graySmall, 2, 2);

  // Two blur passes: a small radius keeps sharp/accurate edges for
  // corner precision, but fine dense detail (a block of small legal
  // text, a QR code, a dark graphic/photo element) can still fail to
  // pass threshold at that radius and get excluded as "not document" —
  // verified against a real upload where that cut off roughly the
  // bottom half of a text-and-graphics-heavy bank letter. A much
  // coarser blur washes that fine detail out into a properly-classified
  // region, at the cost of being too forgiving on its own (it can
  // bridge into an unrelated noisy background, verified against a
  // different real upload with a glossy coloured folder background).
  //
  // The fix for both at once: find the fine pass's main blob first (the
  // "core" of the real document), then let the coarse pass extend that
  // specific blob via connectivity, rather than either trusting the
  // coarse pass everywhere (unsafe) or not using it at all (misses
  // dense content). Opening happens *before* seed selection and *before*
  // the seeded fill — doing it after would let a thin bridge into
  // background survive long enough to leak through regardless of where
  // the seed is.
  const openRadius = Math.max(6, Math.round(Math.min(smallW, smallH) * 0.05));

  const blurredFine = boxBlur(stretchedSmall, smallW, smallH, 8, 3);
  const thresholdFine = otsuThreshold(blurredFine);
  const binaryFine = new Uint8Array(blurredFine.length);
  for (let i = 0; i < blurredFine.length; i++) binaryFine[i] = blurredFine[i] > thresholdFine ? 1 : 0;
  const openedFine = binaryDilate(binaryErode(binaryFine, smallW, smallH, openRadius), smallW, smallH, openRadius);
  const fineCore = largestConnectedComponent(openedFine, smallW, smallH);
  const seed = fineCore.indexOf(1);

  let binary: Uint8Array;
  if (seed === -1) {
    binary = openedFine; // no confident fine-pass region at all — let findCorners's own checks reject this
  } else {
    const blurredCoarse = boxBlur(stretchedSmall, smallW, smallH, 50, 2);
    const thresholdCoarse = otsuThreshold(blurredCoarse);
    const combined = new Uint8Array(blurredFine.length);
    for (let i = 0; i < blurredFine.length; i++) {
      combined[i] = (binaryFine[i] || blurredCoarse[i] > thresholdCoarse) ? 1 : 0;
    }
    const openedCombined = binaryDilate(binaryErode(combined, smallW, smallH, openRadius), smallW, smallH, openRadius);
    binary = connectedComponentFrom(openedCombined, smallW, smallH, seed);
  }

  const smallCorners = findCorners(binary, smallW, smallH);
  if (!smallCorners) return null;

  let quad = smallCorners.map((p) => ({ x: p.x / scale, y: p.y / scale }));
  quad = shrinkQuadInward(quad, 0.015);
  const [tl, tr, br, bl] = quad;
  const A4_RATIO = Math.SQRT2;

  let outWidth = Math.round(Math.max(Math.hypot(tr.x - tl.x, tr.y - tl.y), Math.hypot(br.x - bl.x, br.y - bl.y)));
  let outHeight = Math.round(Math.max(Math.hypot(bl.x - tl.x, bl.y - tl.y), Math.hypot(br.x - tr.x, br.y - tr.y)));

  const naturalRatio = Math.max(outWidth, outHeight) / Math.min(outWidth, outHeight);
  const closeToA4 = Math.abs(naturalRatio - A4_RATIO) / A4_RATIO < 0.12;
  if (closeToA4) {
    if (outHeight >= outWidth) {
      outHeight = Math.round(outWidth * A4_RATIO);
    } else {
      outWidth = Math.round(outHeight * A4_RATIO);
    }
  }

  const warped = warpPerspective(rgba, width, height, quad, outWidth, outHeight);
  return sharp(warped, { raw: { width: outWidth, height: outHeight, channels: 4 } }).png().toBuffer();
}
