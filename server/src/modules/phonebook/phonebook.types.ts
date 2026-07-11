/** Shared shape for a contact parsed from either import source (vCard
 * file upload or Google Contacts) — lets both feed the exact same
 * admin-panel review/select UI and the same /phonebook/import/commit
 * endpoint downstream. */
export interface ParsedContact {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  organization?: string;
  city?: string;
  notes?: string;
}
