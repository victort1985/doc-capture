export const BASE_URL = '/api';

/** Thrown instead of a plain Error whenever the server's response body
 * carries a machine-readable `code` (e.g. TOTP_REQUIRED,
 * LICENSE_LOCKED) — callers that care about the specific failure
 * reason (not just a human-readable message) can check `.code`
 * instead of string-matching the message text. */
export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

export function getToken(): string | null {
  return sessionStorage.getItem('token');
}

export function setToken(token: string | null) {
  if (token) sessionStorage.setItem('token', token);
  else sessionStorage.removeItem('token');
}

/** "Act as organization" for a genuine super-admin — see
 * JwtStrategy.validate()'s own doc comment for the full backend
 * mechanism this powers. Stored in sessionStorage (same lifetime as
 * the auth token itself: cleared on logout, never persists across a
 * fresh login) rather than the auth token/JWT payload, since it's a
 * per-session UI choice, not part of the account's real identity. */
export function getActiveOrgId(): string | null {
  return sessionStorage.getItem('activeOrgId');
}

export function setActiveOrgId(orgId: number | null) {
  if (orgId != null) sessionStorage.setItem('activeOrgId', String(orgId));
  else sessionStorage.removeItem('activeOrgId');
}

function activeOrgHeader(): Record<string, string> {
  const id = getActiveOrgId();
  return id ? { 'X-Active-Org': id } : {};
}

let onUnauthorized: (() => void) | null = null;
let onLicenseLocked: ((code: string, message: string) => void) | null = null;

/** AuthProvider registers a callback here to clear the session and bounce
 * to the login screen whenever any request comes back 401 — covers token
 * expiry/revocation happening mid-session, not just at page load. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

/** Fires when the API returns 403 with a LICENSE_LOCKED /
 * LICENSE_ADMIN_LOCKED code — LicenseGate uses this to show the lock
 * screen immediately instead of waiting for the next status poll. */
export function setLicenseLockedHandler(handler: ((code: string, message: string) => void) | null) {
  onLicenseLocked = handler;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  // Do NOT set Content-Type when body is FormData — the browser must set
  // it automatically so it includes the multipart boundary string.
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Client-Type': 'admin-panel',
      ...activeOrgHeader(),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      onUnauthorized?.();
    }
    const code = body?.code ?? body?.message?.code;
    if (res.status === 403 && (code === 'LICENSE_LOCKED' || code === 'LICENSE_ADMIN_LOCKED')) {
      onLicenseLocked?.(code, body?.message?.message ?? body?.message ?? 'License locked');
    }
    const message =
      typeof body.message === 'string'
        ? body.message
        : Array.isArray(body.message)
          ? body.message.join(', ')
          : body?.message?.message ?? `Request failed (${res.status})`;
    throw new ApiError(message, code);
  }

  // Handle 200 with empty body (some DELETE endpoints return 200 + no body)
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as T;
  }
}

/** Authenticated binary fetch — plain <img src> can't send an Authorization
 * header, so logo/photo previews need to fetch bytes and turn them into a
 * blob: URL instead of pointing the <img> straight at the API. */
/** Uploads a file (multipart/form-data) and returns the parsed JSON
 * response — same error-handling shape as apiFetch, for endpoints
 * like /data-migration/import/analyze that need to send a File but
 * still get real JSON (not a blob) back. */
export async function apiFetchMultipart<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-Client-Type': 'admin-panel', ...activeOrgHeader() },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      typeof body.message === 'string'
        ? body.message
        : Array.isArray(body.message)
          ? body.message.join(', ')
          : body?.message?.message ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return res.json();
}

export async function apiFetchBlob(path: string): Promise<string> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-Client-Type': 'admin-panel', ...activeOrgHeader() },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      typeof body.message === 'string'
        ? body.message
        : Array.isArray(body.message)
          ? body.message.join(', ')
          : body?.message?.message ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** Same as apiFetchBlob but POSTs a JSON body first — for endpoints
 * like /template-design/preview that render a binary response FROM
 * request-body parameters (the currently-on-screen design values),
 * not from something already stored server-side. */
export async function apiFetchBlobPost(path: string, body: unknown): Promise<string> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Client-Type': 'admin-panel',
      'Content-Type': 'application/json',
      ...activeOrgHeader(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const message =
      typeof errBody.message === 'string'
        ? errBody.message
        : Array.isArray(errBody.message)
          ? errBody.message.join(', ')
          : errBody?.message?.message ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** Same as apiFetchBlobPost, but also returns the response's own
 * headers — for endpoints like /tax-authority-export that surface
 * useful metadata (e.g. whether the generated file exceeds the real
 * Tax Authority simulator's own size limit) as response headers
 * rather than folding it into the binary body itself. Kept separate
 * from apiFetchBlobPost rather than changing that function's return
 * shape, since its other caller (TemplateDesignerPage) has no use
 * for headers and shouldn't need to change to accommodate this. */
export async function apiFetchBlobPostWithHeaders(path: string, body: unknown): Promise<{ url: string; headers: Headers }> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Client-Type': 'admin-panel',
      'Content-Type': 'application/json',
      ...activeOrgHeader(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const message =
      typeof errBody.message === 'string'
        ? errBody.message
        : Array.isArray(errBody.message)
          ? errBody.message.join(', ')
          : errBody?.message?.message ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), headers: res.headers };
}
