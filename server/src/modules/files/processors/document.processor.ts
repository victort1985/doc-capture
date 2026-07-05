import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

/**
 * Document pipeline: normalize contrast for a "scanned" look, then wrap
 * as a single-page PDF.
 *
 * Auto-cropping/perspective-correction is NOT done here right now — see
 * /document-scan-module at the repo root for an isolated, in-progress
 * pure-JavaScript rewrite (zero WASM/native deps, unlike the abandoned
 * OpenCV.js attempts — see that module's README for the full history).
 * It'll get wired in here deliberately once it's been tested against a
 * real batch of phone photos, not before.
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

  const rotated = await sharp(buffer).rotate().toBuffer(); // respect EXIF orientation

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
