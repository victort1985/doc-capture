import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Trash2, RefreshCw, HardDriveDownload, RotateCcw, Clock } from 'lucide-react';
import { apiFetch, apiFetchBlob, BASE_URL, getToken } from '../services/api';

interface BackupFileInfo {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

type Frequency = 'hourly' | 'daily' | 'weekly' | 'monthly';

interface BackupSchedule {
  enabled: boolean;
  frequency: Frequency;
  intervalHours: number;
  timeOfDay: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  retentionCount: number;
  lastRunAt: string | null;
  lastRunError: string | null;
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export default function BackupPage() {
  const { t } = useTranslation();
  const [backups, setBackups] = useState<BackupFileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);

  const [schedule, setSchedule] = useState<BackupSchedule | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      setBackups(await apiFetch<BackupFileInfo[]>('/backup'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load backups');
    } finally { setLoading(false); }
  }
  async function loadSchedule() {
    try {
      setSchedule(await apiFetch<BackupSchedule>('/backup/schedule'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load backup schedule');
    }
  }
  useEffect(() => { load(); loadSchedule(); }, []);

  async function saveSchedule(patch: Partial<BackupSchedule>) {
    if (!schedule) return;
    setScheduleSaving(true); setError(null);
    try {
      const updated = await apiFetch<BackupSchedule>('/backup/schedule', { method: 'POST', body: JSON.stringify(patch) });
      setSchedule(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save schedule');
    } finally { setScheduleSaving(false); }
  }

  async function createNow() {
    setCreating(true); setError(null); setNotice(null);
    try {
      const info = await apiFetch<BackupFileInfo>('/backup', { method: 'POST' });
      setNotice(t('backup.createdSuccess', { filename: info.filename }));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create backup');
    } finally { setCreating(false); }
  }

  async function saveAs(filename: string) {
    setError(null);
    try {
      const url = await apiFetchBlob(`/backup/${encodeURIComponent(filename)}/download`);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.replace(/\.enc$/, '');
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to download backup');
    }
  }

  async function remove(filename: string) {
    if (!confirm(t('backup.confirmDelete', { filename }))) return;
    setError(null);
    try {
      await fetch(`${BASE_URL}/backup/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete backup');
    }
  }

  async function confirmRestore(filename: string) {
    setError(null); setNotice(null);
    try {
      await apiFetch(`/backup/${encodeURIComponent(filename)}/restore`, {
        method: 'POST',
        body: JSON.stringify({ confirm: 'RESTORE' }),
      });
      setNotice(t('backup.restoreSuccess'));
      setRestoreTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('backup.eyebrow')}</div><h1>{t('backup.title')}</h1></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="ghost" onClick={load} disabled={loading}>
            <RefreshCw size={15} /> {t('common.refresh')}
          </button>
          <button type="button" onClick={createNow} disabled={creating}>
            <Save size={15} /> {creating ? t('backup.creating') : t('backup.createNow')}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16, fontSize: 13 }}>
        {t('backup.disclaimer')}
      </div>

      {notice && <div style={{ background: '#e6f4ea', color: '#1a7f37', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{notice}</div>}
      {error && <div className="error-banner" style={{ marginBottom: 16, whiteSpace: 'pre-wrap' }}>{error}</div>}

      {schedule && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Clock size={16} />
            <h3 style={{ margin: 0 }}>{t('backup.scheduleTitle')}</h3>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <input type="checkbox" checked={schedule.enabled} onChange={(e) => saveSchedule({ enabled: e.target.checked })} style={{ width: 'auto' }} />
            {t('backup.scheduleEnable')}
          </label>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12 }}>{t('backup.frequency')}</label>
              <select
                value={schedule.frequency}
                onChange={(e) => saveSchedule({ frequency: e.target.value as Frequency })}
                style={{ minWidth: 140 }}
              >
                <option value="hourly">{t('backup.freqHourly')}</option>
                <option value="daily">{t('backup.freqDaily')}</option>
                <option value="weekly">{t('backup.freqWeekly')}</option>
                <option value="monthly">{t('backup.freqMonthly')}</option>
              </select>
            </div>

            {schedule.frequency === 'hourly' && (
              <div>
                <label style={{ display: 'block', fontSize: 12 }}>{t('backup.everyNHours')}</label>
                <input
                  type="number" min={1} max={24} value={schedule.intervalHours}
                  onChange={(e) => saveSchedule({ intervalHours: Number(e.target.value) })}
                  style={{ width: 90 }}
                />
              </div>
            )}

            {schedule.frequency !== 'hourly' && (
              <div>
                <label style={{ display: 'block', fontSize: 12 }}>{t('backup.timeOfDay')}</label>
                <input
                  type="time" value={schedule.timeOfDay}
                  onChange={(e) => saveSchedule({ timeOfDay: e.target.value })}
                />
              </div>
            )}

            {schedule.frequency === 'weekly' && (
              <div>
                <label style={{ display: 'block', fontSize: 12 }}>{t('backup.dayOfWeek')}</label>
                <select
                  value={schedule.dayOfWeek ?? 0}
                  onChange={(e) => saveSchedule({ dayOfWeek: Number(e.target.value) })}
                >
                  {WEEKDAY_KEYS.map((k, i) => (
                    <option key={k} value={i}>{t(`backup.weekday.${k}`)}</option>
                  ))}
                </select>
              </div>
            )}

            {schedule.frequency === 'monthly' && (
              <div>
                <label style={{ display: 'block', fontSize: 12 }}>{t('backup.dayOfMonth')}</label>
                <input
                  type="number" min={1} max={31} value={schedule.dayOfMonth ?? 1}
                  onChange={(e) => saveSchedule({ dayOfMonth: Number(e.target.value) })}
                  style={{ width: 90 }}
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: 12 }}>{t('backup.retention')}</label>
              <input
                type="number" min={0} value={schedule.retentionCount}
                onChange={(e) => saveSchedule({ retentionCount: Number(e.target.value) })}
                style={{ width: 90 }}
              />
            </div>
          </div>

          <p style={{ fontSize: 11.5, color: 'var(--ink-soft)', margin: '0 0 8px' }}>{t('backup.retentionHint')}</p>
          {scheduleSaving && <p style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{t('common.saving')}</p>}
          {schedule.lastRunAt && (
            <p style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              {t('backup.lastRun')}: {new Date(schedule.lastRunAt).toLocaleString()}
              {schedule.lastRunError && <span style={{ color: 'var(--danger, crimson)' }}> — {schedule.lastRunError}</span>}
            </p>
          )}
        </div>
      )}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>{t('backup.filename')}</th>
              <th style={{ padding: '8px 12px' }}>{t('backup.created')}</th>
              <th style={{ padding: '8px 12px' }}>{t('backup.size')}</th>
              <th style={{ padding: '8px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.filename} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12.5 }}>{b.filename}</td>
                <td style={{ padding: '8px 12px' }}>{new Date(b.createdAt).toLocaleString()}</td>
                <td style={{ padding: '8px 12px', color: 'var(--ink-soft)' }}>{formatSize(b.sizeBytes)}</td>
                <td style={{ padding: '8px 12px' }}>
                  <button type="button" className="ghost" onClick={() => saveAs(b.filename)} title={t('backup.saveAs')} style={{ marginInlineEnd: 6 }}>
                    <HardDriveDownload size={15} />
                  </button>
                  <button type="button" className="ghost" onClick={() => setRestoreTarget(b.filename)} title={t('backup.restore')} style={{ marginInlineEnd: 6, color: 'var(--danger, crimson)' }}>
                    <RotateCcw size={15} />
                  </button>
                  <button type="button" className="ghost" onClick={() => remove(b.filename)} title={t('common.delete')}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {backups.length === 0 && !loading && (
              <tr><td colSpan={4} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('backup.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {restoreTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => setRestoreTarget(null)}>
          <div className="card" style={{ width: 460, padding: 20 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, color: 'var(--danger, crimson)' }}>{t('backup.restoreConfirmTitle')}</h2>
            <p style={{ fontSize: 13.5 }}>{t('backup.restoreConfirmBody', { filename: restoreTarget })}</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button type="button" className="ghost" onClick={() => setRestoreTarget(null)} style={{ flex: 1 }}>{t('common.cancel')}</button>
              <button
                type="button"
                onClick={() => confirmRestore(restoreTarget)}
                style={{ flex: 1, background: 'var(--danger, crimson)' }}
              >
                {t('backup.restoreConfirmButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
