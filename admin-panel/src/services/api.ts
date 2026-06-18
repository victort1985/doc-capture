const BASE_URL = '/api';

function getToken(): string | null {
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
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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
  return res.json();
}
