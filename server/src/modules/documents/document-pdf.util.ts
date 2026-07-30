import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from 'pdf-lib';
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
  /** Draws a large translucent "sample, not for use" watermark diagonally
   * across the page — for demo/sandbox organizations only, see Organization.isDemoMode. */
  isDemoMode?: boolean;

  /** Optional diagonal stamp text (e.g. "נאמן למקור" — "certified true
   * copy") drawn in a neutral blue-gray, independent of isDemoMode —
   * both can be present at once (a demo-org copy would show both). */
  stampText?: string;

  /** When true, an 18% VAT (מע"מ) line is added between the subtotal
   * (params.total, which is always pre-VAT) and the printed grand
   * total. Undefined/false means the org is VAT-exempt for this
   * document type — the printed total simply equals params.total. */
  vatEnabled?: boolean;

  /** Israeli VAT has three practical categories a whole document
   * normally falls into (mixed-rate line items within one document
   * are a real but rare edge case, not handled here): 'standard'
   * (18%, default), 'zero' (0% — export sales/inbound tourism, VAT
   * Act sec. 30 — still shows a VAT line, just at 0%, since that's
   * what distinguishes a documented zero-rated sale from one that
   * was never subject to VAT at all), 'exempt' (עוסק פטור or exempt
   * goods/services — no VAT line at all, same visual result as
   * vatEnabled=false but recorded distinctly for reporting). Only
   * takes effect when vatEnabled is true; ignored otherwise. */
  vatCategory?: 'standard' | 'zero' | 'exempt';

  /** ISO 4217 code. Undefined/'ILS' means plain shekels, no
   * additional line. Any other currency shows the document totals in
   * that currency AND a converted ILS-equivalent line using
   * exchangeRateToIls (locked at document creation time) — Israeli
   * tax reporting always needs the ILS figure regardless of what
   * currency the customer was actually billed in. */
  currency?: string;
  exchangeRateToIls?: number;

  /** requirement #6 ("Invoice Israel") — the short (9-digit)
   * allocation number, printed per the ITA spec's exact instruction:
   * prominently, under the heading "הקצאה מספר:". Undefined/null
   * means no number applies (below threshold, integration not
   * enabled, or not yet received) and nothing gets printed. */
  allocationNumber?: string | null;

  /** True when an invoice is being issued WITHOUT an allocation
   * number after the ITA explicitly refused one and the "continue
   * anyway" alternative was chosen — the spec requires this specific
   * disclaimer to appear prominently in that case ("אין לנכות מס
   * תשומות בגין חשבונית זו"). */
  continuedWithoutAllocation?: boolean;
}

/** Israel's standard VAT rate. Not read from anywhere configurable on
 * purpose — if/when the statutory rate changes, this is the one place
 * to update, and every document type picks it up together. */
export const VAT_RATE = 0.18;

/** Resolves the actual rate + Hebrew label to print for a document's
 * vatCategory, so the 3 templates don't each re-implement this
 * mapping. 'exempt' returns rate 0 with showLine=false (no VAT line
 * printed at all, distinct from 'zero' which prints "מע"מ (0%)"). */
function resolveVatDisplay(category: GenerateDocumentPdfParams['vatCategory']): { rate: number; label: string; showLine: boolean } {
  if (category === 'exempt') return { rate: 0, label: '', showLine: false };
  if (category === 'zero') return { rate: 0, label: 'מע"מ (0% — עסקת חוץ):', showLine: true };
  return { rate: VAT_RATE, label: `מע"מ (${(VAT_RATE * 100).toFixed(0)}%):`, showLine: true };
}

/** Currency symbol for the handful of currencies this app is
 * actually likely to see (ILS-based Israeli business dealing
 * occasionally in USD/EUR/GBP) — not a general-purpose ISO 4217
 * lookup table. */
function currencySymbol(code?: string): string {
  switch (code) {
    case 'USD': return '$';
    case 'EUR': return '€';
    case 'GBP': return '£';
    default: return '₪';
  }
}

/** The converted-ILS line shown under a foreign-currency document's
 * total, since Israeli tax reporting needs the ILS figure regardless
 * of billing currency. Returns '' when the document is already in
 * ILS or has no locked rate (nothing to convert). */
