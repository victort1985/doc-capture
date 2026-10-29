/**
 * Document-scanner detector (v2, written from scratch).
 *
 * Idea: no single edge-detection method works on every photo (Canny fails on a
 * white page on a white table, a brightness threshold fails on a dark page,
 * saturation fails on coloured paper, ...). So instead of committing to one:
 *
 *   1. every method proposes candidate quadrilaterals for THIS image
 *      (Canny, colour-distance-from-background, brightness, saturation and an
 *      AI saliency segmentation model);
 *   2. each candidate is scored from evidence in the image itself — is there a
 *      real edge under all 4 sides, is there a colour step across each side,
 *      is the shape a plausible perspective view of a rectangle;
 *   3. the best-scoring candidate wins, and only then
 *   4. its 4 sides are snapped to the real paper edge at full resolution with a
 *      robust line fit, giving sub-pixel corners.
 *
 * Runs inside a worker thread (see docscan.worker.ts) because OpenCV.js/WASM
 * has hung before; the caller enforces a timeout.
 *
 * Everything here works on RGB data; `Cv` is the opencv-js module.
 */
import * as fs from 'fs';
import * as path from 'path';

type Cv = any;
export interface P { x: number; y: number }
export type Quad = [P, P, P, P]; // TL, TR, BR, BL

export interface DocScanResult {
  corners: Quad;      // full-resolution pixel coordinates
  method: string;     // which method produced the winning candidate
  score: number;      // 0..1 confidence from the scoring step
  refined: boolean;
}

// ───────────────────────── OpenCV bootstrap ─────────────────────────

// NOTE: the opencv-js module object is "thenable" (it has a .then method).
// Returning it directly from an async function / Promise makes the runtime
// call cv.then() forever, so the promise NEVER resolves — the process just
// sits there. It is therefore always passed around inside a { cv } holder.
let cvReady: Promise<{ cv: Cv }> | null = null;
export function getCv(): Promise<{ cv: Cv }> {
  if (cvReady) return cvReady;
  cvReady = (async () => {
    // plain require (lazy, so the WASM only loads on first use). NOT `await import()`:
    // tsc turns that into an esModuleInterop copy made BEFORE the WASM finishes
    // initialising, so cv.Mat would never appear on the copy.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@techstark/opencv-js');
    const cv = mod.default ?? mod;
    return new Promise<{ cv: Cv }>((resolve, reject) => {
      let n = 0;
      const t = setInterval(() => {
        if (cv.Mat) { clearInterval(t); resolve({ cv }); }
        else if (++n > 400) { clearInterval(t); reject(new Error('OpenCV.js init timeout')); }
      }, 25);
    });
  })();
  return cvReady;
}

// ───────────────────────── small helpers ─────────────────────────

/** Reorders 4 points to TL, TR, BR, BL. */
export function orderQuad(pts: P[]): Quad {
  const sum = pts.map((p) => p.x + p.y);
  const diff = pts.map((p) => p.y - p.x);
  const tl = pts[sum.indexOf(Math.min(...sum))];
  const br = pts[sum.indexOf(Math.max(...sum))];
  const tr = pts[diff.indexOf(Math.min(...diff))];
  const bl = pts[diff.indexOf(Math.max(...diff))];
  return [tl, tr, br, bl];
}

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const quadArea = (q: P[]) => {
  let s = 0;
  for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; s += a.x * b.y - b.x * a.y; }
  return Math.abs(s) / 2;
};
function isConvex(q: P[]): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) < 1e-6) return false;
    const s = Math.sign(cr);
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
}
function cornerAngles(q: P[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    const p = q[i], a = q[(i + 3) % 4], b = q[(i + 1) % 4];
    const v1x = a.x - p.x, v1y = a.y - p.y, v2x = b.x - p.x, v2y = b.y - p.y;
    const c = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) + 1e-9);
    out.push((Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI);
  }
  return out;
}
function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

