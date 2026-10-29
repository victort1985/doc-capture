/**
 * Page cleaner: removes shadows, uneven lighting and crease shading from a
 * flattened document image, leaving ink and printed colours untouched.
 *
 * Idea: a photographed page = (true page) × (smooth illumination field).
 * Estimate the illumination field from PAPER pixels only, then divide it out.
 *
 *   - "Paper" pixels = pixels whose shadow-invariant colour (R,G,B ÷ max) is the
 *     page's dominant colour. Printed colour blocks (a green header, a stamp)
 *     have a different colour, so they never contaminate the estimate; the field
 *     is interpolated across them instead of "correcting" them to white.
 *   - Ink / text is excluded because it deviates strongly from the local paper
 *     level (iteratively re-weighted estimate), while shadows, gradients and
 *     creases only deviate a little and are therefore followed.
 *   - Works on dark paper with light ink too (polarity is detected).
 *   - A neutral (white / grey) paper is colour-balanced; coloured paper keeps its tint.
 *
 * Pure TypeScript on typed arrays (no WASM / native code), so it can run inside
 * the normal request path. The heavy part runs on a ≤640 px copy.
 */

const WORK_SIZE = 640;
const SIGMA_FRAC = 0.006; // illumination smoothing scale, fraction of the longest side
const TAU = 0.12; // relative deviation from local paper level still counted as paper
const CHROMA_TOL = 0.09; // allowed distance from paper colour (R,G,B ÷ max)
const WHITE_TARGET = 252;

// ───────────────────────── float image helpers ─────────────────────────

function gaussKernel(sigma: number): Float32Array {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + r] = v; s += v; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  return k;
}

/** Exact separable gaussian blur (small sigmas), edge-replicating. */
function gaussBlurExact(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const k = gaussKernel(sigma), r = (k.length - 1) >> 1;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) { const xx = x + i; a += src[row + (xx < 0 ? 0 : xx >= w ? w - 1 : xx)] * k[i + r]; }
      tmp[row + x] = a;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) { const yy = y + i; a += tmp[(yy < 0 ? 0 : yy >= h ? h - 1 : yy) * w + x] * k[i + r]; }
      out[y * w + x] = a;
    }
  }
  return out;
}

/** One running-sum box pass of radius r along rows (horizontal=true) or columns, edge-replicating. O(n) for any r. */
function boxPass(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, horizontal: boolean): void {
  const len = horizontal ? w : h, lines = horizontal ? h : w, step = horizontal ? 1 : w, lineStep = horizontal ? w : 1;
  const inv = 1 / (2 * r + 1);
  for (let l = 0; l < lines; l++) {
    const base = l * lineStep;
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += src[base + Math.min(len - 1, Math.max(0, i)) * step];
    for (let i = 0; i < len; i++) {
      dst[base + i * step] = acc * inv;
      acc += src[base + Math.min(len - 1, i + r + 1) * step] - src[base + Math.max(0, i - r) * step];
    }
  }
}

/** Gaussian blur approximated by 3 box passes per axis (error < 3%), cost independent of sigma. */
function gaussBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma < 2) return gaussBlurExact(src, w, h, sigma);
  // box radii for a 3-pass approximation (Kovesi / "fastest gaussian blur")
  const n = 3, wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
  const wu = wl + 2, m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  let a = Float32Array.from(src), b = new Float32Array(w * h);
  for (let pass = 0; pass < n; pass++) {
    const r = ((pass < m ? wl : wu) - 1) >> 1;
    boxPass(a, b, w, h, r, true); [a, b] = [b, a];
  }
  for (let pass = 0; pass < n; pass++) {
    const r = ((pass < m ? wl : wu) - 1) >> 1;
    boxPass(a, b, w, h, r, false); [a, b] = [b, a];
  }
  return a;
}

/** Box (area) downscale by an integer factor. */
function downBox(src: Float32Array, w: number, h: number, f: number): { data: Float32Array; w: number; h: number } {
  const nw = Math.max(1, Math.ceil(w / f)), nh = Math.max(1, Math.ceil(h / f));
  const out = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      let a = 0, c = 0;
      const y1 = Math.min(h, (y + 1) * f), x1 = Math.min(w, (x + 1) * f);
      for (let yy = y * f; yy < y1; yy++) for (let xx = x * f; xx < x1; xx++) { a += src[yy * w + xx]; c++; }
      out[y * nw + x] = a / c;
    }
  }
  return { data: out, w: nw, h: nh };
}

