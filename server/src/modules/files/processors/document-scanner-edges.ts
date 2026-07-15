import type { Point, Quad } from './document-scanner';

/**
 * Edge-based document boundary detection — an attempt at the CamScanner/
 * OpenCV-tutorial style pipeline (Canny edges -> contour -> polygon
 * approximation), specifically to handle a real failure mode the
 * existing brightness-region detector has: when the page and its
 * background are similar in overall brightness (confirmed directly
 * against 5 real photos of documents on a gray fabric background —
 * many detected corners showed less than a 10-point brightness
 * difference between "inside" and "outside"), there's no reliable
 * brightness threshold to separate them, no matter how the threshold is
 * tuned. A physical page edge is still almost always a real *gradient*
 * discontinuity even when the two average brightnesses are close, so
 * edge detection can succeed where brightness thresholding structurally
 * can't.
 *
 * This is kept as a fully separate module from the proven brightness-
 * based detector in document-scanner.ts, on purpose: an earlier, less
 * careful attempt at edge-based detection (this project's git history)
 * passed every synthetic test but broke on 2 of 3 real photos it hadn't
 * been tested against, because textured backgrounds (wood grain,
 * fabric weave) produce far more spurious gradients than clean test
 * images do. The lesson taken from that: never let an edge-detection
 * attempt replace the working brightness-based path outright. Here it
 * only ever *supplements* it — detectDocumentCorners() in
 * document-scanner.ts tries this first and only uses the result if it
 * passes strict shape-confidence checks (see findQuadByRadialProfile);
 * any photo where this module is unsure at all, including this module
 * throwing partway through, falls through to the exact same brightness-
 * based detection that was already working before this file existed.
 * SCANNER_EDGE_DETECTION_ENABLED=false in the environment disables this
 * module completely (falls back to 100% brightness-based for every
 * photo) without any code change or redeploy needed beyond restarting
 * the service with that variable set — the operational "roll back to
 * current behavior" switch.
 */

// ---------------------------------------------------------------------
// Canny edge detection: Sobel -> non-max suppression -> hysteresis
// ---------------------------------------------------------------------

function boxBlur(gray: Uint8ClampedArray | Buffer, width: number, height: number, radius: number, passes: number): Float32Array {
  let src: Uint8ClampedArray | Buffer | Float32Array = gray;
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

function sobel(gray: Float32Array, width: number, height: number): { mag: Float32Array; dir: Float32Array } {
  const mag = new Float32Array(width * height);
  const dir = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const tl = gray[i - width - 1], t = gray[i - width], tr = gray[i - width + 1];
      const l = gray[i - 1], r = gray[i + 1];
      const bl = gray[i + width - 1], b = gray[i + width], br = gray[i + width + 1];
      const gx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const gy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      mag[i] = Math.sqrt(gx * gx + gy * gy);
      dir[i] = Math.atan2(gy, gx);
    }
  }
  return { mag, dir };
}

function nonMaxSuppression(mag: Float32Array, dir: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const m = mag[i];
      if (m === 0) continue;
      let angle = (dir[i] * 180) / Math.PI;
      if (angle < 0) angle += 180;
      let n1: number, n2: number;
      if (angle < 22.5 || angle >= 157.5) { n1 = mag[i - 1]; n2 = mag[i + 1]; }
      else if (angle < 67.5) { n1 = mag[i - width + 1]; n2 = mag[i + width - 1]; }
      else if (angle < 112.5) { n1 = mag[i - width]; n2 = mag[i + width]; }
      else { n1 = mag[i - width - 1]; n2 = mag[i + width + 1]; }
      out[i] = (m >= n1 && m >= n2) ? m : 0;
    }
  }
  return out;
}

/** Auto-picks Canny's high/low thresholds from the gradient histogram
 * rather than fixed constants, so this adapts to how strong the page/
 * background contrast actually is in a given photo. */
