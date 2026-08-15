import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Pencil, Trash2, X, Plus } from 'lucide-react';
import { apiFetch } from '../services/api';

interface TimesheetRow { userId: number; username: string; totalHours: number; shiftCount: number; }
interface Entry {
  id: number; clockIn: string; clockOut: string | null; notes?: string | null;
  user: { id: number; username: string };
  costCenter?: { id: number; name: string } | null;
}
interface Employee { id: number; username: string; }

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }

function EditEntryModal({ entry, onClose, onSaved }: { entry: Entry; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const toLocal = (iso: string | null) => iso ? new Date(iso).toISOString().slice(0, 16) : '';
  const [clockIn, setClockIn] = useState(toLocal(entry.clockIn));
  const [clockOut, setClockOut] = useState(toLocal(entry.clockOut));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true); setError(null);
    try {
      await apiFetch(`/time-clock/${entry.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ clockIn: new Date(clockIn).toISOString(), clockOut: clockOut ? new Date(clockOut).toISOString() : null }),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div className="card" style={{ width: 360 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{entry.user.username}</h3>
          <button className="ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <label>{t('timesheet.clockIn')}</label>
        <input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <label>{t('timesheet.clockOut')}</label>
        <input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} style={{ width: '100%', marginBottom: 14 }} />
        {error && <div className="error-banner" style={{ marginBottom: 10 }}>{error}</div>}
        <button type="button" onClick={save} disabled={saving} style={{ width: '100%' }}>{saving ? t('common.saving') : t('common.save')}</button>
      </div>
    </div>
  );
}

/** Native <input type="date"/"time"> — on a phone browser (this app's
 * primary context, per the whole session's own established focus) iOS
 * Safari and Android Chrome both already render these as spinning
 * wheel pickers, exactly what was asked for ("организуй колесом"),
 * without needing a custom wheel-picker component or library. On
 * desktop they fall back to the browser's own native date/time
 * widgets, which is a reasonable, unsurprising degradation.
 *
 * Deliberately takes plain date/startTime/endTime strings rather than
 * two full datetime-local values — the SERVER (TimeClockService.
 * createManualEntry) is what actually applies the overnight-shift
 * rule (end time-of-day not after start time-of-day means the shift
 * crossed midnight, end lands on the day after the entered date), so
 * the person filling this in never has to work out and manually pick
 * the "correct" end date themselves — they just enter the shift as
 * they'd naturally describe it ("14th, 16:30 to 00:58"), matching
 * exactly how this was described in the request that asked for it. */
function AddShiftModal({ employees, onClose, onSaved }: { employees: Employee[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [userId, setUserId] = useState(employees[0]?.id ?? '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true); setError(null);
    try {
      await apiFetch('/time-clock/manual-entry', {
        method: 'POST',
        body: JSON.stringify({ userId: Number(userId), date, startTime, endTime }),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div className="card" style={{ width: 360 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{t('timesheet.addShift')}</h3>
          <button className="ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <label>{t('timesheet.employee')}</label>
        <select value={userId} onChange={(e) => setUserId(Number(e.target.value))} style={{ width: '100%', marginBottom: 10 }}>
          {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.username}</option>)}
        </select>
        <label>{t('timesheet.shiftDate')}</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <label>{t('timesheet.startTime')}</label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label>{t('timesheet.endTime')}</label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ width: '100%' }} />
          </div>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 0, marginBottom: 14 }}>{t('timesheet.overnightHint')}</p>
        {error && <div className="error-banner" style={{ marginBottom: 10 }}>{error}</div>}
        <button type="button" onClick={save} disabled={saving || !userId} style={{ width: '100%' }}>{saving ? t('common.saving') : t('common.save')}</button>
      </div>
    </div>
  );
}

export default function TimesheetPage() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<TimesheetRow[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [addingShift, setAddingShift] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const [from, setFrom] = useState(toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)));

  useEffect(() => {
    apiFetch<Employee[]>('/users').then(setEmployees).catch(() => {});
  }, []);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [s, e] = await Promise.all([
        apiFetch<TimesheetRow[]>(`/time-clock/timesheet?${new URLSearchParams({ from, to }).toString()}`),
        apiFetch<Entry[]>(`/time-clock/entries?${new URLSearchParams({ from, to }).toString()}`),
      ]);
      setSummary(s);
      setEntries(e);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [from, to]);

  async function removeEntry(id: number) {
    if (!confirm(t('timesheet.deleteConfirm'))) return;
    await apiFetch(`/time-clock/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="eyebrow">{t('timesheet.eyebrow')}</div>
          <h1>{t('timesheet.title')}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Calendar size={15} style={{ color: 'var(--ink-soft)' }} />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span style={{ color: 'var(--ink-soft)' }}>–</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <button type="button" onClick={() => setAddingShift(true)}><Plus size={15} /> {t('timesheet.addShift')}</button>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card" style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>{t('timesheet.employee')}</th>
              <th style={{ padding: '8px 12px' }}>{t('timesheet.totalHours')}</th>
              <th style={{ padding: '8px 12px' }}>{t('timesheet.shifts')}</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((r) => (
              <tr key={r.userId} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.username}</td>
                <td style={{ padding: '8px 12px' }}>{r.totalHours}h</td>
                <td style={{ padding: '8px 12px' }}>{r.shiftCount}</td>
              </tr>
            ))}
            {summary.length === 0 && !loading && (
              <tr><td colSpan={3} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('timesheet.noData')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>{t('timesheet.employee')}</th>
              <th style={{ padding: '8px 12px' }}>{t('timesheet.clockIn')}</th>
              <th style={{ padding: '8px 12px' }}>{t('timesheet.clockOut')}</th>
              <th style={{ padding: '8px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                <td style={{ padding: '8px 12px' }}>{e.user.username}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{new Date(e.clockIn).toLocaleString()}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  {e.clockOut ? new Date(e.clockOut).toLocaleString() : (
                    <span style={{ color: 'var(--success, #2E7D32)', fontWeight: 600 }}>{t('timesheet.stillOpen')}</span>
                  )}
                </td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  <button className="ghost" onClick={() => setEditingEntry(e)} style={{ marginRight: 4 }}><Pencil size={14} /></button>
                  <button className="ghost" onClick={() => removeEntry(e.id)} style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {entries.length === 0 && !loading && (
              <tr><td colSpan={4} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('timesheet.noData')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editingEntry && (
        <EditEntryModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSaved={() => { setEditingEntry(null); load(); }} />
      )}
      {addingShift && (
        <AddShiftModal employees={employees} onClose={() => setAddingShift(false)} onSaved={() => { setAddingShift(false); load(); }} />
      )}
    </div>
  );
}
