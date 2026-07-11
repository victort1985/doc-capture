import { v4 as uuid } from 'uuid';

export interface NamePatternContext {
  place: string;
  username: string;
  docType: string;
  counter: number;
}

export function resolveNamePattern(pattern: string, ctx: NamePatternContext): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '-');

  return pattern
    .replace('{date}', date)
    .replace('{time}', time)
    .replace('{place}', sanitize(ctx.place))
    .replace('{username}', sanitize(ctx.username))
    .replace('{docType}', ctx.docType)
    .replace('{counter}', String(ctx.counter).padStart(3, '0'))
    .replace('{uuid}', uuid());
}

/** Used for template-generated filename/subfolder segments ({place},
 * {username}, etc). Only strips characters that are genuinely invalid
 * in a filename/path segment — previously this stripped to ASCII-only,
 * which collapsed any Hebrew/Russian/etc. place or username (this
 * business's everyday working languages) into a single generic
 * underscore, making every such subfolder look the same/effectively
 * blank instead of showing the actual name. */
export function sanitize(value: string): string {
  return sanitizeFilenameComponent(value) || '_';
}

/** For a user-typed custom document name (as opposed to the template-
 * generated names sanitize() above is for) — only strips characters
 * that are genuinely invalid in a filename (path separators, control
 * characters, the handful of characters Windows/NAS shares reject),
 * preserving everything else including Hebrew/Russian/etc. text, so a
 * name someone actually typed doesn't come out unrecognizable. */
export function sanitizeFilenameComponent(value: string): string {
  return value
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150); // generous but bounded — avoids pathological filesystem-limit issues
}

export interface PhoneBookNamePatternContext {
  organization: string;
  city: string;
  position: string;
  firstName: string;
  lastName: string;
  year: number;
}

export const DEFAULT_PHONEBOOK_PATTERN =
  '{organization}_{city}_{position}_{firstName}_{lastName}_{year}';

/** Filename for a phone book contact's stored record — admin-configurable pattern (see Templates). */
export function resolvePhoneBookNamePattern(
  pattern: string,
  ctx: PhoneBookNamePatternContext,
): string {
  return pattern
    .replace('{organization}', sanitize(ctx.organization || 'unknown'))
    .replace('{city}', sanitize(ctx.city || 'unknown'))
    .replace('{position}', sanitize(ctx.position || 'unknown'))
    .replace('{firstName}', sanitize(ctx.firstName || 'unknown'))
    .replace('{lastName}', sanitize(ctx.lastName || 'unknown'))
    .replace('{year}', String(ctx.year));
}
