import { useEffect, useState } from 'react';
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

const freqLabel: Record<string, string> = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };

const EMPTY = { title: '', locationId: '', frequency: 'monthly', nextRunDate: new Date().toISOString().slice(0, 10), description: '' };

export default function MaintenancePage() {
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
    if (!confirm('Delete this maintenance contract? Future scheduled calls will no longer be created.')) return;
    await apiFetch(`/maintenance-contracts/${id}`, { method: 'DELETE' });
    setContracts((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">SCHEDULED SERVICE</div><h1>Maintenance contracts</h1></div>
        <button type="button" onClick={() => (showForm ? setShowForm(false) : setShowForm(true))}>
          {showForm ? <><X size={16} /> Cancel</> : <><Plus size={16} /> New contract</>}
        </button>
      </div>
      <p style={{ color: 'var(--ink-soft)', maxWidth: 640, marginTop: -8 }}>
        A contract auto-creates a real service call for its location on the schedule below — same
        notifications as a normal call. Runs once daily at 06:00.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <form className="card form-card" onSubmit={submit}>
          <div className="form-grid">
            <div>
              <label>Title</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="e.g. Monthly gym equipment check" />
            </div>
            <div>
              <label>Location</label>
              <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })} required>
                <option value="">Select…</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label>Frequency</label>
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <label>First run date</label>
              <input type="date" value={form.nextRunDate} onChange={(e) => setForm({ ...form, nextRunDate: e.target.value })} required />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Description (used on the auto-created call)</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required rows={2} />
            </div>
          </div>
          <button type="submit"><Plus size={15} /> Create</button>
        </form>
      )}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>Title</th>
              <th style={{ padding: '8px 12px' }}>Location</th>
              <th style={{ padding: '8px 12px' }}>Frequency</th>
              <th style={{ padding: '8px 12px' }}>Next run</th>
              <th style={{ padding: '8px 12px' }}>Status</th>
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
                <td style={{ padding: '8px 12px', color: c.active ? 'green' : 'var(--ink-soft)' }}>{c.active ? 'Active' : 'Paused'}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => toggleActive(c)} title={c.active ? 'Pause' : 'Resume'} style={{ marginRight: 8 }}><Power size={15} /></button>
                  <button type="button" onClick={() => remove(c.id)} title="Delete" style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
            {contracts.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>No maintenance contracts yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
