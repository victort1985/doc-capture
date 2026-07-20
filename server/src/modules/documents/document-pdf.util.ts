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

export type DocTemplate = 'classic' | 'modern' | 'minimalist';

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
  /** Defaults to 'classic' when not set (existing settings rows predate this field). */
  template?: DocTemplate;
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
/** Runs in final left-to-right drawing order, i.e. already flipped for RTL.
 *
 * IMPORTANT: only the ORDER of runs gets reversed here — never the
 * characters within a Hebrew run. Verified against Chromium's own
 * bidi-aware PDF export as ground truth (extracted via pdftotext):
 * word order flips for RTL text, but each word's internal letter
 * sequence is untouched. An earlier version of this function also
 * reversed characters within each Hebrew run, which produced
 * mirror-image gibberish for every word (e.g. "הצעת" came out as
 * "תעצה") — wrong despite seeming plausible on paper. */
function toVisualRuns(text: string): Run[] {
  return splitRuns(text).reverse();
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

  switch (params.template) {
    case 'modern':
      await drawModernLayout(pdf, page, fonts, params);
      break;
    case 'minimalist':
      drawMinimalistLayout(page, fonts, params);
      break;
    case 'classic':
    default:
      await drawClassicLayout(pdf, page, fonts, params);
      break;
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

/** Shared helper: draws a right-aligned block of company header lines
 * (name, subtitle, address, phone/tax-id) and returns the y position
 * just below it — all three templates need this, just at different
 * positions/colors/sizes. */
function drawCompanyBlock(
  page: PDFPage,
  fonts: Fonts,
  header: DocHeader,
  opts: { x: number; y: number; nameSize: number; lineSize: number; nameColor: ReturnType<typeof rgb>; lineColor: ReturnType<typeof rgb>; align: 'left' | 'right' },
): number {
  drawBidiText(page, header.companyName || '', { x: opts.x, y: opts.y, size: opts.nameSize, fonts, bold: true, align: opts.align, color: opts.nameColor });
  let hy = opts.y - (opts.nameSize + 4);
  const lineGap = opts.lineSize + 4;
  if (header.companySubtitle) {
    drawBidiText(page, header.companySubtitle, { x: opts.x, y: hy, size: opts.lineSize, fonts, align: opts.align, color: opts.lineColor });
    hy -= lineGap;
  }
  if (header.companyAddress) {
    drawBidiText(page, header.companyAddress, { x: opts.x, y: hy, size: opts.lineSize, fonts, align: opts.align, color: opts.lineColor });
    hy -= lineGap;
  }
  const contactBits = [header.companyPhone, header.companyTaxId].filter(Boolean).join('   ');
  if (contactBits) {
    drawBidiText(page, contactBits, { x: opts.x, y: hy, size: opts.lineSize, fonts, align: opts.align, color: opts.lineColor });
    hy -= lineGap;
  }
  return hy;
}

async function embedLogo(pdf: PDFDocument, header: DocHeader): Promise<{ img: any; width: number; height: number } | null> {
  if (!header.logoBase64) return null;
  try {
    const match = header.logoBase64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) return null;
    const bytes = Buffer.from(match[2], 'base64');
    const img = match[1].includes('png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    return { img, width: img.width, height: img.height };
  } catch {
    return null; // corrupt/unsupported logo — caller just skips drawing it
  }
}

// ════════════════════════════════════════════════════════════════════
// CLASSIC — navy accents on white, hairline rules, gray table-header
// band. The safe, conservative default — works in any context.
// ════════════════════════════════════════════════════════════════════
async function drawClassicLayout(pdf: PDFDocument, page: PDFPage, fonts: Fonts, params: GenerateDocumentPdfParams) {
  const M = 48;
  const W = page.getWidth();
  let y = page.getHeight() - M;

  const navy = rgb(0.055, 0.086, 0.259);
  const gray = rgb(0.4, 0.42, 0.44);

  const logo = await embedLogo(pdf, params.header);
  if (logo) {
    const h = 40;
    const w = (logo.width / logo.height) * h;
    page.drawImage(logo.img, { x: M, y: y - h, width: w, height: h });
  }

  drawCompanyBlock(page, fonts, params.header, { x: W - M, y: y - 12, nameSize: 14, lineSize: 9, nameColor: navy, lineColor: gray, align: 'right' });

  y -= 70;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: rgb(0.85, 0.86, 0.88) });
  y -= 26;

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

  const col = { total: W - M, unit: W - M - 100, qty: W - M - 180, desc: W - M - 240 };
  const rowH = 20;

  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: rowH, color: rgb(0.96, 0.97, 0.98) });
  drawBidiText(page, 'תיאור', { x: col.desc, y, size: 9.5, fonts, bold: true, align: 'right', color: gray });
  drawBidiText(page, 'כמות', { x: col.qty, y, size: 9.5, fonts, bold: true, align: 'right', color: gray });
  drawBidiText(page, 'מחיר', { x: col.unit, y, size: 9.5, fonts, bold: true, align: 'right', color: gray });
  drawBidiText(page, 'סה"כ', { x: col.total, y, size: 9.5, fonts, bold: true, align: 'right', color: gray });
  y -= rowH;

  for (const item of params.items) {
    if (y < 140) break;
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

  drawClassicFooter(page, fonts, params, M, W, gray);
}

