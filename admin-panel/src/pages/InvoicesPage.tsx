import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Send, CheckCircle2, FileText, Building2, Settings, Plus, X } from 'lucide-react';
import { apiFetch, apiFetchBlob } from '../services/api';
import { useAuth } from '../context/AuthContext';
import DocumentPreviewThumbnail from '../components/DocumentPreviewThumbnail';
import SettingsModal from '../components/SettingsModal';
import InvoiceSettingsPage from './InvoiceSettingsPage';

interface InvoiceItem { description: string; quantity: number; unitPrice: number; }
interface InvoiceRow {
  id: number;
  invoiceNumber?: string;
  date?: string;
  clientName: string;
  clientEmail?: string;
  clientTaxId?: string;
  items: InvoiceItem[];
  total: number;
  currency?: string;
  status: 'draft' | 'sent' | 'paid' | 'cancelled';
  allocationNumber?: string | null;
  allocationStatus?: 'not_applicable' | 'pending' | 'approved' | 'refused' | 'error';
  createdAt: string;
}
interface Org { id: number; name: string; }

const statusColor: Record<string, string> = {
  draft: 'var(--ink-soft)', sent: 'var(--primary)', paid: 'green', cancelled: 'var(--danger, crimson)',
};

export default function InvoicesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperAdmin = user?.organizationId == null;
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selOrgId, setSelOrgId] = useState<number | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [template, setTemplate] = useState('classic');
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisionInvoiceId, setDecisionInvoiceId] = useState<number | null>(null);
  const [submittingDecision, setSubmittingDecision] = useState(false);

  const statusLabel: Record<string, string> = {
    draft: t('invoices.statusDraft'), sent: t('invoices.statusSent'), paid: t('invoices.statusPaid'), cancelled: t('invoices.statusCancelled'),
  };

  useEffect(() => {
    if (isSuperAdmin) {
      apiFetch<Org[]>('/organizations').then(os => { setOrgs(os); if (os.length) setSelOrgId(os[0].id); }).catch(() => {});
    } else if (user?.organizationId) {
      setSelOrgId(user.organizationId);
    }
  }, [isSuperAdmin, user?.organizationId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = isSuperAdmin && selOrgId ? `?orgId=${selOrgId}` : '';
      setInvoices(await apiFetch<InvoiceRow[]>(`/invoices${qs}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { if (!isSuperAdmin || selOrgId) load(); }, [selOrgId]);
  useEffect(() => {
    if (!selOrgId) return;
    apiFetch<{ template?: string }>(`/invoice-settings/${selOrgId}`).then(s => setTemplate(s?.template ?? 'classic')).catch(() => {});
  }, [selOrgId]);

  async function send(id: number) {
    await apiFetch(`/invoices/${id}/send`, { method: 'POST' });
    load();
  }
  async function submitDecision(id: number, decision: 'cancel' | 'continue' | 'furtherObjection') {
    setSubmittingDecision(true);
    try {
      await apiFetch(`/invoices/${id}/allocation-decision`, { method: 'POST', body: JSON.stringify({ decision }) });
      setDecisionInvoiceId(null);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to submit decision');
    } finally {
      setSubmittingDecision(false);
    }
  }
  async function viewPdf(id: number) {
    try {
      const url = await apiFetchBlob(`/invoices/${id}/pdf`);
      window.open(url, '_blank');
    } catch (e) {
      alert(e instanceof Error ? e.message : t('invoices.noPdf'));
    }
  }
  async function regeneratePdf(id: number) {
    try {
      await apiFetch(`/invoices/${id}/regenerate-pdf`, { method: 'POST' });
      alert(t('invoices.regenerated'));
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to regenerate PDF');
    }
  }
  async function markPaid(id: number) {
    await apiFetch(`/invoices/${id}/mark-paid`, { method: 'POST' });
    load();
  }
  // Invoices cannot be deleted once issued — Israeli bookkeeping law
  // requires the record to stay in place (see InvoicesService.remove()
  // on the backend, which now hard-blocks this regardless). The
  // delete button itself was removed here to match — no point
  // showing a control that only ever produces an error.

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('invoices.eyebrow')}</div><h1>{t('invoices.title')}</h1></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isSuperAdmin && orgs.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Building2 size={15} style={{ color: 'var(--ink-soft)' }} />
              <select value={selOrgId ?? ''} onChange={(e) => setSelOrgId(Number(e.target.value))} style={{ minWidth: 160 }}>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          <button type="button" onClick={() => setShowCreate(true)}><Plus size={15} /> {t('invoices.newInvoice')}</button>
          <button type="button" onClick={load} disabled={loading}><RefreshCw size={15} /> {loading ? t('invoices.loading') : t('invoices.refresh')}</button>
          <button type="button" className="ghost" onClick={() => setShowSettings(true)} title={t('documentSeries.numbering')}><Settings size={15} /></button>
        </div>
      </div>
      {showCreate && (
        <CreateInvoiceModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
      )}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)}>
          <InvoiceSettingsPage />
        </SettingsModal>
      )}
      <div className="card" style={{ marginBottom: 16, padding: '10px 16px', background: 'var(--surface-muted)', fontSize: 13 }}>
        {t('invoices.disclaimer')}
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>{t('invoices.preview')}</th>
              <th style={{ padding: '8px 12px' }}>{t('invoices.client')}</th>
              <th style={{ padding: '8px 12px' }}>{t('invoices.number')}</th>
              <th style={{ padding: '8px 12px' }}>{t('invoices.total')}</th>
              <th style={{ padding: '8px 12px' }}>{t('invoices.status')}</th>
              <th style={{ padding: '8px 12px' }}>{t('invoices.allocation')}</th>
              <th style={{ padding: '8px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                <td style={{ padding: '8px 12px' }}>
                  <DocumentPreviewThumbnail
                    docNumber={inv.invoiceNumber || `#${inv.id}`}
                    clientName={inv.clientName}
                    date={inv.date}
                    items={inv.items}
                    total={Number(inv.total)}
                    template={template}
                    onClick={() => viewPdf(inv.id)}
                  />
                </td>
                <td style={{ padding: '8px 12px' }}>{inv.clientName}</td>
                <td style={{ padding: '8px 12px' }}>{inv.invoiceNumber || `#${inv.id}`}</td>
                <td style={{ padding: '8px 12px' }}>
                  {inv.currency && inv.currency !== 'ILS' ? `${inv.currency} ${Number(inv.total).toFixed(2)}` : `₪${Number(inv.total).toFixed(2)}`}
                </td>
                <td style={{ padding: '8px 12px', color: statusColor[inv.status] }}>{statusLabel[inv.status]}</td>
                <td style={{ padding: '8px 12px', fontSize: 12.5 }}>
                  {inv.allocationStatus === 'approved' && inv.allocationNumber && (
                    <span style={{ color: 'var(--success, green)', fontFamily: 'monospace' }}>{inv.allocationNumber}</span>
                  )}
                  {inv.allocationStatus === 'pending' && <span style={{ color: 'var(--ink-soft)' }}>{t('invoices.allocationPending')}</span>}
                  {inv.allocationStatus === 'refused' && (
                    <span style={{ color: 'var(--danger, crimson)', fontWeight: 700 }}>
                      {t('invoices.allocationRefused')}{' '}
                      <button type="button" className="ghost" onClick={() => setDecisionInvoiceId(inv.id)} style={{ padding: '2px 6px', fontSize: 12 }}>
                        {t('invoices.decide')}
                      </button>
                    </span>
                  )}
                  {inv.allocationStatus === 'error' && <span style={{ color: 'var(--danger, crimson)' }}>{t('invoices.allocationError')}</span>}
                  {(!inv.allocationStatus || inv.allocationStatus === 'not_applicable') && <span style={{ color: 'var(--ink-soft)' }}>—</span>}
                </td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => viewPdf(inv.id)} title={t('invoices.viewPdf')} style={{ marginRight: 8 }}><FileText size={15} /></button>
                  <button type="button" onClick={() => regeneratePdf(inv.id)} title={t('invoices.regeneratePdf')} style={{ marginRight: 8 }}><RefreshCw size={15} /></button>
                  {inv.status === 'draft' && (
                    <button type="button" onClick={() => send(inv.id)} title={t('invoices.markSent')} style={{ marginRight: 8 }}><Send size={15} /></button>
                  )}
                  {(inv.status === 'draft' || inv.status === 'sent') && (
                    <button type="button" onClick={() => markPaid(inv.id)} title={t('invoices.markPaid')} style={{ marginRight: 8, color: 'green' }}><CheckCircle2 size={15} /></button>
                  )}
                </td>
              </tr>
            ))}
            {invoices.length === 0 && !loading && (
              <tr><td colSpan={7} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('invoices.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {decisionInvoiceId != null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => setDecisionInvoiceId(null)}>
          <div className="card" style={{ width: 440, padding: 20 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>{t('invoices.decideTitle')}</h2>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{t('invoices.decideHint')}</p>
            <button type="button" disabled={submittingDecision} onClick={() => submitDecision(decisionInvoiceId, 'continue')} style={{ width: '100%', marginBottom: 8 }}>
              {t('invoices.decisionContinue')}
            </button>
            <button type="button" className="ghost" disabled={submittingDecision} onClick={() => submitDecision(decisionInvoiceId, 'furtherObjection')} style={{ width: '100%', marginBottom: 8 }}>
              {t('invoices.decisionHearing')}
            </button>
            <button type="button" className="ghost" disabled={submittingDecision} onClick={() => submitDecision(decisionInvoiceId, 'cancel')} style={{ width: '100%', color: 'var(--danger, crimson)' }}>
              {t('invoices.decisionCancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InvoiceItemsEditor({ items, setItems, t }: {
  items: InvoiceItem[]; setItems: (items: InvoiceItem[]) => void; t: (key: string) => string;
}) {
  function setItem(i: number, patch: Partial<InvoiceItem>) {
    setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  }
  const total = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);

  return (
    <div style={{ marginBottom: 10 }}>
      <label>{t('invoices.items')}</label>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
          <input value={item.description} onChange={e => setItem(i, { description: e.target.value })} placeholder={t('invoices.itemDescription')} style={{ flex: 2 }} />
          <input type="number" min={0} value={item.quantity} onChange={e => setItem(i, { quantity: Number(e.target.value) })} style={{ width: 60 }} />
          <input type="number" min={0} value={item.unitPrice} onChange={e => setItem(i, { unitPrice: Number(e.target.value) })} style={{ width: 80 }} />
          <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} disabled={items.length <= 1}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}><X size={14} /></button>
        </div>
      ))}
      <button type="button" onClick={() => setItems([...items, { description: '', quantity: 1, unitPrice: 0 }])} style={{ fontSize: 12, marginTop: 4 }}>
        + {t('invoices.addItem')}
      </button>
      <div style={{ textAlign: 'right', fontWeight: 700, marginTop: 8, fontSize: 14 }}>
        {t('invoices.total')}: ₪{total.toFixed(2)}
      </div>
    </div>
  );
}

