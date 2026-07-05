#!/usr/bin/env node
/**
 * Standalone document scanner — pure JavaScript, zero WASM/native
 * dependencies.
 *
 * We tried @techstark/opencv-js three separate times, in three
 * increasingly isolated contexts (in-process at server boot, inside a
 * dedicated worker_thread with an enforced timeout, and finally in a
 * bare standalone script with nothing else running) — its WASM runtime
 * simply never finishes initializing in this Node environment. Three
 * hangs is enough; this rewrite doesn't touch OpenCV.js at all, so this
 * failure mode isn't possible anymore.
 *
 * Approach — deliberately simple and robust rather than "as accurate as
 * OpenCV could theoretically be":
 *   1. Grayscale + heavy blur (suppresses background texture/noise)
 *   2. Otsu's method for an automatic light/dark threshold
 *   3. The four "extreme" bright pixels (by x+y and x-y) approximate the
 *      document's corners — valid as long as the document is the
 *      largest light region in frame, which holds for the normal
 *      "document on a table/floor" case this is meant for.
 *   4. Manual homography + inverse-mapped bilinear resampling performs
 *      the perspective correction — same math OpenCV's warpPerspective
 *      does internally, just written out directly.
 *
 * Usage:
 *   node scan.js <input-image> <output-image> [--debug]
 *
 * With --debug, also writes <output>.debug.png: the original photo with
 * the detected quadrilateral drawn on top, so you can see exactly what
 * it found.
 */

const sharp = require('sharp');
const fs = require('fs');

const START = Date.now();
function log(...args) {
  console.error(`[${((Date.now() - START) / 1000).toFixed(2)}s]`, ...args);
}

/** Otsu's method: finds the threshold that best separates a bimodal
 * histogram (here: document vs. background) into two classes. */
function otsuThreshold(gray) {
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

/** Simple separable box blur (fast approximation of Gaussian blur),
 * applied a few times for a smoother result — pure array math, no
 * external dependency. */
function boxBlur(gray, width, height, radius, passes) {
  let src = gray;
  for (let p = 0; p < passes; p++) {
    const tmp = new Uint8ClampedArray(src.length);
    // horizontal pass
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
    // vertical pass
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
  return src;
}

/** Finds the four extreme bright-pixel corners: [top-left, top-right,
 * bottom-right, bottom-left]. Returns null if too few bright pixels were
 * found to be confident this is a real document (vs. a blank/dark frame). */
function findCorners(binary, width, height) {
  let minSum = Infinity, maxSum = -Infinity, minDiff = Infinity, maxDiff = -Infinity;
  let tl = null, br = null, tr = null, bl = null;
  let brightCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (binary[y * width + x] === 0) continue; // 0 = background (dark) in our convention
      brightCount++;
      const s = x + y, d = x - y;
      if (s < minSum) { minSum = s; tl = { x, y }; }
      if (s > maxSum) { maxSum = s; br = { x, y }; }
      if (d > maxDiff) { maxDiff = d; tr = { x, y }; }
      if (d < minDiff) { minDiff = d; bl = { x, y }; }
    }
  }

  // If almost nothing (or almost everything) is "bright", there's no
  // real document/background contrast to work with.
  const fraction = brightCount / (width * height);
  if (fraction < 0.05 || fraction > 0.97 || !tl || !tr || !br || !bl) return null;

  return [tl, tr, br, bl];
}

/** Solves for the 3x3 homography matrix mapping 4 source points to 4
 * destination points (standard direct linear transform via Gaussian
 * elimination on the resulting 8x8 system) — the same math behind
 * OpenCV's getPerspectiveTransform, written out directly. */