function hysteresis(nms: Float32Array, width: number, height: number, highPercentile = 0.88): Uint8Array {
  let maxMag = 0;
  for (let i = 0; i < nms.length; i++) if (nms[i] > maxMag) maxMag = nms[i];
  if (maxMag === 0) return new Uint8Array(width * height);

  const bins = 256;
  const hist = new Array(bins).fill(0);
  for (let i = 0; i < nms.length; i++) {
    if (nms[i] > 0) hist[Math.min(bins - 1, Math.floor((nms[i] / maxMag) * (bins - 1)))]++;
  }
  const total = hist.reduce((a: number, b: number) => a + b, 0) || 1;
  let cum = 0, highBin = bins - 1;
  for (let b = 0; b < bins; b++) {
    cum += hist[b];
    if (cum / total >= highPercentile) { highBin = b; break; }
  }
  const highThresh = (highBin / (bins - 1)) * maxMag;
  const lowThresh = highThresh * 0.4;

  const strong = new Uint8Array(width * height);
  const weak = new Uint8Array(width * height);
  for (let i = 0; i < nms.length; i++) {
    if (nms[i] >= highThresh) strong[i] = 1;
    else if (nms[i] >= lowThresh) weak[i] = 1;
  }

  const result = new Uint8Array(width * height).fill(0);
  const stack: number[] = [];
  for (let i = 0; i < strong.length; i++) if (strong[i]) { result[i] = 1; stack.push(i); }
  while (stack.length > 0) {
    const idx = stack.pop()!;
    const x = idx % width, y = (idx / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (weak[nIdx] && !result[nIdx]) { result[nIdx] = 1; stack.push(nIdx); }
      }
    }
  }
  return result;
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

/** Flood-fills inward from every border pixel, blocked by the edge map
 * — whatever it can't reach is enclosed by edges on all sides, i.e. a
 * candidate document interior, regardless of what brightness or colour
 * that interior happens to be. This is what lets this approach succeed
 * where brightness-thresholding structurally can't: it never classifies
 * a single pixel by brightness at all, only by whether an edge blocks
 * the path back out to the border. */
