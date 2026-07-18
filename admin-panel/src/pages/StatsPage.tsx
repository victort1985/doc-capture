import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

type Period = 'day' | 'week' | 'month' | 'year' | 'all';

interface StatsData {
  period: Period;
  from: string;
  to: string;
  totals: { open?: number; in_progress?: number; closed?: number };
  byUser: { userId: number; username: string; callsWorked: number; totalSeconds: number }[];
  byDay: { day: string; count: number }[];
  avgResolutionSeconds: number | null;
}

function fmtDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}



export default function StatsPage() {
  const { t } = useTranslation();
  const PERIOD_LABELS: Record<Period, string> = {
    day: t('stats.today'), week: t('stats.thisWeek'), month: t('stats.thisMonth'), year: t('stats.thisYear'), all: t('stats.allTime'),
  };
  const [period, setPeriod] = useState<Period>('month');
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<StatsData>(`/stats/calls?period=${period}`)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [period]);

  const totals = data?.totals ?? {};
  const total = (totals.open ?? 0) + (totals.in_progress ?? 0) + (totals.closed ?? 0);
  const byDay = data?.byDay ?? [];
  const maxDay = byDay.length ? Math.max(...byDay.map(d => d.count), 1) : 1;

  return (
    <div>
      <div className="topbar">
        <div><span className="eyebrow">{t('stats.eyebrow')}</span><h1 className="page-title">{t('stats.title')}</h1></div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                background: p === period ? 'var(--primary)' : 'var(--surface)',
                color: p === period ? '#fff' : 'var(--ink)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '5px 12px',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-soft)' }}>{t('common.loading')}</div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: t('stats.totalCalls'), value: total, color: 'var(--primary)' },
              { label: t('stats.open'), value: totals.open ?? 0, color: '#3B82F6' },
              { label: t('stats.inProgress'), value: totals.in_progress ?? 0, color: '#F59E0B' },
              { label: t('stats.closed'), value: totals.closed ?? 0, color: '#10B981' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card" style={{ textAlign: 'center', padding: 20 }}>
                <div style={{ fontSize: 36, fontWeight: 800, color }}>{value}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {/* Avg resolution */}
            <div className="card">
              <h3 style={{ margin: '0 0 12px' }}>{t('stats.avgResolution')}</h3>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>
                {fmtDuration(data?.avgResolutionSeconds ?? null)}
              </div>
              <p style={{ color: 'var(--ink-soft)', fontSize: 13, margin: '6px 0 0' }}>
                {t('stats.avgResolutionHint')}
              </p>
            </div>

            {/* Period info */}
            <div className="card">
              <h3 style={{ margin: '0 0 12px' }}>{t('stats.period')}</h3>
              <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
                <div><strong>{t('stats.from')}:</strong> {data?.from ? new Date(data.from).toLocaleDateString() : '—'}</div>
                <div><strong>{t('stats.to')}:</strong> {data?.to ? new Date(data.to).toLocaleDateString() : '—'}</div>
              </div>
            </div>
          </div>

          {/* Daily bar chart */}
          {byDay.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ margin: '0 0 16px' }}>{t('stats.callsPerDay')}</h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100 }}>
                {byDay.map((d) => {
                  const frac = d.count / maxDay;
                  const dayLabel = new Date(d.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                  return (
                    <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      {d.count > 0 && <span style={{ fontSize: 10, color: 'var(--ink-soft)' }}>{d.count}</span>}
                      <div style={{
                        width: '100%',
                        height: `${Math.max(frac * 72, d.count > 0 ? 4 : 0)}px`,
                        background: 'var(--primary)',
                        opacity: 0.75,
                        borderRadius: '3px 3px 0 0',
                      }} />
                      <span style={{ fontSize: 9, color: 'var(--ink-soft)', writingMode: 'vertical-rl', transform: 'rotate(180deg)', maxHeight: 40, overflow: 'hidden' }}>
                        {dayLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* By user */}
          {(data?.byUser ?? []).length > 0 && (
            <div className="card">
              <h3 style={{ margin: '0 0 12px' }}>{t('stats.byTechnician')}</h3>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('stats.username')}</th>
                    <th style={{ textAlign: 'right' }}>{t('stats.callsWorked')}</th>
                    <th style={{ textAlign: 'right' }}>{t('stats.totalTime')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.byUser ?? []).map((u, i) => (
                    <tr key={u.userId}>
                      <td style={{ color: 'var(--ink-soft)' }}>{i + 1}</td>
                      <td><strong>{u.username}</strong></td>
                      <td style={{ textAlign: 'right' }}>{u.callsWorked}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmtDuration(u.totalSeconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
