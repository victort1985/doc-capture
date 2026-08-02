/** Appendix 1 (נספח מספר 1: טבלת סוגי מסמכים) of horaot_131.pdf —
 * every document type this format recognizes, by its 3-digit code.
 * Vixor's own document types are mapped onto these in
 * document-mapping.ts; not every code here has a Vixor equivalent
 * (e.g. production reports, warehouse-transfer documents), and
 * that's fine — only codes that actually apply need to appear in a
 * given export. */
export const DOCUMENT_TYPE_CODES = {
  ORDER: 100, // הזמנה
  DELIVERY_NOTE: 200, // תעודת משלוח
  DELIVERY_NOTE_AGENT: 205, // תעודת משלוח סוכן
  RETURN_NOTE: 210, // תעודת החזרה
  INVOICE_TRANSACTION: 300, // חשבונית/חשבונית עסקה
  TAX_INVOICE: 305, // חשבונית-מס
  CONSOLIDATED_INVOICE: 310, // חשבונית ריכוז
  TAX_INVOICE_RECEIPT: 320, // חשבונית מס/קבלה
  CREDIT_INVOICE: 330, // חשבונית מס זיכוי
  RESERVATION_INVOICE: 340, // חשבונית שריון
  AGENT_INVOICE: 345, // חשבונית סוכן
  RECEIPT: 400, // קבלה
  DONATION_RECEIPT: 405, // קבלה על תרומות
  CASH_OUT: 410, // יציאה מקופה
  BANK_DEPOSIT: 420, // הפקדת בנק
  PURCHASE_ORDER: 500, // הזמנת רכש
  PURCHASE_DELIVERY_NOTE: 600, // תעודת משלוח רכש
  PURCHASE_RETURN: 610, // החזרת רכש
  PURCHASE_TAX_INVOICE: 700, // חשבונית מס רכש
  PURCHASE_CREDIT: 710, // זיכוי רכש
  OPENING_BALANCE: 800, // יתרת פתיחה
  INVENTORY_IN_GENERAL: 810, // כניסה כללית למלאי
  INVENTORY_OUT_GENERAL: 820, // יציאה כללית מהמלאי
  INVENTORY_TRANSFER: 830, // העברה בין מחסנים
  INVENTORY_COUNT_ADJUSTMENT: 840, // עדכון בעקבות ספירה
  PRODUCTION_IN: 900, // דוח ייצור-כניסה
  PRODUCTION_OUT: 910, // דוח ייצור-יציאה
} as const;

export type DocumentTypeCode = (typeof DOCUMENT_TYPE_CODES)[keyof typeof DOCUMENT_TYPE_CODES];
