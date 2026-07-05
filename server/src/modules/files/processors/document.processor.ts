import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { scanAndCropDocument } from './document-scanner';

const MAX_PDF_BYTES = 1 * 1024 * 1024; // 1 MB per spec

/**
 * Document pipeline: auto-crop to the document's edges (via
 * document-scanner.ts's pure-JS detection — see that file and
 * /document-scan-module at the repo root for why this replaced an
 * OpenCV.js-based approach that hung on every real upload), normalize
 * contrast for a "scanned" look, then wrap as a single-page PDF,
 * iteratively reducing JPEG quality until it's under MAX_PDF_BYTES.
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
    const cropped = await scanAndCropDocument(rotated);
    if (cropped) cropSource = cropped;
    // null: no confidently-detected document edges — fall back to the
    // uncropped, EXIF-rotated photo, same as before this feature existed.
  } catch (err) {
    console.warn(`[processDocument] Auto-crop skipped: ${(err as Error)?.message ?? err}`);
  }

  const enhanced = sharp(cropSource)
    .normalize() // stretch contrast — approximates a "scan" look
    .sharpen({ sigma: 1 });

  let quality = 90;
  let jpegBuffer = await enhanced.clone().jpeg({ quality }).toBuffer();
  let pdfBytes = await buildSinglePageImagePdf(jpegBuffer);

  while (pdfBytes.length > MAX_PDF_BYTES && quality > 25) {
    quality -= 10;
    jpegBuffer = await enhanced.clone().jpeg({ quality }).toBuffer();
    pdfBytes = await buildSinglePageImagePdf(jpegBuffer);
  }

  return pdfBytes;
}

async function buildSinglePageImagePdf(jpegBuffer: Buffer): Promise<Buffer> {
  const { width, height } = await sharp(jpegBuffer).metadata();
  const pdfDoc = await PDFDocument.create();
  const image = await pdfDoc.embedJpg(jpegBuffer);
  const page = pdfDoc.addPage([width || image.width, height || image.height]);
  page.drawImage(image, { x: 0, y: 0, width: width || image.width, height: height || image.height });
  return Buffer.from(await pdfDoc.save());
}

function isPdf(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === '%PDF';
}
