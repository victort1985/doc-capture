import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

/**
 * Document pipeline: auto-trim uniform background/margins around the
 * document, normalize contrast for a "scanned" look, then wrap as a
 * single-page PDF.
 *
 * An OpenCV.js-based approach (perspective-correcting the document like
 * a dedicated scanner app) was tried twice and abandoned both times —
 * see document-edge-detection.ts and edge-detection.worker.ts, kept
 * only as dormant reference. First attempt: importing it pinned the
 * server at 100% CPU indefinitely from boot, before a single request
 * even arrived. Second attempt, after isolating it in a worker_thread
 * with a hard enforced timeout so a hang could no longer take the
 * server down: it still hung/timed out on real uploads every time,
 * never once completing successfully. Two failures with the same
 * library on this server is enough — it isn't worth another attempt.
 *
 * sharp's own `.trim()` (native libvips, no WASM) instead: it crops away
 * uniform-colour borders/background around the document. It won't
 * correct perspective on an angled photo the way OpenCV would have, but
 * it reliably tightens the crop to the document's edges, which is what
 * actually makes scanned photos look neat — and it has none of the
 * stability risk.
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

  let trimmed = rotated;
  try {
    trimmed = await sharp(rotated).trim().toBuffer();
  } catch (err) {
    // trim() throws if the whole image is one uniform colour (nothing
    // to trim) or on other edge cases — never let that block the upload,
    // just fall back to the untrimmed photo.
    console.warn(`[processDocument] Auto-trim skipped: ${(err as Error)?.message ?? err}`);
  }

  const normalized = await sharp(trimmed)
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
