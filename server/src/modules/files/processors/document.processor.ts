import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { runEdgeDetectionInWorker } from './document-edge-detection';

/**
 * Document pipeline: auto-crop to the document's edges (if confidently
 * detected), normalize contrast for a "scanned" look, then wrap as a
 * single-page PDF.
 *
 * The auto-crop step was disabled for a while after a real production
 * incident: OpenCV.js's WASM init ran as a side effect of this module
 * being loaded at server bootstrap, pinning the server at 100% CPU
 * indefinitely before a single request even arrived. It's back on now,
 * but run through runEdgeDetectionInWorker() (see document-edge-detection.ts),
 * which isolates the actual detection work in a disposable worker_thread
 * with a hard, enforced timeout — if it hangs, the worker is forcibly
 * terminated and we just fall back to the uncropped photo, exactly like
 * the "no confident edges found" case. A single slow/bad upload can no
 * longer take the whole server down with it.
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

  let cropSource = rotated;
  try {
    const { data: rgba, info } = await sharp(rotated)
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });

    const cropped = await runEdgeDetectionInWorker(rgba, info.width, info.height);

    if (cropped) {
      cropSource = await sharp(cropped.buffer, {
        raw: { width: cropped.width, height: cropped.height, channels: 4 },
      })
        .png()
        .toBuffer();
    }
    // cropped === null: no confidently-detected document edges (or the
    // detector timed out/errored) — fall back to the uncropped photo.
  } catch (err) {
    console.warn(`[processDocument] Edge-detection crop skipped: ${(err as Error)?.message ?? err}`);
  }

  const normalized = await sharp(cropSource)
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
