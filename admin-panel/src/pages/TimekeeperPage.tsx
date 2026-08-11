import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar as CalendarIcon, List, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiFetch } from '../services/api';

interface Employee { id: number; username: string; }
interface ShiftBreakdown {
  entryId: number; date: string; clockIn: string; clockOut: string;
  regular: number; overtimeTier1: number; overtimeTier2: number;
  restDay: number; restDayOvertimeTier1: number; restDayOvertimeTier2: number;
}
interface TotalBreakdown {
  regular: number; overtimeTier1: number; overtimeTier2: number;
  restDay: number; restDayOvertimeTier1: number; restDayOvertimeTier2: number;
}
interface PeriodData { shifts: ShiftBreakdown[]; total: TotalBreakdown; }

type CategoryKey = keyof TotalBreakdown;

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }

const CATEGORY_COLORS: Record<CategoryKey, string> = {
  regular: '#457B9D',
  overtimeTier1: '#F2701C',
  overtimeTier2: '#C62828',
  restDay: '#6A4C93',
  restDayOvertimeTier1: '#8E44AD',
  restDayOvertimeTier2: '#4A148C',
};

const CATEGORY_KEYS: CategoryKey[] = ['regular', 'overtimeTier1', 'overtimeTier2', 'restDay', 'restDayOvertimeTier1', 'restDayOvertimeTier2'];

function shiftHasHours(s: ShiftBreakdown, key: CategoryKey): boolean {
  return s[key] > 0;
}

export default function TimekeeperPage() {
  const { t } = useTranslation();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [data, setData] = useState<PeriodData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const [monthAnchor, setMonthAnchor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const from = toDateStr(monthAnchor);
  const to = toDateStr(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0));

  useEffect(() => {
    apiFetch<Employee[]>('/users').then((list) => {
      setEmployees(list);
      if (list.length && selectedUserId == null) setSelectedUserId(list[0].id);
    }).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load employees'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedUserId == null) return;
    setLoading(true); setError(null);
    apiFetch<PeriodData>(`/payroll/timekeeper/${selectedUserId}?${new URLSearchParams({ from, to }).toString()}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load timekeeper data'))
      .finally(() => setLoading(false));
  }, [selectedUserId, from, to]);

  const shiftsByDate = new Map<string, ShiftBreakdown[]>();
  for (const s of data?.shifts ?? []) {
    const list = shiftsByDate.get(s.date) ?? [];
    list.push(s);
    shiftsByDate.set(s.date, list);
  }

  const daysInMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = monthAnchor.getDay();

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="eyebrow">{t('timekeeper.eyebrow')}</div>
          <h1>{t('timekeeper.title')}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className={view === 'list' ? '' : 'ghost'} onClick={() => setView('list')}><List size={15} /> {t('timekeeper.viewList')}</button>
          <button type="button" className={view === 'calendar' ? '' : 'ghost'} onClick={() => setView('calendar')}><CalendarIcon size={15} /> {t('timekeeper.viewCalendar')}</button>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={selectedUserId ?? ''} onChange={(e) => setSelectedUserId(Number(e.target.value))}>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.username}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginInlineStart: 'auto' }}>
          <button className="ghost" onClick={() => setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
          <span style={{ fontWeight: 700, minWidth: 130, textAlign: 'center' }}>{monthAnchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
          <button className="ghost" onClick={() => setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}

      {data && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {CATEGORY_KEYS.map((key) => {
              const value = data.total[key];
              if (!value) return null;
              return (
                <div key={key}>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: CATEGORY_COLORS[key], display: 'inline-block' }} />
                    {t(`timekeeper.cat_${key}`)}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{value}h</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'list' ? (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
                <th style={{ padding: '8px 12px' }}>{t('timekeeper.date')}</th>
                <th style={{ padding: '8px 12px' }}>{t('timekeeper.clockIn')}</th>
                <th style={{ padding: '8px 12px' }}>{t('timekeeper.clockOut')}</th>
                <th style={{ padding: '8px 12px' }}>{t('timekeeper.breakdown')}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.shifts ?? []).map((s) => (
                <tr key={s.entryId} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{s.date}</td>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{new Date(s.clockIn).toLocaleTimeString()}</td>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{new Date(s.clockOut).toLocaleTimeString()}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {CATEGORY_KEYS.filter((k) => shiftHasHours(s, k)).map((k) => (
                        <span key={k} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: CATEGORY_COLORS[k] + '22', color: CATEGORY_COLORS[k] }}>
                          {t(`timekeeper.cat_${k}`)}: {s[k]}h
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {(data?.shifts ?? []).length === 0 && !loading && (
                <tr><td colSpan={4} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('timekeeper.noData')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`empty-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateKey = toDateStr(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), day));
              const dayShifts = shiftsByDate.get(dateKey) ?? [];
              const dayTotalHours = dayShifts.reduce((sum, s) => sum + CATEGORY_KEYS.reduce((s2, k) => s2 + s[k], 0), 0);
              const dominantRestCategory = CATEGORY_KEYS.find((k) => k.startsWith('restDay') && dayShifts.some((s) => shiftHasHours(s, k)));
              return (
                <div
                  key={day}
                  style={{
                    minHeight: 64, padding: 6, borderRadius: 6, fontSize: 12,
                    background: dayShifts.length ? (dominantRestCategory ? CATEGORY_COLORS[dominantRestCategory] + '18' : 'var(--surface-muted, #f0f4f8)') : 'transparent',
                    border: '1px solid var(--border, #eee)',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{day}</div>
                  {dayTotalHours > 0 && <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{dayTotalHours.toFixed(1)}h</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
