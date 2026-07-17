import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import * as fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import * as path from 'path';

const HEBREW_REGULAR_PATH = path.join(__dirname, '../../assets/fonts/NotoSansHebrew-Regular.ttf');
const HEBREW_BOLD_PATH = path.join(__dirname, '../../assets/fonts/NotoSansHebrew-Bold.ttf');

export interface DocLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface DocHeader {
  companyName?: string;
  companySubtitle?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyTaxId?: string;
  logoBase64?: string; // data URI
}

export interface GenerateDocumentPdfParams {
  /** e.g. "הצעת מחיר" / "חשבונית" — printed as the document title. */
  docTypeLabel: string;
  docNumber: string;
  date: string;
  clientName: string;
  clientEmail?: string;
  items: DocLineItem[];
  total: number;
  footerText?: string | null;
  header: DocHeader;
}

// ── Minimal RTL layout ───────────────────────────────────────────────
// pdf-lib has no bidi/shaping engine. Hebrew doesn't need glyph
// shaping (letters don't join), so a simplified bidi pass is enough:
// split into Hebrew vs. non-Hebrew runs, reverse the run *order*
// (text flows right-to-left overall) and reverse characters *within*
// each Hebrew run, but keep non-Hebrew runs (numbers, phone numbers,
// emails, Latin text) in their normal left-to-right order internally.
// This is a best-effort approximation, not a full UAX#9 bidi
// implementation — good enough for short business-document strings
// (names, addresses, footer paragraphs), worth a visual check on
// anything unusual (e.g. right-to-left text ending mid-number).
function isHebrewChar(ch: string): boolean {
  const code = ch.codePointAt(0)!;
  return (code >= 0x0590 && code <= 0x05ff) || ch === '₪';
}

interface Run { text: string; hebrew: boolean; }

function splitRuns(text: string): Run[] {
  const runs: Run[] = [];
  let cur = '';
  let curHebrew: boolean | null = null;
  for (const ch of text) {
    const hebrew = isHebrewChar(ch);
    if (curHebrew === null || hebrew === curHebrew) {
      cur += ch;
      curHebrew = hebrew;
    } else {
      runs.push({ text: cur, hebrew: curHebrew });
      cur = ch;
      curHebrew = hebrew;
    }
  }
  if (cur) runs.push({ text: cur, hebrew: curHebrew! });
  return runs;
}

/** Runs in final left-to-right drawing order, i.e. already flipped for RTL. */
function toVisualRuns(text: string): Run[] {
  return splitRuns(text)
    .reverse()
    .map((r) => (r.hebrew ? { ...r, text: [...r.text].reverse().join('') } : r));
}

interface Fonts { he: PDFFont; heBold: PDFFont; latin: PDFFont; latinBold: PDFFont; }

function runWidth(run: Run, fonts: Fonts, size: number, bold: boolean): number {
  const font = run.hebrew ? (bold ? fonts.heBold : fonts.he) : (bold ? fonts.latinBold : fonts.latin);
  return font.widthOfTextAtSize(run.text, size);
}

/** Draws `text` (auto-detecting per-run script) at the given anchor.
 * align='right' anchors x as the right edge (typical for Hebrew UI);
 * align='left' anchors x as the left edge. */
function drawBidiText(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; size: number; fonts: Fonts; bold?: boolean; align?: 'left' | 'right'; color?: ReturnType<typeof rgb> },
) {
  const runs = toVisualRuns(text);
  const bold = !!opts.bold;
  const totalWidth = runs.reduce((sum, r) => sum + runWidth(r, opts.fonts, opts.size, bold), 0);
  let x = opts.align === 'right' ? opts.x - totalWidth : opts.x;
  for (const run of runs) {
    const font = run.hebrew ? (bold ? opts.fonts.heBold : opts.fonts.he) : (bold ? opts.fonts.latinBold : opts.fonts.latin);
    page.drawText(run.text, { x, y: opts.y, size: opts.size, font, color: opts.color ?? rgb(0.08, 0.1, 0.11) });
    x += runWidth(run, opts.fonts, opts.size, bold);
  }
  return totalWidth;
}

