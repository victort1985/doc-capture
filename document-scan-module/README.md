# document-scan-module

Standalone, isolated experimentation tool for document edge-detection +
perspective correction ("straightening" a photo of a document shot at an
angle). **Not wired into the live server** — test it here first, on real
photos, before we decide how to integrate it into Vixor ERP.

## Why this exists

We tried `@techstark/opencv-js` (WASM) for this three separate times, in
three increasingly isolated contexts:

1. Imported directly at server boot — pinned the server at 100% CPU
   indefinitely, before a single request even arrived.
2. Isolated inside a `worker_thread` with an enforced hard timeout — the
   worker still hung/timed out on every real upload, never once
   completing.
3. A bare, standalone script doing nothing else — still hung at WASM
   init.

Three hangs across three different isolation strategies means the
library itself just doesn't work reliably in this environment. This
module is a full rewrite with **zero WASM or native dependencies** —
pure JavaScript math only (grayscale, Otsu thresholding, corner
detection, and a manually-computed perspective transform). It cannot
hang the way OpenCV.js did, because there's no WASM runtime to hang.

## How it works

1. Grayscale + heavy blur (suppresses background texture/noise)
2. Otsu's method picks an automatic light/dark threshold
3. The four "extreme" bright pixels (by `x+y` and `x-y`) approximate the
   document's four corners — valid as long as the document is the
   largest light region in the frame (the normal case for a document
   photographed on a table or floor)
4. A manually-computed homography + bilinear-sampled inverse warp
   performs the perspective correction — the same math
   `cv.warpPerspective` does internally, just written out directly

If no confident document region is found (too little or too much
contrast — e.g. a blank frame, or the whole image is one color), it
saves the original image unchanged instead of guessing.

## Usage

```bash
cd document-scan-module
npm install
node scan.js path/to/photo.jpg path/to/output.png --debug
```

With `--debug`, it also writes:
- `output.png.debug.png` — the original photo with the detected
  quadrilateral drawn on top (red outline, green corner dots)
- `output.png.blurred-debug.png` / `output.png.threshold-debug.png` —
  the intermediate grayscale-blurred and binary-threshold images, useful
  if detection isn't finding the right region

Every stage logs its timing to stderr, so you can see exactly where
time goes (should be well under a second even on a full-resolution
phone photo).

## Testing checklist before integrating

Try it against a handful of *real* phone photos (not just synthetic
test images) covering:
- [ ] Document shot straight-on, good lighting
- [ ] Document shot at a noticeable angle
- [ ] Document on a cluttered/textured background (wood desk, patterned
      floor)
- [ ] Document that's small relative to the frame
- [ ] Document that fills almost the entire frame
- [ ] A non-document photo (should gracefully skip cropping, not
      produce garbage)

If corner detection is off on some of these, the usual knobs to try
first (in `scan.js`):
- `boxBlur(..., radius, passes)` — more blur = less sensitive to
  background texture, but can also blur away a document's edges if
  overdone
- The `0.05` / `0.97` fraction bounds in `findCorners()` — how much of
  the frame needs to be "bright" before we trust it's a real document