// ───────────────────────── mask → quadrilateral ─────────────────────────

/** Largest blob of a binary (0/255) CV_8UC1 mask → 4 corners, or null. */
function maskToQuad(cv: Cv, mask: any): Quad | null {
  const closed = new cv.Mat();
  const k = cv.Mat.ones(7, 7, cv.CV_8U);
  const contours = new cv.MatVector();
  const hier = new cv.Mat();
  try {
    cv.morphologyEx(mask, closed, cv.MORPH_CLOSE, k);
    cv.findContours(closed, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    let best: any = null, bestA = 0;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const a = cv.contourArea(c);
      if (a > bestA) { best?.delete(); best = c; bestA = a; } else c.delete();
    }
    if (!best || bestA < 0.05 * mask.rows * mask.cols) { best?.delete(); return null; }
    const hull = new cv.Mat();
    cv.convexHull(best, hull, false, true);
    const per = cv.arcLength(hull, true);
    let quad: Quad | null = null;
    for (let e = 0.01; e <= 0.0801; e += 0.005) {
      const ap = new cv.Mat();
      cv.approxPolyDP(hull, ap, e * per, true);
      const n = ap.rows;
      if (n === 4) {
        const pts: P[] = [];
        for (let i = 0; i < 4; i++) pts.push({ x: ap.data32S[i * 2], y: ap.data32S[i * 2 + 1] });
        ap.delete();
        quad = orderQuad(pts);
        break;
      }
      ap.delete();
      if (n < 4) break;
    }
    if (!quad) {
      const r = cv.minAreaRect(hull);
      const th = (r.angle * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
      const hw = r.size.width / 2, hh = r.size.height / 2;
      quad = orderQuad([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({ x: r.center.x + x * c - y * s, y: r.center.y + x * s + y * c })));
    }
    hull.delete(); best.delete();
    return quad;
  } finally {
    closed.delete(); k.delete(); contours.delete(); hier.delete();
  }
}

// ───────────────────────── candidate generators ─────────────────────────
// Each takes the small RGB image (CV_8UC3) and returns zero or more quads.

interface Ctx { cv: Cv; rgb: any; gray: any; w: number; h: number }

function viaCanny({ cv, gray, w, h }: Ctx): Quad[] {
  const out: Quad[] = [];
  for (const sigma of [1.5, 3]) {
    const g = new cv.Mat(), e = new cv.Mat(), ed = new cv.Mat(), k = cv.Mat.ones(5, 5, cv.CV_8U);
    cv.GaussianBlur(gray, g, new cv.Size(0, 0), sigma);
    const med = medianOfMat(g);
    cv.Canny(g, e, Math.max(10, 0.5 * med), Math.max(40, 1.2 * med));
    cv.dilate(e, ed, k, new cv.Point(-1, -1), 2);
    // everything NOT reachable from the image border without crossing an edge is "inside"
    const flood = ed.clone();
    const ff = cv.Mat.zeros(h + 2, w + 2, cv.CV_8U);
    cv.floodFill(flood, ff, new cv.Point(0, 0), new cv.Scalar(255));
    const inv = new cv.Mat(), inside = new cv.Mat();
    cv.bitwise_not(flood, inv);
    cv.add(inv, ed, inside); // saturating add == OR on 0/255 masks (opencv-js bitwise_or misbehaves without an explicit mask)
    const er = new cv.Mat();
    cv.erode(inside, er, k, new cv.Point(-1, -1), 2);
    const q = maskToQuad(cv, er);
    if (q) out.push(q);
    [g, e, ed, k, flood, ff, inv, inside, er].forEach((m) => m.delete());
  }
  return out;
}

function medianOfMat(m: any): number {
  const hist = new Array(256).fill(0);
  const d = m.data as Uint8Array;
  for (let i = 0; i < d.length; i++) hist[d[i]]++;
  let acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= d.length / 2) return i; }
  return 128;
}

