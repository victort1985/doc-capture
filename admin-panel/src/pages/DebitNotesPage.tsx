import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Building2, Plus, X, Settings } from 'lucide-react';
import { apiFetch, apiFetchBlob } from '../services/api';
import { useAuth } from '../context/AuthContext';
import SettingsModal from '../components/SettingsModal';
import DebitNoteSettingsPage from './DebitNoteSettingsPage';

interface DebitNoteRow {
  id: number;
  creditNoteNumber?: string;
  date?: string;
  clientName: string;
  invoiceId: number;
  reason: string;
  total: number;
  createdAt: string;
}
interface Org { id: number; name: string; }
interface InvoiceOption { id: number; invoiceNumber?: string; clientName: string; clientEmail?: string; total: number; }

export default function DebitNotesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperAdmin = user?.organizationId == null;
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selOrgId, setSelOrgId] = useState<number | null>(null);
  const [notes, setNotes] = useState<DebitNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
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
      setNotes(await apiFetch<DebitNoteRow[]>('/debit-notes'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load credit notes');
    } finally { setLoading(false); }
  }
  useEffect(() => { if (!isSuperAdmin || selOrgId) load(); }, [selOrgId]);

  async function viewPdf(id: number) {
    try {
      const url = await apiFetchBlob(`/debit-notes/${id}/pdf`);
      window.open(url, '_blank');
    } catch (e) {
      alert(e instanceof Error ? e.message : t('debitNotes.noPdf'));
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('debitNotes.eyebrow')}</div><h1>{t('debitNotes.title')}</h1></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isSuperAdmin && orgs.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Building2 size={15} style={{ color: 'var(--ink-soft)' }} />
              <select value={selOrgId ?? ''} onChange={(e) => setSelOrgId(Number(e.target.value))} style={{ minWidth: 160 }}>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          <button type="button" onClick={() => setShowCreate(true)}><Plus size={15} /> {t('debitNotes.create')}</button>
          <button type="button" className="ghost" onClick={() => setShowSettings(true)} title={t('documentSeries.numbering')}><Settings size={15} /></button>
        </div>
      </div>
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)}>
          <DebitNoteSettingsPage />
        </SettingsModal>
      )}
      <div className="card" style={{ marginBottom: 16, padding: '10px 16px', background: 'var(--surface-muted)', fontSize: 13 }}>
        {t('debitNotes.legalNotice')}
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>{t('debitNotes.number')}</th>
              <th style={{ padding: '8px 12px' }}>{t('debitNotes.client')}</th>
              <th style={{ padding: '8px 12px' }}>{t('debitNotes.reason')}</th>
              <th style={{ padding: '8px 12px' }}>{t('debitNotes.invoice')}</th>
              <th style={{ padding: '8px 12px' }}>{t('debitNotes.total')}</th>
              <th style={{ padding: '8px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {notes.map((n) => (
              <tr key={n.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                <td style={{ padding: '8px 12px' }}>{n.creditNoteNumber || `#${n.id}`}</td>
                <td style={{ padding: '8px 12px' }}>{n.clientName}</td>
                <td style={{ padding: '8px 12px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={n.reason}>{n.reason}</td>
                <td style={{ padding: '8px 12px' }}>#{n.invoiceId}</td>
                <td style={{ padding: '8px 12px', fontWeight: 700 }}>₪{Number(n.total).toFixed(2)}</td>
                <td style={{ padding: '8px 12px' }}>
                  <button type="button" onClick={() => viewPdf(n.id)} title={t('debitNotes.viewPdf')}><FileText size={15} /></button>
                </td>
              </tr>
            ))}
            {notes.length === 0 && !loading && (
              <tr><td colSpan={6} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('debitNotes.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateDebitNoteModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function CreateDebitNoteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceOption | null>(null);
  const [reason, setReason] = useState('');
  const [items, setItems] = useState([{ description: '', quantity: 1, unitPrice: 0 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<InvoiceOption[]>('/invoices').then(setInvoices).catch(() => {});
  }, []);

  const filteredInvoices = invoices.filter((inv) =>
    !invoiceQuery ||
    (inv.invoiceNumber ?? '').toLowerCase().includes(invoiceQuery.toLowerCase()) ||
    inv.clientName.toLowerCase().includes(invoiceQuery.toLowerCase()));

  function selectInvoice(inv: InvoiceOption) {
    setSelectedInvoice(inv);
    setItems([{ description: t('debitNotes.defaultItemDescription', { number: inv.invoiceNumber ?? `#${inv.id}` }), quantity: 1, unitPrice: inv.total }]);
  }

  const total = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  async function submit() {
    if (!selectedInvoice || !reason.trim() || items.length === 0) return;
    setSaving(true); setError(null);
    try {
      await apiFetch('/debit-notes', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: selectedInvoice.id,
          clientName: selectedInvoice.clientName,
          clientEmail: selectedInvoice.clientEmail,
          reason: reason.trim(),
          items,
        }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create credit note');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div className="card" style={{ width: 520, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{t('debitNotes.createTitle')}</h2>
          <button className="ghost" onClick={onClose}><X size={16} /></button>
        </div>

        {!selectedInvoice ? (
          <>
            <label>{t('debitNotes.pickInvoiceLabel')}</label>
            <input type="text" value={invoiceQuery} onChange={e => setInvoiceQuery(e.target.value)} placeholder={t('debitNotes.searchPlaceholder')} style={{ width: '100%', marginBottom: 10 }} />
            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8 }}>
              {filteredInvoices.map((inv) => (
                <div key={inv.id} onClick={() => selectInvoice(inv)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                  {inv.invoiceNumber ?? `#${inv.id}`} · {inv.clientName} · ₪{inv.total.toFixed(2)}
                </div>
              ))}
              {filteredInvoices.length === 0 && <div style={{ padding: 12, color: 'var(--ink-soft)' }}>{t('debitNotes.noInvoicesFound')}</div>}
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 10, fontSize: 13.5 }}>
              {t('debitNotes.correcting')}: <b>{selectedInvoice.invoiceNumber ?? `#${selectedInvoice.id}`}</b> · {selectedInvoice.clientName} · ₪{selectedInvoice.total.toFixed(2)}
              <button className="ghost" style={{ marginInlineStart: 8 }} onClick={() => setSelectedInvoice(null)}>{t('debitNotes.changeInvoice')}</button>
            </div>
            <label>{t('debitNotes.reasonLabel')}</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} style={{ width: '100%', marginBottom: 10 }} placeholder={t('debitNotes.reasonPlaceholder')} />

            {items.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input type="text" value={item.description} onChange={e => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, description: e.target.value } : it))} placeholder={t('debitNotes.itemDescription')} style={{ flex: 2 }} />
                <input type="number" value={item.quantity} onChange={e => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, quantity: Number(e.target.value) } : it))} style={{ width: 60 }} />
                <input type="number" value={item.unitPrice} onChange={e => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, unitPrice: Number(e.target.value) } : it))} style={{ width: 90 }} />
              </div>
            ))}
            <button type="button" className="ghost" onClick={() => setItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0 }])} style={{ marginBottom: 12 }}>
              + {t('debitNotes.addItem')}
            </button>

            <div style={{ fontWeight: 700, marginBottom: 12 }}>{t('debitNotes.total')}: ₪{total.toFixed(2)}</div>
            {error && <div className="error-banner" style={{ marginBottom: 10 }}>{error}</div>}
            <button type="button" disabled={saving || !reason.trim() || total <= 0} onClick={submit} style={{ width: '100%' }}>
              {saving ? t('common.saving') : t('debitNotes.submit')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