/** Bilinear upscale (pixel-centre aligned) to a target size. */
function upBilinear(src: Float32Array, sw: number, sh: number, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  const fx = sw / w, fy = sh / h;
  for (let y = 0; y < h; y++) {
    const sy = Math.min(sh - 1, Math.max(0, (y + 0.5) * fy - 0.5));
    const y0 = Math.floor(sy), y1 = Math.min(sh - 1, y0 + 1), ty = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = Math.min(sw - 1, Math.max(0, (x + 0.5) * fx - 0.5));
      const x0 = Math.floor(sx), x1 = Math.min(sw - 1, x0 + 1), tx = sx - x0;
      out[y * w + x] =
        (src[y0 * sw + x0] * (1 - tx) + src[y0 * sw + x1] * tx) * (1 - ty) +
        (src[y1 * sw + x0] * (1 - tx) + src[y1 * sw + x1] * tx) * ty;
    }
  }
  return out;
}

/** Gaussian blur of std `sigma` px, computed on a 1/f copy so big sigmas stay cheap. */
function blurScaled(src: Float32Array, w: number, h: number, sigma: number, f: number): Float32Array {
  if (f <= 1) return gaussBlur(src, w, h, sigma);
  const d = downBox(src, w, h, f);
  return upBilinear(gaussBlur(d.data, d.w, d.h, sigma / f), d.w, d.h, w, h);
}

/** Separable max filter with an odd window. */
function maxFilter(src: Float32Array, w: number, h: number, k: number): Float32Array {
  const r = k >> 1, tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = -Infinity;
    for (let i = Math.max(0, x - r); i <= Math.min(w - 1, x + r); i++) m = Math.max(m, src[y * w + i]);
    tmp[y * w + x] = m;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = -Infinity;
    for (let j = Math.max(0, y - r); j <= Math.min(h - 1, y + r); j++) m = Math.max(m, tmp[j * w + x]);
    out[y * w + x] = m;
  }
  return out;
}

function medianOf(values: ArrayLike<number>, lo: number, hi: number, bins = 1024): number {
  const hist = new Uint32Array(bins);
  const sc = (bins - 1) / (hi - lo);
  for (let i = 0; i < values.length; i++) hist[Math.min(bins - 1, Math.max(0, Math.round((values[i] - lo) * sc)))]++;
  let acc = 0;
  for (let i = 0; i < bins; i++) { acc += hist[i]; if (acc >= values.length / 2) return lo + i / sc; }
  return (lo + hi) / 2;
}

function percentile(values: Float32Array, p: number): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < values.length; i++) hist[Math.min(255, Math.max(0, Math.round(values[i])))]++;
  let acc = 0;
  const target = values.length * p;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= target) return i; }
  return 255;
}

// ───────────────────────── illumination estimate ─────────────────────────

/** Normalised convolution whose scale grows until it has enough paper support, so holes get filled from paper only. */
function multiScaleFill(V: Float32Array, wgt: Float32Array, w: number, h: number, sigma: number, fallback: number): Float32Array {
  const n = w * h, out = new Float32Array(n), filled = new Uint8Array(n);
  const wv = new Float32Array(n);
  for (let i = 0; i < n; i++) wv[i] = wgt[i] * V[i];
  for (let lvl = 0; lvl < 6; lvl++) {
    const s = sigma * 2 ** lvl, f = Math.max(1, Math.floor(s / 4));
    const den = blurScaled(wgt, w, h, s, f), num = blurScaled(wv, w, h, s, f);
    let remaining = 0;
    for (let i = 0; i < n; i++) {
      if (filled[i]) continue;
      if (den[i] > 0.08) { out[i] = num[i] / den[i]; filled[i] = 1; } else remaining++;
    }
    if (!remaining) break;
  }
  for (let i = 0; i < n; i++) if (!filled[i]) out[i] = fallback;
  return out;
}

export interface Illumination {
  /** paper brightness field at working size (in the "paper is bright" polarity removed → true V units) */
  bg: Float32Array;
  w: number;
  h: number;
  /** dominant (paper) colour as R,G,B ÷ max channel */
  paperChroma: [number, number, number];
  paperIsDark: boolean;
}

/**
 * @param rgb working-size RGB (3 channels interleaved)
 */