function drawClassicFooter(page: PDFPage, fonts: Fonts, params: GenerateDocumentPdfParams, M: number, W: number, gray: ReturnType<typeof rgb>) {
  if (!params.footerText) return;
  const footerY = 60;
  page.drawLine({ start: { x: M, y: footerY + 20 }, end: { x: W - M, y: footerY + 20 }, thickness: 0.5, color: rgb(0.9, 0.91, 0.92) });
  const lines = params.footerText.split('\n').slice(0, 4);
  let fy = footerY;
  for (const line of lines) {
    drawBidiText(page, line, { x: W - M, y: fy, size: 8, fonts, align: 'right', color: gray });
    fy -= 11;
  }
}

// ════════════════════════════════════════════════════════════════════
// MODERN — full-width colored header band (logo/name in white),
// rounded client-info card, zebra-striped item rows, total in a
// colored pill. Best for tech/creative-leaning businesses.
// ════════════════════════════════════════════════════════════════════
async function drawModernLayout(pdf: PDFDocument, page: PDFPage, fonts: Fonts, params: GenerateDocumentPdfParams) {
  const M = 48;
  const W = page.getWidth();
  const H = page.getHeight();
  const orange = rgb(0.949, 0.439, 0.11);
  const navy = rgb(0.055, 0.086, 0.259);
  const gray = rgb(0.4, 0.42, 0.44);
  const bandH = 118;

  // Full-width colored band across the top.
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: navy });

  const logo = await embedLogo(pdf, params.header);
  if (logo) {
    const h = 34;
    const w = (logo.width / logo.height) * h;
    page.drawImage(logo.img, { x: M, y: H - 40 - h, width: w, height: h });
  }
  drawBidiText(page, params.header.companyName || '', { x: W - M, y: H - 44, size: 15, fonts, bold: true, align: 'right', color: rgb(1, 1, 1) });
  let by = H - 60;
  const bandBits = [params.header.companySubtitle, params.header.companyAddress].filter(Boolean).join('  ·  ');
  if (bandBits) { drawBidiText(page, bandBits, { x: W - M, y: by, size: 9, fonts, align: 'right', color: rgb(0.8, 0.82, 0.9) }); by -= 13; }
  const contactBits = [params.header.companyPhone, params.header.companyTaxId].filter(Boolean).join('   ');
  if (contactBits) drawBidiText(page, contactBits, { x: W - M, y: by, size: 9, fonts, align: 'right', color: rgb(0.8, 0.82, 0.9) });

  // Document type pill, bottom-left of the band.
  const pillLabel = `${params.docTypeLabel} ${params.docNumber}`;
  const pillWidth = fonts.heBold.widthOfTextAtSize(pillLabel, 11) + 28;
  page.drawRectangle({ x: M, y: H - bandH + 16, width: pillWidth, height: 24, color: orange });
  drawBidiText(page, pillLabel, { x: M + pillWidth - 14, y: H - bandH + 24, size: 11, fonts, bold: true, align: 'right', color: rgb(1, 1, 1) });

  let y = H - bandH - 36;

  // Client info card.
  const cardH = params.clientEmail ? 56 : 42;
  page.drawRectangle({ x: M, y: y - cardH, width: W - 2 * M, height: cardH, color: rgb(0.96, 0.97, 0.98) });
  drawBidiText(page, 'ללקוח', { x: W - M - 14, y: y - 18, size: 8.5, fonts, align: 'right', color: gray });
  drawBidiText(page, params.clientName, { x: W - M - 14, y: y - 34, size: 13, fonts, bold: true, align: 'right' });
  if (params.clientEmail) page.drawText(params.clientEmail, { x: M + 14, y: y - 34, size: 9, font: fonts.latin, color: gray });
  drawBidiText(page, params.date, { x: M + 14, y: y - 18, size: 9, fonts, align: 'left', color: gray });
  y -= cardH + 28;

  const col = { total: W - M, unit: W - M - 100, qty: W - M - 180, desc: W - M - 250 };
  const rowH = 22;

  drawBidiText(page, 'תיאור', { x: col.desc, y, size: 9, fonts, bold: true, align: 'right', color: orange });
  drawBidiText(page, 'כמות', { x: col.qty, y, size: 9, fonts, bold: true, align: 'right', color: orange });
  drawBidiText(page, 'מחיר', { x: col.unit, y, size: 9, fonts, bold: true, align: 'right', color: orange });
  drawBidiText(page, 'סה"כ', { x: col.total, y, size: 9, fonts, bold: true, align: 'right', color: orange });
  y -= rowH;

  let stripe = false;
  for (const item of params.items) {
    if (y < 140) break;
    if (stripe) page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: rowH, color: rgb(0.97, 0.975, 0.98) });
    stripe = !stripe;
    const lineTotal = item.quantity * item.unitPrice;
    drawBidiText(page, item.description, { x: col.desc, y, size: 10, fonts, align: 'right' });
    page.drawText(String(item.quantity), { x: col.qty - fonts.latin.widthOfTextAtSize(String(item.quantity), 10), y, size: 10, font: fonts.latin });
    const priceStr = item.unitPrice.toFixed(2);
    page.drawText(priceStr, { x: col.unit - fonts.latin.widthOfTextAtSize(priceStr, 10), y, size: 10, font: fonts.latin });
    const totalStr = lineTotal.toFixed(2);
    page.drawText(totalStr, { x: col.total - fonts.latin.widthOfTextAtSize(totalStr, 10), y, size: 10, font: fonts.latin });
    y -= rowH;
  }

  y -= 14;
  const totalStr = `₪ ${params.total.toFixed(2)}`;
  const totalPillW = fonts.latinBold.widthOfTextAtSize(totalStr, 14) + 28;
  page.drawRectangle({ x: W - M - totalPillW, y: y - 8, width: totalPillW, height: 28, color: navy });
  page.drawText(totalStr, { x: W - M - totalPillW + 14, y: y, size: 14, font: fonts.latinBold, color: rgb(1, 1, 1) });

  if (params.footerText) {
    const footerY = 60;
    page.drawLine({ start: { x: M, y: footerY + 20 }, end: { x: W - M, y: footerY + 20 }, thickness: 0.5, color: rgb(0.9, 0.91, 0.92) });
    const lines = params.footerText.split('\n').slice(0, 4);
    let fy = footerY;
    for (const line of lines) {
      drawBidiText(page, line, { x: W - M, y: fy, size: 8, fonts, align: 'right', color: gray });
      fy -= 11;
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// MINIMALIST — pure black on white, no fills, no boxes. Just
// typography, alignment, and whitespace, with a couple of thin
// hairlines for structure. Understated, works anywhere.
// ════════════════════════════════════════════════════════════════════
function drawMinimalistLayout(page: PDFPage, fonts: Fonts, params: GenerateDocumentPdfParams) {
  const M = 56;
  const W = page.getWidth();
  const black = rgb(0.08, 0.08, 0.08);
  const gray = rgb(0.5, 0.5, 0.5);
  let y = page.getHeight() - M - 4;

  // No logo image in the minimalist template by design — wordmark-only
  // header keeps the austere look consistent even for customers whose
  // logo is busy/colorful.
  drawBidiText(page, params.header.companyName || '', { x: W - M, y, size: 13, fonts, bold: true, align: 'right', color: black });
  y -= 16;
  const bits = [params.header.companySubtitle, params.header.companyAddress, params.header.companyPhone, params.header.companyTaxId].filter(Boolean).join('   ·   ');
  if (bits) { drawBidiText(page, bits, { x: W - M, y, size: 8.5, fonts, align: 'right', color: gray }); y -= 14; }

  y -= 30;
  drawBidiText(page, `${params.docTypeLabel}`, { x: W - M, y, size: 20, fonts, align: 'right', color: black });
  y -= 16;
  drawBidiText(page, `${params.docNumber}   ·   ${params.date}`, { x: W - M, y, size: 9, fonts, align: 'right', color: gray });
  y -= 34;

  page.drawLine({ start: { x: M, y: y + 12 }, end: { x: W - M, y: y + 12 }, thickness: 0.75, color: black });

  drawBidiText(page, params.clientName, { x: W - M, y, size: 11, fonts, bold: true, align: 'right', color: black });
  if (params.clientEmail) page.drawText(params.clientEmail, { x: M, y, size: 9, font: fonts.latin, color: gray });
  y -= 32;

  const col = { total: W - M, unit: W - M - 100, qty: W - M - 175, desc: W - M - 235 };

  drawBidiText(page, 'תיאור', { x: col.desc, y, size: 8, fonts, align: 'right', color: gray });
  drawBidiText(page, 'כמות', { x: col.qty, y, size: 8, fonts, align: 'right', color: gray });
  drawBidiText(page, 'מחיר', { x: col.unit, y, size: 8, fonts, align: 'right', color: gray });
  drawBidiText(page, 'סה"כ', { x: col.total, y, size: 8, fonts, align: 'right', color: gray });
  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  y -= 20;

  const rowH = 24;
  for (const item of params.items) {
    if (y < 140) break;
    const lineTotal = item.quantity * item.unitPrice;
    drawBidiText(page, item.description, { x: col.desc, y, size: 10, fonts, align: 'right', color: black });
    page.drawText(String(item.quantity), { x: col.qty - fonts.latin.widthOfTextAtSize(String(item.quantity), 10), y, size: 10, font: fonts.latin, color: black });
    const priceStr = item.unitPrice.toFixed(2);
    page.drawText(priceStr, { x: col.unit - fonts.latin.widthOfTextAtSize(priceStr, 10), y, size: 10, font: fonts.latin, color: black });
    const totalStr = lineTotal.toFixed(2);
    page.drawText(totalStr, { x: col.total - fonts.latin.widthOfTextAtSize(totalStr, 10), y, size: 10, font: fonts.latin, color: black });
    y -= rowH;
  }

  y -= 4;
  page.drawLine({ start: { x: M, y: y + 16 }, end: { x: W - M, y: y + 16 }, thickness: 0.75, color: black });
  const totalStr = `₪ ${params.total.toFixed(2)}`;
  drawBidiText(page, totalStr, { x: W - M, y, size: 15, fonts, align: 'right', color: black });

  if (params.footerText) {
    const footerY = 56;
    const lines = params.footerText.split('\n').slice(0, 4);
    let fy = footerY;
    for (const line of lines) {
      drawBidiText(page, line, { x: W - M, y: fy, size: 8, fonts, align: 'right', color: gray });
      fy -= 11;
    }
  }
}
