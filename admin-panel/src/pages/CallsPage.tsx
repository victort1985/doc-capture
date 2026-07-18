import { useEffect, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
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

export default function CallsPage() {
  const { t } = useTranslation();
  const STATUS_LABEL: Record<string, string> = { open: t('calls.open'), in_progress: t('calls.inProgress'), closed: t('calls.closed') };
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

  useEffect(() => {
    load();
    const intervalId = setInterval(load, 15_000);
    return () => clearInterval(intervalId);
  }, [statusFilter]);

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
    if (!confirm(t('calls.deleteConfirm'))) return;
    await apiFetch(`/calls/${id}`, { method: 'DELETE' });
    setDetail(null);
    load();
  }

  const filtered = statusFilter ? calls.filter((c) => c.status === statusFilter) : calls;

  return (
    <div>
      <div className="topbar">
        <div>
          <span className="eyebrow">{t('calls.eyebrow')}</span>
          <h1 className="page-title">{t('calls.title')}</h1>
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 180 }}>
          <option value="">{t('calls.allStatuses')}</option>
          <option value="open">{t('calls.open')}</option>
          <option value="in_progress">{t('calls.inProgress')}</option>
          <option value="closed">{t('calls.closed')}</option>
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>{t('calls.place')}</th>
              <th>{t('common.status')}</th>
              <th>{t('calls.contact')}</th>
              <th>{t('calls.createdBy')}</th>
              <th>{t('common.createdAt')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.id}</td>
                <td>{c.place}{c.urgency === 'urgent' && <span className="stamp-badge danger" style={{ marginLeft: 6 }}>{t('calls.urgent')}</span>}</td>
                <td><span className="stamp-badge neutral">{STATUS_LABEL[c.status]}</span></td>
                <td>{c.contactName} <span className="mono" style={{ color: 'var(--ink-soft)' }}>{c.contactPhone}</span></td>
                <td>{c.createdBy?.username ?? '—'}</td>
                <td className="mono">{new Date(c.createdAt).toLocaleString()}</td>
                <td>
                  <div className="row-actions">
                    <button className="ghost" onClick={() => openDetail(c.id)} title={t('calls.viewLogs')}><Eye size={15} /></button>
                    <button className="ghost" onClick={() => openDetailForEdit(c.id)} title={t('common.edit')}><Pencil size={15} /></button>
                    <button className="ghost" onClick={() => removeCall(c.id)} title={t('common.delete')} style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: 24 }}>{t('calls.empty')}</td></tr>
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
              <h3 style={{ marginTop: 0 }}>{t('calls.callHash')}{detail.id} — {detail.place}</h3>
              <div style={{ display: 'flex', gap: 4 }}>
                {!editing && (
                  <button className="ghost" onClick={startEdit} title={t('common.edit')}><Pencil size={16} /></button>
                )}
                <button className="ghost" onClick={() => setDetail(null)}><X size={16} /></button>
              </div>
            </div>

            {editing ? (
              <form onSubmit={saveEdit} className="form-grid" style={{ marginTop: 12 }}>
                <div>
                  <label>{t('calls.place')}</label>
                  <input value={editForm.place} onChange={(e) => setEditForm({ ...editForm, place: e.target.value })} required />
                </div>
                <div>
                  <label>{t('calls.urgency')}</label>
                  <select value={editForm.urgency} onChange={(e) => setEditForm({ ...editForm, urgency: e.target.value })}>
                    <option value="not_urgent">{t('calls.notUrgent')}</option>
                    <option value="urgent">{t('calls.urgent')}</option>
                  </select>
                </div>
                <div>
                  <label>{t('calls.contactName')}</label>
                  <input value={editForm.contactName} onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })} required />
                </div>
                <div>
                  <label>{t('calls.contactPosition')}</label>
                  <input value={editForm.contactPosition} onChange={(e) => setEditForm({ ...editForm, contactPosition: e.target.value })} />
                </div>
                <div>
                  <label>{t('calls.contactPhone')}</label>
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
                    {t('calls.unusualDamage')}
                  </label>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label>{t('calls.description')}</label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={3}
                    style={{ width: '100%' }}
                  />
                </div>
                <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                  <button type="button" className="ghost" onClick={() => setEditing(false)}>{t('common.cancel')}</button>
                  <button type="submit"><Save size={15} /> {t('calls.saveChanges')}</button>
                </div>
              </form>
            ) : (
              <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{detail.description}</p>
            )}

            <h4>{t('calls.statusLog')}</h4>
            <p style={{ fontSize: 13 }}>
              {t('calls.currently')} <strong>{STATUS_LABEL[detail.status]}</strong>
              {detail.statusChangedBy && <> — <Trans i18nKey="calls.lastChangedBy" values={{ user: detail.statusChangedBy.username }} />{detail.statusChangedAt ? ` ${t('calls.at')} ${new Date(detail.statusChangedAt).toLocaleString()}` : ''}</>}
            </p>

            <h4>{t('calls.workingSessions')}</h4>
            {detail.workingSessions.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{t('calls.noSessions')}</p>
            ) : (
              <ul style={{ fontSize: 13, paddingLeft: 18 }}>
                {detail.workingSessions.map((s) => (
                  <li key={s.id}>
                    {s.userName}: {new Date(s.startedAt).toLocaleTimeString()} {s.endedAt ? `→ ${new Date(s.endedAt).toLocaleTimeString()}` : `(${t('calls.stillRunning')})`}
                  </li>
                ))}
              </ul>
            )}

            <h4>{t('calls.notes')} ({detail.notes.length})</h4>
            <ul style={{ fontSize: 13, paddingLeft: 18 }}>
              {detail.notes.map((n) => (
                <li key={n.id}>{n.text || `(${t('calls.photo')})`} — {n.author?.username} · {new Date(n.createdAt).toLocaleString()}</li>
              ))}
            </ul>

            <h4>{t('calls.attachments')} ({detail.attachments.length})</h4>
            <ul style={{ fontSize: 13, paddingLeft: 18 }}>
              {detail.attachments.map((a) => (
                <li key={a.id}>{a.originalName} — {a.uploadedBy?.username} · {new Date(a.createdAt).toLocaleString()}</li>
              ))}
            </ul>

            <div className="form-actions" style={{ marginTop: 16 }}>
              <button onClick={() => removeCall(detail.id)} style={{ background: 'var(--danger)' }}>
                <Trash2 size={15} /> {t('calls.deleteThisCall')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