function floodFillFromBorder(edges: Uint8Array, width: number, height: number): Uint8Array {
  const n = width * height;
  const outside = new Uint8Array(n);
  const stack: number[] = [];
  const tryPush = (idx: number) => { if (!edges[idx] && !outside[idx]) { outside[idx] = 1; stack.push(idx); } };
  for (let x = 0; x < width; x++) { tryPush(x); tryPush((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { tryPush(y * width); tryPush(y * width + width - 1); }
  while (stack.length > 0) {
    const idx = stack.pop()!;
    const x = idx % width, y = (idx / width) | 0;
    if (x > 0) tryPush(idx - 1);
    if (x < width - 1) tryPush(idx + 1);
    if (y > 0) tryPush(idx - width);
    if (y < height - 1) tryPush(idx + width);
  }
  const interior = new Uint8Array(n);
  for (let i = 0; i < n; i++) interior[i] = outside[i] ? 0 : 1;
  return interior;
}

// ---------------------------------------------------------------------
// Quadrilateral corner-finding via radial profile
// ---------------------------------------------------------------------

/**
 * Finds the 4 corners of a region by profiling its boundary distance
 * from the centroid as a function of angle. For a convex quadrilateral,
 * that profile has exactly 4 local maxima (the corners stick out
 * further than the edge midpoints between them) — this is the
 * "does this region's shape actually look like a document" check that
 * a plain largest-connected-region approach lacks, and is what should
 * reject a noise-corrupted blob (an irregular shape has a messy,
 * many-peaked profile) even if it happens to be the largest region
 * found. Returns null if the region doesn't confidently look like one
 * (not enough separated peaks, or the peaks aren't much more prominent
 * than the profile's low points — a real page's corners stick out
 * noticeably; a blob or ellipse doesn't).
 */
function findQuadByRadialProfile(region: Uint8Array, width: number, height: number): Quad | null {
  let sumX = 0, sumY = 0, n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (region[y * width + x]) { sumX += x; sumY += y; n++; }
    }
  }
  if (n === 0) return null;
  const cx = sumX / n, cy = sumY / n;

  const NUM_ANGLES = 360;
  const maxRadius = Math.hypot(width, height);
  const radii = new Float64Array(NUM_ANGLES);
  for (let a = 0; a < NUM_ANGLES; a++) {
    const theta = (a / NUM_ANGLES) * 2 * Math.PI;
    const dx = Math.cos(theta), dy = Math.sin(theta);
    let maxR = 0, missStreak = 0;
    for (let r = 1; r < maxRadius; r++) {
      const x = Math.round(cx + dx * r), y = Math.round(cy + dy * r);
      if (x < 0 || y < 0 || x >= width || y >= height) break;
      if (region[y * width + x]) { maxR = r; missStreak = 0; }
      else if (++missStreak > 15) break; // stepped off the region for good
    }
    radii[a] = maxR;
  }

  // Smooth to avoid single-pixel boundary jaggedness creating spurious peaks.
  const smoothRadius = 4;
  const smoothed = new Float64Array(NUM_ANGLES);
  for (let a = 0; a < NUM_ANGLES; a++) {
    let s = 0, cnt = 0;
    for (let d = -smoothRadius; d <= smoothRadius; d++) {
      const idx = ((a + d) % NUM_ANGLES + NUM_ANGLES) % NUM_ANGLES;
      s += radii[idx]; cnt++;
    }
    smoothed[a] = s / cnt;
  }

  const candidates: { angle: number; r: number }[] = [];
  for (let a = 0; a < NUM_ANGLES; a++) {
    const prev = smoothed[(a - 1 + NUM_ANGLES) % NUM_ANGLES];
    const next = smoothed[(a + 1) % NUM_ANGLES];
    if (smoothed[a] >= prev && smoothed[a] >= next) candidates.push({ angle: a, r: smoothed[a] });
  }
  candidates.sort((a, b) => b.r - a.r);

  const MIN_SEPARATION_DEG = 50; // a real quad's 4 corners are roughly evenly spread; reject two "peaks" that are really the same corner
  const chosen: { angle: number; r: number }[] = [];
  for (const c of candidates) {
    if (chosen.length >= 4) break;
    const tooClose = chosen.some((ch) => {
      const diff = Math.abs(c.angle - ch.angle);
      return Math.min(diff, NUM_ANGLES - diff) < MIN_SEPARATION_DEG;
    });
    if (!tooClose) chosen.push(c);
  }
  if (chosen.length < 4) { return null; }

  // The 4 peaks should be meaningfully more prominent than the profile's
  // low points (the edge midpoints) — otherwise this is closer to an
  // ellipse/blob than an actual quadrilateral, and shouldn't be trusted.
  const minR = Math.min(...Array.from(smoothed));
  const avgPeakR = chosen.reduce((s, c) => s + c.r, 0) / chosen.length;
  if (minR < avgPeakR * 0.15) { return null; }
  if (avgPeakR - minR < avgPeakR * 0.12) { return null; }

  chosen.sort((a, b) => a.angle - b.angle);
  const points: Point[] = chosen.map((c) => {
    const theta = (c.angle / NUM_ANGLES) * 2 * Math.PI;
    return { x: cx + Math.cos(theta) * c.r, y: cy + Math.sin(theta) * c.r };
  });

  // Basic convexity check — a document's 4 corners should turn the same
  // way at every vertex; a self-intersecting or concave result means
  // the peak-picking above found something that isn't a clean quad.
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const p0 = points[i], p1 = points[(i + 1) % 4], p2 = points[(i + 2) % 4];
    const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
    const s = Math.sign(cross);
    if (s === 0) continue;
    if (sign === 0) sign = s;
    else if (s !== sign) { return null; }
  }

  const tl = points.reduce((best, p) => (p.x + p.y < best.x + best.y ? p : best));
  const br = points.reduce((best, p) => (p.x + p.y > best.x + best.y ? p : best));
  const bl = points.reduce((best, p) => (p.x - p.y < best.x - best.y ? p : best));
  const tr = points.reduce((best, p) => (p.x - p.y > best.x - best.y ? p : best));

  // Final safety net: verify the actual enclosed area (shoelace formula)
  // is a plausible fraction of the frame. The sub-checks above (peak
  // separation, convexity) didn't catch every degenerate case on their
  // own — confirmed directly: 2 of 9 real test photos produced a
  // near-zero-area quad instead of correctly declining, before this
  // check was added.
  const quad = [tl, tr, br, bl];
  let shoelace = 0;
  for (let i = 0; i < 4; i++) {
    const p0 = quad[i], p1 = quad[(i + 1) % 4];
    shoelace += p0.x * p1.y - p1.x * p0.y;
  }
  const quadArea = Math.abs(shoelace) / 2;
  const frameArea = width * height;
  if (quadArea < frameArea * 0.05 || quadArea > frameArea * 0.97) { return null; }

  return [tl, tr, br, bl];
}

