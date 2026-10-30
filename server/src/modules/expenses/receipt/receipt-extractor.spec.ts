import { extractReceipt, parseAmount, amountsInLine } from './receipt-extractor';
import { detectLanguage, normalizeDigits } from './receipt-lang';

const HE = `אם.סי. אילת מיוזיק בע"מ
ע.מ. 513181792
חשבונית מס/קבלה מס' 458213
מספר הקצאה: 123456789
תאריך: 26/06/2026   שעה 14:32
שרות כללי 1 3,000.00
סה"כ ביניים 3,000.00
מע"מ 18% 457.63
סה"כ לתשלום 3,457.63 ₪
אשראי ויזה ****4412
מספר אישור 0087341
3 תשלומים`;

const RU = `ООО "Ромашка"
ИНН 7701234567
Кассовый чек № 4521
Дата: 12 октября 2026  18:05
Бензин АИ-95  40.00 л
Итого с НДС          2 450,00 ₽
в т.ч. НДС 20%         408,33
К оплате             2 450,00
Оплата картой VISA ****1234
Код авторизации 83A92B`;

const EN = `ACME Office Supplies Ltd
VAT No: 123456789
Tax Invoice
Invoice No: INV-20931
Date: 03/10/2026
Subtotal 100.00
VAT 17% 17.00
Total Due $117.00
Paid by Mastercard ending **** 5599
Approval code: 77A12B`;

const AR = `شركة النور للتجارة
الرقم الضريبي ٣١٢٣٤٥٦٧٨٩٠١٢٣٤
فاتورة ضريبية
رقم الفاتورة ٢٠٤٥٨
التاريخ: ١٥/٠٩/٢٠٢٦
المجموع قبل الضريبة ١٠٠٫٠٠
ضريبة القيمة المضافة ١٥٪ ١٥٫٠٠
الإجمالي المستحق ١١٥٫٠٠ ريال
الدفع: نقدا`;

describe('receipt language detection', () => {
  it('detects he/ru/en/ar by dominant script', () => {
    expect(detectLanguage(HE).language).toBe('he');
    expect(detectLanguage(RU).language).toBe('ru');
    expect(detectLanguage(EN).language).toBe('en');
    expect(detectLanguage(AR).language).toBe('ar');
  });
  it('normalises Arabic-Indic digits', () => expect(normalizeDigits('٣٬٤٥٦٫٧٨')).toBe('3,456.78'));
});

describe('amount parsing', () => {
  it.each([['1,234.56', 1234.56], ['1.234,56', 1234.56], ['2 450,00', 2450], ['12,50', 12.5], ['1,234', 1234], ['99.9', 99.9]])('%s', (raw, v) => expect(parseAmount(raw as string)).toBe(v));
  it('ignores dates, times, percents and long ids', () => expect(amountsInLine('26/06/2026 14:32 18% 5133181792 45.50')).toEqual([45.5]));
});

describe('card last 4', () => {
  it.each([
    ['אשראי ויזה ****0540', '0540'], ['Card XXXX-XXXX-XXXX-0540', '0540'], ['כרטיס אשראי xxxxxxxxxxxx0540', '0540'],
    ['Visa ending in 0540', '0540'], ['ספרות אחרונות: 0540', '0540'], ['Оплата картой VISA •••• 0540', '0540'],
  ])('%s', (line, last4) => expect(extractReceipt(`Shop Ltd\n${line}\nTotal 10.00`).cardLast4).toBe(last4));
});

describe('receipt extraction', () => {
  it('Hebrew tax invoice-receipt', () => {
    const r = extractReceipt(HE);
    expect(r.language).toBe('he');
    expect(r.vendorName).toContain('אילת מיוזיק');
    expect(r.vendorTaxId).toBe('513181792');
    expect(r.documentType).toBe('tax_invoice_receipt');
    expect(r.documentNumber).toBe('458213');
    expect(r.allocationNumber).toBe('123456789');
    expect(r.transactionDate).toBe('2026-06-26');
    expect(r.total).toBe(3457.63);
    expect(r.vatAmount).toBe(457.63);
    expect(r.vatRate).toBe(18);
    expect(r.currency).toBe('ILS');
    expect(r.paymentMethod).toBe('credit_card');
    expect(r.cardLast4).toBe('4412');
    expect(r.approvalNumber).toBe('0087341');
    expect(r.installments).toBe(3);
  });
  it('Russian cash slip', () => {
    const r = extractReceipt(RU);
    expect(r.language).toBe('ru');
    expect(r.vendorName).toContain('Ромашка');
    expect(r.vendorTaxId).toBe('7701234567');
    expect(r.documentType).toBe('cash_slip');
    expect(r.documentNumber).toBe('4521');
    expect(r.transactionDate).toBe('2026-10-12');
    expect(r.total).toBe(2450);
    expect(r.vatAmount).toBe(408.33);
    expect(r.vatRate).toBe(20);
    expect(r.currency).toBe('RUB');
    expect(r.paymentMethod).toBe('credit_card');
    expect(r.cardLast4).toBe('1234');
    expect(r.categoryCode).toBe('fuel');
  });
  it('English tax invoice', () => {
    const r = extractReceipt(EN);
    expect(r.language).toBe('en');
    expect(r.vendorName).toContain('ACME');
    expect(r.vendorTaxId).toBe('123456789');
    expect(r.documentType).toBe('tax_invoice');
    expect(r.documentNumber).toBe('INV-20931');
    expect(r.transactionDate).toBe('2026-10-03');
    expect(r.total).toBe(117);
    expect(r.vatAmount).toBe(17);
    expect(r.vatRate).toBe(17);
    expect(r.currency).toBe('USD');
    expect(r.cardLast4).toBe('5599');
    expect(r.cardType).toBe('Mastercard');
    expect(r.categoryCode).toBe('office');
  });
  it('Arabic tax invoice', () => {
    const r = extractReceipt(AR);
    expect(r.language).toBe('ar');
    expect(r.vendorName).toContain('النور');
    expect(r.documentType).toBe('tax_invoice');
    expect(r.documentNumber).toBe('20458');
    expect(r.transactionDate).toBe('2026-09-15');
    expect(r.total).toBe(115);
    expect(r.vatAmount).toBe(15);
    expect(r.vatRate).toBe(15);
    expect(r.currency).toBe('SAR');
    expect(r.paymentMethod).toBe('cash');
  });
  it('flags a guessed total as low confidence and tolerates garbage', () => {
    const r = extractReceipt('xx\n12.50\n3.00');
    expect(r.total).toBe(12.5);
    expect(r.confidence.total).toBe('low');
    expect(extractReceipt('').total).toBeNull();
  });
});
