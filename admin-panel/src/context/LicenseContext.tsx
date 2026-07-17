import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiFetch, setLicenseLockedHandler } from '../services/api';

export type LicenseTier = 'NOT_ACTIVATED' | 'OK' | 'WARNING' | 'ADMIN_LOCKED' | 'FULL_LOCKED';

export interface LicenseStatus {
  state: LicenseTier;
  customerName: string | null;
  lastVerifiedAt: string | null;
  hoursSinceCheck: number | null;
  nextDeadline: string | null;
}

interface Ctx {
  status: LicenseStatus | null;
  loading: boolean;
  refresh: () => void;
}

const LicenseCtx = createContext<Ctx>({ status: null, loading: true, refresh: () => {} });

export function useLicense() {
  return useContext(LicenseCtx);
}

export function LicenseProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const s = await apiFetch<LicenseStatus>('/license/status');
      setStatus(s);
    } catch {
      // If even the status check fails (server down entirely), leave
      // the previous status in place rather than guessing.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // Registered once — any 403 LICENSE_* response anywhere in the app
    // updates status immediately instead of waiting for the next poll.
    setLicenseLockedHandler((code) => {
      setStatus((s) => (s ? { ...s, state: code === 'LICENSE_LOCKED' ? 'FULL_LOCKED' : 'ADMIN_LOCKED' } : s));
    });
    const interval = setInterval(refresh, 5 * 60 * 1000); // every 5 min
    return () => { clearInterval(interval); setLicenseLockedHandler(null); };
  }, []);

  return <LicenseCtx.Provider value={{ status, loading, refresh }}>{children}</LicenseCtx.Provider>;
}
