import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2, Plus, AlertTriangle, X, FileText, Building2 } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface NoteItem { quantity: number; name: string; notes?: string; }
interface DeliveryNote {
  id: number;
  noteNumber?: string;
  date?: string;
  documentType?: string;
  clientName?: string;
  deliveredTo?: string;
  status: string;
  items: NoteItem[];
  remarks?: string;
  createdAt: string;
  createdByUsername?: string;
  organization?: { id: number; name: string };
}
interface Org { id: number; name: string; }

function fmtDate(iso?: string) {
  if (!iso) return '';
  const [y, m, day] = iso.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

function DeleteModal({ note, onConfirm, onCancel }: { note: DeliveryNote; onConfirm: () => Promise<void>; onCancel: () => void }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function handleClick() {
    setLoading(true); setError('');
    try { await onConfirm(); } catch (e: any) { setError(e?.message || 'Delete failed'); setLoading(false); }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: 360, padding: 28 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <AlertTriangle size={48} color="var(--danger, #e53e3e)" style={{ marginBottom: 12 }} />
          <h2 style={{ margin: 0, fontSize: 18 }}>{t('deliveryNotes.deleteTitle')}</h2>
          <p style={{ color: 'var(--ink-soft)', marginTop: 8, fontSize: 14 }}>
            {t('deliveryNotes.noteHash')}{note.noteNumber} — {note.clientName}<br />
            <strong style={{ color: 'var(--danger, #e53e3e)' }}>{t('deliveryNotes.cannotUndo')}</strong>
          </p>
          {error && <p style={{ color: 'red', fontSize: 13, marginTop: 8 }}>{error}</p>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} disabled={loading} style={{ flex: 1 }}>{t('common.cancel')}</button>
          <button onClick={handleClick} disabled={loading}
            style={{ flex: 1, background: 'var(--danger, #e53e3e)', color: 'white', border: 'none', borderRadius: 8, padding: '10px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: loading ? 0.7 : 1 }}>
            {loading ? t('deliveryNotes.deleting') : t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

function NoteModal({ note, onSave, onClose }: { note: Partial<DeliveryNote> | null; onSave: (data: any) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<any>(note || { documentType: 'תעודת משלוח', date: new Date().toISOString().slice(0, 10), items: [{ quantity: 1, name: '', notes: '' }] });
  const [saving, setSaving] = useState(false);
  // Actual printed-document values (Hebrew business terms) — not UI
  // labels, so these stay in Hebrew regardless of admin panel language.
  const docTypes = ['תעודת משלוח', 'הסכם שכירות', 'ביצוע עבודה', 'תעודת משלוח / הסכם שכירות', 'תעודת משלוח / ביצוע עבודה'];
  function setField(k: string, v: any) { setForm((p: any) => ({ ...p, [k]: v })); }
  function setItem(i: number, k: string, v: any) {
    setForm((p: any) => { const items = [...(p.items || [])]; items[i] = { ...items[i], [k]: v }; return { ...p, items }; });
  }
  async function save() { setSaving(true); try { await onSave(form); } finally { setSaving(false); } }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>{note?.id ? t('deliveryNotes.editNote') : t('deliveryNotes.newNote')}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div><label>{t('deliveryNotes.documentType')}</label>
            <select value={form.documentType || ''} onChange={e => setField('documentType', e.target.value)} style={{ width: '100%' }}>
              {docTypes.map(dt => <option key={dt} value={dt}>{dt}</option>)}
            </select>
          </div>
          <div><label>{t('orders.date')}</label>
            <input type="date" value={form.date?.slice(0, 10) || ''} onChange={e => setField('date', e.target.value)} style={{ width: '100%' }} />
          </div>
          <div><label>{t('deliveryNotes.clientName')}</label>
            <input value={form.clientName || ''} onChange={e => setField('clientName', e.target.value)} style={{ width: '100%' }} />
          </div>
          <div><label>{t('deliveryNotes.deliveredTo')}</label>
            <input value={form.deliveredTo || ''} onChange={e => setField('deliveredTo', e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ gridColumn: '1/-1' }}><label>{t('deliveryNotes.remarks')}</label>
            <textarea value={form.remarks || ''} onChange={e => setField('remarks', e.target.value)} style={{ width: '100%', minHeight: 60 }} />
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label>{t('deliveryNotes.items')}</label>
          {(form.items || []).map((item: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <input type="number" value={item.quantity || 1} onChange={e => setItem(i, 'quantity', +e.target.value)} style={{ width: 60 }} min={1} />
              <input value={item.name || ''} onChange={e => setItem(i, 'name', e.target.value)} placeholder={t('deliveryNotes.itemName')} style={{ flex: 2 }} />
              <input value={item.notes || ''} onChange={e => setItem(i, 'notes', e.target.value)} placeholder={t('deliveryNotes.itemNotes')} style={{ flex: 1 }} />
              <button onClick={() => setForm((p: any) => ({ ...p, items: p.items.filter((_: any, j: number) => j !== i) }))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}><X size={14} /></button>
            </div>
          ))}
          <button onClick={() => setForm((p: any) => ({ ...p, items: [...(p.items || []), { quantity: 1, name: '', notes: '' }] }))}
            style={{ fontSize: 12, marginTop: 4 }}>+ {t('deliveryNotes.addItem')}</button>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose}>{t('common.cancel')}</button>
          <button onClick={save} disabled={saving} style={{ background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 700 }}>
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DeliveryNotesPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const isSuperAdmin = auth?.user?.organizationId == null;
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DeliveryNote | null>(null);
  const [editTarget, setEditTarget] = useState<Partial<DeliveryNote> | null | undefined>(undefined);

  const isAdmin = auth?.user?.role === 'admin' || isSuperAdmin;

  useEffect(() => {
    if (isSuperAdmin) {
      apiFetch<Org[]>('/organizations').then(setOrgs).catch(() => {});
    }
    load('');
  }, []);

  async function load(orgId: string) {
    setLoading(true);
    try {
      const url = orgId ? `/delivery-notes?orgId=${orgId}` : '/delivery-notes';
      const data = await apiFetch<DeliveryNote[]>(url);
      setNotes(data);
    } finally { setLoading(false); }
  }

  function handleOrgChange(orgId: string) {
    setSelectedOrgId(orgId);
    load(orgId);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await apiFetch(`/delivery-notes/${deleteTarget.id}`, { method: 'DELETE' });
    setNotes(prev => prev.filter(n => n.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  async function handleSave(form: any) {
    if (editTarget?.id) {
      const updated = await apiFetch<DeliveryNote>(`/delivery-notes/${editTarget.id}`, {
        method: 'PATCH', body: JSON.stringify(form), headers: { 'Content-Type': 'application/json' },
      });
      setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
    } else {
      const created = await apiFetch<DeliveryNote>('/delivery-notes', {
        method: 'POST', body: JSON.stringify(form), headers: { 'Content-Type': 'application/json' },
      });
      setNotes(prev => [created, ...prev]);
    }
    setEditTarget(undefined);
  }

  if (!isAdmin) return (
    <div className="card" style={{ textAlign: 'center', padding: 40 }}>
      <AlertTriangle size={40} color="var(--danger)" style={{ marginBottom: 12 }} />
      <h2>{t('deliveryNotes.adminRequired')}</h2>
    </div>
  );

  const filtered = notes.filter(n =>
    !search ||
    (n.clientName || '').toLowerCase().includes(search.toLowerCase()) ||
    (n.noteNumber || '').includes(search) ||
    (n.deliveredTo || '').toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    t('deliveryNotes.colNumber'), t('deliveryNotes.documentType'), t('orders.date'), t('deliveryNotes.clientName'),
    t('deliveryNotes.deliveredTo'), t('deliveryNotes.items'), t('common.status'),
    ...(isSuperAdmin ? [t('organizations.title')] : []), '',
  ];

  return (
    <div>
      <div className="topbar">
        <div>
          <span className="eyebrow">{t('deliveryNotes.eyebrow')}</span>
          <h1 className="page-title">{t('nav.deliveryNotes')}</h1>
        </div>
        <button onClick={() => setEditTarget({})} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> {t('deliveryNotes.newNote')}
        </button>
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder={t('deliveryNotes.searchPlaceholder')}
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, maxWidth: 360 }}
        />
        {/* Organization filter — super-admin only */}
        {isSuperAdmin && orgs.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Building2 size={16} style={{ color: 'var(--ink-soft)', flexShrink: 0 }} />
            <select
              value={selectedOrgId}
              onChange={e => handleOrgChange(e.target.value)}
              style={{ minWidth: 180 }}
            >
              <option value="">{t('deliveryNotes.allOrganizations')}</option>
              {orgs.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
        )}
        {/* Current org badge for regular admin */}
        {!isSuperAdmin && auth?.user?.organizationId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', background: 'var(--primary-wash)',
            borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}>
            <Building2 size={14} style={{ color: 'var(--primary)' }} />
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
              {orgs.find(o => o.id === auth?.user?.organizationId)?.name ?? t('deliveryNotes.yourOrganization')}
            </span>
          </div>
        )}
        <span style={{ color: 'var(--ink-soft)', fontSize: 13, marginLeft: 'auto' }}>
          {filtered.length} {filtered.length !== 1 ? t('deliveryNotes.notesPlural') : t('deliveryNotes.notesSingular')}
        </span>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--ink-soft)' }}>{t('common.loading')}</div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {columns.map((h, i) => (
                  <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--ink-soft)', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 32, color: 'var(--ink-soft)' }}>
                  <FileText size={32} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
                  {t('deliveryNotes.noneFound')}
                </td></tr>
              )}
              {filtered.map(n => (
                <tr key={n.id} style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  {/* Note number — no prefix, show as-is */}
                  <td style={{ padding: '10px 12px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {n.noteNumber ?? `#${n.id}`}
                  </td>
                  <td style={{ padding: '10px 12px', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="rtl">
                    {n.documentType || 'תעודת משלוח'}
                  </td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{fmtDate(n.date)}</td>
                  <td style={{ padding: '10px 12px' }}>{n.clientName}</td>
                  <td style={{ padding: '10px 12px' }}>{n.deliveredTo}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--ink-soft)' }}>{n.items?.length || 0}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      background: n.status === 'signed' ? '#d4edda' : '#fff3cd',
                      color: n.status === 'signed' ? '#155724' : '#856404',
                    }}>{n.status}</span>
                  </td>
                  {isSuperAdmin && (
                    <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--ink-soft)' }}>
                      {n.organization?.name ?? '—'}
                    </td>
                  )}
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="ghost" title={t('common.edit')} onClick={() => setEditTarget(n)}><Pencil size={14} /></button>
                      <button className="ghost" title={t('common.delete')} style={{ color: 'var(--danger, #e53e3e)' }} onClick={() => setDeleteTarget(n)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <DeleteModal note={deleteTarget} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
      {editTarget !== undefined && (
        <NoteModal note={editTarget} onSave={handleSave} onClose={() => setEditTarget(undefined)} />
      )}
    </div>
  );
}