export interface InvoiceInitialData {
  clientName: string;
  clientEmail?: string;
  items: InvoiceItem[];
  quoteId?: number;
  deliveryNoteId?: number;
}

export function CreateInvoiceModal({ onClose, onCreated, initialData }: { onClose: () => void; onCreated: () => void; initialData?: InvoiceInitialData }) {
  const { t } = useTranslation();
  const [clientName, setClientName] = useState(initialData?.clientName ?? '');
  const [clientEmail, setClientEmail] = useState(initialData?.clientEmail ?? '');
  const [clientTaxId, setClientTaxId] = useState('');
  const [date, setDate] = useState('');
  const [vatCategory, setVatCategory] = useState<'standard' | 'zero' | 'exempt'>('standard');
  const [items, setItems] = useState<InvoiceItem[]>(initialData?.items?.length ? initialData.items.map(it => ({ ...it })) : [{ description: '', quantity: 1, unitPrice: 0 }]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validItems = items.filter(it => it.description.trim());

  async function submit() {
    setSaving(true); setError(null);
    try {
      await apiFetch('/invoices', {
        method: 'POST',
        body: JSON.stringify({
          clientName, clientEmail: clientEmail || undefined, clientTaxId: clientTaxId || undefined,
          date: date || undefined, vatCategory, items: validItems, notes: notes || undefined,
          quoteId: initialData?.quoteId,
          deliveryNoteId: initialData?.deliveryNoteId,
        }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create invoice');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div className="card" style={{ width: 480, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{t('invoices.newInvoice')}</h2>
          <button className="ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <label>{t('invoices.client')}</label>
        <input value={clientName} onChange={e => setClientName(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <label>{t('invoices.clientEmail')}</label>
        <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <label>{t('invoices.clientTaxId')}</label>
        <input value={clientTaxId} onChange={e => setClientTaxId(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <label>{t('invoices.date')}</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <label>{t('invoices.vatCategory')}</label>
        <select value={vatCategory} onChange={e => setVatCategory(e.target.value as any)} style={{ width: '100%', marginBottom: 10 }}>
          <option value="standard">{t('invoices.vatStandard')}</option>
          <option value="zero">{t('invoices.vatZero')}</option>
          <option value="exempt">{t('invoices.vatExempt')}</option>
        </select>
        <InvoiceItemsEditor items={items} setItems={setItems} t={t} />
        <label>{t('invoices.notes')}</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', minHeight: 50, marginBottom: 14 }} />
        {error && <div className="error-banner" style={{ marginBottom: 10 }}>{error}</div>}
        <button type="button" disabled={saving || !clientName.trim() || validItems.length === 0} onClick={submit} style={{ width: '100%' }}>
          {saving ? t('common.saving') : t('invoices.submit')}
        </button>
      </div>
    </div>
  );
}
