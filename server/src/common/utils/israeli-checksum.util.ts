/**
 * Validates the check digit of a 9-digit Israeli identifier — ת.ז.
 * (personal ID) and מספר עוסק מורשה (VAT/business number) both use
 * the exact same Luhn-variant algorithm. Confirmed directly against
 * the worked example on Hebrew Wikipedia's own "ספרת ביקורת" article
 * (54370042-1 → check digit 1) before trusting it, not just derived
 * from a written description of the algorithm in isolation.
 *
 * Found this the hard way: the Tax Authority's own simulator flagged
 * "ספרת הביקורת שגויה" (check digit is wrong) on EVERY single record
 * in a real test export, because the test VAT number used
 * (a placeholder, not a real registered business's number) simply
 * doesn't carry a valid check digit — every occurrence of that same
 * vatId field failed identically across every record type, which is
 * exactly what a systematically-invalid number produces. Validating
 * this locally, before generating a real export, catches that
 * upfront instead of only discovering it after a round trip to the
 * government's own simulator.
 */
export function isValidIsraeliChecksum(nineDigits: string): boolean {
  const digits = nineDigits.replace(/\D/g, '');
  if (digits.length !== 9) return false;

  const weights = [1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    let product = Number(digits[i]) * weights[i];
    if (product >= 10) product = Math.floor(product / 10) + (product % 10);
    sum += product;
  }
  const expectedCheckDigit = (10 - (sum % 10)) % 10;
  return expectedCheckDigit === Number(digits[8]);
}