export async function generateDocumentPdf(params: GenerateDocumentPdfParams): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit as any);

  const [heRegularBytes, heBoldBytes] = await Promise.all([
    fs.promises.readFile(HEBREW_REGULAR_PATH),
    fs.promises.readFile(HEBREW_BOLD_PATH),
  ]);
  const fonts: Fonts = {
    he: await pdf.embedFont(heRegularBytes, { subset: true }),
    heBold: await pdf.embedFont(heBoldBytes, { subset: true }),
    latin: await pdf.embedFont(StandardFonts.Helvetica),
    latinBold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  const page = pdf.addPage([595.28, 841.89]); // A4
  const M = 48; // margin
  const W = page.getWidth();
  let y = page.getHeight() - M;

  const navy = rgb(0.055, 0.086, 0.259);
  const orange = rgb(0.949, 0.439, 0.11);
  const gray = rgb(0.4, 0.42, 0.44);

  // ── Header: logo (left) + company info (right, RTL) ─────────────────
  if (params.header.logoBase64) {
    try {
      const match = params.header.logoBase64.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        const bytes = Buffer.from(match[2], 'base64');
        const img = match[1].includes('png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        const h = 40;
        const w = (img.width / img.height) * h;
        page.drawImage(img, { x: M, y: y - h, width: w, height: h });
      }
    } catch {
      // Corrupt/unsupported logo image — skip it rather than fail the whole document.
    }
  }

  drawBidiText(page, params.header.companyName || '', { x: W - M, y: y - 12, size: 14, fonts, bold: true, align: 'right', color: navy });
  let hy = y - 28;
  if (params.header.companySubtitle) {
    drawBidiText(page, params.header.companySubtitle, { x: W - M, y: hy, size: 9, fonts, align: 'right', color: gray });
    hy -= 13;
  }
  if (params.header.companyAddress) {
    drawBidiText(page, params.header.companyAddress, { x: W - M, y: hy, size: 9, fonts, align: 'right', color: gray });
    hy -= 13;
  }
  const contactBits = [params.header.companyPhone, params.header.companyTaxId].filter(Boolean).join('   ');
  if (contactBits) {
    drawBidiText(page, contactBits, { x: W - M, y: hy, size: 9, fonts, align: 'right', color: gray });
  }

  y -= 70;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: rgb(0.85, 0.86, 0.88) });
  y -= 26;

  // ── Document title + number/date/client ──────────────────────────────
  drawBidiText(page, `${params.docTypeLabel} ${params.docNumber}`, { x: W - M, y, size: 16, fonts, bold: true, align: 'right', color: navy });
  y -= 20;
  drawBidiText(page, params.date, { x: W - M, y, size: 10, fonts, align: 'right', color: gray });
  y -= 22;
  drawBidiText(page, params.clientName, { x: W - M, y, size: 12, fonts, bold: true, align: 'right' });
  if (params.clientEmail) {
    y -= 14;
    page.drawText(params.clientEmail, { x: M, y, size: 9, font: fonts.latin, color: gray });
  }
  y -= 26;

  // ── Line items table ──────────────────────────────────────────────────
  const col = { total: W - M, unit: W - M - 100, qty: W - M - 180, desc: W - M - 240 };
  const rowH = 20;

  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: rowH, color: rgb(0.96, 0.97, 0.98) });
  drawBidiText(page, 'תיאור', { x: col.desc, y, size: 9.5, fonts, bold: true, align: 'right', color: gray });
  drawBidiText(page, 'כמות', { x: col.qty, y, size: 9.5, fonts, bold: true, align: 'right', color: gray });
  drawBidiText(page, 'מחיר', { x: col.unit, y, size: 9.5, fonts, bold: true, align: 'right', color: gray });
  drawBidiText(page, 'סה"כ', { x: col.total, y, size: 9.5, fonts, bold: true, align: 'right', color: gray });
  y -= rowH;

  for (const item of params.items) {
    if (y < 140) break; // simple single-page cap — see note below
    const lineTotal = item.quantity * item.unitPrice;
    drawBidiText(page, item.description, { x: col.desc, y, size: 10, fonts, align: 'right' });
    page.drawText(String(item.quantity), { x: col.qty - fonts.latin.widthOfTextAtSize(String(item.quantity), 10), y, size: 10, font: fonts.latin });
    const priceStr = item.unitPrice.toFixed(2);
    page.drawText(priceStr, { x: col.unit - fonts.latin.widthOfTextAtSize(priceStr, 10), y, size: 10, font: fonts.latin });
    const totalStr = lineTotal.toFixed(2);
    page.drawText(totalStr, { x: col.total - fonts.latin.widthOfTextAtSize(totalStr, 10), y, size: 10, font: fonts.latin });
    y -= rowH;
    page.drawLine({ start: { x: M, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.5, color: rgb(0.92, 0.93, 0.94) });
  }

  y -= 10;
  const totalStr = `₪ ${params.total.toFixed(2)}`;
  drawBidiText(page, totalStr, { x: W - M, y, size: 14, fonts, bold: true, align: 'right', color: navy });

  // ── Footer ──────────────────────────────────────────────────────────
  if (params.footerText) {
    const footerY = 60;
    page.drawLine({ start: { x: M, y: footerY + 20 }, end: { x: W - M, y: footerY + 20 }, thickness: 0.5, color: rgb(0.9, 0.91, 0.92) });
    // Naive wrap: split on existing newlines only — long unbroken lines
    // may run off the page edge. Good enough for typical short terms
    // text; revisit if someone pastes a large unbroken paragraph.
    const lines = params.footerText.split('\n').slice(0, 4);
    let fy = footerY;
    for (const line of lines) {
      drawBidiText(page, line, { x: W - M, y: fy, size: 8, fonts, align: 'right', color: gray });
      fy -= 11;
    }
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
