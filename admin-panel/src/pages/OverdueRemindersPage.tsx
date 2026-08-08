import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Plus, X } from 'lucide-react';
import { apiFetch } from '../services/api';

interface Settings { enabled: boolean; thresholdDays: number[]; messageTemplate?: string | null; }
interface LogEntry {
  id: number; thresholdDays: number; sentSuccessfully: boolean; sentAt: string;
  invoice: { id: number; invoiceNumber?: string; clientName: string; total: number; currency: string };
}

export default function OverdueRemindersPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<Settings>({ enabled: false, thresholdDays: [7, 14, 30] });
  const [log, setLog] = useState<LogEntry[]>([]);
  const [newThreshold, setNewThreshold] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [s, l] = await Promise.all([
        apiFetch<Settings>('/overdue-reminders/settings'),
        apiFetch<LogEntry[]>('/overdue-reminders/log'),
      ]);
      setSettings(s);
      setLog(l);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true); setError(null); setNotice(null);
    try {
      await apiFetch('/overdue-reminders/settings', { method: 'POST', body: JSON.stringify(settings) });
      setNotice(t('overdueReminders.saved'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  async function runNow() {
    setRunning(true); setError(null); setNotice(null);
    try {
      await apiFetch('/overdue-reminders/run-now', { method: 'POST' });
      setNotice(t('overdueReminders.ranNow'));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run');
    } finally { setRunning(false); }
  }

  function addThreshold() {
    const n = Number(newThreshold);
    if (n > 0 && !settings.thresholdDays.includes(n)) {
      setSettings({ ...settings, thresholdDays: [...settings.thresholdDays, n].sort((a, b) => a - b) });
    }
    setNewThreshold('');
  }

  function removeThreshold(n: number) {
    setSettings({ ...settings, thresholdDays: settings.thresholdDays.filter((d) => d !== n) });
  }

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="eyebrow">{t('overdueReminders.eyebrow')}</div>
          <h1>{t('overdueReminders.title')}</h1>
        </div>
        <button type="button" onClick={runNow} disabled={running}><Send size={15} /> {running ? t('overdueReminders.running') : t('overdueReminders.runNow')}</button>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}
      {notice && <div className="notice-banner" style={{ marginBottom: 12 }}>{notice}</div>}

      <div className="card" style={{ padding: 16, marginBottom: 16, maxWidth: 520 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
          {t('overdueReminders.enable')}
        </label>

        <label style={{ display: 'block', marginBottom: 6 }}>{t('overdueReminders.thresholds')}</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {settings.thresholdDays.map((d) => (
            <span key={d} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface-muted, #f0f0f0)', borderRadius: 12, padding: '3px 8px', fontSize: 12.5 }}>
              {t('overdueReminders.daysOverdue', { count: d })}
              <button onClick={() => removeThreshold(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={12} /></button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <input type="number" min={1} value={newThreshold} onChange={(e) => setNewThreshold(e.target.value)} placeholder={t('overdueReminders.addThresholdPlaceholder')} style={{ width: 140, fontSize: 12.5 }} />
          <button type="button" className="ghost" onClick={addThreshold}><Plus size={14} /></button>
        </div>

        <label style={{ display: 'block', marginBottom: 6 }}>{t('overdueReminders.messageTemplate')}</label>
        <textarea
          value={settings.messageTemplate ?? ''}
          onChange={(e) => setSettings({ ...settings, messageTemplate: e.target.value })}
          placeholder={t('overdueReminders.templateHint')}
          style={{ width: '100%', minHeight: 90, marginBottom: 14, fontSize: 12.5 }}
        />
        <button type="button" onClick={save} disabled={saving}>{saving ? t('common.saving') : t('overdueReminders.saveSettings')}</button>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <h3 style={{ margin: '4px 12px' }}>{t('overdueReminders.sendLog')}</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>{t('overdueReminders.sentAt')}</th>
              <th style={{ padding: '8px 12px' }}>{t('invoices.client')}</th>
              <th style={{ padding: '8px 12px' }}>{t('invoices.number')}</th>
              <th style={{ padding: '8px 12px' }}>{t('overdueReminders.threshold')}</th>
              <th style={{ padding: '8px 12px' }}>{t('accounting.bankStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {log.map((e) => (
              <tr key={e.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{new Date(e.sentAt).toLocaleString()}</td>
                <td style={{ padding: '8px 12px' }}>{e.invoice.clientName}</td>
                <td style={{ padding: '8px 12px' }}>{e.invoice.invoiceNumber ?? `#${e.invoice.id}`}</td>
                <td style={{ padding: '8px 12px' }}>{t('overdueReminders.daysOverdue', { count: e.thresholdDays })}</td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10,
                    background: e.sentSuccessfully ? '#d4edda' : '#f8d7da',
                    color: e.sentSuccessfully ? '#155724' : '#721c24',
                  }}>
                    {e.sentSuccessfully ? t('overdueReminders.sent') : t('overdueReminders.failed')}
                  </span>
                </td>
              </tr>
            ))}
            {log.length === 0 && !loading && (
              <tr><td colSpan={5} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('overdueReminders.emptyLog')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
