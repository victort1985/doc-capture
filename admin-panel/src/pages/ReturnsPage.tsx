import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Building2, Plus, X } from 'lucide-react';
import { apiFetch, apiFetchBlob } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface ReturnRow {
  id: number;
  returnNumber?: string;
  date?: string;
  clientName: string;
  deliveryNoteId: number;
  reason: string;
  items: { name: string; quantity: number; notes?: string }[];
  createdAt: string;
}
interface Org { id: number; name: string; }
interface NoteOption { id: number; noteNumber?: string; clientName?: string; clientEmail?: string; items?: { name: string; quantity: number; notes?: string }[]; }

export default function ReturnsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperAdmin = user?.organizationId == null;
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selOrgId, setSelOrgId] = useState<number | null>(null);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (isSuperAdmin) {
      apiFetch<Org[]>('/organizations').then(os => { setOrgs(os); if (os.length) setSelOrgId(os[0].id); }).catch(() => {});
    }
  }, [isSuperAdmin]);

  async function load() {
    setLoading(true); setError(null);
    try {
      setReturns(await apiFetch<ReturnRow[]>('/returns'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load returns');
    } finally { setLoading(false); }
  }
  useEffect(() => { if (!isSuperAdmin || selOrgId) load(); }, [selOrgId]);

  async function viewPdf(id: number) {
    try {
      const url = await apiFetchBlob(`/returns/${id}/pdf`);
      window.open(url, '_blank');
    } catch (e) {
      alert(e instanceof Error ? e.message : t('returns.noPdf'));
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('returns.eyebrow')}</div><h1>{t('returns.title')}</h1></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isSuperAdmin && orgs.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Building2 size={15} style={{ color: 'var(--ink-soft)' }} />
              <select value={selOrgId ?? ''} onChange={(e) => setSelOrgId(Number(e.target.value))} style={{ minWidth: 160 }}>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          <button type="button" onClick={() => setShowCreate(true)}><Plus size={15} /> {t('returns.create')}</button>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16, padding: '10px 16px', background: 'var(--surface-muted)', fontSize: 13 }}>
        {t('returns.legalNotice')}
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>{t('returns.number')}</th>
              <th style={{ padding: '8px 12px' }}>{t('returns.client')}</th>
              <th style={{ padding: '8px 12px' }}>{t('returns.reason')}</th>
              <th style={{ padding: '8px 12px' }}>{t('returns.deliveryNote')}</th>
              <th style={{ padding: '8px 12px' }}>{t('returns.items')}</th>
              <th style={{ padding: '8px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {returns.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                <td style={{ padding: '8px 12px' }}>{r.returnNumber || `#${r.id}`}</td>
                <td style={{ padding: '8px 12px' }}>{r.clientName}</td>
                <td style={{ padding: '8px 12px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.reason}>{r.reason}</td>
                <td style={{ padding: '8px 12px' }}>#{r.deliveryNoteId}</td>
                <td style={{ padding: '8px 12px' }}>{r.items?.length ?? 0}</td>
                <td style={{ padding: '8px 12px' }}>
                  <button type="button" onClick={() => viewPdf(r.id)} title={t('returns.viewPdf')}><FileText size={15} /></button>
                </td>
              </tr>
            ))}
            {returns.length === 0 && !loading && (
              <tr><td colSpan={6} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('returns.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateReturnModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function CreateReturnModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [noteQuery, setNoteQuery] = useState('');
  const [notes, setNotes] = useState<NoteOption[]>([]);
  const [selectedNote, setSelectedNote] = useState<NoteOption | null>(null);
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<{ name: string; quantity: number; notes: string }[]>([{ name: '', quantity: 1, notes: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<NoteOption[]>('/delivery-notes').then(setNotes).catch(() => {});
  }, []);

  const filteredNotes = notes.filter((n) =>
    !noteQuery ||
    (n.noteNumber ?? '').toLowerCase().includes(noteQuery.toLowerCase()) ||
    (n.clientName ?? '').toLowerCase().includes(noteQuery.toLowerCase()));

  function selectNote(n: NoteOption) {
    setSelectedNote(n);
    // Prefill from the note's own items as a starting point — the
    // person adjusts quantities down to however much actually came back.
    if (n.items?.length) {
      setItems(n.items.map((i) => ({ name: i.name, quantity: i.quantity, notes: '' })));
    }
  }

  async function submit() {
    if (!selectedNote || !reason.trim() || items.length === 0) return;
    setSaving(true); setError(null);
    try {
      await apiFetch('/returns', {
        method: 'POST',
        body: JSON.stringify({
          deliveryNoteId: selectedNote.id,
          clientName: selectedNote.clientName ?? '',
          clientEmail: selectedNote.clientEmail,
          reason: reason.trim(),
          items: items.filter((i) => i.name.trim()),
        }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create return');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div className="card" style={{ width: 520, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{t('returns.createTitle')}</h2>
          <button className="ghost" onClick={onClose}><X size={16} /></button>
        </div>

        {!selectedNote ? (
          <>
            <label>{t('returns.pickNoteLabel')}</label>
            <input type="text" value={noteQuery} onChange={e => setNoteQuery(e.target.value)} placeholder={t('returns.searchPlaceholder')} style={{ width: '100%', marginBottom: 10 }} />
            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8 }}>
              {filteredNotes.map((n) => (
                <div key={n.id} onClick={() => selectNote(n)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                  {n.noteNumber ?? `#${n.id}`} · {n.clientName ?? ''}
                </div>
              ))}
              {filteredNotes.length === 0 && <div style={{ padding: 12, color: 'var(--ink-soft)' }}>{t('returns.noNotesFound')}</div>}
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 10, fontSize: 13.5 }}>
              {t('returns.returning')}: <b>{selectedNote.noteNumber ?? `#${selectedNote.id}`}</b> · {selectedNote.clientName}
              <button className="ghost" style={{ marginInlineStart: 8 }} onClick={() => setSelectedNote(null)}>{t('returns.changeNote')}</button>
            </div>
            <label>{t('returns.reasonLabel')}</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} style={{ width: '100%', marginBottom: 10 }} placeholder={t('returns.reasonPlaceholder')} />

            {items.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input type="text" value={item.name} onChange={e => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, name: e.target.value } : it))} placeholder={t('returns.itemName')} style={{ flex: 2 }} />
                <input type="number" value={item.quantity} onChange={e => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, quantity: Number(e.target.value) } : it))} style={{ width: 70 }} />
                <input type="text" value={item.notes} onChange={e => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, notes: e.target.value } : it))} placeholder={t('returns.itemNotes')} style={{ flex: 1 }} />
              </div>
            ))}
            <button type="button" className="ghost" onClick={() => setItems(prev => [...prev, { name: '', quantity: 1, notes: '' }])} style={{ marginBottom: 12 }}>
              + {t('returns.addItem')}
            </button>

            {error && <div className="error-banner" style={{ marginBottom: 10 }}>{error}</div>}
            <button type="button" disabled={saving || !reason.trim() || items.filter(i => i.name.trim()).length === 0} onClick={submit} style={{ width: '100%' }}>
              {saving ? t('common.saving') : t('returns.submit')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
