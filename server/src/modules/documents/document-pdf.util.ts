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

export type DocTemplate =
  | 'classic' | 'modern' | 'minimalist'
  | 'ledger' | 'atelier' | 'blueprint' | 'marquee' | 'minimalMono' | 'stampSeal';

/** Per-org customization on top of a chosen template's own default
 * look — a "theme", not a different layout. Every field is optional;
 * anything unset falls back to that template's own defaults (see
 * TEMPLATE_DEFAULTS below), so an org that never opens the Template
 * Designer gets a fully-designed document regardless. */
export interface TemplateDesignConfig {
  colors?: { primary?: string; accent?: string; text?: string }; // hex, e.g. '#1D3557'
  /** Percentages of page width/height, top-left origin (matches how
   * a visual editor naturally works) — converted to pdf-lib's
   * bottom-left point system at render time. heightPercent alone
   * determines size; width follows the logo image's own aspect
   * ratio, same convention the fixed-position templates already use. */
  logo?: { xPercent: number; yPercent: number; heightPercent: number };
  /** Where the company name/address block starts — also top-left-
   * origin percentages. Only x/y move; text stays the size/alignment
   * the template itself defines, since letting font size become
   * freely draggable risks text overflowing other elements in ways
   * this renderer (no collision detection) can't protect against. */
  companyInfo?: { xPercent: number; yPercent: number };
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

  /** Optional per-org theme override — see TemplateDesignConfig. */
  design?: TemplateDesignConfig;
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

// ── Theming: colors + logo/company-info placement ──────────────────────
// Each of the 9 templates has its own default palette/positions
// (below), so an org that never opens the Template Designer still
// gets a fully-designed, non-generic document — TemplateDesignConfig
// only ever overrides specific fields, never requires all of them.

function hexToRgbColor(hex: string, fallback: ReturnType<typeof rgb>): ReturnType<typeof rgb> {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const int = parseInt(m[1], 16);
  return rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255);
}

interface TemplatePalette { primary: ReturnType<typeof rgb>; accent: ReturnType<typeof rgb>; text: ReturnType<typeof rgb>; }

