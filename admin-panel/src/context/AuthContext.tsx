import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch, setToken, setUnauthorizedHandler, setActiveOrgId } from '../services/api';

interface AuthUser {
  id: number;
  username: string;
  role: string;
  language: string;
  organizationId: number | null;
  /** Always the account's TRUE organization — null for a genuine
   * super-admin regardless of which org they're currently "acting
   * as" (organizationId above reflects that instead). Use this one
   * to decide whether to show the org-switcher UI at all; use
   * organizationId for anything that should follow whichever org is
   * currently being managed. */
  realOrganizationId?: number | null;
  isActingAsOrg?: boolean;
  isDemoMode?: boolean;
  setupWizardCompleted?: boolean;
  tosAccepted?: boolean;
  totpEnabled?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string, totpCode?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  /** Sets (or clears, with null) which organization a genuine super-
   * admin is currently acting as, then re-fetches /auth/me so the
   * change takes effect immediately across the whole app — every
   * page reading user.organizationId sees the new value right away,
   * not just future requests. See JwtStrategy.validate()'s own doc
   * comment for the backend half of this mechanism. */
  switchOrg: (orgId: number | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  function logout() {
    setToken(null);
    setActiveOrgId(null);
    setUser(null);
  }

  useEffect(() => {
    setUnauthorizedHandler(logout);

    // Restore the session on page reload — a token in sessionStorage
    // without this would otherwise bounce straight back to /login on
    // every refresh, even with a perfectly valid token.
    const hasToken = Boolean(sessionStorage.getItem('token'));
    if (!hasToken) {
      setLoading(false);
      return;
    }
    apiFetch<AuthUser>('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));

    return () => setUnauthorizedHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(username: string, password: string, totpCode?: string) {
    // A fresh login always starts as the account's own real identity —
    // any acting-as-org choice from a previous session never carries
    // over (matches how the token itself already works; see
    // getActiveOrgId's own doc comment).
    setActiveOrgId(null);
    const data = await apiFetch<{ token: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, totpCode }),
    });
    setToken(data.token);
    setUser(data.user);
  }

  /** Re-fetches /auth/me — used after an action that changes something
   * on the user record itself (accepting ToS, finishing the setup
   * wizard) so the rest of the app sees the update without requiring
   * a full page reload. */
  async function refreshUser() {
    const data = await apiFetch<AuthUser>('/auth/me');
    setUser(data);
  }

  async function switchOrg(orgId: number | null) {
    setActiveOrgId(orgId);
    await refreshUser();
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, switchOrg }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