function ilsEquivalentLine(params: GenerateDocumentPdfParams, amount: number): string {
  if (!params.currency || params.currency === 'ILS' || !params.exchangeRateToIls) return '';
  const ils = amount * params.exchangeRateToIls;
  return `(≈ ₪ ${ils.toFixed(2)} לפי שער ${params.exchangeRateToIls.toFixed(4)})`;
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
type RunKind = 'hebrew' | 'other' | 'space';

function classify(ch: string): RunKind {
  if (ch === ' ') return 'space';
  const code = ch.codePointAt(0)!;
  return (code >= 0x0590 && code <= 0x05ff) || ch === '₪' ? 'hebrew' : 'other';
}

interface Run { text: string; hebrew: boolean; }

function splitRuns(text: string): Run[] {
  const runs: Run[] = [];
  let cur = '';
  let curKind: RunKind | null = null;
  for (const ch of text) {
    const kind = classify(ch);
    if (curKind === null || kind === curKind) {
      cur += ch;
      curKind = kind;
    } else {
      runs.push({ text: cur, hebrew: curKind === 'hebrew' });
      cur = ch;
      curKind = kind;
    }
  }
  if (cur) runs.push({ text: cur, hebrew: curKind === 'hebrew' });
  return runs;
}

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
  const runs = splitRuns(text);
  const hasHebrew = runs.some((r) => r.hebrew);
  return hasHebrew ? runs.reverse() : runs;
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

/** Large, translucent, diagonal stamp across the page — reused for
 * both the demo "sample, not for use" watermark and the "certified
 * true copy" (נאמן למקור) stamp. Same bidi run handling as
 * drawBidiText (each run keeps the same rotation angle, anchored at
 * its own position along the line, so the whole phrase still reads as
 * one straight rotated line despite being drawn run-by-run). */
function drawDiagonalStamp(page: PDFPage, fonts: Fonts, text: string, color: { r: number; g: number; b: number }) {
  const W = page.getWidth();
  const H = page.getHeight();
  const size = 34;
  const angle = degrees(28);
  const runs = toVisualRuns(text);
  const totalWidth = runs.reduce((sum, r) => sum + runWidth(r, fonts, size, true), 0);

  // Anchor the un-rotated line so its rotated center lands at the
  // page center — rotate() in pdf-lib pivots around (x, y), so we
  // offset the start point by half the (unrotated) width along the
  // rotation angle rather than just centering on a horizontal line.
  const cx = W / 2;
  const cy = H / 2;
  const rad = (28 * Math.PI) / 180;
  let x = cx - (totalWidth / 2) * Math.cos(rad);
  let y = cy - (totalWidth / 2) * Math.sin(rad);

  for (const run of runs) {
    const font = run.hebrew ? fonts.heBold : fonts.latinBold;
    page.drawText(run.text, { x, y, size, font, color: rgb(color.r, color.g, color.b), opacity: 0.2, rotate: angle });
    const w = runWidth(run, fonts, size, true);
    x += w * Math.cos(rad);
    y += w * Math.sin(rad);
  }
}

export async function generateDocumentPdf(rawParams: GenerateDocumentPdfParams): Promise<Buffer> {
  // requirement #6 ("Invoice Israel") — the allocation number gets
  // folded into footerText as a forced first line rather than adding
  // template-specific drawing code to all 3 layouts (classic/modern/
  // minimal each have their own pixel-level positioning) — this way
  // every template prints it the same way footerText already renders
  // consistently everywhere, satisfying the spec's "prominently
  // displayed" requirement without three separate implementations to
  // keep in sync.
  const params: GenerateDocumentPdfParams = rawParams.allocationNumber
    ? { ...rawParams, footerText: `הקצאה מספר: ${rawParams.allocationNumber}${rawParams.footerText ? `\n${rawParams.footerText}` : ''}` }
    : rawParams.continuedWithoutAllocation
      ? { ...rawParams, footerText: `אין לנכות מס תשומות בגין חשבונית זו${rawParams.footerText ? `\n${rawParams.footerText}` : ''}` }
      : rawParams;

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

  if (params.isDemoMode) {
    drawDiagonalStamp(page, fonts, 'לדוגמה, לא לשימוש', { r: 0.75, g: 0.15, b: 0.15 });
  }
  if (params.stampText) {
    drawDiagonalStamp(page, fonts, params.stampText, { r: 0.15, g: 0.3, b: 0.55 });
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
  {
    const sym = currencySymbol(params.currency);
    const vd = params.vatEnabled ? resolveVatDisplay(params.vatCategory) : { rate: 0, label: '', showLine: false };
    if (vd.showLine) {
      const vatAmount = params.total * vd.rate;
      const grandTotal = params.total + vatAmount;
      drawBidiText(page, `סה"כ לפני מע"מ:  ${sym} ${params.total.toFixed(2)}`, { x: W - M, y, size: 10, fonts, align: 'right', color: gray });
      y -= 16;
      drawBidiText(page, `${vd.label}  ${sym} ${vatAmount.toFixed(2)}`, { x: W - M, y, size: 10, fonts, align: 'right', color: gray });
      y -= 20;
      drawBidiText(page, `סה"כ לתשלום:  ${sym} ${grandTotal.toFixed(2)}`, { x: W - M, y, size: 14, fonts, bold: true, align: 'right', color: navy });
      const ilsLine = ilsEquivalentLine(params, grandTotal);
      if (ilsLine) { y -= 14; drawBidiText(page, ilsLine, { x: W - M, y, size: 8.5, fonts, align: 'right', color: gray }); }
    } else {
      drawBidiText(page, `${sym} ${params.total.toFixed(2)}`, { x: W - M, y, size: 14, fonts, bold: true, align: 'right', color: navy });
      const ilsLine = ilsEquivalentLine(params, params.total);
      if (ilsLine) { y -= 14; drawBidiText(page, ilsLine, { x: W - M, y, size: 8.5, fonts, align: 'right', color: gray }); }
    }
  }

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
  const pillLabelRuns = toVisualRuns(pillLabel);
  const pillWidth = pillLabelRuns.reduce((sum, r) => sum + runWidth(r, fonts, 11, true), 0) + 28;
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
  {
    const sym = currencySymbol(params.currency);
    const vd = params.vatEnabled ? resolveVatDisplay(params.vatCategory) : { rate: 0, label: '', showLine: false };
    let grandTotal = params.total;
    if (vd.showLine) {
      const vatAmount = params.total * vd.rate;
      grandTotal = params.total + vatAmount;
      drawBidiText(page, `סה"כ לפני מע"מ:  ${sym} ${params.total.toFixed(2)}`, { x: W - M, y, size: 9.5, fonts, align: 'right', color: gray });
      y -= 15;
      drawBidiText(page, `${vd.label}  ${sym} ${vatAmount.toFixed(2)}`, { x: W - M, y, size: 9.5, fonts, align: 'right', color: gray });
      y -= 18;
    }
    const totalStr = `${sym} ${grandTotal.toFixed(2)}`;
    const totalRuns = toVisualRuns(totalStr);
    const totalTextW = totalRuns.reduce((sum, r) => sum + runWidth(r, fonts, 14, true), 0);
    const totalPillW = totalTextW + 28;
    page.drawRectangle({ x: W - M - totalPillW, y: y - 8, width: totalPillW, height: 28, color: navy });
    drawBidiText(page, totalStr, { x: W - M - 14, y, size: 14, fonts, bold: true, align: 'right', color: rgb(1, 1, 1) });
    const ilsLine = ilsEquivalentLine(params, grandTotal);
    if (ilsLine) { y -= 24; drawBidiText(page, ilsLine, { x: W - M, y, size: 8, fonts, align: 'right', color: gray }); }
  }

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
  {
    const sym = currencySymbol(params.currency);
    const vd = params.vatEnabled ? resolveVatDisplay(params.vatCategory) : { rate: 0, label: '', showLine: false };
    if (vd.showLine) {
      const vatAmount = params.total * vd.rate;
      const grandTotal = params.total + vatAmount;
      drawBidiText(page, `סה"כ לפני מע"מ:  ${sym} ${params.total.toFixed(2)}`, { x: W - M, y, size: 9.5, fonts, align: 'right', color: gray });
      y -= 15;
      drawBidiText(page, `${vd.label}  ${sym} ${vatAmount.toFixed(2)}`, { x: W - M, y, size: 9.5, fonts, align: 'right', color: gray });
      y -= 20;
      drawBidiText(page, `${sym} ${grandTotal.toFixed(2)}`, { x: W - M, y, size: 15, fonts, align: 'right', color: black });
      const ilsLine = ilsEquivalentLine(params, grandTotal);
      if (ilsLine) { y -= 14; drawBidiText(page, ilsLine, { x: W - M, y, size: 8, fonts, align: 'right', color: gray }); }
    } else {
      drawBidiText(page, `${sym} ${params.total.toFixed(2)}`, { x: W - M, y, size: 15, fonts, align: 'right', color: black });
      const ilsLine = ilsEquivalentLine(params, params.total);
      if (ilsLine) { y -= 14; drawBidiText(page, ilsLine, { x: W - M, y, size: 8, fonts, align: 'right', color: gray }); }
    }
  }

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