function resolvePalette(defaults: { primary: string; accent: string; text: string }, design?: TemplateDesignConfig): TemplatePalette {
  const fallbackPrimary = hexToRgbColor(defaults.primary, rgb(0.1, 0.1, 0.1));
  const fallbackAccent = hexToRgbColor(defaults.accent, rgb(0.5, 0.5, 0.5));
  const fallbackText = hexToRgbColor(defaults.text, rgb(0.15, 0.15, 0.15));
  return {
    primary: design?.colors?.primary ? hexToRgbColor(design.colors.primary, fallbackPrimary) : fallbackPrimary,
    accent: design?.colors?.accent ? hexToRgbColor(design.colors.accent, fallbackAccent) : fallbackAccent,
    text: design?.colors?.text ? hexToRgbColor(design.colors.text, fallbackText) : fallbackText,
  };
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;

/** Resolves the logo's actual drawing box for this page, given a
 * default (top-left-origin percentages, matching the template's own
 * built-in placement) and an optional org override. Width always
 * follows the embedded image's own aspect ratio — only position and
 * height are ever configurable, so a stretched/distorted logo isn't
 * a state the editor can produce. */
function resolveLogoBox(
  defaultPct: { xPercent: number; yPercent: number; heightPercent: number },
  design: TemplateDesignConfig | undefined,
  logo: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const pct = design?.logo ?? defaultPct;
  const heightPt = (pct.heightPercent / 100) * PAGE_H;
  const widthPt = (logo.width / logo.height) * heightPt;
  const x = (pct.xPercent / 100) * PAGE_W;
  const topY = (pct.yPercent / 100) * PAGE_H;
  const y = PAGE_H - topY - heightPt; // top-left percent -> pdf-lib's bottom-left point origin
  return { x, y, width: widthPt, height: heightPt };
}

/** Same top-left-to-bottom-left conversion for the company info
 * block's anchor point (text baseline, not a box — height isn't
 * meaningful for a text anchor the way it is for an image). */
function resolveCompanyInfoAnchor(defaultPct: { xPercent: number; yPercent: number }, design?: TemplateDesignConfig): { x: number; y: number } {
  const pct = design?.companyInfo ?? defaultPct;
  return { x: (pct.xPercent / 100) * PAGE_W, y: PAGE_H - (pct.yPercent / 100) * PAGE_H };
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

export interface Fonts { he: PDFFont; heBold: PDFFont; latin: PDFFont; latinBold: PDFFont; }

export async function loadFonts(pdf: PDFDocument): Promise<Fonts> {
  pdf.registerFontkit(fontkit as any);
  const [heRegularBytes, heBoldBytes] = await Promise.all([
    fs.promises.readFile(HEBREW_REGULAR_PATH),
    fs.promises.readFile(HEBREW_BOLD_PATH),
  ]);
  return {
    he: await pdf.embedFont(heRegularBytes, { subset: true }),
    heBold: await pdf.embedFont(heBoldBytes, { subset: true }),
    latin: await pdf.embedFont(StandardFonts.Helvetica),
    latinBold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
}

function runWidth(run: Run, fonts: Fonts, size: number, bold: boolean): number {
  const font = run.hebrew ? (bold ? fonts.heBold : fonts.he) : (bold ? fonts.latinBold : fonts.latin);
  return font.widthOfTextAtSize(run.text, size);
}

/** Draws `text` (auto-detecting per-run script) at the given anchor.
 * align='right' anchors x as the right edge (typical for Hebrew UI);
 * align='left' anchors x as the left edge. */
export function drawBidiText(
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
    case 'ledger':
      await drawLedgerLayout(pdf, page, fonts, params);
      break;
    case 'atelier':
      await drawAtelierLayout(pdf, page, fonts, params);
      break;
    case 'blueprint':
      await drawBlueprintLayout(pdf, page, fonts, params);
      break;
    case 'marquee':
      await drawMarqueeLayout(pdf, page, fonts, params);
      break;
    case 'minimalMono':
      await drawMinimalMonoLayout(pdf, page, fonts, params);
      break;
    case 'stampSeal':
      await drawStampSealLayout(pdf, page, fonts, params);
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

// ════════════════════════════════════════════════════════════════════
// Shared item-table + totals renderers for the 6 new templates below —
// avoids re-deriving the VAT/currency/allocation-number logic 6 times
// the way the original 3 templates each did separately.
// ════════════════════════════════════════════════════════════════════

function drawThemedItemTable(
  page: PDFPage, fonts: Fonts, params: GenerateDocumentPdfParams,
  opts: { M: number; W: number; y: number; headerColor: ReturnType<typeof rgb>; textColor: ReturnType<typeof rgb>; ruleColor: ReturnType<typeof rgb>; headerBg?: ReturnType<typeof rgb>; mono?: boolean },
): number {
  let { y } = opts;
  const { M, W, headerColor, textColor, ruleColor, headerBg, mono } = opts;
  const col = { total: W - M, unit: W - M - 100, qty: W - M - 180, desc: W - M - 240 };
  const rowH = 20;
  const bodyFont = mono ? fonts.latin : fonts.latin; // pdf-lib has no bundled monospace face — mono templates lean on tight tabular alignment instead of an actual mono glyph

  if (headerBg) page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: rowH, color: headerBg });
  drawBidiText(page, 'תיאור', { x: col.desc, y, size: 9.5, fonts, bold: true, align: 'right', color: headerColor });
  drawBidiText(page, 'כמות', { x: col.qty, y, size: 9.5, fonts, bold: true, align: 'right', color: headerColor });
  drawBidiText(page, 'מחיר', { x: col.unit, y, size: 9.5, fonts, bold: true, align: 'right', color: headerColor });
  drawBidiText(page, 'סה"כ', { x: col.total, y, size: 9.5, fonts, bold: true, align: 'right', color: headerColor });
  y -= rowH;
  page.drawLine({ start: { x: M, y: y + 12 }, end: { x: W - M, y: y + 12 }, thickness: mono ? 0.75 : 0.5, color: ruleColor });

  for (const item of params.items) {
    if (y < 140) break;
    const lineTotal = item.quantity * item.unitPrice;
    drawBidiText(page, item.description, { x: col.desc, y, size: 10, fonts, align: 'right', color: textColor });
    const qtyStr = String(item.quantity);
    page.drawText(qtyStr, { x: col.qty - bodyFont.widthOfTextAtSize(qtyStr, 10), y, size: 10, font: bodyFont, color: textColor });
    const priceStr = item.unitPrice.toFixed(2);
    page.drawText(priceStr, { x: col.unit - bodyFont.widthOfTextAtSize(priceStr, 10), y, size: 10, font: bodyFont, color: textColor });
    const totalStr = lineTotal.toFixed(2);
    page.drawText(totalStr, { x: col.total - bodyFont.widthOfTextAtSize(totalStr, 10), y, size: 10, font: bodyFont, color: textColor });
    y -= rowH;
    page.drawLine({ start: { x: M, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.4, color: ruleColor });
  }
  return y;
}

function drawThemedTotals(
  page: PDFPage, fonts: Fonts, params: GenerateDocumentPdfParams,
  opts: { M: number; W: number; y: number; labelColor: ReturnType<typeof rgb>; totalColor: ReturnType<typeof rgb>; totalSize?: number; ruled?: ReturnType<typeof rgb> },
): number {
  let { y } = opts;
  const { M, W, labelColor, totalColor } = opts;
  const totalSize = opts.totalSize ?? 15;
  const sym = currencySymbol(params.currency);
  const vd = params.vatEnabled ? resolveVatDisplay(params.vatCategory) : { rate: 0, label: '', showLine: false };

  if (opts.ruled) { page.drawLine({ start: { x: M, y: y + 14 }, end: { x: W - M, y: y + 14 }, thickness: 0.75, color: opts.ruled }); }

  let grandTotal = params.total;
  if (vd.showLine) {
    const vatAmount = params.total * vd.rate;
    grandTotal = params.total + vatAmount;
    drawBidiText(page, `סה"כ לפני מע"מ:  ${sym} ${params.total.toFixed(2)}`, { x: W - M, y, size: 9.5, fonts, align: 'right', color: labelColor });
    y -= 15;
    drawBidiText(page, `${vd.label}  ${sym} ${vatAmount.toFixed(2)}`, { x: W - M, y, size: 9.5, fonts, align: 'right', color: labelColor });
    y -= 22;
  }
  drawBidiText(page, `${sym} ${grandTotal.toFixed(2)}`, { x: W - M, y, size: totalSize, fonts, bold: true, align: 'right', color: totalColor });
  const ilsLine = ilsEquivalentLine(params, grandTotal);
  if (ilsLine) { y -= 14; drawBidiText(page, ilsLine, { x: W - M, y, size: 8, fonts, align: 'right', color: labelColor }); }
  if (params.allocationNumber) { y -= 16; drawBidiText(page, `הקצאה מספר: ${params.allocationNumber}`, { x: W - M, y, size: 8.5, fonts, bold: true, align: 'right', color: labelColor }); }
  return y;
}

function drawThemedFooter(page: PDFPage, fonts: Fonts, params: GenerateDocumentPdfParams, M: number, W: number, color: ReturnType<typeof rgb>) {
  if (!params.footerText) return;
  const lines = params.footerText.split('\n').slice(0, 4);
  let fy = 50;
  for (const line of lines) {
    drawBidiText(page, line, { x: W - M, y: fy, size: 8.5, fonts, align: 'right', color });
    fy -= 12;
  }
}


// ════════════════════════════════════════════════════════════════════
// LEDGER — deep navy + brass, on cream paper. Grounded in the world of
// a real accounting ledger book: a ruled double-line under the doc
// title (like an underlined ledger heading), a small diamond bullet
// before section labels, and a ruled horizontal rhythm through the
// totals block echoing ledger-paper rows. For accounting-forward
// tenants who want the document to visually read as "the books".
// ════════════════════════════════════════════════════════════════════
const LEDGER_DEFAULTS = { primary: '#1B2A4A', accent: '#B8935B', text: '#2A2A28' };

async function drawLedgerLayout(pdf: PDFDocument, page: PDFPage, fonts: Fonts, params: GenerateDocumentPdfParams) {
  const M = 50;
  const W = page.getWidth();
  const H = page.getHeight();
  const cream = rgb(0.980, 0.973, 0.953);
  const c = resolvePalette(LEDGER_DEFAULTS, params.design);

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: cream });
  page.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: c.primary });

  let y = H - M - 4;

  const logo = await embedLogo(pdf, params.header);
  if (logo) {
    const box = resolveLogoBox({ xPercent: (M / W) * 100, yPercent: ((H - y) / H) * 100, heightPercent: (36 / H) * 100 }, params.design, logo);
    page.drawImage(logo.img, box);
  }
  const infoAnchor = resolveCompanyInfoAnchor({ xPercent: ((W - M) / W) * 100, yPercent: ((H - (y - 8)) / H) * 100 }, params.design);
  drawCompanyBlock(page, fonts, params.header, { x: infoAnchor.x, y: infoAnchor.y, nameSize: 13, lineSize: 8.5, nameColor: c.primary, lineColor: c.text, align: 'right' });

  y -= 66;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.5, color: c.primary });
  page.drawLine({ start: { x: M, y: y - 2.5 }, end: { x: W - M, y: y - 2.5 }, thickness: 0.5, color: c.accent });
  y -= 24;

  // Small drawn diamond marker (rotated square) — a real shape, not a
  // text glyph, since not every symbol is in pdf-lib's standard-font
  // WinAnsi encoding and this sidesteps that entirely.
  page.drawRectangle({ x: W - M - 6, y: y + 6, width: 7, height: 7, color: c.accent, rotate: degrees(45) });
  drawBidiText(page, `${params.docTypeLabel} ${params.docNumber}`, { x: W - M - 16, y, size: 16, fonts, bold: true, align: 'right', color: c.primary });
  y -= 18;
  drawBidiText(page, params.date, { x: W - M, y, size: 9.5, fonts, align: 'right', color: c.text });
  y -= 22;
  drawBidiText(page, params.clientName, { x: W - M, y, size: 12, fonts, bold: true, align: 'right', color: c.text });
  if (params.clientEmail) { y -= 13; page.drawText(params.clientEmail, { x: M, y, size: 8.5, font: fonts.latin, color: c.text }); }
  y -= 24;

  y = drawThemedItemTable(page, fonts, params, { M, W, y, headerColor: c.primary, textColor: c.text, ruleColor: rgb(0.85, 0.82, 0.74), headerBg: rgb(0.94, 0.92, 0.86) });

  y -= 12;
  y = drawThemedTotals(page, fonts, params, { M, W, y, labelColor: c.text, totalColor: c.primary, ruled: c.accent });

  drawThemedFooter(page, fonts, params, M, W, c.text);
}