function viaColor({ cv, rgb, w, h }: Ctx): Quad[] {
  const lab = new cv.Mat();
  cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);
  const b = Math.max(6, Math.floor(Math.min(h, w) / 25));
  const L: number[][] = [[], [], []];
  const d = lab.data as Uint8Array;
  const push = (x: number, y: number) => { const i = (y * w + x) * 3; for (let c = 0; c < 3; c++) L[c].push(d[i + c]); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (y < b || y >= h - b || x < b || x >= w - b) push(x, y);
  const bg = L.map(median);
  const dist8 = new cv.Mat(h, w, cv.CV_8UC1);
  const o = dist8.data as Uint8Array;
  for (let i = 0, n = w * h; i < n; i++) {
    const dl = d[i * 3] - bg[0], da = d[i * 3 + 1] - bg[1], db = d[i * 3 + 2] - bg[2];
    o[i] = Math.min(255, Math.round(Math.sqrt(dl * dl + da * da + db * db)));
  }
  const bl = new cv.Mat(), m = new cv.Mat();
  cv.GaussianBlur(dist8, bl, new cv.Size(0, 0), 2);
  const t = cv.threshold(bl, new cv.Mat(), 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  cv.threshold(bl, m, Math.max(t, 12), 255, cv.THRESH_BINARY);
  const q = maskToQuad(cv, m);
  [lab, dist8, bl, m].forEach((x) => x.delete());
  return q ? [q] : [];
}

function viaBrightness({ cv, gray, w, h }: Ctx): Quad[] {
  const out: Quad[] = [];
  const g = new cv.Mat(), m = new cv.Mat(), inv = new cv.Mat(), ad = new cv.Mat();
  cv.GaussianBlur(gray, g, new cv.Size(0, 0), 3);
  cv.threshold(g, m, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  cv.bitwise_not(m, inv);
  for (const mm of [m, inv]) { const q = maskToQuad(cv, mm); if (q) out.push(q); }
  const bs = Math.max(31, Math.floor(Math.min(h, w) / 4) | 1);
  cv.adaptiveThreshold(g, ad, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, bs, -6);
  const q = maskToQuad(cv, ad);
  if (q) out.push(q);
  [g, m, inv, ad].forEach((x) => x.delete());
  return out;
}

function viaSaturation({ cv, rgb }: Ctx): Quad[] {
  const hsv = new cv.Mat(), ch = new cv.MatVector(), s = new cv.Mat(), m = new cv.Mat();
  cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
  cv.split(hsv, ch);
  const sat = ch.get(1);
  cv.GaussianBlur(sat, s, new cv.Size(0, 0), 3);
  cv.threshold(s, m, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
  const q = maskToQuad(cv, m);
  sat.delete(); [hsv, s, m].forEach((x) => x.delete()); ch.delete();
  return q ? [q] : [];
}

// ── AI (U²-Net-P salient-object segmentation, ONNX, ~4.5 MB, Apache-2.0) ──

let ortSession: Promise<any> | null = null;
let aiWarned = false;
function modelPath(): string | null {
  const candidates = [
    process.env.SCANNER_AI_MODEL_PATH,
    path.join(__dirname, '../../../../assets/models/u2netp.onnx'), // dist/assets/models
    path.join(__dirname, '../../../../../src/assets/models/u2netp.onnx'), // ts-node / src layout
  ].filter(Boolean) as string[];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}
async function getSession() {
  if (!ortSession) {
    ortSession = (async () => {
      const mp = modelPath();
      if (!mp) throw new Error('u2netp.onnx not found');
      const ort = require('onnxruntime-node');
      return { ort, session: await ort.InferenceSession.create(mp, { graphOptimizationLevel: 'all', intraOpNumThreads: 1 }) };
    })();
  }
  return ortSession;
}

async function viaAI({ cv, rgb, w, h }: Ctx): Promise<Quad[]> {
  if (process.env.SCANNER_AI_ENABLED === 'false') return [];
  let ses: any;
  try { ses = await getSession(); } catch (e: any) {
    if (!aiWarned) { aiWarned = true; console.warn(`[docscan] AI model unavailable, using classical methods only: ${e?.message ?? e}`); }
    return [];
  }
  const S = 320;
  const r = new cv.Mat();
  cv.resize(rgb, r, new cv.Size(S, S), 0, 0, cv.INTER_AREA);
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  const f = new Float32Array(3 * S * S);
  for (let i = 0; i < S * S; i++) for (let c = 0; c < 3; c++) f[c * S * S + i] = (r.data[i * 3 + c] / 255 - mean[c]) / std[c];
  r.delete();
  const res = await ses.session.run({ [ses.session.inputNames[0]]: new ses.ort.Tensor('float32', f, [1, 3, S, S]) });
  const o = res[ses.session.outputNames[0]].data as Float32Array;
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < o.length; i++) { if (o[i] < mn) mn = o[i]; if (o[i] > mx) mx = o[i]; }
  const out: Quad[] = [];
  for (const t of [0.5, 0.35]) {
    const m = new cv.Mat(S, S, cv.CV_8UC1);
    for (let i = 0; i < o.length; i++) m.data[i] = (o[i] - mn) / (mx - mn + 1e-8) > t ? 255 : 0;
    const q = maskToQuad(cv, m);
    m.delete();
    if (q) out.push(q.map((p) => ({ x: (p.x * w) / S, y: (p.y * h) / S })) as Quad);
  }
  return out;
}

// ───────────────────────── scoring ─────────────────────────

interface Evidence { gx: Float32Array; gy: Float32Array; lab: Uint8Array; w: number; h: number }

function sideNormal(a: P, b: P, centre: P): { nx: number; ny: number; len: number } {
  const len = dist(a, b) + 1e-9;
  let nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
  if ((centre.x - (a.x + b.x) / 2) * nx + (centre.y - (a.y + b.y) / 2) * ny < 0) { nx = -nx; ny = -ny; }
  return { nx, ny, len }; // normal points inward
}

function scoreQuad(q: Quad, ev: Evidence): { score: number } | null {
  const { w, h } = ev;
  const area = quadArea(q) / (w * h);
  if (area < 0.08 || area > 0.995 || !isConvex(q)) return null;
  const ang = cornerAngles(q);
  if (Math.min(...ang) < 45 || Math.max(...ang) > 135) return null;

  const centre = { x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 };
  const es: number[] = [], ct: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    const { nx, ny, len } = sideNormal(a, b, centre);
    const n = Math.max(10, Math.floor(len / 4));
    let ok = 0;
    for (let k = 0; k < n; k++) {
      const t = 0.05 + (0.9 * k) / (n - 1);
      const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
      let best = 0;
      for (const off of [-6, -3, 0, 3, 6]) {
        const x = Math.round(px + nx * off), y = Math.round(py + ny * off);
        if (x >= 0 && x < w && y >= 0 && y < h) best = Math.max(best, Math.abs(ev.gx[y * w + x] * nx + ev.gy[y * w + x] * ny));
      }
      if (best > 12) ok++;
    }
    es.push(ok / n);
    // colour step across the side, 10 px either way
    const m = Math.max(10, Math.floor(len / 6));
    const inL: number[][] = [[], [], []], outL: number[][] = [[], [], []];
    for (let k = 0; k < m; k++) {
      const t = 0.1 + (0.8 * k) / (m - 1);
      const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
      const xi = Math.round(px + nx * 10), yi = Math.round(py + ny * 10), xo = Math.round(px - nx * 10), yo = Math.round(py - ny * 10);
      if (xi < 0 || xi >= w || yi < 0 || yi >= h || xo < 0 || xo >= w || yo < 0 || yo >= h) continue;
      for (let c = 0; c < 3; c++) { inL[c].push(ev.lab[(yi * w + xi) * 3 + c]); outL[c].push(ev.lab[(yo * w + xo) * 3 + c]); }
    }
    if (inL[0].length < 5) { ct.push(0); continue; }
    ct.push(Math.hypot(...[0, 1, 2].map((c) => median(inL[c]) - median(outL[c]))));
  }
  const meanEs = es.reduce((s, v) => s + v, 0) / 4, minEs = Math.min(...es);
  const esS = meanEs * 0.6 + minEs * 0.4;
  const meanCt = ct.reduce((s, v) => s + Math.min(v, 40), 0) / 4;
  const ctS = Math.min(1, meanCt / 40) * 0.6 + Math.min(1, Math.min(...ct) / 25) * 0.4;
  const angS = 1 - Math.min(1, ang.reduce((s, v) => s + Math.abs(v - 90), 0) / 4 / 40);
  const score = 0.45 * esS + 0.35 * ctS + 0.1 * angS + 0.1 * Math.min(1, Math.sqrt(area) / 0.7);
  return { score };
}

// ───────────────────────── sub-pixel refinement ─────────────────────────

/** Robust line fit through points: returns point + unit direction. */
function fitLine(pts: P[]): { p: P; d: P } | null {
  let use = pts;
  for (let pass = 0; pass < 3; pass++) {
    if (use.length < 8) return null;
    const mx = use.reduce((s, p) => s + p.x, 0) / use.length, my = use.reduce((s, p) => s + p.y, 0) / use.length;
    let sxx = 0, sxy = 0, syy = 0;
    for (const p of use) { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const d = { x: Math.cos(th), y: Math.sin(th) };
    if (pass === 2) return { p: { x: mx, y: my }, d };
    const res = pts.map((p) => Math.abs((p.x - mx) * -d.y + (p.y - my) * d.x));
    const sorted = [...res].sort((a, b) => a - b);
    const lim = Math.max(1, sorted[Math.floor(sorted.length * 0.7)] * 2);
    use = pts.filter((_, i) => res[i] <= lim);
  }
  return null;
}

function bilinear(lab: Float32Array, w: number, h: number, x: number, y: number, c: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const i = (yy: number, xx: number) => lab[(Math.min(h - 1, Math.max(0, yy)) * w + Math.min(w - 1, Math.max(0, xx))) * 3 + c];
  return (i(y0, x0) * (1 - fx) + i(y0, x0 + 1) * fx) * (1 - fy) + (i(y0 + 1, x0) * (1 - fx) + i(y0 + 1, x0 + 1) * fx) * fy;
}

/**
 * Snaps each side of `quad` (full-res coords) to the strongest colour step
 * along its normal, robustly fits a line per side and re-intersects them.
 */
export function refineQuad(cv: Cv, rgbFull: any, quad: Quad, iterations = 3): Quad {
  const w = rgbFull.cols, h = rgbFull.rows;
  const blur = new cv.Mat(), labM = new cv.Mat();
  cv.GaussianBlur(rgbFull, blur, new cv.Size(0, 0), 1.2);
  cv.cvtColor(blur, labM, cv.COLOR_RGB2Lab);
  const lab = Float32Array.from(labM.data as Uint8Array);
  blur.delete(); labM.delete();

  let q = quad.map((p) => ({ ...p })) as Quad;
  let band = Math.max(12, 0.014 * Math.hypot(w, h));
  const K = 4;
  for (let it = 0; it < iterations; it++) {
    const lines: ({ p: P; d: P } | null)[] = [];
    const centre = { x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 };
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4];
      const { nx, ny, len } = sideNormal(a, b, centre);
      const T = Math.max(20, Math.floor(len / 5));
      const nOff = Math.floor(2 * band) + 1;
      const pts: P[] = [];
      const vecs: number[][] = [];
      for (let ti = 0; ti < T; ti++) {
        const t = 0.04 + (0.92 * ti) / (T - 1);
        const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
        const x0 = px - nx * band, y0 = py - ny * band, x1 = px + nx * band, y1 = py + ny * band;
        if (Math.min(x0, x1) < 1 || Math.max(x0, x1) > w - 2 || Math.min(y0, y1) < 1 || Math.max(y0, y1) > h - 2) continue;
        const prof: number[][] = [];
        for (let j = 0; j < nOff; j++) {
          const o = -band + j;
          prof.push([0, 1, 2].map((c) => bilinear(lab, w, h, px + nx * o, py + ny * o, c)));
        }
        const g: number[] = [];
        for (let j = 0; j + 2 * K < prof.length; j++) g.push(Math.hypot(prof[j + 2 * K][0] - prof[j][0], prof[j + 2 * K][1] - prof[j][1], prof[j + 2 * K][2] - prof[j][2]));
        // strongest step, but prefer the one NEAREST the current estimate, so a
        // stronger unrelated edge further away (table seam, shadow) doesn't win
        let jb = 0, bestV = -1;
        for (let j = 0; j < g.length; j++) {
          const offj = -band + j + K;
          const v = g[j] * (1 - 0.5 * Math.min(1, Math.abs(offj) / band));
          if (v > bestV) { bestV = v; jb = j; }
        }
        if (g[jb] < 6) continue;
        let dj = 0;
        if (jb > 0 && jb < g.length - 1) {
          const den = g[jb - 1] - 2 * g[jb] + g[jb + 1];
          if (den !== 0) dj = (0.5 * (g[jb - 1] - g[jb + 1])) / den;
        }
        const off = -band + jb + dj + K;
        pts.push({ x: px + nx * off, y: py + ny * off });
        vecs.push([prof[jb + 2 * K][0] - prof[jb][0], prof[jb + 2 * K][1] - prof[jb][1], prof[jb + 2 * K][2] - prof[jb][2]]);
      }
      // the paper/background step has one consistent direction along a side;
      // drop samples whose colour step points elsewhere (text, grid lines, ...)
      if (vecs.length >= 8) {
        const mv = [0, 1, 2].map((c) => median(vecs.map((v) => v[c])));
        const mn = Math.hypot(mv[0], mv[1], mv[2]) + 1e-9;
        const keepIdx: number[] = [];
        vecs.forEach((v, i) => { if ((v[0] * mv[0] + v[1] * mv[1] + v[2] * mv[2]) / ((Math.hypot(v[0], v[1], v[2]) + 1e-9) * mn) > 0.3) keepIdx.push(i); });
        if (keepIdx.length >= 8) { const kp = keepIdx.map((i) => pts[i]); pts.length = 0; pts.push(...kp); }
      }
      lines.push(pts.length >= 8 ? fitLine(pts) : null);
    }
    const nq = q.map((p) => ({ ...p })) as Quad;
    let maxMove = 0;
    for (let i = 0; i < 4; i++) {
      const l1 = lines[(i + 3) % 4], l2 = lines[i];
      if (!l1 || !l2) continue;
      const det = l1.d.x * -l2.d.y - -l2.d.x * l1.d.y;
      if (Math.abs(det) < 1e-3) continue;
      const rx = l2.p.x - l1.p.x, ry = l2.p.y - l1.p.y;
      const s = (rx * -l2.d.y - -l2.d.x * ry) / det;
      nq[i] = { x: l1.p.x + l1.d.x * s, y: l1.p.y + l1.d.y * s };
      maxMove = Math.max(maxMove, dist(nq[i], q[i]));
    }
    if (maxMove > band * 3) break; // fit went somewhere implausible — keep previous
    q = nq;
    band = Math.max(3, band * 0.5);
  }
  return q;
}