export interface EdgeDetectionResult {
  corners: Quad;
  region: Uint8Array;
}

/**
 * Attempts edge-based document detection on a small (already-downscaled)
 * grayscale image. Returns null on any low-confidence signal — see the
 * module doc comment for why this is deliberately conservative: a null
 * here just means the caller falls back to the existing brightness-
 * based detector, so there's no harm in this method declining whenever
 * it isn't sure.
 */
export function detectDocumentCornersViaEdges(graySmallU8: Uint8ClampedArray | Buffer, width: number, height: number): EdgeDetectionResult | null {
  try {
    const blurred = boxBlur(graySmallU8, width, height, 2, 1);
    const { mag, dir } = sobel(blurred, width, height);
    const nms = nonMaxSuppression(mag, dir, width, height);

    // Try progressively more sensitive thresholds and keep every
    // attempt that passes all checks, rather than stopping at the
    // first one that merely clears the bar — a real, confirmed case:
    // one photo's standard (0.88) pass already produced a large-enough,
    // valid-shaped region, so the loop never got to a more sensitive
    // pass at all, even though the standard pass's region started well
    // below the page's actual top edge (a real gradient there, ~60
    // magnitude, just weaker than other edges elsewhere in the same
    // photo). Trying every level and keeping the *largest* valid region
    // instead favors whichever pass captured the most complete page
    // boundary, since a truncated capture is — all else equal — always
    // going to be smaller than a complete one.
    let best: EdgeDetectionResult | null = null;
    let bestFraction = 0;
    for (const highPercentile of [0.88, 0.78, 0.68]) {
      const edges = hysteresis(nms, width, height, highPercentile);
      const closedEdges = binaryDilate(edges, width, height, 9);

      let region = floodFillFromBorder(closedEdges, width, height);
      for (let i = 0; i < region.length; i++) if (closedEdges[i]) region[i] = 1;
      region = largestConnectedComponent(region, width, height);

      let filled = 0;
      for (let i = 0; i < region.length; i++) if (region[i]) filled++;
      const fraction = filled / (width * height);
      if (fraction < 0.25 || fraction > 0.95) continue;

      const corners = findQuadByRadialProfile(region, width, height);
      if (!corners) continue;

      // Solidity check: a genuine page's region should be almost
      // entirely inside its own 4-corner quad — a real, confirmed
      // failure mode of the more sensitive passes above is a noise-
      // driven bulge or appendage on the mask (background texture or a
      // shadow the lower threshold let through) that pulls one corner
      // out towards it. That distorts the quad enough that a large
      // chunk of the *actual* region ends up outside the 4 chosen
      // corners, even though every other check above still passes.
      let shoelace = 0;
      for (let i = 0; i < 4; i++) {
        const p0 = corners[i], p1 = corners[(i + 1) % 4];
        shoelace += p0.x * p1.y - p1.x * p0.y;
      }
      const quadArea = Math.abs(shoelace) / 2;
      const solidity = filled / quadArea;
      if (solidity < 0.85 || solidity > 1.15) continue;

      if (fraction > bestFraction) { bestFraction = fraction; best = { corners, region }; }
    }
    return best;
  } catch {
    // Never let a bug in this experimental path take down a real
    // upload — treat any failure exactly like "not confident enough".
    return null;
  }
}