export function estimateIllumination(rgb: Uint8Array | Uint8ClampedArray, w: number, h: number): Illumination {
  const n = w * h, ls = Math.max(w, h), sigma = Math.max(2, SIGMA_FRAC * ls);
  const V = new Float32Array(n), Rf = new Float32Array(n), Gf = new Float32Array(n), Bf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    Rf[i] = rgb[i * 3]; Gf[i] = rgb[i * 3 + 1]; Bf[i] = rgb[i * 3 + 2];
    V[i] = Math.max(Rf[i], Gf[i], Bf[i]);
  }
  const paperIsDark = medianOf(V, 0, 255) < 110;
  const Vw = paperIsDark ? V.map((v) => 255 - v) : V;

  // shadow-invariant colour, from a lightly blurred copy
  const Rs = gaussBlur(Rf, w, h, 1.5), Gs = gaussBlur(Gf, w, h, 1.5), Bs = gaussBlur(Bf, w, h, 1.5);
  const cr = new Float32Array(n), cg = new Float32Array(n), cb = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const m = Math.max(Rs[i], Gs[i], Bs[i], 8);
    cr[i] = Rs[i] / m; cg[i] = Gs[i] / m; cb[i] = Bs[i] / m;
  }
  const pcR = medianOf(cr, 0, 1), pcG = medianOf(cg, 0, 1), pcB = medianOf(cb, 0, 1);
  const cm = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(cr[i] - pcR, cg[i] - pcG, cb[i] - pcB);
    cm[i] = Math.exp(-((d / CHROMA_TOL) ** 2));
  }

  const Vs = gaussBlur(Vw, w, h, 1.0);
  // initial paper mask: paper-coloured and not much darker than the local maximum (excludes ink)
  const k = Math.max(3, Math.floor(0.03 * ls)) | 1;
  const locMax = maxFilter(Vs, w, h, k);
  const w0 = new Float32Array(n);
  for (let i = 0; i < n; i++) w0[i] = cm[i] * (Vs[i] >= 0.8 * locMax[i] ? 1 : 0) * (Vs[i] > 12 ? 1 : 0);
  const fallback = medianOf(Vs, 0, 255);
  let bg = multiScaleFill(Vs, w0, w, h, sigma, fallback);

  const wgt = new Float32Array(n);
  for (let it = 0; it < 5; it++) {
    for (let i = 0; i < n; i++) {
      const d = (Vs[i] - bg[i]) / Math.max(bg[i], 20);
      wgt[i] = Math.exp(-((d / TAU) ** 2)) * cm[i] * (Vs[i] > 12 ? 1 : 0);
    }
    bg = multiScaleFill(Vs, wgt, w, h, sigma, fallback);
  }
  if (paperIsDark) for (let i = 0; i < n; i++) bg[i] = 255 - bg[i];
  return { bg, w, h, paperChroma: [pcR, pcG, pcB], paperIsDark };
}

// ───────────────────────── apply ─────────────────────────

export interface CleanOptions {
  /** divide out shadows / uneven light / crease shading */
  removeShadows: boolean;
}

/**
 * @param rgba  full-size RGBA pixels
 * @param small working-size RGB copy of the same image (see cleanPage in document-scanner)
 */
export function cleanPage(rgba: Buffer, width: number, height: number, small: { data: Uint8Array; w: number; h: number }, opts: CleanOptions): Buffer {
  const ill = estimateIllumination(small.data, small.w, small.h);
  const n = width * height;
  const out = Buffer.from(rgba);

  // colour balance: a neutral (white/grey) paper is made neutral (weaker channels are raised to
  // the strongest one); a coloured paper keeps its tint
  const [pr, pg, pb] = ill.paperChroma;
  let sR = 1, sG = 1, sB = 1;
  if (1 - Math.min(pr, pg, pb) < 0.08) {
    sR = Math.min(1.6, 1 / Math.max(pr, 0.01)); sG = Math.min(1.6, 1 / Math.max(pg, 0.01)); sB = Math.min(1.6, 1 / Math.max(pb, 0.01));
  }

  if (!opts.removeShadows) {
    if (sR !== 1 || sG !== 1 || sB !== 1) {
      // only the colour balance
      for (let i = 0; i < n; i++) {
        out[i * 4] = Math.min(255, Math.round(rgba[i * 4] * sR));
        out[i * 4 + 1] = Math.min(255, Math.round(rgba[i * 4 + 1] * sG));
        out[i * 4 + 2] = Math.min(255, Math.round(rgba[i * 4 + 2] * sB));
      }
    }
    return out;
  }

  const med = medianOf(ill.bg, 0, 255);
  const T = ill.paperIsDark || med <= 140 ? percentile(ill.bg, 0.85) : WHITE_TARGET;
  const bw = ill.w, bh = ill.h, fx = bw / width, fy = bh / height;
  for (let y = 0; y < height; y++) {
    const sy = Math.min(bh - 1, Math.max(0, (y + 0.5) * fy - 0.5)), y0 = Math.floor(sy), y1 = Math.min(bh - 1, y0 + 1), ty = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = Math.min(bw - 1, Math.max(0, (x + 0.5) * fx - 0.5)), x0 = Math.floor(sx), x1 = Math.min(bw - 1, x0 + 1), tx = sx - x0;
      const b = (ill.bg[y0 * bw + x0] * (1 - tx) + ill.bg[y0 * bw + x1] * tx) * (1 - ty) + (ill.bg[y1 * bw + x0] * (1 - tx) + ill.bg[y1 * bw + x1] * tx) * ty;
      const ratio = Math.min(4, Math.max(0.5, T / Math.max(b, 16)));
      const i = (y * width + x) * 4;
      out[i] = Math.min(255, Math.round(rgba[i] * ratio * sR));
      out[i + 1] = Math.min(255, Math.round(rgba[i + 1] * ratio * sG));
      out[i + 2] = Math.min(255, Math.round(rgba[i + 2] * ratio * sB));
    }
  }
  return out;
}

export { WORK_SIZE };
