import { CATEGORY_PATTERNS, CURRENCY_PATTERNS, VOCAB, Vocabulary } from './receipt-keywords';
import { detectLanguage, normalizeDigits, ReceiptLanguage } from './receipt-lang';

export type Confidence = 'high' | 'low';
export type DocType = 'tax_invoice_receipt' | 'tax_invoice' | 'receipt' | 'invoice' | 'credit_note' | 'cash_slip' | 'other';
export type PayMethod = 'cash' | 'credit_card' | 'check' | 'bank_transfer' | 'bit';

export interface ExtractedReceipt {
  language: ReceiptLanguage;
  languageConfidence: number;
  vendorName: string | null;
  vendorTaxId: string | null;
  /** Trade name / store (e.g. from the card terminal line), when it differs from the legal entity name. */
  brandName: string | null;
  documentType: DocType | null;
  documentNumber: string | null;
  allocationNumber: string | null;
  transactionDate: string | null; // yyyy-mm-dd
  transactionTime: string | null; // HH:MM
  total: number | null;
  vatAmount: number | null;
  vatRate: number | null;
  amountBeforeVat: number | null;
  currency: string | null;
  paymentMethod: PayMethod | null;
  cardLast4: string | null;
  cardType: string | null;
  approvalNumber: string | null;
  installments: number | null;
  categoryCode: string | null;
  /** which fields were found via an explicit label (high) or guessed (low) */
  confidence: Partial<Record<keyof ExtractedReceipt, Confidence>>;
}

const KNOWN_VAT_RATES = [0, 16, 17, 18, 15, 12, 7, 5, 20, 21, 19, 10];

// ---------- numbers ----------

/** "1,234.56", "1.234,56", "1 234,56", "12,50", "12.5", "1,234" → number */
export function parseAmount(raw: string): number | null {
  const s = raw.replace(/\s+/g, '');
  if (!/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let norm: string;
  if (lastComma >= 0 && lastDot >= 0) {
    norm = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const parts = s.split(sep);
    const tail = parts[parts.length - 1];
    // exactly 3 digits after a lone separator with a non-zero head = thousands ("1,234"); otherwise decimal
    norm = parts.length > 2 || (tail.length === 3 && parts[0].length <= 3 && parts.length === 2 && !/^0+$/.test(parts[0]))
      ? parts.join('')
      : parts.join('').slice(0, parts.join('').length - tail.length) + '.' + tail;
  } else norm = s;
  const v = parseFloat(norm);
  return Number.isFinite(v) ? v : null;
}

const STRIP_FOR_AMOUNTS = [
  /\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/g, // dates
  /(?<![\d:])\d{1,2}:\d{2}(?::\d{2})?(?![\d])/g, // times
  /\d+(?:[.,]\d+)?\s*%/g, // percentages
  /\b\d{7,}\b/g, // long ids / barcodes / phone numbers
  /\d+-\d+/g, // ranges, reference codes like 015115-00
  /(?<![.,\d])0\d+(?![.,\d])/g, // leading-zero codes (approval/ref numbers), never an amount
];

/** All plausible money amounts on a line, in reading order. */
export function amountsInLine(line: string, requireDecimals = false, allowZero = false): number[] {
  let l = line;
  for (const re of STRIP_FOR_AMOUNTS) l = l.replace(re, ' ');
  const out: number[] = [];
  for (const m of l.matchAll(/(?<![\w.,])\d{1,3}(?:[ ,.]\d{3})+(?:[.,]\d{1,2})?(?![\d])|(?<![\w.,])\d+[.,]\d{1,2}(?!\d)|(?<![\w.,])\d+(?![\w.,]\d)/g)) {
    if (requireDecimals && !/[.,]\d{1,2}$/.test(m[0])) continue;
    const v = parseAmount(m[0]);
    if (v != null && (v > 0 || (allowZero && v === 0)) && v < 10_000_000) out.push(v);
  }
  return out;
}

// ---------- dates ----------

function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  const now = Date.now();
  if (y < 2000 || dt.getTime() > now + 2 * 86400000) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function datesInLine(line: string, vocab: Vocabulary[]): string[] {
  const out: string[] = [];
  const l = line;
  for (const m of l.matchAll(/(?<!\d)(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})(?!\d)/g)) {
    const d = validDate(+m[1], +m[2], +m[3]); if (d) out.push(d);
  }
  for (const m of l.matchAll(/(?<![\d])(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?!\d)/g)) {
    const yy = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    let day = +m[1], mon = +m[2];
    let d = validDate(yy, mon, day);
    if (!d && mon > 12 && day <= 12) d = validDate(yy, day, mon); // MM/DD/YYYY printed by foreign merchants
    if (d) out.push(d);
  }
  // textual months in every vocabulary: "12 Oct 2026", "12 октября 2026", "12 אוקטובר 2026", "12 أكتوبر 2026"
  const lower = l.toLowerCase();
  for (const v of vocab) {
    for (const [name, mon] of Object.entries(v.months)) {
      const re = new RegExp(String.raw`(?<!\d)(\d{1,2})\s*(?:ב|ל)?${name.replace(/\s+/g, String.raw`\s+`)}\.?,?\s*(\d{4})`, 'i');
      const m = lower.match(re);
      if (m) { const d = validDate(+m[2], mon, +m[1]); if (d) out.push(d); }
    }
  }
  return out;
}