// ───────────────────────── main entry ─────────────────────────

const WORK = 800; // longest side of the analysis image

/**
 * @param rgb  full-resolution, EXIF-rotated, 3-channel RGB pixels
 */
export async function detectDocument(rgb: Buffer, width: number, height: number): Promise<DocScanResult | null> {
  const { cv } = await getCv();
  const full = cv.matFromArray(height, width, cv.CV_8UC3, rgb);
  const k = Math.min(1, WORK / Math.max(width, height));
  const w = Math.round(width * k), h = Math.round(height * k);
  const small = new cv.Mat();
  if (k < 1) cv.resize(full, small, new cv.Size(w, h), 0, 0, cv.INTER_AREA); else full.copyTo(small);
  const gray = new cv.Mat();
  cv.cvtColor(small, gray, cv.COLOR_RGB2GRAY);

  // evidence for scoring
  const g = new cv.Mat(), g32 = new cv.Mat(), gxM = new cv.Mat(), gyM = new cv.Mat(), blurS = new cv.Mat(), labS = new cv.Mat();
  cv.GaussianBlur(gray, g, new cv.Size(0, 0), 1.5);
  g.convertTo(g32, cv.CV_32F);
  cv.Sobel(g32, gxM, cv.CV_32F, 1, 0, 3);
  cv.Sobel(g32, gyM, cv.CV_32F, 0, 1, 3);
  cv.GaussianBlur(small, blurS, new cv.Size(0, 0), 2);
  cv.cvtColor(blurS, labS, cv.COLOR_RGB2Lab);
  const ev: Evidence = { gx: new Float32Array(gxM.data32F), gy: new Float32Array(gyM.data32F), lab: new Uint8Array(labS.data), w, h };
  [g, g32, gxM, gyM, blurS, labS].forEach((m) => m.delete());

  const ctx: Ctx = { cv, rgb: small, gray, w, h };
  const generators: [string, (c: Ctx) => Quad[] | Promise<Quad[]>][] = [
    ['canny', viaCanny], ['color', viaColor], ['brightness', viaBrightness], ['saturation', viaSaturation], ['ai', viaAI],
  ];
  type Cand = { score: number; method: string; quad: Quad };
  const cands: Cand[] = [];
  try {
    for (const [name, fn] of generators) {
      let qs: Quad[] = [];
      try { qs = await fn(ctx); } catch (e: any) { console.warn(`[docscan] ${name} failed: ${e?.message ?? e}`); }
      for (const q of qs) {
        const s = scoreQuad(q, ev);
        if (process.env.SCANNER_DEBUG) (globalThis as any).__cands?.push({ name, score: s?.score ?? -1, quad: q.map((p) => ({ x: p.x / k, y: p.y / k })) });
        if (s) cands.push({ score: s.score, method: name, quad: q });
      }
    }
    if (!cands.length) return null;
    cands.sort((a, b) => b.score - a.score);

    // Take the best few DISTINCT candidates, snap each to the real paper edge at
    // full resolution, and let the evidence decide again on the refined quads —
    // a candidate that was a few dozen pixels off can score far better once its
    // sides sit on the true edge.
    const tol = 0.03 * Math.hypot(w, h);
    const picked: Cand[] = [];
    for (const c of cands) {
      if (picked.length >= 4) break;
      if (picked.some((p) => p.quad.every((pt, i) => dist(pt, c.quad[i]) < tol))) continue;
      picked.push(c);
    }
    let best: { rank: number; score: number; method: string; corners: Quad; refined: boolean } | null = null;
    for (const c of picked) {
      const full0 = c.quad.map((p) => ({ x: p.x / k, y: p.y / k })) as Quad;
      let refinedQ: Quad | null = null;
      try {
        const r = refineQuad(cv, full, full0);
        // a candidate that already scores high only needs polishing: don't let refinement
        // drag a corner far away from it (it may have latched onto a neighbouring edge)
        const maxShift = Math.max(...r.map((p, i) => dist(p, full0[i])));
        const polishOnly = c.score >= 0.8 && maxShift > 0.012 * Math.hypot(width, height);
        if (!polishOnly && isConvex(r) && Math.min(...cornerAngles(r)) > 45 && Math.max(...cornerAngles(r)) < 135) refinedQ = r;
      } catch (e: any) { console.warn(`[docscan] refine failed: ${e?.message ?? e}`); }
      const options: { q: Quad; refined: boolean; score: number }[] = [{ q: full0, refined: false, score: c.score }];
      if (refinedQ) {
        const rs = scoreQuad(refinedQ.map((p) => ({ x: p.x * k, y: p.y * k })) as Quad, ev);
        if (rs) options.push({ q: refinedQ, refined: true, score: rs.score });
      }
      // prefer the refined quad unless it scores clearly worse than the unrefined one
      const opt = options.length === 2 && options[1].score >= options[0].score - 0.03 ? options[1] : options[0];
      // rank by the refined evidence but keep the candidate's ORIGINAL score in the mix:
      // a poor candidate can be refined onto some other genuine edge and score ~1.0 there
      const rank = 0.7 * opt.score + 0.3 * c.score;
      if (!best || rank > best.rank) best = { rank, score: opt.score, method: c.method, corners: opt.q, refined: opt.refined };
    }
    if (!best || best.score < 0.45) return null; // unsure → null, so the app shows its safe full-frame default instead of a confident wrong crop
    const corners = best.corners.map((p) => ({ x: Math.min(width - 1, Math.max(0, p.x)), y: Math.min(height - 1, Math.max(0, p.y)) })) as Quad;
    return { corners, method: best.method, score: best.score, refined: best.refined };
  } finally {
    full.delete(); small.delete(); gray.delete();
  }
}

