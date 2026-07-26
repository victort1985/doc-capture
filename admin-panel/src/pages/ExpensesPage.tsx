import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, CheckCircle2, Upload } from 'lucide-react';
import { apiFetch, BASE_URL, getToken } from '../services/api';

interface ExpenseRow { id: number; date: string; description: string; category?: string; amount: number; method: string; }
interface SupplierInvoiceRow { id: number; supplierName: string; invoiceNumber?: string; date: string; dueDate?: string; amount: number; paidAt?: string; }

export default function ExpensesPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'expenses' | 'supplier-invoices'>('expenses');
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoiceRow[]>([]);
  const [showCreateExpense, setShowCreateExpense] = useState(false);
  const [showCreateSupplierInvoice, setShowCreateSupplierInvoice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setExpenses(await apiFetch<ExpenseRow[]>('/expenses'));
      setSupplierInvoices(await apiFetch<SupplierInvoiceRow[]>('/supplier-invoices'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }
  useEffect(() => { load(); }, []);

  async function markPaid(id: number) {
    try {
      await apiFetch(`/supplier-invoices/${id}/mark-paid`, { method: 'POST', body: JSON.stringify({ method: 'bank' }) });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to mark paid');
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('expenses.eyebrow')}</div><h1>{t('expenses.title')}</h1></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label className="ghost" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Upload size={15} /> {t('expenses.importCsv')}
            <input
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const formData = new FormData();
                formData.append('file', file);
                const path = tab === 'expenses' ? '/expenses/import-csv' : '/supplier-invoices/import-csv';
                try {
                  const res = await fetch(`${BASE_URL}${path}`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${getToken()}` },
                    body: formData,
                  });
                  if (!res.ok) throw new Error('Import failed');
                  const result = await res.json() as { imported: number; failed: { row: number; error: string }[] };
                  const msg = result.failed.length
                    ? `${t('expenses.importedCount', { count: result.imported })}\n${t('expenses.failedCount', { count: result.failed.length })}:\n${result.failed.map(f => `#${f.row}: ${f.error}`).join('\n')}`
                    : t('expenses.importedCount', { count: result.imported });
                  alert(msg);
                  load();
                } catch (err) {
                  alert(err instanceof Error ? err.message : 'Import failed');
                }
                e.target.value = '';
              }}
            />
          </label>
          <button type="button" onClick={() => tab === 'expenses' ? setShowCreateExpense(true) : setShowCreateSupplierInvoice(true)}>
            <Plus size={15} /> {tab === 'expenses' ? t('expenses.newExpense') : t('expenses.newSupplierInvoice')}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['expenses', 'supplier-invoices'] as const).map((tKey) => (
          <button
            key={tKey}
            type="button"
            onClick={() => setTab(tKey)}
            style={{ background: tab === tKey ? 'var(--primary)' : 'var(--surface-muted)', color: tab === tKey ? '#fff' : 'var(--ink)', border: 'none' }}
          >
            {tKey === 'expenses' ? t('expenses.tabExpenses') : t('expenses.tabSupplierInvoices')}
          </button>
        ))}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {tab === 'expenses' && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
                <th style={{ padding: '8px 12px' }}>{t('expenses.date')}</th>
                <th style={{ padding: '8px 12px' }}>{t('expenses.description')}</th>
                <th style={{ padding: '8px 12px' }}>{t('expenses.category')}</th>
                <th style={{ padding: '8px 12px' }}>{t('expenses.method')}</th>
                <th style={{ padding: '8px 12px' }}>{t('expenses.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                  <td style={{ padding: '8px 12px' }}>{e.date}</td>
                  <td style={{ padding: '8px 12px' }}>{e.description}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--ink-soft)' }}>{e.category ?? ''}</td>
                  <td style={{ padding: '8px 12px' }}>{e.method === 'cash' ? t('expenses.cash') : t('expenses.bank')}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 700 }}>₪{Number(e.amount).toFixed(2)}</td>
                </tr>
              ))}
              {expenses.length === 0 && <tr><td colSpan={5} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('expenses.noExpenses')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'supplier-invoices' && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
                <th style={{ padding: '8px 12px' }}>{t('expenses.supplier')}</th>
                <th style={{ padding: '8px 12px' }}>{t('expenses.invoiceNumber')}</th>
                <th style={{ padding: '8px 12px' }}>{t('expenses.date')}</th>
                <th style={{ padding: '8px 12px' }}>{t('expenses.dueDate')}</th>
                <th style={{ padding: '8px 12px' }}>{t('expenses.amount')}</th>
                <th style={{ padding: '8px 12px' }}>{t('expenses.status')}</th>
                <th style={{ padding: '8px 12px' }}></th>
              </tr>
            </thead>
            <tbody>
              {supplierInvoices.map((si) => (
                <tr key={si.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                  <td style={{ padding: '8px 12px' }}>{si.supplierName}</td>
                  <td style={{ padding: '8px 12px' }}>{si.invoiceNumber ?? ''}</td>
                  <td style={{ padding: '8px 12px' }}>{si.date}</td>
                  <td style={{ padding: '8px 12px' }}>{si.dueDate ?? ''}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 700 }}>₪{Number(si.amount).toFixed(2)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {si.paidAt ? <span style={{ color: 'var(--success, green)' }}>{t('expenses.paid')}</span> : <span style={{ color: 'var(--danger, crimson)' }}>{t('expenses.unpaid')}</span>}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {!si.paidAt && (
                      <button type="button" className="ghost" onClick={() => markPaid(si.id)} title={t('expenses.markPaid')}>
                        <CheckCircle2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {supplierInvoices.length === 0 && <tr><td colSpan={7} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('expenses.noSupplierInvoices')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showCreateExpense && (
        <CreateExpenseModal onClose={() => setShowCreateExpense(false)} onCreated={() => { setShowCreateExpense(false); load(); }} />
      )}
      {showCreateSupplierInvoice && (
        <CreateSupplierInvoiceModal onClose={() => setShowCreateSupplierInvoice(false)} onCreated={() => { setShowCreateSupplierInvoice(false); load(); }} />
      )}
    </div>
  );
}

function CreateExpenseModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'bank'>('cash');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true); setError(null);
    try {
      await apiFetch('/expenses', { method: 'POST', body: JSON.stringify({ description, category: category || undefined, amount: Number(amount), method }) });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create expense');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div className="card" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{t('expenses.newExpense')}</h2>
          <button className="ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <label>{t('expenses.description')}</label>
        <input value={description} onChange={e => setDescription(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <label>{t('expenses.category')}</label>
        <input value={category} onChange={e => setCategory(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <label>{t('expenses.amount')}</label>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <label>{t('expenses.method')}</label>
        <select value={method} onChange={e => setMethod(e.target.value as 'cash' | 'bank')} style={{ width: '100%', marginBottom: 12 }}>
          <option value="cash">{t('expenses.cash')}</option>
          <option value="bank">{t('expenses.bank')}</option>
        </select>
        {error && <div className="error-banner" style={{ marginBottom: 10 }}>{error}</div>}
        <button type="button" disabled={saving || !description.trim() || !amount} onClick={submit} style={{ width: '100%' }}>
          {saving ? t('common.saving') : t('expenses.submit')}
        </button>
      </div>
    </div>
  );
}

function CreateSupplierInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true); setError(null);
    try {
      await apiFetch('/supplier-invoices', {
        method: 'POST',
        body: JSON.stringify({ supplierName, invoiceNumber: invoiceNumber || undefined, dueDate: dueDate || undefined, amount: Number(amount) }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create supplier invoice');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div className="card" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{t('expenses.newSupplierInvoice')}</h2>
          <button className="ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <label>{t('expenses.supplier')}</label>
        <input value={supplierName} onChange={e => setSupplierName(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <label>{t('expenses.invoiceNumber')}</label>
        <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <label>{t('expenses.dueDate')}</label>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <label>{t('expenses.amount')}</label>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
        {error && <div className="error-banner" style={{ marginBottom: 10 }}>{error}</div>}
        <button type="button" disabled={saving || !supplierName.trim() || !amount} onClick={submit} style={{ width: '100%' }}>
          {saving ? t('common.saving') : t('expenses.submit')}
        </button>
      </div>
    </div>
  );
}
