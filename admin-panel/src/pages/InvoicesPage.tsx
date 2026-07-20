import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, RefreshCw, Send, CheckCircle2, FileText } from 'lucide-react';
import { apiFetch, apiFetchBlob } from '../services/api';
import { useAuth } from '../context/AuthContext';
import DocumentPreviewThumbnail from '../components/DocumentPreviewThumbnail';

interface InvoiceItem { description: string; quantity: number; unitPrice: number; }
interface InvoiceRow {
  id: number;
  invoiceNumber?: string;
  date?: string;
  clientName: string;
  clientEmail?: string;
  items: InvoiceItem[];
  total: number;
  status: 'draft' | 'sent' | 'paid' | 'cancelled';
  createdAt: string;
}

const statusColor: Record<string, string> = {
  draft: 'var(--ink-soft)', sent: 'var(--primary)', paid: 'green', cancelled: 'var(--danger, crimson)',
};

export default function InvoicesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [template, setTemplate] = useState('classic');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const statusLabel: Record<string, string> = {
    draft: t('invoices.statusDraft'), sent: t('invoices.statusSent'), paid: t('invoices.statusPaid'), cancelled: t('invoices.statusCancelled'),
  };

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setInvoices(await apiFetch<InvoiceRow[]>('/invoices'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!user?.organizationId) return;
    apiFetch<{ template?: string }>(`/invoice-settings/${user.organizationId}`).then(s => setTemplate(s?.template ?? 'classic')).catch(() => {});
  }, [user?.organizationId]);

  async function send(id: number) {
    await apiFetch(`/invoices/${id}/send`, { method: 'POST' });
    load();
  }
  async function viewPdf(id: number) {
    const url = await apiFetchBlob(`/invoices/${id}/pdf`);
    if (url) window.open(url, '_blank');
    else alert(t('invoices.noPdf'));
  }
  async function markPaid(id: number) {
    await apiFetch(`/invoices/${id}/mark-paid`, { method: 'POST' });
    load();
  }
  async function remove(id: number, name: string) {
    if (!confirm(t('invoices.deleteConfirm', { name }))) return;
    await apiFetch(`/invoices/${id}`, { method: 'DELETE' });
    setInvoices((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('invoices.eyebrow')}</div><h1>{t('invoices.title')}</h1></div>
        <button type="button" onClick={load} disabled={loading}><RefreshCw size={15} /> {loading ? t('invoices.loading') : t('invoices.refresh')}</button>
      </div>
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
                <td style={{ padding: '8px 12px' }}>₪{Number(inv.total).toFixed(2)}</td>
                <td style={{ padding: '8px 12px', color: statusColor[inv.status] }}>{statusLabel[inv.status]}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => viewPdf(inv.id)} title={t('invoices.viewPdf')} style={{ marginRight: 8 }}><FileText size={15} /></button>
                  {inv.status === 'draft' && (
                    <button type="button" onClick={() => send(inv.id)} title={t('invoices.markSent')} style={{ marginRight: 8 }}><Send size={15} /></button>
                  )}
                  {(inv.status === 'draft' || inv.status === 'sent') && (
                    <button type="button" onClick={() => markPaid(inv.id)} title={t('invoices.markPaid')} style={{ marginRight: 8, color: 'green' }}><CheckCircle2 size={15} /></button>
                  )}
                  <button type="button" onClick={() => remove(inv.id, inv.clientName)} title={t('invoices.delete')} style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && !loading && (
              <tr><td colSpan={6} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('invoices.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
