import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, X, Power } from 'lucide-react';
import { apiFetch } from '../services/api';

interface LocationOpt { id: number; name: string; }
interface Contract {
  id: number;
  title: string;
  location: LocationOpt;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  nextRunDate: string;
  active: boolean;
  description: string;
  lastRunAt?: string | null;
}

const EMPTY = { title: '', locationId: '', frequency: 'monthly', nextRunDate: new Date().toISOString().slice(0, 10), description: '' };

export default function MaintenancePage() {
  const { t } = useTranslation();
  const freqLabel: Record<string, string> = {
    weekly: t('maintenance.weekly'), monthly: t('maintenance.monthly'),
    quarterly: t('maintenance.quarterly'), yearly: t('maintenance.yearly'),
  };
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [locations, setLocations] = useState<LocationOpt[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [c, l] = await Promise.all([
        apiFetch<Contract[]>('/maintenance-contracts'),
        apiFetch<LocationOpt[]>('/locations'),
      ]);
      setContracts(c);
      setLocations(l);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/maintenance-contracts', {
        method: 'POST',
        body: JSON.stringify({ ...form, locationId: Number(form.locationId) }),
      });
      setForm(EMPTY);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create contract');
    }
  }

  async function toggleActive(c: Contract) {
    await apiFetch(`/maintenance-contracts/${c.id}/active`, { method: 'PATCH', body: JSON.stringify({ active: !c.active }) });
    load();
  }

  async function remove(id: number) {
    if (!confirm(t('maintenance.deleteConfirm'))) return;
    await apiFetch(`/maintenance-contracts/${id}`, { method: 'DELETE' });
    setContracts((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('maintenance.eyebrow')}</div><h1>{t('maintenance.title')}</h1></div>
        <button type="button" onClick={() => (showForm ? setShowForm(false) : setShowForm(true))}>
          {showForm ? <><X size={16} /> {t('common.cancel')}</> : <><Plus size={16} /> {t('maintenance.newContract')}</>}
        </button>
      </div>
      <p style={{ color: 'var(--ink-soft)', maxWidth: 640, marginTop: -8 }}>
        {t('maintenance.explanation')}
      </p>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <form className="card form-card" onSubmit={submit}>
          <div className="form-grid">
            <div>
              <label>{t('maintenance.contractTitle')}</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder={t('maintenance.titlePlaceholder')} />
            </div>
            <div>
              <label>{t('maintenance.location')}</label>
              <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })} required>
                <option value="">{t('maintenance.select')}</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label>{t('maintenance.frequency')}</label>
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                <option value="weekly">{t('maintenance.weekly')}</option>
                <option value="monthly">{t('maintenance.monthly')}</option>
                <option value="quarterly">{t('maintenance.quarterly')}</option>
                <option value="yearly">{t('maintenance.yearly')}</option>
              </select>
            </div>
            <div>
              <label>{t('maintenance.firstRunDate')}</label>
              <input type="date" value={form.nextRunDate} onChange={(e) => setForm({ ...form, nextRunDate: e.target.value })} required />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>{t('maintenance.description')}</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required rows={2} />
            </div>
          </div>
          <button type="submit"><Plus size={15} /> {t('maintenance.create')}</button>
        </form>
      )}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>{t('maintenance.contractTitle')}</th>
              <th style={{ padding: '8px 12px' }}>{t('maintenance.location')}</th>
              <th style={{ padding: '8px 12px' }}>{t('maintenance.frequency')}</th>
              <th style={{ padding: '8px 12px' }}>{t('maintenance.nextRun')}</th>
              <th style={{ padding: '8px 12px' }}>{t('common.status')}</th>
              <th style={{ padding: '8px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                <td style={{ padding: '8px 12px' }}>{c.title}</td>
                <td style={{ padding: '8px 12px' }}>{c.location?.name}</td>
                <td style={{ padding: '8px 12px' }}>{freqLabel[c.frequency]}</td>
                <td style={{ padding: '8px 12px' }}>{c.nextRunDate}</td>
                <td style={{ padding: '8px 12px', color: c.active ? 'green' : 'var(--ink-soft)' }}>{c.active ? t('maintenance.active') : t('maintenance.paused')}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => toggleActive(c)} title={c.active ? t('maintenance.pause') : t('maintenance.resume')} style={{ marginRight: 8 }}><Power size={15} /></button>
                  <button type="button" onClick={() => remove(c.id)} title={t('common.delete')} style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
            {contracts.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('maintenance.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
