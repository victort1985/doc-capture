// Deliberately NOT a static top-level import. A static `import cvModule
// from '@techstark/opencv-js'` runs the library's WASM init as a side
// effect of NestJS loading this module at server BOOTSTRAP (this file
// gets pulled in via the dependency graph regardless of whether anyone
// has ever uploaded a document yet) — confirmed as the real cause of a
// production incident: the server process sat at 100% CPU indefinitely
// from the moment it started, with no further log output and no
// incoming requests, exactly matching instability with this library's
// WASM init already observed during development (see the retry/polling
// comment below — that was written after reproducing a related hang in
// sandbox testing). A dynamic import() inside getCv() defers all of
// that to the first time a document actually needs cropping, so a
// problem with this one feature can no longer take the whole server
// down before a single request is even handled.
type Cv = any;
let cvReady: Promise<Cv> | null = null;

/**
 * Waits for the WASM runtime to finish initializing. Deliberately polls
 * rather than relying solely on the one-shot `onRuntimeInitialized`
 * callback — that event can fire before a caller gets a chance to
 * attach a listener (a real race reproduced during development: the
 * module finishes loading in well under a second, often before the
 * consuming code reaches the line that sets the callback, causing an
 * indefinite hang waiting for an event that already happened). Polling
 * is immune to that ordering issue.
 */
async function getCv(): Promise<Cv> {
  if (cvReady) return cvReady;
  cvReady = (async () => {
    const cvModule = (await import('@techstark/opencv-js')) as any;
    const cv = cvModule.default ?? cvModule;
    if (cv.Mat) return cv;
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (cv.Mat) {
          clearInterval(interval);
          resolve(cv);
        } else if (attempts > 200) {
          clearInterval(interval);
          reject(new Error('OpenCV.js failed to initialize within 10s'));
        }
      }, 50);
    });
  })();
  return cvReady;
}

export interface DetectedDocument {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Detects the largest 4-sided contour in a raw RGBA image and performs
 * a perspective transform ("flattens" the photographed document into a
 * straight-on rectangular crop) — equivalent to what dedicated document
 * scanner apps do. Returns null if no confident quadrilateral is found
 * (e.g. the document already fills the frame, busy background, poor
 * contrast), so the caller can fall back to using the original image
 * unmodified rather than risk a bad/garbage crop.
 *
 * Input must be raw RGBA pixel data (use sharp's `.raw().ensureAlpha()`
 * to produce it) — this function does no image decoding itself.
 */
export async function detectAndCropDocument(
  rgba: Buffer,
  width: number,
  height: number,
): Promise<DetectedDocument | null> {
  const cv = await getCv();

  const src = cv.matFromArray(height, width, cv.CV_8UC4, rgba);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const dilated = new cv.Mat();
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  let bestQuad: any = null;

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 50, 150);
    cv.dilate(edges, dilated, kernel);
    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const imageArea = width * height;
    let bestArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      // Ignore anything covering less than 15% of the frame — too small
      // to plausibly be the whole document, almost certainly noise/text.
      if (area < imageArea * 0.15) {
        cnt.delete();
        continue;
      }

      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

      if (approx.rows === 4 && area > bestArea) {
        if (bestQuad) bestQuad.delete();
        bestQuad = approx;
        bestArea = area;
      } else {
        approx.delete();
      }
      cnt.delete();
    }

    if (!bestQuad) {
      return null;
    }

    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 4; i++) {
      pts.push({ x: bestQuad.data32S[i * 2], y: bestQuad.data32S[i * 2 + 1] });
    }

    // Order corners: top-left, top-right, bottom-right, bottom-left —
    // required for getPerspectiveTransform to map them correctly.
    pts.sort((a, b) => a.y - b.y);
    const top = pts.slice(0, 2).sort((a, b) => a.x - b.x);
    const bottom = pts.slice(2, 4).sort((a, b) => a.x - b.x);
    const [tl, tr] = top;
    const [bl, br] = bottom;

    const widthA = Math.hypot(br.x - bl.x, br.y - bl.y);
    const widthB = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const outWidth = Math.round(Math.max(widthA, widthB));

    const heightA = Math.hypot(tr.x - br.x, tr.y - br.y);
    const heightB = Math.hypot(tl.x - bl.x, tl.y - bl.y);
    const outHeight = Math.round(Math.max(heightA, heightB));

    if (outWidth < 50 || outHeight < 50) {
      // Degenerate quad (near-zero size) — treat as "nothing usable found"
      // rather than producing a tiny garbage crop.
      return null;
    }

    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y,
    ]);
    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0, outWidth, 0, outWidth, outHeight, 0, outHeight,
    ]);
    const M = cv.getPerspectiveTransform(srcTri, dstTri);
    const dst = new cv.Mat();
    cv.warpPerspective(src, dst, M, new cv.Size(outWidth, outHeight));

    const outBuffer = Buffer.from(dst.data);

    srcTri.delete();
    dstTri.delete();
    M.delete();
    dst.delete();

    return { buffer: outBuffer, width: outWidth, height: outHeight };
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    dilated.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();
    if (bestQuad) bestQuad.delete();
  }
}
