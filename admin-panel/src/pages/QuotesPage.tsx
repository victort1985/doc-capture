import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Send, FileText, Building2, Settings, Bookmark, BookmarkX, X, Plus } from 'lucide-react';
import { apiFetch, apiFetchBlob } from '../services/api';
import { useAuth } from '../context/AuthContext';
import DocumentPreviewThumbnail from '../components/DocumentPreviewThumbnail';
import SettingsModal from '../components/SettingsModal';
import QuoteSettingsPage from './QuoteSettingsPage';

interface QuoteItem { description: string; quantity: number; unitPrice: number; }
interface QuoteRow {
  id: number;
  quoteNumber?: string;
  date?: string;
  clientName: string;
  clientEmail?: string;
  items: QuoteItem[];
  total: number;
  status: 'draft' | 'sent' | 'approved' | 'declined';
  createdAt: string;
  isTemplate?: boolean;
  templateNumber?: number | null;
  templateName?: string | null;
}
interface Org { id: number; name: string; }

const statusColor: Record<string, string> = {
  draft: 'var(--ink-soft)', sent: 'var(--primary)', approved: 'green', declined: 'var(--danger, crimson)',
};

export default function QuotesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperAdmin = user?.organizationId == null;
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selOrgId, setSelOrgId] = useState<number | null>(null);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [view, setView] = useState<'quotes' | 'templates'>('quotes');
  const [saveTemplateFor, setSaveTemplateFor] = useState<QuoteRow | null>(null);
  const [template, setTemplate] = useState('classic');
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusLabel: Record<string, string> = {
    draft: t('quotes.statusDraft'), sent: t('quotes.statusSent'), approved: t('quotes.statusApproved'), declined: t('quotes.statusDeclined'),
  };

  // Super-admins pick which organization's quotes to look at; a
  // regular admin only ever has their own, so no picker needed —
  // GET /organizations is super-admin-only and 403s for anyone else.
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
      if (view === 'templates') {
        setQuotes(await apiFetch<QuoteRow[]>('/quotes/templates'));
      } else {
        const qs = isSuperAdmin && selOrgId ? `?orgId=${selOrgId}` : '';
        setQuotes(await apiFetch<QuoteRow[]>(`/quotes${qs}`));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load quotes');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { if (!isSuperAdmin || selOrgId) load(); }, [selOrgId, view]);
  useEffect(() => {
    if (!selOrgId) return;
    apiFetch<{ template?: string }>(`/quote-settings/${selOrgId}`).then(s => setTemplate(s?.template ?? 'classic')).catch(() => {});
  }, [selOrgId]);

  async function send(id: number) {
    await apiFetch(`/quotes/${id}/send`, { method: 'POST' });
    load();
  }
  async function viewPdf(id: number) {
    try {
      const url = await apiFetchBlob(`/quotes/${id}/pdf`);
      window.open(url, '_blank');
    } catch (e) {
      alert(e instanceof Error ? e.message : t('quotes.noPdf'));
    }
  }
  async function regeneratePdf(id: number) {
    try {
      await apiFetch(`/quotes/${id}/regenerate-pdf`, { method: 'POST' });
      alert(t('quotes.regenerated'));
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to regenerate PDF');
    }
  }
  // Quotes cannot be deleted once created — mark declined instead
  // (see QuotesService.remove() on the backend, which now
  // hard-blocks deletion regardless).
  async function submitSaveAsTemplate(name: string) {
    if (!saveTemplateFor) return;
    try {
      await apiFetch(`/quotes/${saveTemplateFor.id}/save-as-template`, { method: 'POST', body: JSON.stringify({ templateName: name }) });
      setSaveTemplateFor(null);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save as template');
    }
  }
  async function unmarkTemplate(id: number) {
    if (!confirm(t('quotes.unmarkTemplateConfirm'))) return;
    await apiFetch(`/quotes/${id}/unmark-template`, { method: 'POST' });
    setQuotes((prev) => prev.filter((q) => q.id !== id));
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('quotes.eyebrow')}</div><h1>{view === 'templates' ? t('quotes.templatesTitle') : t('quotes.title')}</h1></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button type="button" className={view === 'quotes' ? '' : 'ghost'} onClick={() => setView('quotes')}>{t('quotes.title')}</button>
          <button type="button" className={view === 'templates' ? '' : 'ghost'} onClick={() => setView('templates')}>{t('quotes.templatesTitle')}</button>
          {isSuperAdmin && orgs.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Building2 size={15} style={{ color: 'var(--ink-soft)' }} />
              <select value={selOrgId ?? ''} onChange={(e) => setSelOrgId(Number(e.target.value))} style={{ minWidth: 160 }}>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          <button type="button" onClick={() => setShowCreate(true)}><Plus size={15} /> {t('quotes.newQuote')}</button>
          <button type="button" onClick={load} disabled={loading}><RefreshCw size={15} /> {loading ? t('quotes.loading') : t('quotes.refresh')}</button>
          <button type="button" className="ghost" onClick={() => setShowSettings(true)} title={t('documentSeries.numbering')}><Settings size={15} /></button>
        </div>
      </div>
      {showCreate && (
        <CreateQuoteModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
      )}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)}>
          <QuoteSettingsPage />
        </SettingsModal>
      )}
      {error && <div className="error-banner">{error}</div>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>{t('quotes.preview')}</th>
              {view === 'templates' && <th style={{ padding: '8px 12px' }}>{t('quotes.templateNumber')}</th>}
              {view === 'templates' && <th style={{ padding: '8px 12px' }}>{t('quotes.templateName')}</th>}
              <th style={{ padding: '8px 12px' }}>{t('quotes.client')}</th>
              <th style={{ padding: '8px 12px' }}>{t('quotes.number')}</th>
              <th style={{ padding: '8px 12px' }}>{t('quotes.total')}</th>
              <th style={{ padding: '8px 12px' }}>{t('quotes.status')}</th>
              <th style={{ padding: '8px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                <td style={{ padding: '8px 12px' }}>
                  <DocumentPreviewThumbnail
                    docNumber={q.quoteNumber || `#${q.id}`}
                    clientName={q.clientName}
                    date={q.date}
                    items={q.items}
                    total={Number(q.total)}
                    template={template}
                    onClick={() => viewPdf(q.id)}
                  />
                </td>
                {view === 'templates' && <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>T-{String(q.templateNumber ?? '').padStart(5, '0')}</td>}
                {view === 'templates' && <td style={{ padding: '8px 12px', fontWeight: 600 }}>{q.templateName}</td>}
                <td style={{ padding: '8px 12px' }}>{q.clientName}</td>
                <td style={{ padding: '8px 12px' }}>{q.quoteNumber || `#${q.id}`}</td>
                <td style={{ padding: '8px 12px' }}>₪{Number(q.total).toFixed(2)}</td>
                <td style={{ padding: '8px 12px', color: statusColor[q.status] }}>{statusLabel[q.status]}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => viewPdf(q.id)} title={t('quotes.viewPdf')} style={{ marginRight: 8 }}><FileText size={15} /></button>
                  <button type="button" onClick={() => regeneratePdf(q.id)} title={t('quotes.regeneratePdf')} style={{ marginRight: 8 }}><RefreshCw size={15} /></button>
                  {view === 'quotes' && q.status === 'draft' && (
                    <button type="button" onClick={() => send(q.id)} title={t('quotes.markSent')} style={{ marginRight: 8 }}><Send size={15} /></button>
                  )}
                  {view === 'quotes' && (
                    <button type="button" onClick={() => setSaveTemplateFor(q)} title={t('quotes.saveAsTemplate')} style={{ marginRight: 8 }}><Bookmark size={15} /></button>
                  )}
                  {view === 'templates' && (
                    <button type="button" onClick={() => unmarkTemplate(q.id)} title={t('quotes.unmarkTemplate')} style={{ marginRight: 8 }}><BookmarkX size={15} /></button>
                  )}
                </td>
              </tr>
            ))}
            {quotes.length === 0 && !loading && (
              <tr><td colSpan={view === 'templates' ? 8 : 6} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{view === 'templates' ? t('quotes.templatesEmpty') : t('quotes.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {saveTemplateFor && (
        <SaveAsTemplateModal
          quote={saveTemplateFor}
          onClose={() => setSaveTemplateFor(null)}
          onSubmit={submitSaveAsTemplate}
        />
      )}
    </div>
  );
}