// ════════════════════════════════════════════════════════════════════
// ATELIER — sage + dusty rose on soft ivory, for hospitality/boutique
// tenants (hotels, salons, studios). Signature: thin architectural
// corner brackets framing the header, evoking printed boutique
// stationery rather than a generic invoice.
// ════════════════════════════════════════════════════════════════════
const ATELIER_DEFAULTS = { primary: '#6B7C5E', accent: '#C99A87', text: '#3D3B36' };

async function drawAtelierLayout(pdf: PDFDocument, page: PDFPage, fonts: Fonts, params: GenerateDocumentPdfParams) {
  const M = 54;
  const W = page.getWidth();
  const H = page.getHeight();
  const ivory = rgb(0.984, 0.976, 0.965);
  const c = resolvePalette(ATELIER_DEFAULTS, params.design);

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: ivory });

  // Corner brackets — the signature element
  const bracket = 22;
  const bx = M - 10, by = H - M + 6;
  page.drawLine({ start: { x: bx, y: by }, end: { x: bx + bracket, y: by }, thickness: 1.25, color: c.accent });
  page.drawLine({ start: { x: bx, y: by }, end: { x: bx, y: by - bracket }, thickness: 1.25, color: c.accent });
  page.drawLine({ start: { x: W - bx, y: by }, end: { x: W - bx - bracket, y: by }, thickness: 1.25, color: c.accent });
  page.drawLine({ start: { x: W - bx, y: by }, end: { x: W - bx, y: by - bracket }, thickness: 1.25, color: c.accent });

  let y = H - M - 14;
  const logo = await embedLogo(pdf, params.header);
  if (logo) {
    const box = resolveLogoBox({ xPercent: (M / W) * 100, yPercent: ((H - y) / H) * 100, heightPercent: (34 / H) * 100 }, params.design, logo);
    page.drawImage(logo.img, box);
  }
  const infoAnchor = resolveCompanyInfoAnchor({ xPercent: ((W - M) / W) * 100, yPercent: ((H - (y - 6)) / H) * 100 }, params.design);
  drawCompanyBlock(page, fonts, params.header, { x: infoAnchor.x, y: infoAnchor.y, nameSize: 15, lineSize: 9, nameColor: c.primary, lineColor: c.text, align: 'right' });

  y -= 74;
  drawBidiText(page, params.docTypeLabel.toUpperCase(), { x: W - M, y, size: 10, fonts, align: 'right', color: c.accent });
  y -= 18;
  drawBidiText(page, params.docNumber, { x: W - M, y, size: 20, fonts, bold: true, align: 'right', color: c.primary });
  y -= 16;
  drawBidiText(page, params.date, { x: W - M, y, size: 9, fonts, align: 'right', color: c.text });
  y -= 22;
  drawBidiText(page, params.clientName, { x: W - M, y, size: 12, fonts, bold: true, align: 'right', color: c.text });
  if (params.clientEmail) { y -= 13; page.drawText(params.clientEmail, { x: M, y, size: 8.5, font: fonts.latin, color: c.text }); }
  y -= 26;

  y = drawThemedItemTable(page, fonts, params, { M, W, y, headerColor: c.accent, textColor: c.text, ruleColor: rgb(0.9, 0.87, 0.83) });

  y -= 12;
  y = drawThemedTotals(page, fonts, params, { M, W, y, labelColor: c.text, totalColor: c.primary });

  drawThemedFooter(page, fonts, params, M, W, c.text);
}


