export const BASE_URL = '/api';

export function getToken(): string | null {
  return sessionStorage.getItem('token');
}

export function setToken(token: string | null) {
  if (token) sessionStorage.setItem('token', token);
  else sessionStorage.removeItem('token');
}

let onUnauthorized: (() => void) | null = null;

/** AuthProvider registers a callback here to clear the session and bounce
 * to the login screen whenever any request comes back 401 — covers token
 * expiry/revocation happening mid-session, not just at page load. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
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
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      onUnauthorized?.();
    }
    const message =
      typeof body.message === 'string'
        ? body.message
        : Array.isArray(body.message)
          ? body.message.join(', ')
          : `Request failed (${res.status})`;
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;

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
export async function apiFetchBlob(path: string): Promise<string | null> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
