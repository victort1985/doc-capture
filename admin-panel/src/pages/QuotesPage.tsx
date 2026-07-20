import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, RefreshCw, Send, FileText, Building2 } from 'lucide-react';
import { apiFetch, apiFetchBlob } from '../services/api';
import { useAuth } from '../context/AuthContext';
import DocumentPreviewThumbnail from '../components/DocumentPreviewThumbnail';

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
  const [template, setTemplate] = useState('classic');
  const [loading, setLoading] = useState(true);
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
      const qs = isSuperAdmin && selOrgId ? `?orgId=${selOrgId}` : '';
      setQuotes(await apiFetch<QuoteRow[]>(`/quotes${qs}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load quotes');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { if (!isSuperAdmin || selOrgId) load(); }, [selOrgId]);
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
  async function remove(id: number, name: string) {
    if (!confirm(t('quotes.deleteConfirm', { name }))) return;
    await apiFetch(`/quotes/${id}`, { method: 'DELETE' });
    setQuotes((prev) => prev.filter((q) => q.id !== id));
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('quotes.eyebrow')}</div><h1>{t('quotes.title')}</h1></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isSuperAdmin && orgs.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Building2 size={15} style={{ color: 'var(--ink-soft)' }} />
              <select value={selOrgId ?? ''} onChange={(e) => setSelOrgId(Number(e.target.value))} style={{ minWidth: 160 }}>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          <button type="button" onClick={load} disabled={loading}><RefreshCw size={15} /> {loading ? t('quotes.loading') : t('quotes.refresh')}</button>
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>{t('quotes.preview')}</th>
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
                <td style={{ padding: '8px 12px' }}>{q.clientName}</td>
                <td style={{ padding: '8px 12px' }}>{q.quoteNumber || `#${q.id}`}</td>
                <td style={{ padding: '8px 12px' }}>₪{Number(q.total).toFixed(2)}</td>
                <td style={{ padding: '8px 12px', color: statusColor[q.status] }}>{statusLabel[q.status]}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => viewPdf(q.id)} title={t('quotes.viewPdf')} style={{ marginRight: 8 }}><FileText size={15} /></button>
                  <button type="button" onClick={() => regeneratePdf(q.id)} title={t('quotes.regeneratePdf')} style={{ marginRight: 8 }}><RefreshCw size={15} /></button>
                  {q.status === 'draft' && (
                    <button type="button" onClick={() => send(q.id)} title={t('quotes.markSent')} style={{ marginRight: 8 }}><Send size={15} /></button>
                  )}
                  <button type="button" onClick={() => remove(q.id, q.clientName)} title={t('quotes.delete')} style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
            {quotes.length === 0 && !loading && (
              <tr><td colSpan={6} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('quotes.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
