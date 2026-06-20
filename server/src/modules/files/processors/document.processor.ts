import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { detectAndCropDocument } from './document-edge-detection';

/**
 * Document pipeline: auto-crop to detected edges, normalize contrast for
 * a "scanned" look, then wrap as a single-page PDF.
 *
 * If the input is already a PDF (picked from the file manager rather than
 * the camera/gallery), it's passed through unchanged instead of being fed
 * to sharp — sharp only decodes raster image formats and would throw on
 * PDF bytes ("Input buffer contains unsupported image format").
 *
 * Edge detection uses OpenCV.js (see document-edge-detection.ts) to find
 * the document's quadrilateral and perspective-correct it. If no
 * confident quadrilateral is found (busy background, document already
 * fills the frame, poor contrast, etc.) or detection throws for any
 * reason, falls back to the original uncropped-but-normalized image
 * rather than failing the upload — a worse-than-ideal crop is better
 * than no upload at all.
 */
export async function processDocument(buffer: Buffer): Promise<Buffer> {
  if (isPdf(buffer)) {
    return buffer;
  }

  const rotated = await sharp(buffer).rotate().toBuffer(); // respect EXIF orientation first

  let workingBuffer = rotated;

  try {
    const { data, info } = await sharp(rotated)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Hard timeout around detection — found during testing that the
    // OpenCV.js WASM path can hang indefinitely in some environments
    // (reproduced in CI/sandbox testing, cause not fully isolated before
    // shipping). An upload must never hang forever waiting on this —
    // worst case is the same as before this feature existed: an
    // uncropped-but-normalized image, not a stuck request.
    const detected = await Promise.race([
      detectAndCropDocument(data, info.width, info.height),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    if (detected) {
      workingBuffer = await sharp(detected.buffer, {
        raw: { width: detected.width, height: detected.height, channels: 4 },
      })
        .png()
        .toBuffer();
    }
  } catch (err) {
    // Detection failure should never block the upload — fall back to the
    // rotated-but-uncropped image (logged for visibility, not rethrown).
    // eslint-disable-next-line no-console
    console.warn('Document edge detection failed, using uncropped image:', (err as Error).message);
  }

  const normalized = await sharp(workingBuffer)
    .normalize() // stretch contrast — approximates a "scan" look
    .sharpen({ sigma: 1 })
    .toFormat('png')
    .toBuffer();

  const pdfDoc = await PDFDocument.create();
  const image = await pdfDoc.embedPng(normalized);
  const page = pdfDoc.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });

  return Buffer.from(await pdfDoc.save());
}

function isPdf(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === '%PDF';
}
