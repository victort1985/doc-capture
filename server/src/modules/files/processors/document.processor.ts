import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { detectDocumentCorners, warpDocument, applyFilters, A4_RATIO } from './document-scanner';

const MAX_PDF_BYTES = 1 * 1024 * 1024; // 1 MB per spec

/**
 * Non-interactive document pipeline — detects, crops/straightens, and
 * applies the default B&W filter in one shot, for callers that don't go
 * through the review/preview flow (see ScanSessionsService for that;
 * document-scanner.ts's detectDocumentCorners/warpDocument/applyFilters
 * are the same composable building blocks used there).
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

  let cropped: Buffer;
  try {
    const detected = await detectDocumentCorners(rotated);
    if (detected) {
      cropped = await warpDocument(
        rotated,
        detected.corners,
        { topCurve: detected.topCurve, bottomCurve: detected.bottomCurve, leftCurve: detected.leftCurve, rightCurve: detected.rightCurve },
        A4_RATIO,
      );
    } else {
      cropped = rotated;
    }
  } catch (err) {
    console.warn(`[processDocument] Auto-crop skipped: ${(err as Error)?.message ?? err}`);
    cropped = rotated;
  }

  const filtered = await applyFilters(cropped, { mode: 'bw' });
  const enhanced = await fitToA4(sharp(filtered).sharpen({ sigma: 1 }));

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

const A4_TARGET_WIDTH = 1700; // ~205 DPI at A4 width — plenty for a document photo

/**
 * Guarantees the final page is A4-proportioned no matter what came in.
 * Fits the content inside the A4 canvas without stretching/distorting it
 * — if the source isn't quite A4-shaped, it's letterboxed with white
 * bars rather than warped to fill the frame.
 */
async function fitToA4(pipeline: sharp.Sharp): Promise<sharp.Sharp> {
  const targetHeight = Math.round(A4_TARGET_WIDTH * A4_RATIO);
  const buffer = await pipeline
    .resize(A4_TARGET_WIDTH, targetHeight, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
    .toBuffer();
  return sharp(buffer);
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
