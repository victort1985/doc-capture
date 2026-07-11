/**
 * Minimal vCard (.vcf) parser — covers what iOS Contacts.app actually
 * exports (vCard 3.0), which is what this feature exists for: an admin
 * exports selected contacts from their iPhone's Contacts app as a .vcf
 * (native iOS "Share Contact" capability, no extra app needed) and
 * uploads it here, since there's no web API that can reach into an
 * iPhone's contacts directly (the Contact Picker API only exists on
 * Chrome for Android, not iOS Safari/WebKit).
 *
 * Not a full RFC 6350 implementation — no vCard 2.1 QUOTED-PRINTABLE
 * decoding, no group prefixes (`item1.TEL:`), no BASE64 photo
 * extraction. Good enough for name/phone/email/org/city, which is all
 * this import actually uses.
 */

import { ParsedContact } from './phonebook.types';

export function parseVCard(content: string): ParsedContact[] {
  // RFC 6350 line folding: a continuation line starts with a single
  // space or tab and should be joined onto the previous line.
  const unfolded = content.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const lines = unfolded.split(/\r\n|\n|\r/);

  const contacts: ParsedContact[] = [];
  let current: Record<string, string[]> = {};
  let inCard = false;

  const flush = () => {
    if (!inCard) return;
    const fn = current.FN?.[0]?.trim();
    const n = current.N?.[0];

    let firstName = '';
    let lastName = '';
    if (n) {
      // N is structured: Family;Given;Additional;Prefix;Suffix
      const parts = n.split(';').map((p) => p.trim());
      lastName = parts[0] || '';
      firstName = parts[1] || '';
    }
    if (!firstName && !lastName && fn) {
      const parts = fn.split(/\s+/);
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ');
    }

    const phone = current.TEL?.[0]?.trim() ?? '';
    const org = current.ORG?.[0]?.split(';')[0]?.trim();
    // ADR is structured: PO Box;Extended;Street;City;Region;PostalCode;Country
    const city = current.ADR?.[0]?.split(';')[3]?.trim();

    if (firstName || lastName) {
      contacts.push({
        firstName: firstName || lastName,
        lastName: firstName ? lastName : '',
        phone,
        email: current.EMAIL?.[0]?.trim(),
        organization: org || undefined,
        city: city || undefined,
        notes: current.NOTE?.[0]?.trim(),
      });
    }

    current = {};
    inCard = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^BEGIN:VCARD$/i.test(line)) {
      inCard = true;
      current = {};
      continue;
    }
    if (/^END:VCARD$/i.test(line)) {
      flush();
      continue;
    }
    if (!inCard) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const keyPart = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    // Strip TYPE=... and similar parameters — VERSION;TYPE=x:val -> VERSION
    const key = keyPart.split(';')[0].toUpperCase();

    if (!current[key]) current[key] = [];
    current[key].push(value);
  }

  return contacts;
}
