import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export interface ParsedReceiptFields {
  amount: number | null;
  date: string | null; // yyyy-mm-dd
  vendor: string | null;
}

/**
 * Extracts amount/date/vendor from a photographed or scanned receipt
 * via the same OCR approach as OrderPdfParserService (tesseract +
 * heb+eng, pdftoppm for PDF input) — reused deliberately rather than
 * built from scratch, since that pipeline's already proven against a
 * real document.
 *
 * Receipts are a genuinely harder target than the purchase-order PDFs
 * that service was built for: a PO has one consistent layout from one
 * known supplier, while a receipt could be a phone photo taken at any
 * angle, in any lighting, from any of hundreds of possible store
 * formats. This is reflected in how the result gets used: every
 * extracted field only ever PRE-FILLS the expense form — nothing here
 * is treated as final, exactly like the PO parser's own fields stay
 * plain editable text. A person reviews and can correct or clear any
 * of it before saving, same principle as every other auto-detected
 * value in this codebase.
 *
 * Same system requirements as OrderPdfParserService: tesseract-ocr +
 * tesseract-ocr-heb, and poppler-utils (pdftoppm) if a PDF receipt is
 * ever uploaded instead of a photo.
 */
@Injectable()
export class ExpenseReceiptParserService {
  private readonly logger = new Logger('ExpenseReceiptParserService');

  async parse(fileBuffer: Buffer, mimetype: string): Promise<ParsedReceiptFields | null> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'receipt-'));
    try {
      let imgPath: string;

      if (mimetype === 'application/pdf') {
        const pdfPath = path.join(tmpDir, 'receipt.pdf');
        await fs.writeFile(pdfPath, fileBuffer);
        const imgPrefix = path.join(tmpDir, 'page');
        await execFileAsync('pdftoppm', ['-png', '-r', '300', '-f', '1', '-l', '1', pdfPath, imgPrefix]);
        const files = await fs.readdir(tmpDir);
        const imgFile = files.find((f) => f.startsWith('page') && f.endsWith('.png'));
        if (!imgFile) return null;
        imgPath = path.join(tmpDir, imgFile);
      } else {
        // A camera photo is already an image tesseract can read
        // directly — no rendering step needed, unlike a PDF.
        const ext = mimetype === 'image/png' ? 'png' : 'jpg';
        imgPath = path.join(tmpDir, `receipt.${ext}`);
        await fs.writeFile(imgPath, fileBuffer);
      }

      const { stdout: text } = await execFileAsync('tesseract', [imgPath, 'stdout', '-l', 'heb+eng']);
      return this.extractFields(text);
    } catch (err: any) {
      this.logger.error(`Receipt parse failed: ${err?.message}`);
      return null;
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  extractFields(text: string): ParsedReceiptFields {
    return {
      amount: this.extractAmount(text),
      date: this.extractDate(text),
      vendor: this.extractVendor(text),
    };
  }

  private extractAmount(text: string): number | null {
    // Receipts commonly print a subtotal, a VAT line, AND a final
    // total — all three look like plausible amounts on their own. The
    // strongest signal is a number appearing on the same line as a
    // "total" label (Hebrew סה"כ/לתשלום, Russian "Итого", English
    // "TOTAL"/"Amount Due") — checked in that priority order, since a
    // line explicitly labeled as the total is far more reliable than
    // just picking the largest number on the page (which can be
    // wrong if, e.g., a loyalty-points balance is printed larger than
    // the actual charge).
    const numberPattern = /(\d{1,3}(?:[,.]\d{3})*(?:[.,]\d{1,2})?)/;
    const totalLabels = [/סה"?כ.*לתשלום/, /לתשלום/, /סה"?כ/, /итого/i, /\btotal\b|amount due/i];

    const lines = text.split('\n');
    for (const labelPattern of totalLabels) {
      for (const line of lines) {
        // "Subtotal" contains "total" as a substring but is explicitly
        // the WRONG amount to pick — a genuine failure mode caught by
        // testing against a real-shaped sample, not something the
        // \b word-boundary alone fixes (there's no word boundary
        // between "Sub" and "total" either way, so \btotal\b already
        // wouldn't match "Subtotal" — but excluding it explicitly here
        // too, since a receipt could plausibly print "Sub Total" with
        // a space, where the boundary check alone WOULD wrongly match).
        if (/sub\s*-?\s*total|ביניים/i.test(line)) continue;
        if (labelPattern.test(line)) {
          const m = line.match(numberPattern);
          if (m) return this.parseAmount(m[1]);
        }
      }
    }

    // Fallback: no explicit "total" line found (OCR may have dropped
    // the label text, a real observed failure mode for this exact
    // pipeline on low-quality sources) — take the largest plausible
    // monetary amount anywhere on the receipt instead.
    const allAmounts = [...text.matchAll(new RegExp(numberPattern, 'g'))]
      .map((m) => this.parseAmount(m[1]))
      .filter((n): n is number => n !== null && n > 0 && n < 1_000_000);
    if (allAmounts.length === 0) return null;
    return Math.max(...allAmounts);
  }

  private parseAmount(raw: string): number | null {
    // Handles both "1,234.56" (thousands comma, decimal point) and
    // "1.234,56" (the reverse, common outside the US) by checking
    // which separator appears last — that one is the decimal point.
    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');
    let normalized: string;
    if (lastComma > lastDot) {
      normalized = raw.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = raw.replace(/,/g, '');
    }
    const value = parseFloat(normalized);
    return Number.isFinite(value) ? value : null;
  }

  private extractDate(text: string): string | null {
    const dateRegex = /(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/;
    for (const line of text.split('\n')) {
      const m = line.match(dateRegex);
      if (m) return this.toIsoDate(m[1], m[2], m[3]);
    }
    return null;
  }

  private toIsoDate(d: string, m: string, y: string): string {
    const year = y.length === 2 ? `20${y}` : y;
    // Assumes DD/MM/YYYY (the convention on virtually every Israeli
    // receipt, matching this app's own locale) — but if that reading
    // would put an impossible month (>12) in the month position, the
    // two are almost certainly swapped (an MM/DD/YYYY-formatted
    // receipt, e.g. from an imported US purchase), so flip them
    // rather than emitting a nonsense date.
    const day = parseInt(d, 10);
    const month = parseInt(m, 10);
    if (month > 12 && day <= 12) {
      return `${year}-${d.padStart(2, '0')}-${m.padStart(2, '0')}`;
    }
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  private extractVendor(text: string): string | null {
    // The store/business name is almost always one of the first few
    // non-empty lines on a receipt — skip anything that's mostly
    // digits/punctuation (a barcode number, a date, a phone number),
    // since those sometimes print above the actual name.
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines.slice(0, 6)) {
      const letters = line.replace(/[^a-zA-Zא-תа-яА-ЯёЁ]/g, '');
      if (letters.length >= 3) return line;
    }
    return null;
  }
}
