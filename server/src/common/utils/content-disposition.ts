/**
 * Builds a Content-Disposition header value that is safe for ANY file name.
 *
 * Node refuses to send a header containing non-Latin-1 characters
 * (ERR_INVALID_CHAR → HTTP 500), so a Hebrew/Russian/emoji file name put
 * straight into `filename="…"` makes the download fail. This emits an ASCII
 * fallback in `filename` plus the real name in RFC 5987 `filename*`, which
 * every browser and HTTP client understands.
 */
export function contentDisposition(type: 'inline' | 'attachment', filename: string | undefined | null): string {
  const clean = String(filename ?? '').replace(/[\r\n"]/g, '').trim() || 'file';
  const ascii = clean.replace(/[^\x20-\x7E]/g, '_').replace(/[\\%;]/g, '_');
  const encoded = encodeURIComponent(clean).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
