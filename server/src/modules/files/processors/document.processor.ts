import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

// detectAndCropDocument (OpenCV.js-based edge detection) is intentionally
// NOT called below right now — disabled after a real production
// incident: the server sat at 100% CPU indefinitely (no incoming
// requests even needed to trigger it, since the dependency was
// statically imported at module-load time — now fixed to load lazily,
// see document-edge-detection.ts) with no further log output, matching
// instability with this exact library already seen in earlier sandbox
// testing. A timeout around the call (Promise.race) only stops the
// CALLER from waiting — it doesn't cancel whatever's actually hung
// underneath, which is exactly how the runaway CPU happened in the
// first place. Until this library's reliability on this server is
// properly understood, every document upload just gets normalized
// (no auto-crop) rather than risk repeating the outage on the very
// first photo someone uploads. See document-edge-detection.ts for the
// dormant implementation.

/**
 * Document pipeline: normalize contrast for a "scanned" look, then wrap
 * as a single-page PDF.
 *
 * If the input is already a PDF (picked from the file manager rather than
 * the camera/gallery), it's passed through unchanged instead of being fed
 * to sharp — sharp only decodes raster image formats and would throw on
 * PDF bytes ("Input buffer contains unsupported image format").
 */
export async function processDocument(buffer: Buffer): Promise<Buffer> {
  if (isPdf(buffer)) {
    return buffer;
  }

  const rotated = await sharp(buffer).rotate().toBuffer(); // respect EXIF orientation first

  const normalized = await sharp(rotated)
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
