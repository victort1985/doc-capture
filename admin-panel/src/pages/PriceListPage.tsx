import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Pencil, Building2 } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface PriceItem { id: number; name: string; type: 'device' | 'service'; price: number; notes?: string | null; }
interface Org { id: number; name: string; }

export default function PriceListPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperAdmin = user?.organizationId == null;
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selOrgId, setSelOrgId] = useState<number | null>(null);
  const [items, setItems] = useState<PriceItem[]>([]);
  const [tab, setTab] = useState<'device' | 'service'>('device');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PriceItem | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (isSuperAdmin) {
      apiFetch<Org[]>('/organizations').then(os => { setOrgs(os); if (os.length) setSelOrgId(os[0].id); }).catch(() => {});
    } else if (user?.organizationId) {
      setSelOrgId(user.organizationId);
    }
  }, [isSuperAdmin, user?.organizationId]);

  async function load() {
    if (isSuperAdmin && !selOrgId) return;
    setLoading(true); setError(null);
    try {
      const qs = isSuperAdmin && selOrgId ? `?orgId=${selOrgId}` : '';
      setItems(await apiFetch<PriceItem[]>(`/price-list${qs}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load price list');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [selOrgId]);

  async function remove(id: number, name: string) {
    if (!confirm(t('prices.deleteConfirm', { name }))) return;
    const qs = isSuperAdmin && selOrgId ? `?orgId=${selOrgId}` : '';
    await apiFetch(`/price-list/${id}${qs}`, { method: 'DELETE' });
    load();
  }

  const filtered = items.filter(i => i.type === tab);

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('prices.eyebrow')}</div><h1>{t('prices.title')}</h1></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isSuperAdmin && orgs.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Building2 size={15} style={{ color: 'var(--ink-soft)' }} />
              <select value={selOrgId ?? ''} onChange={e => setSelOrgId(Number(e.target.value))} style={{ minWidth: 160 }}>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          <button type="button" onClick={() => { setEditing(null); setShowForm(true); }}><Plus size={15} /> {t('prices.add')}</button>
        </div>
      </div>

      <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, marginTop: -8, marginBottom: 16 }}>{t('prices.explainer')}</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" className={tab === 'device' ? '' : 'ghost'} onClick={() => setTab('device')}>{t('prices.devices')}</button>
        <button type="button" className={tab === 'service' ? '' : 'ghost'} onClick={() => setTab('service')}>{t('prices.services')}</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>{t('prices.name')}</th>
              <th style={{ padding: '8px 12px' }}>{t('prices.price')}</th>
              <th style={{ padding: '8px 12px' }}>{t('prices.notes')}</th>
              <th style={{ padding: '8px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                <td style={{ padding: '8px 12px', fontWeight: 600 }}>{item.name}</td>
                <td style={{ padding: '8px 12px' }}>₪{Number(item.price).toFixed(2)}</td>
                <td style={{ padding: '8px 12px', color: 'var(--ink-soft)', fontSize: 13 }}>{item.notes}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => { setEditing(item); setShowForm(true); }} style={{ marginRight: 8 }}><Pencil size={15} /></button>
                  <button type="button" onClick={() => remove(item.id, item.name)} style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={4} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('prices.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <PriceForm
          initial={editing}
          defaultType={tab}
          orgId={selOrgId}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

function PriceForm({ initial, defaultType, orgId, isSuperAdmin, onClose, onSaved }: {
  initial: PriceItem | null; defaultType: 'device' | 'service'; orgId: number | null; isSuperAdmin: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<'device' | 'service'>(initial?.type ?? defaultType);
  const [price, setPrice] = useState(initial ? String(initial.price) : '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) { setError(t('prices.nameRequired')); return; }
    setSaving(true); setError(null);
    try {
      const qs = isSuperAdmin && orgId ? `?orgId=${orgId}` : '';
      const body = JSON.stringify({ name: name.trim(), type, price: Number(price) || 0, notes: notes.trim() || undefined });
      if (initial) await apiFetch(`/price-list/${initial.id}${qs}`, { method: 'PATCH', body });
      else await apiFetch(`/price-list${qs}`, { method: 'POST', body });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div className="card" style={{ width: 360 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{initial ? t('prices.editItem') : t('prices.addItem')}</h3>
        {error && <div className="error-banner" style={{ marginBottom: 10 }}>{error}</div>}
        <label>{t('prices.name')}</label>
        <input value={name} onChange={e => setName(e.target.value)} />
        <label>{t('prices.type')}</label>
        <select value={type} onChange={e => setType(e.target.value as any)}>
          <option value="device">{t('prices.devices')}</option>
          <option value="service">{t('prices.services')}</option>
        </select>
        <label>{t('prices.price')}</label>
        <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} />
        <label>{t('prices.notes')}</label>
        <input value={notes} onChange={e => setNotes(e.target.value)} />
        <div className="form-actions" style={{ marginTop: 16 }}>
          <button className="ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button disabled={saving} onClick={save}>{saving ? t('common.saving') : t('common.save')}</button>
        </div>
      </div>
    </div>
  );
}