// ════════════════════════════════════════════════════════════════════
// BLUEPRINT — deep cyan-blue + safety orange on pale blue-white, for
// trades/field-service tenants (plumbers, electricians, HVAC, techs).
// Signature: a faint technical grid across the header band and corner
// ruler-tick marks, drawing on real blueprint/spec-sheet convention —
// this is a genuine trade document aesthetic, not decoration.
// ════════════════════════════════════════════════════════════════════
const BLUEPRINT_DEFAULTS = { primary: '#1E4D6B', accent: '#E67E22', text: '#243138' };

async function drawBlueprintLayout(pdf: PDFDocument, page: PDFPage, fonts: Fonts, params: GenerateDocumentPdfParams) {
  const M = 48;
  const W = page.getWidth();
  const H = page.getHeight();
  const paleBlue = rgb(0.965, 0.976, 0.984);
  const c = resolvePalette(BLUEPRINT_DEFAULTS, params.design);

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: paleBlue });
  const bandH = 90;
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: c.primary });
  // Faint technical grid inside the header band
  for (let gx = M; gx < W - M; gx += 24) {
    page.drawLine({ start: { x: gx, y: H - bandH }, end: { x: gx, y: H }, thickness: 0.4, color: rgb(1, 1, 1), opacity: 0.06 });
  }
  // Corner tick marks — ruler convention
  page.drawLine({ start: { x: M, y: H - 10 }, end: { x: M, y: H - 18 }, thickness: 1, color: c.accent });
  page.drawLine({ start: { x: W - M, y: H - 10 }, end: { x: W - M, y: H - 18 }, thickness: 1, color: c.accent });

  let y = H - 24;
  const logo = await embedLogo(pdf, params.header);
  if (logo) {
    const box = resolveLogoBox({ xPercent: (M / W) * 100, yPercent: ((H - y) / H) * 100, heightPercent: (36 / H) * 100 }, params.design, logo);
    page.drawImage(logo.img, box);
  }
  const infoAnchor = resolveCompanyInfoAnchor({ xPercent: ((W - M) / W) * 100, yPercent: ((H - y) / H) * 100 }, params.design);
  drawCompanyBlock(page, fonts, params.header, { x: infoAnchor.x, y: infoAnchor.y, nameSize: 13, lineSize: 8.5, nameColor: rgb(1, 1, 1), lineColor: rgb(0.85, 0.9, 0.94), align: 'right' });

  y = H - bandH - 26;
  drawBidiText(page, `${params.docTypeLabel}  #${params.docNumber}`, { x: W - M, y, size: 15, fonts, bold: true, align: 'right', color: c.primary });
  y -= 17;
  drawBidiText(page, params.date, { x: W - M, y, size: 9, fonts, align: 'right', color: c.text });
  y -= 20;
  drawBidiText(page, params.clientName, { x: W - M, y, size: 11.5, fonts, bold: true, align: 'right', color: c.text });
  if (params.clientEmail) { y -= 12; page.drawText(params.clientEmail, { x: M, y, size: 8.5, font: fonts.latin, color: c.text }); }
  y -= 24;

  page.drawLine({ start: { x: M, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.75, color: c.accent });
  y -= 6;

  y = drawThemedItemTable(page, fonts, params, { M, W, y, headerColor: c.primary, textColor: c.text, ruleColor: rgb(0.8, 0.86, 0.9), headerBg: rgb(0.92, 0.95, 0.97), mono: true });

  y -= 12;
  y = drawThemedTotals(page, fonts, params, { M, W, y, labelColor: c.text, totalColor: c.primary, ruled: c.accent });

  drawThemedFooter(page, fonts, params, M, W, c.text);
}

