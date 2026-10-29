import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { applyFilters, detectDocumentCorners, warpDocument } from '../files/processors/document-scanner';
import { extractReceipt, ExtractedReceipt } from './receipt/receipt-extractor';
import { detectLanguage, ReceiptLanguage } from './receipt/receipt-lang';

const execFileAsync = promisify(execFile);

/** tesseract traineddata name per supported language. */
const TESS_LANG: Record<ReceiptLanguage, string> = { he: 'heb', ru: 'rus', en: 'eng', ar: 'ara' };

export interface ReceiptScanResult {
  fields: ExtractedReceipt;
  /** The cropped, straightened, shadow-free scan (JPEG) that will be stored with the expense. */
  scanImage: Buffer | null;
  scanMimeType: string;
  /** Whether the document edges were found and the page was cropped/straightened. */
  cropped: boolean;
  /** Human-readable problems (missing OCR language pack, unreadable image, ...) */
  warnings: string[];
  ocrLanguages: string[];
  /** Text as recognised by OCR (for the 'show recognised text' panel and debugging). */
  rawText: string;
}

/**
 * Receipt scanner: crop + straighten + de-shadow the photo (the same
 * document-scanner pipeline used for regular scans), detect the
 * receipt's LANGUAGE first, OCR it with that language's model, then
 * extract the fields with that language's vocabulary.
 *
 * Nothing here is final: every field only PRE-FILLS the expense form,
 * and the person reviews and confirms before anything is saved.
 *
 * System requirements: tesseract-ocr plus the language packs
 * tesseract-ocr-heb, tesseract-ocr-rus, tesseract-ocr-ara (English is
 * built in) and poppler-utils (pdftoppm) for PDF receipts. A missing
 * pack never breaks scanning — that language is skipped and reported
 * in `warnings`.
 */
@Injectable()
export class ExpenseReceiptParserService {
  private readonly logger = new Logger('ExpenseReceiptParserService');
  private installedLangs: Set<string> | null = null;

  /** Back-compat for the old endpoint shape. */
  async parse(fileBuffer: Buffer, mimetype: string): Promise<{ amount: number | null; date: string | null; vendor: string | null } | null> {
    const r = await this.scan(fileBuffer, mimetype);
    return { amount: r.fields.total, date: r.fields.transactionDate, vendor: r.fields.vendorName };
  }

