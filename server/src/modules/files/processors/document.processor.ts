import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

/**
 * Document pipeline: auto-crop to detected edges (placeholder — see TODO),
 * normalize contrast for a "scanned" look, then wrap as a single-page PDF.
 *
 * If the input is already a PDF (picked from the file manager rather than
 * the camera/gallery), it's passed through unchanged instead of being fed
 * to sharp — sharp only decodes raster image formats and would throw on
 * PDF bytes ("Input buffer contains unsupported image format").
 *
 * Edge detection is intentionally a stub: a real implementation needs either
 * a CV library (e.g. OpenCV via a native binding) or a vision API call.
 * sharp alone can't detect document borders, only apply pixel-level ops.
 */
export async function processDocument(buffer: Buffer): Promise<Buffer> {
  if (isPdf(buffer)) {
    return buffer;
  }

  const normalized = await sharp(buffer)
    .rotate() // respect EXIF orientation
    .normalize() // stretch contrast — approximates a "scan" look
    .sharpen({ sigma: 1 })
    .toFormat('png')
    .toBuffer();

  // TODO: replace with real border detection + perspective correction
  // (e.g. OpenCV findContours + warpPerspective) before this step.
  const cropped = normalized;

  const pdfDoc = await PDFDocument.create();
  const image = await pdfDoc.embedPng(cropped);
  const page = pdfDoc.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });

  return Buffer.from(await pdfDoc.save());
}

function isPdf(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === '%PDF';
}