// ════════════════════════════════════════════════════════════════════
// MARQUEE — deep plum + amber, for entertainment/event/music venues.
// Signature: a perforated "ticket stub" edge down the left margin
// (dashed line + small punched circles), borrowing directly from
// physical ticket stationery rather than a generic invoice motif.
// ════════════════════════════════════════════════════════════════════
const MARQUEE_DEFAULTS = { primary: '#4A1942', accent: '#FFB627', text: '#2B2129' };

async function drawMarqueeLayout(pdf: PDFDocument, page: PDFPage, fonts: Fonts, params: GenerateDocumentPdfParams) {
  const M = 58;
  const W = page.getWidth();
  const H = page.getHeight();
  const c = resolvePalette(MARQUEE_DEFAULTS, params.design);

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(0.995, 0.99, 0.985) });

  // Ticket-stub perforation down the left margin
  const stubX = 34;
  for (let py = H - 20; py > 20; py -= 14) {
    page.drawCircle({ x: stubX, y: py, size: 1.4, color: rgb(0.85, 0.85, 0.85) });
  }
  page.drawLine({ start: { x: stubX + 12, y: H - 10 }, end: { x: stubX + 12, y: 10 }, thickness: 0.75, color: rgb(0.88, 0.88, 0.88), dashArray: [3, 3] });

  let y = H - M;
  const logo = await embedLogo(pdf, params.header);
  if (logo) {
    const box = resolveLogoBox({ xPercent: (M / W) * 100, yPercent: ((H - y) / H) * 100, heightPercent: (38 / H) * 100 }, params.design, logo);
    page.drawImage(logo.img, box);
  }
  const infoAnchor = resolveCompanyInfoAnchor({ xPercent: ((W - M) / W) * 100, yPercent: ((H - (y - 10)) / H) * 100 }, params.design);
  drawCompanyBlock(page, fonts, params.header, { x: infoAnchor.x, y: infoAnchor.y, nameSize: 14, lineSize: 9, nameColor: c.primary, lineColor: c.text, align: 'right' });

  y -= 72;
  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 40, color: c.primary });
  drawBidiText(page, `${params.docTypeLabel}  ·  ${params.docNumber}`, { x: W - M - 14, y: y + 6, size: 15, fonts, bold: true, align: 'right', color: rgb(1, 1, 1) });
  drawBidiText(page, params.date, { x: M + 14, y: y + 6, size: 9, fonts, align: 'left', color: c.accent });
  y -= 58;

  drawBidiText(page, params.clientName, { x: W - M, y, size: 12, fonts, bold: true, align: 'right', color: c.text });
  if (params.clientEmail) { y -= 13; page.drawText(params.clientEmail, { x: M, y, size: 8.5, font: fonts.latin, color: c.text }); }
  y -= 24;

  y = drawThemedItemTable(page, fonts, params, { M, W, y, headerColor: c.primary, textColor: c.text, ruleColor: rgb(0.9, 0.87, 0.9) });

  y -= 12;
  y = drawThemedTotals(page, fonts, params, { M, W, y, labelColor: c.text, totalColor: c.primary, totalSize: 17 });

  drawThemedFooter(page, fonts, params, M, W, c.text);
}


