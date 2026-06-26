import { useEffect, useState } from 'react';
import { Pencil, Trash2, Plus, AlertTriangle, X, FileText } from 'lucide-react';
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
}

function fmtDate(iso?: string) {
  if (!iso) return '';
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function DeleteModal({ note, onConfirm, onCancel }: { note: DeliveryNote; onConfirm: () => Promise<void>; onCancel: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleClick() {
    setLoading(true);
    setError('');
    try {
      await onConfirm();
    } catch (e: any) {
      setError(e?.message || 'Delete failed');
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: 360, padding: 28 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <AlertTriangle size={48} color="var(--danger, #e53e3e)" style={{ marginBottom: 12 }} />
          <h2 style={{ margin: 0, fontSize: 18 }}>Delete delivery note?</h2>
          <p style={{ color: 'var(--ink-soft)', marginTop: 8, fontSize: 14 }}>
            Note #{note.noteNumber} — {note.clientName}<br />
            <strong style={{ color: 'var(--danger, #e53e3e)' }}>This action cannot be undone.</strong>
          </p>
          {error && <p style={{ color: 'red', fontSize: 13, marginTop: 8 }}>{error}</p>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} disabled={loading} style={{ flex: 1 }}>Cancel</button>
          <button
            onClick={handleClick}
            disabled={loading}
            style={{ flex: 1, background: 'var(--danger, #e53e3e)', color: 'white', border: 'none', borderRadius: 8, padding: '10px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NoteModal({ note, onSave, onClose }: { note: Partial<DeliveryNote> | null; onSave: (data: any) => void; onCancel?: () => void; onClose: () => void }) {
  const [form, setForm] = useState<any>(note || { documentType: 'תעודת משלוח', date: new Date().toISOString().slice(0, 10), items: [{ quantity: 1, name: '', notes: '' }] });
  const [saving, setSaving] = useState(false);

  const docTypes = ['תעודת משלוח', 'הסכם שכירות', 'ביצוע עבודה', 'תעודת משלוח / הסכם שכירות', 'תעודת משלוח / ביצוע עבודה'];

  function setField(k: string, v: any) { setForm((p: any) => ({ ...p, [k]: v })); }

  function setItem(i: number, k: string, v: any) {
    setForm((p: any) => {
      const items = [...(p.items || [])];
      items[i] = { ...items[i], [k]: v };
      return { ...p, items };
    });
  }

  async function save() {
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>{note?.id ? 'Edit note' : 'New note'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div><label>Document type</label>
            <select value={form.documentType || ''} onChange={e => setField('documentType', e.target.value)} style={{ width: '100%' }}>
              {docTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div><label>Date</label>
            <input type="date" value={form.date?.slice(0, 10) || ''} onChange={e => setField('date', e.target.value)} style={{ width: '100%' }} />
          </div>
          <div><label>Client name</label>
            <input value={form.clientName || ''} onChange={e => setField('clientName', e.target.value)} style={{ width: '100%' }} />
          </div>
          <div><label>Delivered to</label>
            <input value={form.deliveredTo || ''} onChange={e => setField('deliveredTo', e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ gridColumn: '1/-1' }}><label>Remarks</label>
            <textarea value={form.remarks || ''} onChange={e => setField('remarks', e.target.value)} style={{ width: '100%', minHeight: 60 }} />
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label>Items</label>
          {(form.items || []).map((item: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <input type="number" value={item.quantity || 1} onChange={e => setItem(i, 'quantity', +e.target.value)}
                style={{ width: 60 }} min={1} />
              <input value={item.name || ''} onChange={e => setItem(i, 'name', e.target.value)}
                placeholder="Item name" style={{ flex: 2 }} />
              <input value={item.notes || ''} onChange={e => setItem(i, 'notes', e.target.value)}
                placeholder="Notes" style={{ flex: 1 }} />
              <button onClick={() => setForm((p: any) => ({ ...p, items: p.items.filter((_: any, j: number) => j !== i) }))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>
                <X size={14} />
              </button>
            </div>
          ))}
          <button onClick={() => setForm((p: any) => ({ ...p, items: [...(p.items || []), { quantity: 1, name: '', notes: '' }] }))}
            style={{ fontSize: 12, marginTop: 4 }}>
            + Add item
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 700 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DeliveryNotesPage() {
  const auth = useAuth();
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DeliveryNote | null>(null);
  const [editTarget, setEditTarget] = useState<Partial<DeliveryNote> | null | undefined>(undefined);

  // Admin-only guard
  const isAdmin = auth?.user?.role === 'admin' || auth?.user?.organizationId === null;

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<DeliveryNote[]>('/delivery-notes');
      setNotes(data);
    } finally { setLoading(false); }
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
        method: 'PATCH', body: JSON.stringify(form),
        headers: { 'Content-Type': 'application/json' },
      });
      setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
    } else {
      const created = await apiFetch<DeliveryNote>('/delivery-notes', {
        method: 'POST', body: JSON.stringify(form),
        headers: { 'Content-Type': 'application/json' },
      });
      setNotes(prev => [created, ...prev]);
    }
    setEditTarget(undefined);
  }

  if (!isAdmin) return (
    <div className="card" style={{ textAlign: 'center', padding: 40 }}>
      <AlertTriangle size={40} color="var(--danger)" style={{ marginBottom: 12 }} />
      <h2>Admin access required</h2>
    </div>
  );

  const filtered = notes.filter(n =>
    !search || (n.clientName || '').toLowerCase().includes(search.toLowerCase()) ||
    (n.noteNumber || '').includes(search) || (n.deliveredTo || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="topbar">
        <div>
          <span className="eyebrow">Documents</span>
          <h1 className="page-title">Delivery notes</h1>
        </div>
        <button onClick={() => setEditTarget({})} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> New note
        </button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <input
          placeholder="Search by client, note number…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: 360 }}
        />
      </div>

      {loading ? <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--ink-soft)' }}>Loading…</div> : (
        <div className="card" style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['#', 'Type', 'Date', 'Client', 'Delivered to', 'Items', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--ink-soft)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--ink-soft)' }}>
                  <FileText size={32} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
                  No notes found
                </td></tr>
              )}
              {filtered.map(n => (
                <tr key={n.id} style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>DN{n.noteNumber}</td>
                  <td style={{ padding: '10px 12px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="rtl">{n.documentType || 'תעודת משלוח'}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{fmtDate(n.date)}</td>
                  <td style={{ padding: '10px 12px' }}>{n.clientName}</td>
                  <td style={{ padding: '10px 12px' }}>{n.deliveredTo}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--ink-soft)' }}>{n.items?.length || 0} items</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      background: n.status === 'signed' ? '#d4edda' : '#fff3cd',
                      color: n.status === 'signed' ? '#155724' : '#856404',
                    }}>{n.status}</span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="ghost" title="Edit" onClick={() => setEditTarget(n)}><Pencil size={14} /></button>
                      <button className="ghost" title="Delete" style={{ color: 'var(--danger, #e53e3e)' }} onClick={() => setDeleteTarget(n)}><Trash2 size={14} /></button>
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