function SaveAsTemplateModal({ quote, onClose, onSubmit }: { quote: QuoteRow; onClose: () => void; onSubmit: (name: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(quote.templateName ?? '');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div className="card" style={{ width: 380, padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{t('quotes.saveAsTemplate')}</h2>
          <button className="ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 0 }}>{t('quotes.saveAsTemplateHint', { name: quote.clientName })}</p>
        <label>{t('quotes.templateName')}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', marginBottom: 14 }} autoFocus />
        <button type="button" disabled={!name.trim()} onClick={() => onSubmit(name.trim())} style={{ width: '100%' }}>
          {t('quotes.saveAsTemplate')}
        </button>
      </div>
    </div>
  );
}

/** Line-item editor shared shape (description/quantity/unitPrice) —
 * matches QuoteItem/InvoiceItem exactly, since both documents use the
 * identical line shape server-side (see CreateQuoteDto/CreateInvoiceDto). */
function ItemsEditor({ items, setItems, t }: {
  items: QuoteItem[]; setItems: (items: QuoteItem[]) => void; t: (key: string) => string;
}) {
  function setItem(i: number, patch: Partial<QuoteItem>) {
    setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  }
  const total = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);

  return (
    <div style={{ marginBottom: 10 }}>
      <label>{t('quotes.items')}</label>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
          <input value={item.description} onChange={e => setItem(i, { description: e.target.value })} placeholder={t('quotes.itemDescription')} style={{ flex: 2 }} />
          <input type="number" min={0} value={item.quantity} onChange={e => setItem(i, { quantity: Number(e.target.value) })} style={{ width: 60 }} />
          <input type="number" min={0} value={item.unitPrice} onChange={e => setItem(i, { unitPrice: Number(e.target.value) })} style={{ width: 80 }} />
          <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} disabled={items.length <= 1}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}><X size={14} /></button>
        </div>
      ))}
      <button type="button" onClick={() => setItems([...items, { description: '', quantity: 1, unitPrice: 0 }])} style={{ fontSize: 12, marginTop: 4 }}>
        + {t('quotes.addItem')}
      </button>
      <div style={{ textAlign: 'right', fontWeight: 700, marginTop: 8, fontSize: 14 }}>
        {t('quotes.total')}: ₪{total.toFixed(2)}
      </div>
    </div>
  );
}

function CreateQuoteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [date, setDate] = useState('');
  const [items, setItems] = useState<QuoteItem[]>([{ description: '', quantity: 1, unitPrice: 0 }]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validItems = items.filter(it => it.description.trim());

  async function submit() {
    setSaving(true); setError(null);
    try {
      await apiFetch('/quotes', {
        method: 'POST',
        body: JSON.stringify({
          clientName, clientEmail: clientEmail || undefined, date: date || undefined,
          items: validItems, notes: notes || undefined,
        }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create quote');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div className="card" style={{ width: 480, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{t('quotes.newQuote')}</h2>
          <button className="ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <label>{t('quotes.client')}</label>
        <input value={clientName} onChange={e => setClientName(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <label>{t('quotes.clientEmail')}</label>
        <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <label>{t('quotes.date')}</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <ItemsEditor items={items} setItems={setItems} t={t} />
        <label>{t('quotes.notes')}</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', minHeight: 50, marginBottom: 14 }} />
        {error && <div className="error-banner" style={{ marginBottom: 10 }}>{error}</div>}
        <button type="button" disabled={saving || !clientName.trim() || validItems.length === 0} onClick={submit} style={{ width: '100%' }}>
          {saving ? t('common.saving') : t('quotes.submit')}
        </button>
      </div>
    </div>
  );
}