// ════════════════════════════════════════════════════════════════════
// MINIMAL MONO — true black/white/gray, print-practical (no ink-heavy
// fills), a single oversized total as the only loud element on the
// page. For tenants who want understatement over branding.
// ════════════════════════════════════════════════════════════════════
const MINIMAL_MONO_DEFAULTS = { primary: '#111111', accent: '#111111', text: '#444444' };

async function drawMinimalMonoLayout(pdf: PDFDocument, page: PDFPage, fonts: Fonts, params: GenerateDocumentPdfParams) {
  const M = 64;
  const W = page.getWidth();
  const H = page.getHeight();
  const c = resolvePalette(MINIMAL_MONO_DEFAULTS, params.design);
  const hair = rgb(0.85, 0.85, 0.85);

  let y = H - M;
  const logo = await embedLogo(pdf, params.header);
  if (logo) {
    const box = resolveLogoBox({ xPercent: (M / W) * 100, yPercent: ((H - y) / H) * 100, heightPercent: (28 / H) * 100 }, params.design, logo);
    page.drawImage(logo.img, box);
  }
  const infoAnchor = resolveCompanyInfoAnchor({ xPercent: ((W - M) / W) * 100, yPercent: ((H - y) / H) * 100 }, params.design);
  drawCompanyBlock(page, fonts, params.header, { x: infoAnchor.x, y: infoAnchor.y, nameSize: 11, lineSize: 8, nameColor: c.text, lineColor: c.text, align: 'right' });

  y -= 64;
  drawBidiText(page, params.docTypeLabel, { x: W - M, y, size: 10, fonts, align: 'right', color: c.text });
  y -= 30;
  drawBidiText(page, params.docNumber, { x: W - M, y, size: 26, fonts, bold: true, align: 'right', color: c.primary });
  y -= 20;
  drawBidiText(page, params.date, { x: W - M, y, size: 9, fonts, align: 'right', color: c.text });
  y -= 26;
  page.drawLine({ start: { x: M, y: y + 10 }, end: { x: W - M, y: y + 10 }, thickness: 0.5, color: hair });
  drawBidiText(page, params.clientName, { x: W - M, y, size: 11, fonts, bold: true, align: 'right', color: c.primary });
  if (params.clientEmail) { y -= 13; page.drawText(params.clientEmail, { x: M, y, size: 8.5, font: fonts.latin, color: c.text }); }
  y -= 28;

  y = drawThemedItemTable(page, fonts, params, { M, W, y, headerColor: c.text, textColor: c.primary, ruleColor: hair });

  y -= 16;
  y = drawThemedTotals(page, fonts, params, { M, W, y, labelColor: c.text, totalColor: c.primary, totalSize: 22 });

  drawThemedFooter(page, fonts, params, M, W, c.text);
}

