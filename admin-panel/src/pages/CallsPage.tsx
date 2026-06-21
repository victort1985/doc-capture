import { useEffect, useState } from 'react';
import { Trash2, Eye, X, Pencil, Save } from 'lucide-react';
import { apiFetch } from '../services/api';

interface CallRow {
  id: number;
  place: string;
  status: 'open' | 'in_progress' | 'closed';
  urgency: 'urgent' | 'not_urgent';
  contactName: string;
  contactPhone: string;
  createdBy?: { username: string };
  createdAt: string;
}

interface CallDetail extends CallRow {
  description: string;
  contactPosition: string;
  unusualDamage: boolean;
  notes: { id: number; text?: string; author?: { username: string }; createdAt: string }[];
  attachments: { id: number; originalName: string; uploadedBy?: { username: string }; createdAt: string }[];
  workingSessions: { id: number; userName: string; startedAt: string; endedAt?: string }[];
  statusChangedBy?: { username: string };
  statusChangedAt?: string;
}

const STATUS_LABEL: Record<string, string> = { open: 'Open', in_progress: 'In progress', closed: 'Closed' };

export default function CallsPage() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CallDetail | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    place: '', urgency: 'not_urgent', contactName: '', contactPosition: '', contactPhone: '', description: '', unusualDamage: false,
  });

  async function load() {
    try {
      setCalls(await apiFetch<CallRow[]>('/calls'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calls');
    }
  }

  useEffect(() => { load(); }, []);

  async function openDetail(id: number) {
    const d = await apiFetch<CallDetail>(`/calls/${id}`);
    setDetail(d);
    setEditing(false);
  }

  async function openDetailForEdit(id: number) {
    const d = await apiFetch<CallDetail>(`/calls/${id}`);
    setDetail(d);
    setEditForm({
      place: d.place,
      urgency: d.urgency,
      contactName: d.contactName,
      contactPosition: d.contactPosition,
      contactPhone: d.contactPhone,
      description: d.description,
      unusualDamage: d.unusualDamage,
    });
    setEditing(true);
  }

  function startEdit() {
    if (!detail) return;
    setEditForm({
      place: detail.place,
      urgency: detail.urgency,
      contactName: detail.contactName,
      contactPosition: detail.contactPosition,
      contactPhone: detail.contactPhone,
      description: detail.description,
      unusualDamage: detail.unusualDamage,
    });
    setEditing(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    try {
      await apiFetch(`/calls/${detail.id}`, { method: 'PATCH', body: JSON.stringify(editForm) });
      setEditing(false);
      openDetail(detail.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save call');
    }
  }

  async function removeCall(id: number) {
    if (!confirm('Delete this call permanently? This removes its notes, attachments, and timer history too — files already on storage are not deleted, only the database records.')) return;
    await apiFetch(`/calls/${id}`, { method: 'DELETE' });
    setDetail(null);
    load();
  }

  const filtered = statusFilter ? calls.filter((c) => c.status === statusFilter) : calls;

  return (
    <div>
      <div className="topbar">
        <div>
          <span className="eyebrow">Service calls</span>
          <h1 className="page-title">Calls</h1>
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 180 }}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Place</th>
              <th>Status</th>
              <th>Contact</th>
              <th>Created by</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.id}</td>
                <td>{c.place}{c.urgency === 'urgent' && <span className="stamp-badge danger" style={{ marginLeft: 6 }}>urgent</span>}</td>
                <td><span className="stamp-badge neutral">{STATUS_LABEL[c.status]}</span></td>
                <td>{c.contactName} <span className="mono" style={{ color: 'var(--ink-soft)' }}>{c.contactPhone}</span></td>
                <td>{c.createdBy?.username ?? '—'}</td>
                <td className="mono">{new Date(c.createdAt).toLocaleString()}</td>
                <td>
                  <div className="row-actions">
                    <button className="ghost" onClick={() => openDetail(c.id)} title="View / logs"><Eye size={15} /></button>
                    <button className="ghost" onClick={() => openDetailForEdit(c.id)} title="Edit"><Pencil size={15} /></button>
                    <button className="ghost" onClick={() => removeCall(c.id)} title="Delete" style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: 24 }}>No calls</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }} onClick={() => setDetail(null)}>
          <div className="card" style={{ width: 520, maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h3 style={{ marginTop: 0 }}>Call #{detail.id} — {detail.place}</h3>
              <div style={{ display: 'flex', gap: 4 }}>
                {!editing && (
                  <button className="ghost" onClick={startEdit} title="Edit"><Pencil size={16} /></button>
                )}
                <button className="ghost" onClick={() => setDetail(null)}><X size={16} /></button>
              </div>
            </div>

            {editing ? (
              <form onSubmit={saveEdit} className="form-grid" style={{ marginTop: 12 }}>
                <div>
                  <label>Place</label>
                  <input value={editForm.place} onChange={(e) => setEditForm({ ...editForm, place: e.target.value })} required />
                </div>
                <div>
                  <label>Urgency</label>
                  <select value={editForm.urgency} onChange={(e) => setEditForm({ ...editForm, urgency: e.target.value })}>
                    <option value="not_urgent">Not urgent</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label>Contact name</label>
                  <input value={editForm.contactName} onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })} required />
                </div>
                <div>
                  <label>Contact position</label>
                  <input value={editForm.contactPosition} onChange={(e) => setEditForm({ ...editForm, contactPosition: e.target.value })} />
                </div>
                <div>
                  <label>Contact phone</label>
                  <input value={editForm.contactPhone} onChange={(e) => setEditForm({ ...editForm, contactPhone: e.target.value })} required />
                </div>
                <div>
                  <label>
                    <input
                      type="checkbox"
                      checked={editForm.unusualDamage}
                      onChange={(e) => setEditForm({ ...editForm, unusualDamage: e.target.checked })}
                      style={{ marginRight: 6 }}
                    />
                    Unusual damage
                  </label>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label>Description</label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={3}
                    style={{ width: '100%' }}
                  />
                </div>
                <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                  <button type="button" className="ghost" onClick={() => setEditing(false)}>Cancel</button>
                  <button type="submit"><Save size={15} /> Save changes</button>
                </div>
              </form>
            ) : (
              <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{detail.description}</p>
            )}

            <h4>Status log</h4>
            <p style={{ fontSize: 13 }}>
              Currently <strong>{STATUS_LABEL[detail.status]}</strong>
              {detail.statusChangedBy && <> — last changed by {detail.statusChangedBy.username}{detail.statusChangedAt ? ` at ${new Date(detail.statusChangedAt).toLocaleString()}` : ''}</>}
            </p>

            <h4>Working sessions (timers)</h4>
            {detail.workingSessions.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>No one has pressed "In progress" yet.</p>
            ) : (
              <ul style={{ fontSize: 13, paddingLeft: 18 }}>
                {detail.workingSessions.map((s) => (
                  <li key={s.id}>
                    {s.userName}: {new Date(s.startedAt).toLocaleTimeString()} {s.endedAt ? `→ ${new Date(s.endedAt).toLocaleTimeString()}` : '(still running)'}
                  </li>
                ))}
              </ul>
            )}

            <h4>Notes ({detail.notes.length})</h4>
            <ul style={{ fontSize: 13, paddingLeft: 18 }}>
              {detail.notes.map((n) => (
                <li key={n.id}>{n.text || '(photo)'} — {n.author?.username} · {new Date(n.createdAt).toLocaleString()}</li>
              ))}
            </ul>

            <h4>Attachments ({detail.attachments.length})</h4>
            <ul style={{ fontSize: 13, paddingLeft: 18 }}>
              {detail.attachments.map((a) => (
                <li key={a.id}>{a.originalName} — {a.uploadedBy?.username} · {new Date(a.createdAt).toLocaleString()}</li>
              ))}
            </ul>

            <div className="form-actions" style={{ marginTop: 16 }}>
              <button onClick={() => removeCall(detail.id)} style={{ background: 'var(--danger)' }}>
                <Trash2 size={15} /> Delete this call
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