function getPerspectiveTransform(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i];
    const { x: dx, y: dy } = dst[i];
    A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]); b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]); b.push(dy);
  }
  const h = solveLinearSystem(A, b); // [a,b,c,d,e,f,g,h] -> matrix with i=1
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function solveLinearSystem(A, b) {
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

/** Applies the inverse of the homography to inverse-map each output
 * pixel back into the source image, with bilinear interpolation. */
function warpPerspective(rgba, srcWidth, srcHeight, quad, outWidth, outHeight) {
  const dstCorners = [
    { x: 0, y: 0 }, { x: outWidth, y: 0 },
    { x: outWidth, y: outHeight }, { x: 0, y: outHeight },
  ];
  const H = getPerspectiveTransform(dstCorners, quad); // dst -> src, so we can inverse-map directly
  const out = Buffer.alloc(outWidth * outHeight * 4);

  for (let oy = 0; oy < outHeight; oy++) {
    for (let ox = 0; ox < outWidth; ox++) {
      const w = H[6] * ox + H[7] * oy + H[8];
      const sx = (H[0] * ox + H[1] * oy + H[2]) / w;
      const sy = (H[3] * ox + H[4] * oy + H[5]) / w;

      const outIdx = (oy * outWidth + ox) * 4;
      if (sx < 0 || sy < 0 || sx >= srcWidth - 1 || sy >= srcHeight - 1) {
        out[outIdx] = out[outIdx + 1] = out[outIdx + 2] = 255; // white padding outside source
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

async function main() {
  const args = process.argv.slice(2);
  const debug = args.includes('--debug');
  const [inputPath, outputPath] = args.filter(a => !a.startsWith('--'));
  if (!inputPath || !outputPath) {
    console.error('Usage: node scan.js <input-image> <output-image> [--debug]');
    process.exit(1);
  }

  log(`Reading ${inputPath}`);
  const inputBuffer = fs.readFileSync(inputPath);
  const rotated = await sharp(inputBuffer).rotate().toBuffer();
  const { data: rgba, info } = await sharp(rotated).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  log(`Image loaded: ${width}x${height}`);

  // Downscale for the (relatively expensive) pixel-scanning steps —
  // corners found on a smaller version scale back up cleanly, and this
  // keeps things fast even on full-resolution phone photos.
  const scale = Math.min(1, 900 / Math.max(width, height));
  const smallW = Math.round(width * scale), smallH = Math.round(height * scale);
  const small = await sharp(rotated).resize(smallW, smallH).greyscale().raw().toBuffer();
  log(`Downscaled to ${smallW}x${smallH} for analysis (scale=${scale.toFixed(3)})`);

  const blurred = boxBlur(small, smallW, smallH, 4, 3);
  const threshold = otsuThreshold(blurred);
  log(`Otsu threshold: ${threshold}`);

  const binary = new Uint8Array(blurred.length);
  for (let i = 0; i < blurred.length; i++) binary[i] = blurred[i] > threshold ? 1 : 0;

  const smallCorners = findCorners(binary, smallW, smallH);

  if (debug) {
    await sharp(blurred, { raw: { width: smallW, height: smallH, channels: 1 } })
      .png().toFile(outputPath + '.blurred-debug.png');
    const binPixels = Buffer.from(Array.from(binary, v => v * 255));
    await sharp(binPixels, { raw: { width: smallW, height: smallH, channels: 1 } })
      .png().toFile(outputPath + '.threshold-debug.png');
    log('Saved intermediate blur/threshold debug images');
  }

  if (!smallCorners) {
    log('No confident document region found (too little or too much contrast). Saving original, uncropped.');
    await sharp(rotated).toFile(outputPath);
    return;
  }

  const quad = smallCorners.map(p => ({ x: p.x / scale, y: p.y / scale }));
  log(`Quad found (full-res coords): ${JSON.stringify(quad)}`);

  const [tl, tr, br, bl] = quad;
  const outWidth = Math.round(Math.max(Math.hypot(tr.x - tl.x, tr.y - tl.y), Math.hypot(br.x - bl.x, br.y - bl.y)));
  const outHeight = Math.round(Math.max(Math.hypot(bl.x - tl.x, bl.y - tl.y), Math.hypot(br.x - tr.x, br.y - tr.y)));

  log(`Warping perspective to ${outWidth}x${outHeight}…`);
  const warped = warpPerspective(rgba, width, height, quad, outWidth, outHeight);

  await sharp(warped, { raw: { width: outWidth, height: outHeight, channels: 4 } }).png().toFile(outputPath);
  log(`Saved result to ${outputPath}`);

  if (debug) {
    const overlay = Buffer.from(
      `<svg width="${width}" height="${height}">
        <polygon points="${quad.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="red" stroke-width="6" />
        ${quad.map(p => `<circle cx="${p.x}" cy="${p.y}" r="10" fill="lime" />`).join('')}
      </svg>`
    );
    await sharp(rotated).composite([{ input: overlay, top: 0, left: 0 }]).toFile(outputPath + '.debug.png');
    log(`Saved corner-overlay debug image to ${outputPath}.debug.png`);
  }

  log('Done.');
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