// ════════════════════════════════════════════════════════════════════
// STAMP & SEAL — burgundy + aged gold on warm parchment, formal
// letterhead register for tenants who want the document to read as an
// official/legal-adjacent instrument. Signature: a double-ring "seal"
// medallion drawn beside the header, in the tradition of an embossed
// corporate/notary seal.
// ════════════════════════════════════════════════════════════════════
const STAMP_SEAL_DEFAULTS = { primary: '#6B1E23', accent: '#A67C3D', text: '#3A2E24' };

async function drawStampSealLayout(pdf: PDFDocument, page: PDFPage, fonts: Fonts, params: GenerateDocumentPdfParams) {
  const M = 52;
  const W = page.getWidth();
  const H = page.getHeight();
  const parchment = rgb(0.973, 0.949, 0.890);
  const c = resolvePalette(STAMP_SEAL_DEFAULTS, params.design);

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: parchment });
  page.drawRectangle({ x: 10, y: 10, width: W - 20, height: H - 20, borderWidth: 1, borderColor: c.accent });

  let y = H - M - 6;
  const logo = await embedLogo(pdf, params.header);
  if (logo) {
    const box = resolveLogoBox({ xPercent: (M / W) * 100, yPercent: ((H - y) / H) * 100, heightPercent: (34 / H) * 100 }, params.design, logo);
    page.drawImage(logo.img, box);
  }
  // Seal medallion — double ring beside the logo
  const sealCx = M + 66, sealCy = y - 18;
  page.drawCircle({ x: sealCx, y: sealCy, size: 16, borderWidth: 1.4, borderColor: c.accent });
  page.drawCircle({ x: sealCx, y: sealCy, size: 11, borderWidth: 0.8, borderColor: c.accent });

  const infoAnchor = resolveCompanyInfoAnchor({ xPercent: ((W - M) / W) * 100, yPercent: ((H - y) / H) * 100 }, params.design);
  drawCompanyBlock(page, fonts, params.header, { x: infoAnchor.x, y: infoAnchor.y, nameSize: 14, lineSize: 8.5, nameColor: c.primary, lineColor: c.text, align: 'right' });

  y -= 66;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.75, color: c.accent });
  y -= 22;
  drawBidiText(page, `${params.docTypeLabel}  |  ${params.docNumber}`, { x: W - M, y, size: 15, fonts, bold: true, align: 'right', color: c.primary });
  y -= 18;
  drawBidiText(page, params.date, { x: W - M, y, size: 9, fonts, align: 'right', color: c.text });
  y -= 22;
  drawBidiText(page, params.clientName, { x: W - M, y, size: 12, fonts, bold: true, align: 'right', color: c.text });
  if (params.clientEmail) { y -= 13; page.drawText(params.clientEmail, { x: M, y, size: 8.5, font: fonts.latin, color: c.text }); }
  y -= 26;

  y = drawThemedItemTable(page, fonts, params, { M, W, y, headerColor: c.primary, textColor: c.text, ruleColor: rgb(0.85, 0.78, 0.68), headerBg: rgb(0.93, 0.88, 0.78) });

  y -= 12;
  y = drawThemedTotals(page, fonts, params, { M, W, y, labelColor: c.text, totalColor: c.primary, ruled: c.accent });

  drawThemedFooter(page, fonts, params, M, W, c.text);
}

