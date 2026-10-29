import type { ReceiptLanguage } from './receipt-lang';

/**
 * Per-language vocabulary for receipt parsing. Everything language-
 * specific lives here; the extractor itself is language-agnostic and
 * simply runs the patterns of the detected language (plus English,
 * which appears on most receipts everywhere).
 *
 * Patterns are matched against digit-normalised text (see
 * normalizeDigits) and are case-insensitive. Hebrew abbreviation
 * quotes are normalised to a plain " so `סה"כ` is one spelling.
 */
export interface Vocabulary {
  /** Lines that carry the grand total, strongest label first. */
  totalLabels: RegExp[];
  /** Lines that must never be taken as the grand total. */
  notTotal: RegExp;
  vatLabels: RegExp[];
  beforeVatLabels: RegExp[];
  dateLabels: RegExp;
  dueDateLabels: RegExp;
  taxId: RegExp[];
  docNumber: RegExp[];
  allocation: RegExp[];
  approval: RegExp[];
  installments: RegExp[];
  months: Record<string, number>;
  docTypes: Array<[RegExp, 'tax_invoice_receipt' | 'tax_invoice' | 'receipt' | 'invoice' | 'credit_note' | 'cash_slip']>;
  /** Words that make a line a document title / boilerplate, never the vendor name. */
  notVendor: RegExp;
  legalSuffix: RegExp;
  payment: Array<[RegExp, 'cash' | 'credit_card' | 'check' | 'bank_transfer' | 'bit']>;
}

const num = String.raw`(\d{5,12})`;

