import { PDFDocument, rgb } from 'pdf-lib';
import { loadFonts, drawBidiText, Fonts } from '../documents/document-pdf.util';
import { Section26Report, Section54Report } from './compliance-reports.service';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 40;

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Prints Section 2.6's two required tables (per-document-type
 * count+sum, and the trial balance) — see ComplianceReportsService's
 * own doc comment for what each part represents and why both are
 * included. Paginates automatically if either table runs past one
 * page (a real multi-org, multi-year business easily could). */
export async function generateSection26Pdf(report: Section26Report): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const fonts = await loadFonts(pdf);
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < M) { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - M; }
  };

  drawBidiText(page, 'פלט מודפס לפי סעיף 2.6 להוראות הפקת קבצים במבנה אחיד', { x: PAGE_W - M, y, size: 14, fonts, bold: true, align: 'right' });
  y -= 30;

  // ── Part 1: per-document-type counts and sums ──
  drawBidiText(page, 'א. דוח כמות וסכום מסמכים לפי סוג', { x: PAGE_W - M, y, size: 12, fonts, bold: true, align: 'right' });
  y -= 22;

  const col = { code: PAGE_W - M, name: PAGE_W - M - 60, count: PAGE_W - M - 300, sum: PAGE_W - M - 420 };
  drawBidiText(page, 'קוד', { x: col.code, y, size: 9, fonts, bold: true, align: 'right' });
  drawBidiText(page, 'סוג המסמך', { x: col.name, y, size: 9, fonts, bold: true, align: 'right' });
  drawBidiText(page, 'סה"כ כמותי', { x: col.count, y, size: 9, fonts, bold: true, align: 'right' });
  drawBidiText(page, 'סה"כ כספי (בש"ח)', { x: col.sum, y, size: 9, fonts, bold: true, align: 'right' });
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
  y -= 14;

  for (const row of report.rows) {
    newPageIfNeeded(16);
    drawBidiText(page, String(row.code), { x: col.code, y, size: 9, fonts, align: 'right' });
    drawBidiText(page, row.name, { x: col.name, y, size: 9, fonts, align: 'right' });
    drawBidiText(page, String(row.count), { x: col.count, y, size: 9, fonts, align: 'right' });
    drawBidiText(page, fmtMoney(row.sum), { x: col.sum, y, size: 9, fonts, align: 'right' });
    y -= 15;
  }

  // ── Part 2: trial balance ──
  y -= 20;
  newPageIfNeeded(60);
  drawBidiText(page, 'ב. מאזן בוחן תנועות', { x: PAGE_W - M, y, size: 12, fonts, bold: true, align: 'right' });
  y -= 22;

  if (report.trialBalance.length === 0) {
    drawBidiText(page, '(אין תנועות הנהלת חשבונות בטווח שנבחר)', { x: PAGE_W - M, y, size: 9, fonts, align: 'right', color: rgb(0.5, 0.5, 0.5) });
    y -= 15;
  } else {
    const tbCol = { name: PAGE_W - M, debit: PAGE_W - M - 220, credit: PAGE_W - M - 360 };
    drawBidiText(page, 'שם חשבון', { x: tbCol.name, y, size: 9, fonts, bold: true, align: 'right' });
    drawBidiText(page, 'חובה', { x: tbCol.debit, y, size: 9, fonts, bold: true, align: 'right' });
    drawBidiText(page, 'זכות', { x: tbCol.credit, y, size: 9, fonts, bold: true, align: 'right' });
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
    y -= 14;
    for (const acc of report.trialBalance) {
      newPageIfNeeded(16);
      drawBidiText(page, acc.accountName, { x: tbCol.name, y, size: 9, fonts, align: 'right' });
      drawBidiText(page, fmtMoney(acc.debit), { x: tbCol.debit, y, size: 9, fonts, align: 'right' });
      drawBidiText(page, fmtMoney(acc.credit), { x: tbCol.credit, y, size: 9, fonts, align: 'right' });
      y -= 15;
    }
  }

  return Buffer.from(await pdf.save());
}

/** Prints the confirmation screen defined in Appendix 4 (section
 * 5.4), following the instructions' own template layout line by
 * line — see ComplianceReportsService.getSection54Report's own doc
 * comment for what each field represents. */
export async function generateSection54Pdf(report: Section54Report): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const fonts: Fonts = await loadFonts(pdf);
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;

  const line = (text: string, opts: { size?: number; bold?: boolean; gap?: number } = {}) => {
    drawBidiText(page, text, { x: PAGE_W - M, y, size: opts.size ?? 10, fonts, bold: opts.bold, align: 'right' });
    y -= opts.gap ?? 16;
  };

  line('הפקת קבצים במבנה אחיד עבור:', { size: 14, bold: true, gap: 28 });
  line(`מספר עוסק מורשה: ${report.vatId}`);
  line(`שם בית העסק: ${report.businessName}`, { gap: 24 });
  line('ביצוע ממשק פתוח הסתיים בהצלחה.', { bold: true, gap: 24 });
  line('הנתונים נשמרו בנתיב הבא:');
  drawBidiText(page, report.path, { x: PAGE_W - M, y, size: 10, fonts, align: 'right' });
  y -= 24;

  line(`טווח תאריכים: מתאריך ${fmtDate(report.from)} ועד תאריך ${fmtDate(report.to)}`, { gap: 28 });

  line('פירוט סך סוגי הרשומות שנוצרו בקובץ BKMVDATA.TXT:', { bold: true, gap: 20 });
  const col = { name: PAGE_W - M, code: PAGE_W - M - 220, count: PAGE_W - M - 340 };
  drawBidiText(page, 'תיאור רשומה', { x: col.name, y, size: 9, fonts, bold: true, align: 'right' });
  drawBidiText(page, 'קוד רשומה', { x: col.code, y, size: 9, fonts, bold: true, align: 'right' });
  drawBidiText(page, 'סך רשומות', { x: col.count, y, size: 9, fonts, bold: true, align: 'right' });
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
  y -= 14;
  for (const rc of report.recordCounts) {
    if (rc.count <= 0) continue; // "הערה: השורה תופיע במידה וקיימות רשומות מסוג זה" — spec's own note
    drawBidiText(page, rc.name, { x: col.name, y, size: 9, fonts, align: 'right' });
    drawBidiText(page, rc.code, { x: col.code, y, size: 9, fonts, align: 'right' });
    drawBidiText(page, String(rc.count), { x: col.count, y, size: 9, fonts, align: 'right' });
    y -= 15;
  }

  y -= 16;
  const reg = report.softwareRegistrationNumber || '(טרם התקבל)';
  line(`פירוט תוכנה ותאריך הפקה: הנתונים הופקו באמצעות תוכנת: ${report.softwareName}, מספר תעודת הרישום: ${reg}`);
  line(`בתאריך ${fmtDate(report.generatedAt)} בשעה ${String(report.generatedAt.getHours()).padStart(2, '0')}:${String(report.generatedAt.getMinutes()).padStart(2, '0')}.`);

  return Buffer.from(await pdf.save());
}