// ───────────────────────── true page aspect ratio ─────────────────────────

/**
 * Width/height of the real rectangle that produced this perspective quad
 * (Zhang & He, "Whiteboard scanning", principal point = image centre).
 * Returns null when the geometry is degenerate.
 */
export function estimateAspect(q: Quad, imgW: number, imgH: number): number | null {
  const u0 = imgW / 2, v0 = imgH / 2;
  const m = q.map((p) => [p.x - u0, p.y - v0, 1]);
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // Zhang & He number the corners TL, TR, BL, BR (ours are TL, TR, BR, BL)
  const [m1, m2, m4, m3] = m;
  const k2 = dot(cross(m1, m4), m3) / dot(cross(m2, m4), m3);
  const k3 = dot(cross(m1, m4), m2) / dot(cross(m3, m4), m2);
  const n2 = m2.map((v, i) => k2 * v - m1[i]);
  const n3 = m3.map((v, i) => k3 * v - m1[i]);
  const f2 = -(n2[0] * n3[0] + n2[1] * n3[1]) / (n2[2] * n3[2]);
  if (!isFinite(f2) || f2 <= 0) return null;
  const f = Math.sqrt(f2);
  const nn = (n: number[]) => Math.hypot(n[0] / f, n[1] / f, n[2]);
  const r = nn(n2) / nn(n3);
  return isFinite(r) && r > 0.2 && r < 5 ? r : null;
}

/** Output size for a rectified page: true proportions, snapped to `snapTo` (e.g. A4) only if the measurement agrees within 8%. */
export function rectifiedSize(q: Quad, imgW: number, imgH: number, snapTo?: number, longSide = 2000): { width: number; height: number } {
  // plain average of opposite side lengths: biased by perspective but always sane
  const simple = (dist(q[0], q[1]) + dist(q[3], q[2])) / (dist(q[0], q[3]) + dist(q[1], q[2]));
  let r = estimateAspect(q, imgW, imgH);
  // the geometric estimate is only trusted when it is in the same ballpark as the
  // simple one (a noisy corner can throw it far off)
  if (r === null || Math.abs(r / simple - 1) > 0.25) r = simple;
  const portrait = r < 1;
  let ar = Math.max(r, 1 / r);
  if (snapTo && Math.abs(ar - snapTo) / snapTo < 0.08) ar = snapTo;
  const short = Math.round(longSide / ar);
  return portrait ? { width: short, height: longSide } : { width: longSide, height: short };
}
