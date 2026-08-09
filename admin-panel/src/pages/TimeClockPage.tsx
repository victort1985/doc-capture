import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Square, Clock } from 'lucide-react';
import { apiFetch } from '../services/api';

interface Shift { id: number; clockIn: string; clockOut: string | null; notes?: string | null; }

function formatElapsed(since: string): string {
  const ms = Date.now() - new Date(since).getTime();
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

export default function TimeClockPage() {
  const { t } = useTranslation();
  const [openShift, setOpenShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  async function load() {
    setLoading(true); setError(null);
    try {
      const status = await apiFetch<Shift | null>('/time-clock/my-status');
      setOpenShift(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load status');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!openShift) return;
    const id = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, [openShift]);

  async function clockIn() {
    setBusy(true); setError(null);
    try {
      await apiFetch('/time-clock/clock-in', { method: 'POST', body: JSON.stringify({}) });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clock in');
    } finally { setBusy(false); }
  }

  async function clockOut() {
    setBusy(true); setError(null);
    try {
      await apiFetch('/time-clock/clock-out', { method: 'POST', body: JSON.stringify({}) });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clock out');
    } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="eyebrow">{t('timeClock.eyebrow')}</div>
          <h1>{t('timeClock.title')}</h1>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card" style={{ padding: 32, textAlign: 'center', maxWidth: 420 }}>
        <Clock size={40} style={{ color: openShift ? 'var(--success, #2E7D32)' : 'var(--ink-soft)', marginBottom: 12 }} />
        {loading ? (
          <div style={{ color: 'var(--ink-soft)' }}>{t('common.loading')}</div>
        ) : openShift ? (
          <>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 4 }}>{t('timeClock.clockedInSince')}</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{new Date(openShift.clockIn).toLocaleTimeString()}</div>
            <div key={tick} style={{ fontSize: 14, color: 'var(--success, #2E7D32)', marginBottom: 20 }}>{formatElapsed(openShift.clockIn)}</div>
            <button type="button" onClick={clockOut} disabled={busy} style={{ width: '100%', background: 'var(--danger, #C62828)', borderColor: 'var(--danger, #C62828)' }}>
              <Square size={15} /> {t('timeClock.clockOut')}
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, color: 'var(--ink-soft)', marginBottom: 20 }}>{t('timeClock.notClockedIn')}</div>
            <button type="button" onClick={clockIn} disabled={busy} style={{ width: '100%' }}>
              <Play size={15} /> {t('timeClock.clockIn')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
