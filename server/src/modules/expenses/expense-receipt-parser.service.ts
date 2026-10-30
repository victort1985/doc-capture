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

      // 1) crop + straighten + clean (the cleaned image is what gets stored)
      const prepared = await this.prepareScan(imageBuf);
      const cropped = prepared.cropped;
      let scan = prepared.image;
      let ocrBase = prepared.ocrBase;

      // 2) OCR: detect the language first, then read with that language's model
      const installed = await this.getInstalledLangs();
      const wanted = (Object.keys(TESS_LANG) as ReceiptLanguage[]).filter((l) => installed.has(TESS_LANG[l]));
      for (const l of Object.keys(TESS_LANG) as ReceiptLanguage[]) {
        if (!installed.has(TESS_LANG[l])) warnings.push(`OCR language pack "${TESS_LANG[l]}" is not installed on the server (${l} receipts will read poorly)`);
      }
      const allLangs = wanted.map((l) => TESS_LANG[l]).join('+') || 'eng';
      const imgPath = path.join(tmpDir, 'scan.png');
      const readable = (g: { counts: Record<ReceiptLanguage, number> }) => g.counts.he + g.counts.ru + g.counts.ar + g.counts.en;

      await fs.writeFile(imgPath, await this.grayPng(ocrBase, 1));
      let text = await this.ocr(imgPath, allLangs, 6);
      let guess = detectLanguage(text);
      // sideways / upside-down photo: nothing readable → try the other orientations
      if (readable(guess) < 25) {
        for (const angle of [90, 270, 180]) {
          const rotated = await sharp(ocrBase).rotate(angle).toBuffer();
          await fs.writeFile(imgPath, await this.grayPng(rotated, 1));
          const t = await this.ocr(imgPath, allLangs, 6);
          const g = detectLanguage(t);
          if (readable(g) > readable(guess)) {
            text = t; guess = g; ocrBase = rotated;
            scan = await sharp(scan).rotate(angle).jpeg({ quality: 88 }).toBuffer();
          }
        }
      }
      const rotatedScan = scan;

      // second pass with the detected language's model (+ English for brand names / card networks),
      // on two renderings of the photo; the one that yields more fields wins
      const lang = guess.language;
      const langs = [TESS_LANG[lang], 'eng'].filter((x, i, a) => installed.has(x) && a.indexOf(x) === i);
      let best = { text, fields: extractReceipt(text, lang), score: -1 };
      best.score = this.fieldScore(best.fields);
      if (langs.length) {
        const meta = await sharp(ocrBase).metadata();
        const scales = (meta.width ?? 0) < 1400 ? [1, 3] : [1];
        for (const scale of scales) {
          await fs.writeFile(imgPath, await this.grayPng(ocrBase, scale));
          const t = await this.ocr(imgPath, langs.join('+'), 6);
          if (t.replace(/\s/g, '').length < 20) continue;
          const f = extractReceipt(t, lang);
          const sc = this.fieldScore(f);
          if (sc > best.score) best = { text: t, fields: f, score: sc };
        }
      }
      text = best.text;

      const fields = best.fields;
      return { fields, scanImage: rotatedScan, scanMimeType: 'image/jpeg', cropped, warnings, ocrLanguages: langs, rawText: text };
    } catch (err: any) {
      this.logger.error(`Receipt scan failed: ${err?.message}`);
      return { fields: empty, scanImage: null, scanMimeType: 'image/jpeg', cropped: false, warnings: [`Scan failed: ${err?.message ?? 'unknown error'}`], ocrLanguages: [], rawText: '' };
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Auto-rotate (EXIF) → find the receipt's edges → perspective-correct → de-shadow → JPEG. */
  private async prepareScan(input: Buffer): Promise<{ image: Buffer; cropped: boolean; ocrBase: Buffer }> {
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
    // OCR reads the cropped but UNCLEANED photo: shadow removal / white balance help the
    // stored scan look clean, but measurably hurt thin thermal-print text for tesseract.
    return { image, cropped, ocrBase: working };
  }

  /** Plain grayscale rendering (optionally upscaled) — tesseract reads thin thermal-print
   * text best from the untouched grayscale photo; heavy contrast/threshold processing hurt. */
  private async grayPng(img: Buffer, scale: number): Promise<Buffer> {
    let p = sharp(img).greyscale();
    if (scale !== 1) {
      const meta = await sharp(img).metadata();
      p = p.resize({ width: Math.round((meta.width ?? 1000) * scale), kernel: 'cubic' });
    }
    return p.png().toBuffer();
  }

  /** How complete an extraction looks — used to pick between OCR renderings. */
  private fieldScore(f: ExtractedReceipt): number {
    const keys: Array<keyof ExtractedReceipt> = ['vendorName', 'vendorTaxId', 'documentNumber', 'transactionDate', 'total', 'vatAmount', 'cardLast4', 'approvalNumber', 'documentType'];
    let sc = keys.filter((k) => f[k] != null).length;
    for (const k of Object.keys(f.confidence)) if ((f.confidence as any)[k] === 'high') sc += 0.5;
    return sc;
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