  async scan(fileBuffer: Buffer, mimetype: string): Promise<ReceiptScanResult> {
    const warnings: string[] = [];
    const empty = extractReceipt('');
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'receipt-'));
    try {
      let imageBuf: Buffer;
      if (mimetype === 'application/pdf') {
        const pdfPath = path.join(tmpDir, 'in.pdf');
        await fs.writeFile(pdfPath, fileBuffer);
        await execFileAsync('pdftoppm', ['-png', '-r', '250', '-f', '1', '-l', '1', pdfPath, path.join(tmpDir, 'page')]);
        const f = (await fs.readdir(tmpDir)).find((x) => x.startsWith('page') && x.endsWith('.png'));
        if (!f) return { fields: empty, scanImage: null, scanMimeType: 'image/jpeg', cropped: false, warnings: ['Could not read the PDF'], ocrLanguages: [], rawText: '' };
        imageBuf = await fs.readFile(path.join(tmpDir, f));
      } else {
        imageBuf = fileBuffer;
      }

      // 1) crop + straighten + clean
      const { image: scan, cropped } = await this.prepareScan(imageBuf);

      // 2) OCR: detect language first, then read with the right model
      const installed = await this.getInstalledLangs();
      const wanted = (Object.keys(TESS_LANG) as ReceiptLanguage[]).filter((l) => installed.has(TESS_LANG[l]));
      for (const l of Object.keys(TESS_LANG) as ReceiptLanguage[]) {
        if (!installed.has(TESS_LANG[l])) warnings.push(`OCR language pack "${TESS_LANG[l]}" is not installed on the server (${l} receipts will read poorly)`);
      }
      const ocrInput = await this.ocrReadyImage(scan);
      const imgPath = path.join(tmpDir, 'scan.png');
      await fs.writeFile(imgPath, ocrInput);

      let text = await this.ocr(imgPath, wanted.map((l) => TESS_LANG[l]).join('+') || 'eng', 6);
      let guess = detectLanguage(text);
      let rotatedScan = scan;
      // sideways / upside-down photo: nothing readable → try the other orientations
      if (guess.counts.he + guess.counts.ru + guess.counts.ar + guess.counts.en < 25) {
        for (const angle of [90, 270, 180]) {
          const rot = await sharp(ocrInput).rotate(angle).png().toBuffer();
          await fs.writeFile(imgPath, rot);
          const t = await this.ocr(imgPath, wanted.map((l) => TESS_LANG[l]).join('+') || 'eng', 6);
          const g = detectLanguage(t);
          const readable = g.counts.he + g.counts.ru + g.counts.ar + g.counts.en;
          if (readable > guess.counts.he + guess.counts.ru + guess.counts.ar + guess.counts.en) {
            text = t; guess = g;
            rotatedScan = await sharp(scan).rotate(angle).jpeg({ quality: 88 }).toBuffer();
            await fs.writeFile(imgPath, rot);
          }
        }
        if (rotatedScan !== scan) await fs.writeFile(imgPath, await this.ocrReadyImage(rotatedScan));
      }

      // second pass with the detected language's model (+ English for brand names / card networks)
      const lang = guess.language;
      const langs = [TESS_LANG[lang], 'eng'].filter((x, i, a) => installed.has(x) && a.indexOf(x) === i);
      if (langs.length && !(langs.length === wanted.length)) {
        const refined = await this.ocr(imgPath, langs.join('+'), 4);
        if (refined.replace(/\s/g, '').length >= text.replace(/\s/g, '').length * 0.6) text = refined;
      }

      const fields = extractReceipt(text, lang);
      return { fields, scanImage: rotatedScan, scanMimeType: 'image/jpeg', cropped, warnings, ocrLanguages: langs, rawText: text };
    } catch (err: any) {
      this.logger.error(`Receipt scan failed: ${err?.message}`);
      return { fields: empty, scanImage: null, scanMimeType: 'image/jpeg', cropped: false, warnings: [`Scan failed: ${err?.message ?? 'unknown error'}`], ocrLanguages: [], rawText: '' };
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Auto-rotate (EXIF) → find the receipt's edges → perspective-correct → de-shadow → JPEG. */
  private async prepareScan(input: Buffer): Promise<{ image: Buffer; cropped: boolean }> {
    let base: Buffer = await sharp(input).rotate().toBuffer();
    const meta = await sharp(base).metadata();
    // cap huge phone photos: 3000px on the long side is plenty for OCR and keeps the file small
    if (Math.max(meta.width ?? 0, meta.height ?? 0) > 3000) base = await sharp(base).resize({ width: 3000, height: 3000, fit: 'inside' }).toBuffer();

    let cropped = false;
    let working = base;
    try {
      const det = await detectDocumentCorners(base);
      if (det && (det.score ?? 0) >= 0.5) {
        const c = det.corners;
        const area = Math.abs(c.reduce((s, p, i) => s + (p.x * c[(i + 1) % 4].y - c[(i + 1) % 4].x * p.y), 0)) / 2;
        const frac = area / (det.imageWidth * det.imageHeight);
        // ignore "found" quads that are basically the whole frame (nothing to crop) or tiny blobs
        if (frac > 0.12 && frac < 0.97) {
          working = await warpDocument(base, c);
          cropped = true;
        }
      }
    } catch (e: any) {
      this.logger.warn(`Receipt crop skipped: ${e?.message}`);
    }
    const cleaned = await applyFilters(working, { mode: 'original', removeShadows: true });
    const image = await sharp(cleaned).jpeg({ quality: 88 }).toBuffer();
    return { image, cropped };
  }

  /** Grayscale + normalise + upscale small images: what tesseract reads best. */
  private async ocrReadyImage(img: Buffer): Promise<Buffer> {
    const meta = await sharp(img).metadata();
    const minSide = Math.min(meta.width ?? 0, meta.height ?? 0);
    let p = sharp(img).greyscale().normalise();
    if (minSide && minSide < 1200) p = p.resize({ width: Math.round((meta.width ?? 1200) * (1200 / minSide)), kernel: 'lanczos3' });
    return p.sharpen().png().toBuffer();
  }

  private async ocr(imgPath: string, langs: string, psm: number): Promise<string> {
    const { stdout } = await execFileAsync('tesseract', [imgPath, 'stdout', '-l', langs, '--psm', String(psm)], { maxBuffer: 16 * 1024 * 1024, timeout: 90_000 });
    return stdout;
  }

  private async getInstalledLangs(): Promise<Set<string>> {
    if (this.installedLangs) return this.installedLangs;
    try {
      const { stdout } = await execFileAsync('tesseract', ['--list-langs']);
      this.installedLangs = new Set(stdout.split('\n').slice(1).map((l) => l.trim()).filter(Boolean));
    } catch {
      this.installedLangs = new Set(['eng']);
    }
    return this.installedLangs;
  }
}
