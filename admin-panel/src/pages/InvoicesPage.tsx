import { useEffect, useState } from 'react';
import { Trash2, RefreshCw, Send, CheckCircle2, FileText } from 'lucide-react';
import { apiFetch, apiFetchBlob } from '../services/api';

interface InvoiceItem { description: string; quantity: number; unitPrice: number; }
interface InvoiceRow {
  id: number;
  invoiceNumber?: string;
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
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  async function send(id: number) {
    await apiFetch(`/invoices/${id}/send`, { method: 'POST' });
    load();
  }
  async function viewPdf(id: number) {
    const url = await apiFetchBlob(`/invoices/${id}/pdf`);
    if (url) window.open(url, '_blank');
    else alert('No PDF available — check that a storage connection is configured in Invoice settings.');
  }
  async function markPaid(id: number) {
    await apiFetch(`/invoices/${id}/mark-paid`, { method: 'POST' });
    load();
  }
  async function remove(id: number, name: string) {
    if (!confirm(`Delete the invoice for "${name}"? This cannot be undone.`)) return;
    await apiFetch(`/invoices/${id}`, { method: 'DELETE' });
    setInvoices((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">OFFICE</div><h1>Invoices</h1></div>
        <button type="button" onClick={load} disabled={loading}><RefreshCw size={15} /> {loading ? 'Loading…' : 'Refresh'}</button>
      </div>
      <div className="card" style={{ marginBottom: 16, padding: '10px 16px', background: 'var(--surface-muted)', fontSize: 13 }}>
        Basic record-keeping — no payment gateway is connected yet, so "paid" is set manually. Not a certified tax invoice (חשבונית מס); confirm compliance with your accountant before relying on this as the official invoicing system.
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>Client</th>
              <th style={{ padding: '8px 12px' }}>Number</th>
              <th style={{ padding: '8px 12px' }}>Total</th>
              <th style={{ padding: '8px 12px' }}>Status</th>
              <th style={{ padding: '8px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                <td style={{ padding: '8px 12px' }}>{inv.clientName}</td>
                <td style={{ padding: '8px 12px' }}>{inv.invoiceNumber || `#${inv.id}`}</td>
                <td style={{ padding: '8px 12px' }}>₪{inv.total.toFixed(2)}</td>
                <td style={{ padding: '8px 12px', color: statusColor[inv.status] }}>{inv.status}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => viewPdf(inv.id)} title="View PDF" style={{ marginRight: 8 }}><FileText size={15} /></button>
                  {inv.status === 'draft' && (
                    <button type="button" onClick={() => send(inv.id)} title="Mark sent" style={{ marginRight: 8 }}><Send size={15} /></button>
                  )}
                  {(inv.status === 'draft' || inv.status === 'sent') && (
                    <button type="button" onClick={() => markPaid(inv.id)} title="Mark paid" style={{ marginRight: 8, color: 'green' }}><CheckCircle2 size={15} /></button>
                  )}
                  <button type="button" onClick={() => remove(inv.id, inv.clientName)} title="Delete" style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && !loading && (
              <tr><td colSpan={5} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>No invoices yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
