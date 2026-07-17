import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, RefreshCw, Send, FileText } from 'lucide-react';
import { apiFetch, apiFetchBlob } from '../services/api';

interface QuoteItem { description: string; quantity: number; unitPrice: number; }
interface QuoteRow {
  id: number;
  quoteNumber?: string;
  clientName: string;
  clientEmail?: string;
  items: QuoteItem[];
  total: number;
  status: 'draft' | 'sent' | 'approved' | 'declined';
  createdAt: string;
}

const statusColor: Record<string, string> = {
  draft: 'var(--ink-soft)', sent: 'var(--primary)', approved: 'green', declined: 'var(--danger, crimson)',
};

export default function QuotesPage() {
  const { t } = useTranslation();
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const statusLabel: Record<string, string> = {
    draft: t('quotes.statusDraft'), sent: t('quotes.statusSent'), approved: t('quotes.statusApproved'), declined: t('quotes.statusDeclined'),
  };

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setQuotes(await apiFetch<QuoteRow[]>('/quotes'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load quotes');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function send(id: number) {
    await apiFetch(`/quotes/${id}/send`, { method: 'POST' });
    load();
  }
  async function viewPdf(id: number) {
    const url = await apiFetchBlob(`/quotes/${id}/pdf`);
    if (url) window.open(url, '_blank');
    else alert(t('quotes.noPdf'));
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
        <button type="button" onClick={load} disabled={loading}><RefreshCw size={15} /> {loading ? t('quotes.loading') : t('quotes.refresh')}</button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
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
                <td style={{ padding: '8px 12px' }}>{q.clientName}</td>
                <td style={{ padding: '8px 12px' }}>{q.quoteNumber || `#${q.id}`}</td>
                <td style={{ padding: '8px 12px' }}>₪{q.total.toFixed(2)}</td>
                <td style={{ padding: '8px 12px', color: statusColor[q.status] }}>{statusLabel[q.status]}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => viewPdf(q.id)} title={t('quotes.viewPdf')} style={{ marginRight: 8 }}><FileText size={15} /></button>
                  {q.status === 'draft' && (
                    <button type="button" onClick={() => send(q.id)} title={t('quotes.markSent')} style={{ marginRight: 8 }}><Send size={15} /></button>
                  )}
                  <button type="button" onClick={() => remove(q.id, q.clientName)} title={t('quotes.delete')} style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
            {quotes.length === 0 && !loading && (
              <tr><td colSpan={5} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('quotes.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
