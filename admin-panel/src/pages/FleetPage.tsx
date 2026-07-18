import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Pencil, X, Save, Car } from 'lucide-react';
import { apiFetch } from '../services/api';

interface User { id: number; username: string; }
interface Vehicle {
  id: number; make: string; model: string; year?: number;
  licensePlate: string; color?: string; vin?: string; notes?: string;
  currentMileage: number;
  lastInspectionDate?: string; lastTestDate?: string;
  isActive: boolean;
  assignedUser?: { id: number; username: string };
}

const EMPTY: Partial<Vehicle> & { assignedUserId?: number } = { make: '', model: '', licensePlate: '', isActive: true, currentMileage: 0 };

export default function FleetPage() {
  const { t } = useTranslation();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Vehicle> & { assignedUserId?: number }>(EMPTY);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    try {
      const [v, u] = await Promise.all([
        apiFetch<Vehicle[]>('/fleet/vehicles'),
        apiFetch<User[]>('/users'),
      ]);
      setVehicles(v); setUsers(u);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  }

  useEffect(() => { load(); }, []);

  function openEdit(v: Vehicle) {
    setEditingId(v.id);
    setForm({ ...v, assignedUserId: v.assignedUser?.id });
    setShowForm(true);
  }

  function cancelForm() { setForm(EMPTY); setEditingId(null); setShowForm(false); }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    try {
      if (editingId) {
        await apiFetch(`/fleet/vehicles/${editingId}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await apiFetch('/fleet/vehicles', { method: 'POST', body: JSON.stringify(form) });
      }
      cancelForm(); load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
  }

  async function remove(id: number) {
    if (!confirm(t('fleet.deleteConfirm'))) return;
    await apiFetch(`/fleet/vehicles/${id}`, { method: 'DELETE' }); setVehicles(prev => prev.filter((v: any) => v.id !== id));
  }

  const f = (field: keyof Vehicle, type = 'text') => (
    <input
      type={type}
      value={(form[field] as string | number | undefined) ?? ''}
      onChange={ev => setForm({ ...form, [field]: type === 'number' ? Number(ev.target.value) : ev.target.value })}
    />
  );

  return (
    <div>
      <div className="topbar">
        <div><span className="eyebrow">{t('fleet.eyebrow')}</span><h1 className="page-title">{t('fleet.title')}</h1></div>
        <button onClick={() => showForm ? cancelForm() : setShowForm(true)}>
          {showForm ? <><X size={16} /> {t('common.cancel')}</> : <><Plus size={16} /> {t('fleet.addVehicle')}</>}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <form className="card form-card" onSubmit={submit} style={{ maxWidth: 640, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>{editingId ? t('fleet.editVehicle') : t('fleet.newVehicle')}</h3>
          <div className="form-grid">
            <div><label>{t('fleet.make')} *</label>{f('make')}</div>
            <div><label>{t('fleet.model')} *</label>{f('model')}</div>
            <div><label>{t('fleet.year')}</label>{f('year', 'number')}</div>
            <div><label>{t('fleet.licensePlate')} *</label>{f('licensePlate')}</div>
            <div><label>{t('fleet.color')}</label>{f('color')}</div>
            <div><label>{t('fleet.vin')}</label><input value={form.vin ?? ''} onChange={e => setForm({ ...form, vin: e.target.value })} /></div>
            <div><label>{t('fleet.currentMileage')}</label><input type="number" value={form.currentMileage ?? 0} onChange={e => setForm({ ...form, currentMileage: Number(e.target.value) })} /></div>
            <div>
              <label>{t('fleet.assignedUser')}</label>
              <select value={form.assignedUserId ?? ''} onChange={e => setForm({ ...form, assignedUserId: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">{t('fleet.notAssigned')}</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
              </select>
            </div>
            <div><label>{t('fleet.lastInspection')}</label><input type="date" value={form.lastInspectionDate ?? ''} onChange={e => setForm({ ...form, lastInspectionDate: e.target.value || undefined })} /></div>
            <div><label>{t('fleet.lastTest')}</label><input type="date" value={form.lastTestDate ?? ''} onChange={e => setForm({ ...form, lastTestDate: e.target.value || undefined })} /></div>
            <div style={{ gridColumn: '1/-1' }}><label>{t('fleet.notes')}</label><textarea value={form.notes ?? ''} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} style={{ width: '100%' }} /></div>
          </div>
          <div className="form-actions">
            <button type="submit"><Save size={15} /> {editingId ? t('common.save') : t('fleet.addVehicle')}</button>
          </div>
        </form>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{t('fleet.vehicle')}</th><th>{t('fleet.licensePlate')}</th><th>{t('fleet.mileage')}</th>
              <th>{t('fleet.assignedTo')}</th><th>{t('fleet.lastInspection')}</th><th>{t('fleet.lastTest')}</th><th>{t('common.status')}</th><th />
            </tr>
          </thead>
          <tbody>
            {vehicles.map(v => (
              <tr key={v.id}>
                <td><Car size={14} style={{ marginRight: 6 }} />{v.make} {v.model}{v.year ? ` (${v.year})` : ''}</td>
                <td className="mono">{v.licensePlate}</td>
                <td>{v.currentMileage ? `${v.currentMileage.toLocaleString()} km` : '—'}</td>
                <td>{v.assignedUser?.username ?? '—'}</td>
                <td>{v.lastInspectionDate ?? '—'}</td>
                <td>{v.lastTestDate ?? '—'}</td>
                <td><span className={`stamp-badge ${v.isActive ? 'on' : 'off'}`}>{v.isActive ? t('fleet.active') : t('fleet.inactive')}</span></td>
                <td>
                  <div className="row-actions">
                    <button className="ghost" onClick={() => openEdit(v)}><Pencil size={15} /></button>
                    <button className="ghost" onClick={() => remove(v.id)} style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {vehicles.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--ink-soft)' }}>{t('fleet.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