export const VOCAB: Record<ReceiptLanguage, Vocabulary> = {
  he: {
    totalLabels: [/סה"?כ\s*(?:כולל\s*מע"?מ\s*)?לתשלום/, /לתשלום/, /סה"?כ\s*כולל\s*מע"?מ/, /סה"?כ\s*חיוב/, /סה"?כ/, /סכום\s*כולל/, /סכום/],
    notTotal: /ביניים|לפני\s*מע"?מ|ללא\s*מע"?מ|הנחה|עודף|מזומן\s*שולם|שולם\s*במזומן|נקודות/,
    vatLabels: [/מע"?מ/, /מעמ\b/],
    beforeVatLabels: [/לפני\s*מע"?מ/, /ללא\s*מע"?מ/, /סכום\s*נטו/, /נטו/],
    dateLabels: /תאריך|תא'/,
    dueDateLabels: /לתשלום\s*עד|תאריך\s*(?:פירעון|תשלום|יעד)|פירעון/,
    taxId: [
      new RegExp(String.raw`(?:ע\.?\s?מ\.?|עוסק\s*מורשה|עוסק\s*פטור|ח\.?\s?פ\.?|ח"פ|מס'?\s*עוסק|מספר\s*עוסק|מס'?\s*חברה)\D{0,12}(\d{8,9})`),
    ],
    docNumber: [
      /(?:חשבונית(?:\s*מס)?(?:\s*\/?\s*קבלה)?|קבלה|מסמך|אסמכתא|תעודה)\s*(?:מס(?:פר)?'?|#|:|-|\.)*\s*(\d{3,12})/,
    ],
    allocation: [new RegExp(String.raw`(?:מס(?:פר)?'?\s*)?הקצאה\D{0,10}${num}`)],
    approval: [/(?:מס(?:פר)?'?\s*)?אישור\D{0,8}(\d{4,10})/, /אסמכתא\D{0,6}(\d{4,12})/],
    installments: [/(\d{1,2})\s*תשלומים/, /תשלומים\D{0,4}(\d{1,2})/],
    months: {
      'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'מרס': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6,
      'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12,
    },
    docTypes: [
      [/חשבונית\s*מס\s*[\/\\]?\s*קבלה/, 'tax_invoice_receipt'],
      [/חשבונית\s*זיכוי|זיכוי\s*חשבונית/, 'credit_note'],
      [/חשבונית\s*מס/, 'tax_invoice'],
      [/חשבונית\s*עסקה/, 'invoice'],
      [/קבלה/, 'receipt'],
      [/חשבונית/, 'invoice'],
    ],
    notVendor: /סה"?כ|מע"?מ|חשבונית|קבלה|העתק|מקור|תאריך|שעה|טלפון|טל['.]|פקס|עוסק|ח\.?פ|לכבוד|כתובת/,
    legalSuffix: /בע"?מ|\(?\s*1990\s*\)?|עמותה|שותפות|עוסק/,
    payment: [
      [/ביט\b|\bbit\b/i, 'bit'], [/העברה\s*בנקאית|העברת\s*בנק/, 'bank_transfer'], [/שיק/, 'check'],
      [/אשראי|ויזה|מאסטר|מסטרקארד|ישראכרט|דיינרס|כאל|אמריקן|כרטיס|visa|master/i, 'credit_card'], [/מזומן/, 'cash'],
    ],
  },
  ru: {
    totalLabels: [/итого\s*к\s*оплате/i, /к\s*оплате/i, /всего\s*к\s*оплате/i, /итого\s*с\s*ндс/i, /итого/i, /всего/i, /сумма\s*чека/i, /сумма/i],
    notTotal: /подытог|без\s*ндс|скидк|сдача|бонус|баллов/i,
    vatLabels: [/ндс/i],
    beforeVatLabels: [/без\s*ндс/i, /сумма\s*без/i],
    dateLabels: /дата/i,
    dueDateLabels: /оплатить\s*до|срок\s*оплаты/i,
    taxId: [/инн\D{0,6}(\d{10,12})/i, /\bтин\D{0,6}(\d{8,12})/i],
    docNumber: [/(?:чек|счет(?:-фактура)?|счёт(?:-фактура)?|документ|накладная|квитанция|док\.?)\s*(?:№|n[o°]?\.?|#)\s*([\w-]{2,20})/i],
    allocation: [/номер\s*(?:аллокации|распределения)\D{0,10}(\d{5,12})/i],
    approval: [/(?:код\s*авторизации|авт\.?\s*код|rrn|auth)\D{0,6}([A-Z0-9]{4,12})/i],
    installments: [/(\d{1,2})\s*платеж/i, /рассрочк\D{0,6}(\d{1,2})/i],
    months: {
      'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4, 'мая': 5, 'июня': 6, 'июля': 7, 'августа': 8,
      'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12,
      'январь': 1, 'февраль': 2, 'март': 3, 'апрель': 4, 'май': 5, 'июнь': 6, 'июль': 7, 'август': 8,
      'сентябрь': 9, 'октябрь': 10, 'ноябрь': 11, 'декабрь': 12,
    },
    docTypes: [
      [/кассовый\s*чек|фискальный\s*чек|чек\s*№/i, 'cash_slip'],
      [/счет-?\s*фактура|счёт-?\s*фактура/i, 'tax_invoice'],
      [/кредит-?\s*нота|возврат/i, 'credit_note'],
      [/товарный\s*чек|квитанция|расписка/i, 'receipt'],
      [/сч[её]т|накладная/i, 'invoice'],
      [/чек/i, 'cash_slip'],
    ],
    notVendor: /итого|ндс|чек|кассир|смена|дата|время|телефон|тел\.|инн|кпп|адрес|добро\s*пожаловать|фискальн/i,
    legalSuffix: /ооо|оао|зао|\bип\b|ао\b|пао|тоо|тов\b/i,
    payment: [
      [/наличн/i, 'cash'], [/перевод|безнал/i, 'bank_transfer'], [/карт|visa|master|мир\b/i, 'credit_card'],
    ],
  },
  en: {
    totalLabels: [/(?:total|amount|balance)\s*due/i, /grand\s*total/i, /total\s*(?:amount\s*)?(?:incl\.?|including)\s*(?:vat|tax)/i, /total\s*payable/i, /amount\s*paid/i, /\btotal\b/i, /\bamount\b/i, /\bsum\b/i],
    notTotal: /sub\s*-?\s*total|before\s*(?:vat|tax)|excl(?:uding|\.)?\s*(?:vat|tax)|net\s*total|discount|change\b|tip\b/i,
    vatLabels: [/\bvat\b/i, /\bgst\b/i, /\bsales\s*tax\b/i, /\btax\b/i],
    beforeVatLabels: [/before\s*(?:vat|tax)/i, /excl(?:uding|\.)?\s*(?:vat|tax)/i, /net\s*(?:amount|total)/i, /sub\s*-?\s*total/i],
    dateLabels: /\bdate\b/i,
    dueDateLabels: /due\s*date|pay(?:ment)?\s*by|valid\s*until/i,
    taxId: [/(?:vat|tax|tin|reg(?:istration)?|company|co\.?)\s*(?:no\.?|number|id|#|n[o°])?\s*[:.#-]?\s*(?:[A-Z]{2})?\s*(\d{8,12})/i],
    docNumber: [/(?:invoice|receipt|bill|document|doc|order|ref(?:erence)?|check|tx)\s*(?:no\.?|number|nr\.?|#|n°)\s*[:.#-]?\s*([\w-]{3,20})/i, /(?:invoice|receipt)\s*[:#]\s*([\w-]{3,20})/i],
    allocation: [/allocation\s*(?:no\.?|number|code)?\D{0,8}(\d{5,12})/i],
    approval: [/(?:approval|auth(?:orization)?|authcode)\s*(?:code|no\.?|number)?\s*[:#-]?\s*([A-Z0-9]{4,12})/i],
    installments: [/(\d{1,2})\s*installments?/i, /installments?\D{0,4}(\d{1,2})/i],
    months: {
      jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
      aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
    },
    docTypes: [
      [/tax\s*invoice\s*[\/&-]?\s*receipt|invoice\s*[\/&-]\s*receipt/i, 'tax_invoice_receipt'],
      [/credit\s*note|credit\s*memo|refund/i, 'credit_note'],
      [/tax\s*invoice/i, 'tax_invoice'],
      [/receipt/i, 'receipt'],
      [/invoice|bill\b/i, 'invoice'],
    ],
    notVendor: /total|subtotal|receipt|invoice|tax|vat|date|time|tel|phone|fax|cashier|welcome|thank|address|www\.|@|order/i,
    legalSuffix: /\b(?:ltd|llc|inc|corp|gmbh|co\.|company|plc)\b/i,
    payment: [
      [/\bbit\b/i, 'bit'], [/wire|bank\s*transfer/i, 'bank_transfer'], [/cheque|\bcheck\b/i, 'check'],
      [/visa|master\s*card|mastercard|amex|american\s*express|credit|debit|\bcard\b|isracard|diners/i, 'credit_card'], [/\bcash\b/i, 'cash'],
    ],
  },
  ar: {
    totalLabels: [/(?:الإجمالي|الاجمالي|المجموع)\s*المستحق/, /(?:الإجمالي|الاجمالي|المجموع)\s*الكلي/, /الإجمالي|الاجمالي/, /المجموع/, /المبلغ\s*(?:المدفوع|الإجمالي)/, /المبلغ/],
    notTotal: /قبل\s*الضريبة|بدون\s*ضريبة|خصم|الباقي|المجموع\s*الفرعي/,
    vatLabels: [/ضريبة\s*القيمة\s*المضافة/, /ضريبة/, /\bvat\b/i],
    beforeVatLabels: [/قبل\s*الضريبة/, /بدون\s*ضريبة/, /المجموع\s*الفرعي/],
    dateLabels: /التاريخ|تاريخ/,
    dueDateLabels: /تاريخ\s*الاستحقاق|تاريخ\s*السداد/,
    taxId: [/(?:الرقم|رقم)\s*(?:الضريبي|ضريبي|التسجيل\s*الضريبي)\D{0,8}(\d{8,15})/, /(?:vat|tin)\D{0,8}(\d{8,15})/i],
    docNumber: [/رقم\s*(?:الفاتورة|الإيصال|الايصال|المستند)\D{0,6}([\w-]{2,20})/, /(?:فاتورة|إيصال|ايصال)\s*(?:رقم|#)\s*([\w-]{2,20})/],
    allocation: [/رقم\s*التخصيص\D{0,8}(\d{5,12})/],
    approval: [/رقم\s*(?:الموافقة|التفويض|المرجع)\D{0,6}([A-Z0-9]{4,12})/i],
    installments: [/(\d{1,2})\s*(?:دفعات|أقساط|اقساط)/],
    months: {
      'يناير': 1, 'كانون الثاني': 1, 'فبراير': 2, 'شباط': 2, 'مارس': 3, 'آذار': 3, 'أبريل': 4, 'ابريل': 4, 'نيسان': 4,
      'مايو': 5, 'أيار': 5, 'يونيو': 6, 'حزيران': 6, 'يوليو': 7, 'تموز': 7, 'أغسطس': 8, 'اغسطس': 8, 'آب': 8,
      'سبتمبر': 9, 'أيلول': 9, 'أكتوبر': 10, 'تشرين الأول': 10, 'نوفمبر': 11, 'تشرين الثاني': 11, 'ديسمبر': 12, 'كانون الأول': 12,
    },
    docTypes: [
      [/فاتورة\s*ضريبية\s*(?:و|\/)?\s*إيصال/, 'tax_invoice_receipt'],
      [/إشعار\s*دائن|اشعار\s*دائن|مرتجع/, 'credit_note'],
      [/فاتورة\s*ضريبية/, 'tax_invoice'],
      [/إيصال|ايصال|وصل/, 'receipt'],
      [/فاتورة/, 'invoice'],
    ],
    notVendor: /المجموع|الإجمالي|الاجمالي|ضريبة|فاتورة|إيصال|ايصال|التاريخ|الوقت|هاتف|فاكس|الرقم|العنوان|شكرا|مرحبا/,
    legalSuffix: /م\.?\s*ض\.?\s*م|ش\.?\s*م\.?\s*م|شركة|مؤسسة/,
    payment: [
      [/شيك/, 'check'], [/تحويل/, 'bank_transfer'], [/بطاقة|فيزا|ماستر|مدى|ائتمان/, 'credit_card'], [/نقد|كاش/, 'cash'],
    ],
  },
};

/** Currency recognised from symbols / words in any language. */
export const CURRENCY_PATTERNS: Array<[RegExp, string]> = [
  [/₪|ש"?ח|שקל|\bnis\b|\bils\b|шекел|شيكل/i, 'ILS'],
  [/\$|\busd\b|доллар|دولار/i, 'USD'],
  [/€|\beur\b|евро|يورو/i, 'EUR'],
  [/£|\bgbp\b|фунт|جنيه\s*استرليني/i, 'GBP'],
  [/₽|\brub\b|руб/i, 'RUB'],
  [/₴|\buah\b|грн|гривн/i, 'UAH'],
  [/ريال|\bsar\b/i, 'SAR'],
  [/درهم|\baed\b/i, 'AED'],
  [/دينار|\bjod\b/i, 'JOD'],
  [/ج\.?\s*م|\begp\b/i, 'EGP'],
];

/** Expense category guess, language-neutral code (the admin panel
 * translates it for display). */
const he = (w: string) => `(?<![\u05d0-\u05ea])(?:${w})(?![\u05d0-\u05ea])`;
const ru = (w: string) => `(?<![\u0430-\u044f\u0451])(?:${w})`;
const ar = (w: string) => `(?<![\u0600-\u06ff])(?:${w})(?![\u0600-\u06ff])`;
const en = (w: string) => `\\b(?:${w})\\b`;
const cat = (...parts: string[]) => new RegExp(parts.join('|'), 'i');

export const CATEGORY_PATTERNS: Array<[RegExp, string]> = [
  [cat(he('דלק|תדלוק|פז|סונול|דור\\s*אלון'), ru('топлив|бензин|азс|заправк'), en('fuel|petrol|gasoline|diesel|gas\\s*station'), ar('وقود|بنزين|محطة')), 'fuel'],
  [cat(he('מסעדה|קפה|קפיטריה|מאפה|פיצה|ארוחה'), ru('ресторан|кафе|кофе|пиццер|столов'), en('restaurant|cafe|coffee|bistro|pizza'), ar('مطعم|مقهى|قهوة')), 'food'],
  [cat(he('סופר|מכולת|שופרסל|רמי\\s*לוי|ויקטורי|מגה'), ru('супермаркет|продукты'), en('grocery|supermarket'), ar('سوبرماركت|بقالة')), 'groceries'],
  [cat(he('ציוד\\s*משרדי|משרדית'), ru('канцеляр|офис'), en('office\\s*suppl\\w*|stationery'), ar('قرطاسية')), 'office'],
  [cat(he('חניה|חנייה|כביש\\s*6|נתיבי|רב\\s*קו|מונית'), ru('паркинг|парковк|такси|проезд'), en('parking|taxi|toll|uber'), ar('موقف|تاكسي')), 'transport'],
  [cat(he('סלקום|פלאפון|פרטנר|הוט|בזק|סלולר'), ru('телефон|связь|мобильн|интернет'), en('telecom|mobile|internet|phone\\s*bill'), ar('اتصالات|جوال|إنترنت')), 'telecom'],
  [cat(he('חשמל|מים|ארנונה|גז'), ru('электро|водоканал|коммунал'), en('electric\\w*|water\\s*bill|utilit\\w*'), ar('كهرباء|مياه')), 'utilities'],
  [cat(he('חומרי\\s*בניין|ברגים|כלי\\s*עבודה|אייס|הום\\s*סנטר'), ru('стройматериал|инструмент|крепеж'), en('hardware|tools|building\\s*materials'), ar('أدوات|مواد\\s*بناء')), 'materials'],
  [cat(he('תיקון|מוסך'), ru('ремонт|автосервис'), en('repair|garage|service\\s*center'), ar('صيانة|ورشة')), 'repairs'],
  [cat(he('ביטוח'), ru('страхов'), en('insurance'), ar('تأمين')), 'insurance'],
];
