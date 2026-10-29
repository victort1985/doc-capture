export type ReceiptLanguage = 'he' | 'ru' | 'en' | 'ar';

/** Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) digits → ASCII,
 * Arabic decimal/thousands separators → . and , — done before any
 * pattern matching so every language shares one set of numeric rules. */
export function normalizeDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .replace(/٬/g, ',')
    // typographic quotes used in סה"כ / מע"מ, and Hebrew geresh variants
    .replace(/[”“„״‟]/g, '"')
    .replace(/[’‘׳`´]/g, "'");
}

export interface LanguageGuess {
  language: ReceiptLanguage;
  /** 0..1 — share of the letters belonging to the winning script. */
  confidence: number;
  counts: Record<ReceiptLanguage, number>;
}

/** Picks the receipt's language from which script dominates its
 * letters. Mixed-script receipts are normal (Hebrew store, Latin
 * brand names, digits everywhere) so only letters are counted and the
 * dominant script wins; Latin must clearly outweigh the rest to be
 * chosen, because Latin letters show up on nearly every receipt. */
export function detectLanguage(text: string): LanguageGuess {
  const counts: Record<ReceiptLanguage, number> = { he: 0, ru: 0, en: 0, ar: 0 };
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x0590 && c <= 0x05ff) counts.he++;
    else if (c >= 0x0400 && c <= 0x04ff) counts.ru++;
    else if ((c >= 0x0600 && c <= 0x06ff) || (c >= 0x0750 && c <= 0x077f) || (c >= 0xfb50 && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfeff)) counts.ar++;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) counts.en++;
  }
  // Latin letters are discounted: brand names / card networks print in Latin on every receipt
  const weighted = { ...counts, en: counts.en * 0.6 };
  const total = weighted.he + weighted.ru + weighted.en + weighted.ar;
  if (total === 0) return { language: 'en', confidence: 0, counts };
  let best: ReceiptLanguage = 'en';
  for (const k of ['he', 'ru', 'ar', 'en'] as ReceiptLanguage[]) if (weighted[k] > weighted[best]) best = k;
  return { language: best, confidence: weighted[best] / total, counts };
}
