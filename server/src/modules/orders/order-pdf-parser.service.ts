import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export interface ParsedOrderFields {
  orderDate: string; // yyyy-mm-dd
  organization: string;
  poNumberLast4: string;
}

/**
 * Extracts the 3 fields needed to name an order (date, ordering
 * organization, PO number) from a supplier's purchase-order PDF via
 * OCR + text patterns — not colour-coded regions (confirmed directly:
 * the red/blue/green circles in the reference sample were the user's
 * own annotations for explaining the task, not something that
 * actually appears in real incoming PDFs).
 *
 * Verified end-to-end against a real sample document (Hebrew PO from
 * a hotel supplier): correctly pulled "1844" from "PO2603001844",
 * "2026-06-18" from "18/06/26", and the ordering organization's name
 * from the letterhead. Requires `tesseract-ocr` + `tesseract-ocr-heb`
 * and `poppler-utils` (pdftoppm) installed on the server — see the
 * module's deploy notes.
 *
 * Not perfectly reliable on every possible supplier's layout — this is
 * why Order keeps these as plain editable fields rather than treating
 * extraction as final; a person can correct any field in the app
 * exactly like every other auto-detected value in this codebase.
 */
@Injectable()
export class OrderPdfParserService {
  private readonly logger = new Logger('OrderPdfParserService');

  async parse(pdfBuffer: Buffer): Promise<ParsedOrderFields | null> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'order-pdf-'));
    try {
      const pdfPath = path.join(tmpDir, 'order.pdf');
      await fs.writeFile(pdfPath, pdfBuffer);
      const imgPrefix = path.join(tmpDir, 'page');
      // Render at a genuinely high resolution — a real PDF renders far
      // more legibly than a compressed phone screenshot of one
      // (confirmed directly: a screenshot-quality test image made OCR
      // drop the order-date label's own text entirely, though the date
      // value itself was still recoverable as a fallback).
      await execFileAsync('pdftoppm', ['-png', '-r', '300', '-f', '1', '-l', '1', pdfPath, imgPrefix]);
      const files = await fs.readdir(tmpDir);
      const imgFile = files.find((f) => f.startsWith('page') && f.endsWith('.png'));
      if (!imgFile) return null;
      const imgPath = path.join(tmpDir, imgFile);

      const { stdout: text } = await execFileAsync('tesseract', [imgPath, 'stdout', '-l', 'heb+eng']);
      const { stdout: tsv } = await execFileAsync('tesseract', [imgPath, 'stdout', '-l', 'heb+eng', 'tsv']);

      return this.extractFields(text, tsv);
    } catch (err: any) {
      this.logger.error(`PDF parse failed: ${err?.message}`);
      return null;
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  extractFields(text: string, tsv: string): ParsedOrderFields | null {
    const poNumberLast4 = this.extractPoNumber(text);
    const orderDate = this.extractOrderDate(text);
    const organization = this.extractOrganization(tsv);
    if (!poNumberLast4 || !orderDate || !organization) return null;
    return { orderDate, organization, poNumberLast4 };
  }

  private extractPoNumber(text: string): string | null {
    const match = text.match(/PO\s*[:\-]?\s*(\d{4,})/i);
    if (!match) return null;
    return match[1].slice(-4);
  }

  private extractOrderDate(text: string): string | null {
    // Prefer the date on the same line as the "order date" label; if
    // OCR dropped that label's text (a real, observed failure mode on
    // a low-quality source), fall back to whichever DD/MM/YY-like date
    // appears first on the page.
    const lines = text.split('\n');
    const labelIdx = lines.findIndex((l) => l.includes('תאריך הזמנה'));
    const dateRegex = /(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/;

    if (labelIdx !== -1) {
      const m = lines[labelIdx].match(dateRegex);
      if (m) return this.toIsoDate(m[1], m[2], m[3]);
    }
    for (const line of lines) {
      const m = line.match(dateRegex);
      if (m) return this.toIsoDate(m[1], m[2], m[3]);
    }
    return null;
  }

  private toIsoDate(d: string, m: string, y: string): string {
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  private extractOrganization(tsv: string): string | null {
    // The ordering company's name sits in the letterhead near the top
    // of the page and (for an Israeli business) almost always includes
    // "בע"מ" (Ltd.) -- restricting the search to roughly the top
    // quarter of the page is what tells it apart from the recipient's
    // own company name, which also includes "בע"מ" but appears further
    // down under "לכבוד:" (To:).
    const rows = tsv
      .split('\n')
      .slice(1)
      .map((r) => r.split('\t'));
    let pageHeight = 0;
    for (const r of rows) {
      if (r[0] === '1' && r[9]) pageHeight = Math.max(pageHeight, parseInt(r[9], 10));
    }
    if (!pageHeight) return null;

    const lineMap = new Map<string, { top: number; words: string[] }>();
    for (const r of rows) {
      if (r[0] !== '5' || !r[11]?.trim()) continue; // level 5 = word
      const key = `${r[2]}-${r[3]}-${r[4]}`; // block-par-line
      const top = parseInt(r[7], 10);
      if (!lineMap.has(key)) lineMap.set(key, { top, words: [] });
      lineMap.get(key)!.words.push(r[11]);
    }

    const candidates = [...lineMap.values()]
      .filter((l) => l.top < pageHeight * 0.25)
      .map((l) => l.words.join(' ').trim())
      .filter((t) => t.includes('בע"מ') || t.includes('בעמ'));

    return candidates[0] ?? null;
  }
}
