/**
 * Israeli bank codes (קוד בנק), assigned by Bank of Israel. Compiled
 * from Bank of Israel's own published registry cross-referenced
 * against multiple independent sources — where sources disagreed,
 * used the value backed by the most sources rather than trusting any
 * single one. Caught and corrected one clear data error this way:
 * a page listing "31" for Mizrahi-Tefahot (contradicted by that same
 * page's own summary table, which correctly showed 20 — every other
 * independent source agreed on 20; 31 is First International Bank's
 * code, not Mizrahi's, most likely a copy-paste artifact on that
 * page's detail-card template).
 *
 * Covers both the 17 currently-active commercial/digital banks and a
 * handful of additional codes worth recognizing even though they're
 * historical, merged, or non-commercial (a check or bank reference
 * using an old code doesn't stop existing just because the bank
 * merged) — active/historical/special are distinguished via `status`
 * so the UI can visually de-emphasize non-active entries without
 * hiding them outright.
 */
export type BankStatus = 'active' | 'historical' | 'special';

export interface BankReference {
  code: string; // as it appears on the wire — 2-digit, zero-padded where the real code is a single digit (e.g. "04" for Yahav)
  name: string;
  nameEn?: string;
  swift?: string;
  status: BankStatus;
}

export const ISRAELI_BANKS: BankReference[] = [
  { code: '03', name: 'בנק אש ישראל', nameEn: 'Esh Israel Bank', status: 'active' },
  { code: '04', name: 'בנק יהב לעובדי המדינה', nameEn: 'Bank Yahav', swift: 'BYAHILI1XXX', status: 'active' },
  { code: '10', name: 'בנק לאומי לישראל', nameEn: 'Bank Leumi', swift: 'LUMIILITXXX', status: 'active' },
  { code: '11', name: 'בנק דיסקונט לישראל', nameEn: 'Discount Bank', swift: 'IDBLILITXXX', status: 'active' },
  { code: '12', name: 'בנק הפועלים', nameEn: 'Bank Hapoalim', swift: 'POALILITXXX', status: 'active' },
  { code: '14', name: 'בנק אוצר החייל', nameEn: 'Otsar HaChayal Bank', status: 'historical' },
  { code: '17', name: 'בנק מרכנתיל דיסקונט', nameEn: 'Mercantile Discount Bank', swift: 'BARDILITXXX', status: 'active' },
  { code: '18', name: 'One Zero הבנק הדיגיטלי', nameEn: 'One Zero Digital Bank', swift: 'DIGIILITXXX', status: 'active' },
  { code: '20', name: 'בנק מזרחי טפחות', nameEn: 'Mizrahi-Tefahot Bank', swift: 'MIZBILITXXX', status: 'active' },
  { code: '22', name: 'Citibank', status: 'active' },
  { code: '23', name: 'HSBC', swift: 'HSBCILITXXX', status: 'active' },
  { code: '26', name: 'יובנק', nameEn: 'Union Bank (Yubank)', swift: 'IGBTILITXXX', status: 'historical' },
  { code: '27', name: 'Barclays Bank PLC', swift: 'BARCGB22', status: 'active' },
  { code: '31', name: 'הבנק הבינלאומי הראשון לישראל', nameEn: 'First International Bank of Israel', swift: 'FIRBILITXXX', status: 'active' },
  { code: '39', name: 'SBI State Bank of India', swift: 'SBINILITXXX', status: 'active' },
  { code: '46', name: 'בנק מסד', nameEn: 'Bank Massad', swift: 'MASBILITXXX', status: 'active' },
  { code: '52', name: 'בנק פועלי אגודת ישראל (פאג"י)', nameEn: 'PAGI Bank', status: 'historical' },
  { code: '54', name: 'בנק ירושלים', nameEn: 'Bank of Jerusalem', swift: 'JERSILITXXX', status: 'active' },
  { code: '59', name: 'שירותי בנק אוטומטיים (שב"א)', nameEn: 'SHVA (Automated Bank Services)', status: 'special' },
  { code: '60', name: 'אלטשולר שחם פיננשיאל סרביסס', nameEn: 'Altshuler Shaham Financial Services', status: 'special' },
  { code: '99', name: 'בנק ישראל', nameEn: 'Bank of Israel (central bank)', swift: 'ISRAILIRXXX', status: 'special' },
];
