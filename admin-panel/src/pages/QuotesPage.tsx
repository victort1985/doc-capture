import { useEffect, useState } from 'react';
import { Trash2, RefreshCw, Send } from 'lucide-react';
import { apiFetch } from '../services/api';

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
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  async function remove(id: number, name: string) {
    if (!confirm(`Delete the quote for "${name}"? This cannot be undone.`)) return;
    await apiFetch(`/quotes/${id}`, { method: 'DELETE' });
    setQuotes((prev) => prev.filter((q) => q.id !== id));
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">OFFICE</div><h1>Quotes</h1></div>
        <button type="button" onClick={load} disabled={loading}><RefreshCw size={15} /> {loading ? 'Loading…' : 'Refresh'}</button>
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
            {quotes.map((q) => (
              <tr key={q.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                <td style={{ padding: '8px 12px' }}>{q.clientName}</td>
                <td style={{ padding: '8px 12px' }}>{q.quoteNumber || `#${q.id}`}</td>
                <td style={{ padding: '8px 12px' }}>₪{q.total.toFixed(2)}</td>
                <td style={{ padding: '8px 12px', color: statusColor[q.status] }}>{q.status}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  {q.status === 'draft' && (
                    <button type="button" onClick={() => send(q.id)} title="Mark sent" style={{ marginRight: 8 }}><Send size={15} /></button>
                  )}
                  <button type="button" onClick={() => remove(q.id, q.clientName)} title="Delete" style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
            {quotes.length === 0 && !loading && (
              <tr><td colSpan={5} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>No quotes yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