// ---------- extraction ----------

function cleanLines(text: string): string[] {
  return normalizeDigits(text).split(/\r?\n/).map((l) => l.replace(/[‎‏‪-‮]/g, '').trim()).filter(Boolean);
}

const CARD_TYPES: Array<[RegExp, string]> = [
  [/visa|ויזה/i, 'Visa'], [/master\s*card|mastercard|מאסטר|מסטרקארד|мастеркард/i, 'Mastercard'], [/amex|american\s*express|אמריקן/i, 'Amex'],
  [/isracard|ישראכרט/i, 'Isracard'], [/diners|דיינרס/i, 'Diners'], [/\bכאל\b|\bcal\b/i, 'Cal'],
];

export function extractReceipt(rawText: string, forcedLanguage?: ReceiptLanguage): ExtractedReceipt {
  const text = normalizeDigits(rawText);
  const guess = detectLanguage(text);
  const language = forcedLanguage ?? guess.language;
  const lines = cleanLines(text);
  // the detected language's vocabulary first, English second (it appears on most receipts everywhere)
  const vocabs = language === 'en' ? [VOCAB.en] : [VOCAB[language], VOCAB.en];
  const allVocabs = [VOCAB.he, VOCAB.ru, VOCAB.en, VOCAB.ar];
  const conf: ExtractedReceipt['confidence'] = {};

  const firstMatch = (res: (v: Vocabulary) => RegExp[]): RegExpMatchArray | null => {
    for (const v of vocabs) for (const re of res(v)) {
      for (const l of lines) { const m = l.match(re); if (m && m[1]) return m; }
    }
    return null;
  };

  // --- document type
  let documentType: DocType | null = null;
  const head = lines.slice(0, 14).join('\n');
  outer: for (const v of vocabs) for (const [re, type] of v.docTypes) { if (re.test(head)) { documentType = type; break outer; } }
  if (!documentType) outer2: for (const v of vocabs) for (const [re, type] of v.docTypes) { if (re.test(text)) { documentType = type; break outer2; } }
  if (documentType) conf.documentType = 'high';

  // --- tax id
  let vendorTaxId: string | null = null;
  const tid = firstMatch((v) => v.taxId);
  if (tid) {
    vendorTaxId = tid[1];
    conf.vendorTaxId = language === 'he' && vendorTaxId.length <= 9 && !isValidIsraeliId(vendorTaxId) ? 'low' : 'high';
  }
  if (!vendorTaxId && language === 'he') {
    // label unreadable: a 9-digit number near the top that passes the Israeli check digit is the business number
    for (const l of lines.slice(0, 14)) {
      const cleaned = l.replace(/\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/g, ' ');
      const m = [...cleaned.matchAll(/(?<![\d.,-])(\d{8,9})(?![\d.,-])/g)].map((x) => x[1]).find(isValidIsraeliId);
      if (m) { vendorTaxId = m; conf.vendorTaxId = 'low'; break; }
    }
  }

  // --- document / allocation numbers
  const dn = firstMatch((v) => v.docNumber);
  const documentNumber = dn ? dn[1] : null;
  if (documentNumber) conf.documentNumber = 'high';
  const al = firstMatch((v) => v.allocation);
  const allocationNumber = al ? al[1] : null;
  if (allocationNumber) conf.allocationNumber = 'high';

  // --- date & time
  let transactionDate: string | null = null;
  const tm = text.match(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?(?!\d)/);
  const transactionTime = tm ? `${tm[1].padStart(2, '0')}:${tm[2]}` : null;
  const isDue = (l: string) => vocabs.some((v) => v.dueDateLabels.test(l));
  const isDateLabel = (l: string) => vocabs.some((v) => v.dateLabels.test(l));
  for (const pass of ['labelled', 'any'] as const) {
    for (let i = 0; i < lines.length && !transactionDate; i++) {
      const l = lines[i];
      if (isDue(l)) continue;
      if (pass === 'labelled' && !isDateLabel(l)) continue;
      const found = datesInLine(l, allVocabs);
      if (found.length) { transactionDate = found[0]; conf.transactionDate = pass === 'labelled' ? 'high' : 'low'; }
    }
    if (transactionDate) break;
  }

  // --- amounts
  let total: number | null = null;
  for (const v of vocabs) {
    for (const label of v.totalLabels) {
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (!label.test(l) || v.notTotal.test(l) || VOCAB.en.notTotal.test(l)) continue;
        // table layouts put the amount on the line below the label
        const candidates = amountsInLine(l);
        const amounts = candidates.length ? candidates : (lines[i + 1] ? amountsInLine(lines[i + 1], true) : []);
        if (amounts.length) { total = amounts[amounts.length - 1]; conf.total = 'high'; break; }
      }
      if (total != null) break;
    }
    if (total != null) break;
  }

  let vatAmount: number | null = null;
  let vatRate: number | null = null;
  for (const v of vocabs) {
    for (const label of v.vatLabels) {
      for (const l of lines) {
        if (!label.test(l) || v.beforeVatLabels.some((b) => b.test(l))) continue;
        const rateM = l.match(/(\d{1,2}(?:[.,]\d+)?)\s*%/);
        if (rateM && !vatRate) vatRate = parseFloat(rateM[1].replace(',', '.'));
        // skip a line that is the grand-total "incl. VAT" label rather than a VAT line
        if (v.totalLabels.some((t) => t.test(l)) && !/^\s*(?:מע"?מ|ндс|vat|tax)/i.test(l)) continue;
        // an explicit "0.00" is a real answer (VAT-exempt receipt), not a miss
        const amts = amountsInLine(l.replace(/\d{1,2}(?:[.,]\d+)?\s*%/g, ' '), true, true);
        if (amts.length) { vatAmount = amts[amts.length - 1]; conf.vatAmount = 'high'; break; }
      }
      if (vatAmount != null) break;
    }
    if (vatAmount != null) break;
  }
  if (vatAmount == null) {
    // the VAT label itself may be unreadable: a "<rate>% <amount>" line is still a VAT line
    for (const l of lines) {
      const m = l.match(/(\d{1,2}(?:[.,]\d+)?)\s*%\s*[^\d]{0,6}(\d+[.,]\d{2})\s*$/);
      if (m && parseFloat(m[1].replace(',', '.')) >= 5 && parseFloat(m[1].replace(',', '.')) <= 25) {
        vatRate = parseFloat(m[1].replace(',', '.')); vatAmount = parseAmount(m[2]); conf.vatAmount = 'low'; break;
      }
    }
  }

  let amountBeforeVat: number | null = null;
  for (const v of vocabs) {
    for (const label of v.beforeVatLabels) {
      for (const l of lines) {
        if (!label.test(l)) continue;
        const amts = amountsInLine(l, true);
        if (amts.length) { amountBeforeVat = amts[amts.length - 1]; break; }
      }
      if (amountBeforeVat != null) break;
    }
    if (amountBeforeVat != null) break;
  }

  // reconcile the three figures
  if (total == null && amountBeforeVat != null && vatAmount != null) { total = round2(amountBeforeVat + vatAmount); conf.total = 'low'; }
  if (total == null) {
    // last resort: the largest amount with decimals — flagged low so the person double-checks it
    const all = lines.flatMap((l) => amountsInLine(l, true)).filter((n) => n < 1_000_000);
    if (all.length) { total = Math.max(...all); conf.total = 'low'; }
  }
  if (total != null && vatAmount != null && vatAmount >= total) { vatAmount = null; delete conf.vatAmount; } // a "VAT" figure ≥ total is a mis-read
  if (vatAmount === 0) { vatRate = 0; conf.vatRate = 'high'; }
  if (vatAmount == null && vatRate != null && total != null && vatRate > 0) {
    vatAmount = round2((total * vatRate) / (100 + vatRate)); conf.vatAmount = 'low';
  }
  if (vatAmount != null && vatAmount > 0 && total != null && vatRate == null) {
    const implied = (vatAmount / (total - vatAmount)) * 100;
    const nearest = KNOWN_VAT_RATES.reduce((a, b) => (Math.abs(b - implied) < Math.abs(a - implied) ? b : a));
    if (Math.abs(nearest - implied) < 0.6) { vatRate = nearest; conf.vatRate = 'low'; }
  } else if (vatRate != null) conf.vatRate = 'high';
  if (amountBeforeVat == null && total != null && vatAmount != null) amountBeforeVat = round2(total - vatAmount);

  // --- currency
  let currency: string | null = null;
  for (const [re, code] of CURRENCY_PATTERNS) if (re.test(text)) { currency = code; break; }
  if (currency) conf.currency = 'high';

  // --- payment
  let paymentMethod: PayMethod | null = null;
  const payText = lines.join('\n');
  outerPay: for (const v of vocabs) for (const [re, m] of v.payment) { if (re.test(payText)) { paymentMethod = m; break outerPay; } }
  let cardLast4: string | null = null;
  const cardPatterns: RegExp[] = [
    // masked number: ****0540, XXXX 0540, xxxx-xxxx-xxxx-0540, •••• 0540
    /(?:\*{2,}|[xX]{2,}|•{2,}|\.{3,}|#{2,})[\s-]*(\d\s?\d\s?\d\s?\d)(?!\d)/,
    // explicit "last 4 digits" wording in all supported languages
    /(?:ספרות\s*אחרונות|סיפרות\s*אחרונות|last\s*(?:4|four)(?:\s*digits)?|ending(?:\s*in)?|заканчивается\s*на|последние\s*4\s*цифры|آخر\s*4\s*أرقام)\D{0,12}(\d{4})(?!\d)/i,
    // label followed by the digits
    /(?:כרט\S{0,4}|card|карт[аы]|بطاقة)\D{0,16}(\d{4})(?!\d)/i,
  ];
  for (const re of cardPatterns) {
    const m = payText.match(re);
    if (m) { cardLast4 = m[1].replace(/\s/g, ''); break; }
  }
  if (!cardLast4) {
    // last resort: a lone 4-digit number on a line that talks about a card / credit payment
    for (const l of lines) {
      if (!/אשראי|ויזה|מאסטר|ישראכרט|דיינרס|כרטיס|visa|master|isracard|amex|карт|بطاقة/i.test(l)) continue;
      const nums = [...l.replace(/\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/g, ' ').matchAll(/(?<![\d.,])(\d{4})(?![\d.,])/g)].map((x) => x[1]).filter((n) => !/^(19|20)\d\d$/.test(n));
      if (nums.length) { cardLast4 = nums[nums.length - 1]; conf.cardLast4 = 'low'; break; }
    }
  }
  if (cardLast4) { paymentMethod = paymentMethod ?? 'credit_card'; if (!conf.cardLast4) conf.cardLast4 = 'high'; }
  let cardType: string | null = null;
  for (const [re, name] of CARD_TYPES) if (re.test(payText)) { cardType = name; break; }
  if (cardType) paymentMethod = paymentMethod === 'cash' ? 'cash' : 'credit_card';
  if (paymentMethod) conf.paymentMethod = 'high';
  const ap = firstMatch((v) => v.approval);
  const approvalNumber = ap ? ap[1] : null;
  const ins = firstMatch((v) => v.installments);
  const installments = ins ? Math.min(60, parseInt(ins[1], 10)) : null;

  // --- vendor
  let vendorName: string | null = null;
  const top = lines.slice(0, 12);
  const isUsable = (l: string) => {
    const letters = l.replace(/[^a-zA-Z\u05d0-\u05ea\u0400-\u04ff\u0600-\u06ff]/g, '');
    const digits = (l.match(/\d/g) || []).length;
    return letters.length >= 3 && digits <= letters.length && !vocabs.some((v) => v.notVendor.test(l)) && !/^[^\w\u0400-\u04ff\u0590-\u06ff]*$/.test(l);
  };
  const hebDoc = language === 'he';
  const isUsable2 = (l: string) => isUsable(l) && (!hebDoc || (l.match(/[\u05d0-\u05ea]/g) || []).length >= 3);
  const withSuffix = top.find((l) => isUsable2(l) && vocabs.some((v) => v.legalSuffix.test(l)));
  const firstUsable = top.find(isUsable2);
  vendorName = (withSuffix ?? firstUsable ?? null);
  if (vendorName) {
    vendorName = vendorName.replace(/[|_~=*#]+/g, ' ');
    if (/[\u05d0-\u05ea]/.test(vendorName)) vendorName = vendorName.replace(/(?:^|\s)[A-Za-z?!.:;]{1,4}(?=\s|$)/g, ' '); // stray Latin OCR junk inside a Hebrew name
    vendorName = vendorName.replace(/\s{2,}/g, ' ').trim().slice(0, 80); conf.vendorName = withSuffix ? 'high' : 'low'; }

  // trade name: Israeli card terminals print "שם מסוף: <store>" — usually the recognisable brand
  let brandName: string | null = null;
  for (const l of lines) {
    const m = l.match(/שם\s*מסוף\s*[:;]?\s*(.{3,40})$/);
    if (m) { brandName = m[1].replace(/[|_~=*#]+/g, ' ').replace(/(?:^|\s)[A-Za-z?!.:;]{1,6}(?=\s|$)/g, ' ').replace(/\s{2,}/g, ' ').trim(); break; }
  }
  if (brandName) conf.brandName = 'low';

  // --- category
  let categoryCode: string | null = null;
  const catText = `${vendorName ?? ''}\n${lines.slice(0, 25).join('\n')}`;
  for (const [re, code] of CATEGORY_PATTERNS) if (re.test(catText)) { categoryCode = code; break; }
  if (categoryCode) conf.categoryCode = 'low';

  return {
    language, languageConfidence: guess.confidence, vendorName, vendorTaxId, brandName, documentType, documentNumber, allocationNumber,
    transactionDate, transactionTime, total, vatAmount, vatRate, amountBeforeVat, currency, paymentMethod, cardLast4, cardType,
    approvalNumber, installments, categoryCode, confidence: conf,
  };
}

/** Israeli ID / company-number check digit (same algorithm as the teudat zehut). */
export function isValidIsraeliId(id: string): boolean {
  const s = id.padStart(9, '0');
  if (!/^\d{9}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) { let d = Number(s[i]) * ((i % 2) + 1); if (d > 9) d -= 9; sum += d; }
  return sum % 10 === 0;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
