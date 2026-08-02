import { alphaField, numField, dateField, signedAmountField, assembleRecord } from './fixed-width-fields.util';
import type { DocumentTypeCode } from './document-type-codes';

export type PaymentMethodCode = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; // 1=cash 2=check 3=credit card 4=bank transfer 5=vouchers 6=exchange coupon 7=bill 8=standing order 9=other

export interface ReceiptLineInput {
  recordNumberInFile: number;
  vatId: string;
  documentType: DocumentTypeCode;
  documentNumber: string;
  lineNumber: number;
  paymentMethod: PaymentMethodCode;
  bankNumber?: string; // check only
  branchNumber?: string; // check only
  accountNumber?: string; // check only
  checkNumber?: string; // check only
  dueDate?: Date; // check or credit card
  lineAmount: number;
  /** 1=Isracard 2=Cal 3=Diners 4=Amex 6=Leumi Card — credit card only. */
  clearingCompanyCode?: 1 | 2 | 3 | 4 | 6;
  cardName?: string;
  /** 1=regular 2=installments 3=credit 4=deferred 5=other — credit card only. */
  creditTransactionType?: 1 | 2 | 3 | 4 | 5;
  documentDate: Date;
  headerLinkId?: number;
}

/** Maps Vixor's own PaymentMethod enum (payments/expenses modules) to
 * this spec's numeric codes — kept here rather than in the entity
 * mapping file since it's specific to this one record type's field
 * 1306. */
export function mapVixorPaymentMethod(method: string): PaymentMethodCode {
  switch (method) {
    case 'cash': return 1;
    case 'check': return 2;
    case 'creditCard': return 3;
    case 'bankTransfer': return 4;
    case 'bit': return 9; // no dedicated code in the spec's 1-9 table — "other"
    case 'standingOrder': return 8;
    default: return 9;
  }
}

/** 120D — receipt/deposit line details (spec section 4.5). Total
 * length 222, verified field-by-field the same way as every other
 * record builder in this module. */
export function buildReceiptLineRecord(input: ReceiptLineInput): string {
  const isCheck = input.paymentMethod === 2;
  const isCard = input.paymentMethod === 3;
  const fields = [
    alphaField('120D', 4), // 1300
    numField(input.recordNumberInFile, 9), // 1301
    numField(parseInt(input.vatId, 10), 9), // 1302
    numField(input.documentType, 3), // 1303
    alphaField(input.documentNumber, 20), // 1304
    numField(input.lineNumber, 4), // 1305
    numField(input.paymentMethod, 1), // 1306
    isCheck && input.bankNumber ? numField(parseInt(input.bankNumber, 10), 10) : alphaField('', 10), // 1307
    isCheck && input.branchNumber ? numField(parseInt(input.branchNumber, 10), 10) : alphaField('', 10), // 1308
    isCheck && input.accountNumber ? numField(parseInt(input.accountNumber, 10), 15) : alphaField('', 15), // 1309
    isCheck && input.checkNumber ? numField(parseInt(input.checkNumber, 10), 10) : alphaField('', 10), // 1310
    input.dueDate ? dateField(input.dueDate) : alphaField('', 8), // 1311
    signedAmountField(input.lineAmount, 15, 2), // 1312
    isCard && input.clearingCompanyCode != null ? numField(input.clearingCompanyCode, 1) : alphaField('', 1), // 1313
    isCard ? alphaField(input.cardName ?? '', 20) : alphaField('', 20), // 1314
    isCard && input.creditTransactionType != null ? numField(input.creditTransactionType, 1) : alphaField('', 1), // 1315
    alphaField('', 0), // 1316 — cancelled, zero-width
    alphaField('', 0), // 1317 — cancelled, zero-width
    alphaField('', 0), // 1318 — cancelled, zero-width
    alphaField('', 0), // 1319 — cancelled, zero-width
    alphaField('', 7), // 1320 — branch/division id, not applicable (see 100C's own note)
    alphaField('', 0), // 1321 — cancelled, zero-width
    dateField(input.documentDate), // 1322
    input.headerLinkId != null ? numField(input.headerLinkId, 7) : alphaField('', 7), // 1323
    alphaField('', 60), // 1324 — future
  ];
  return assembleRecord(fields, 222);
}
