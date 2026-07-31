import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, CheckCircle2, Upload, Paperclip } from 'lucide-react';
import { apiFetch, BASE_URL, getToken } from '../services/api';

interface ExpenseRow { id: number; date: string; description: string; category?: string; amount: number; method: string; receiptStoragePath?: string | null; }
interface SupplierInvoiceRow { id: number; supplierName: string; invoiceNumber?: string; date: string; dueDate?: string; amount: number; paidAt?: string; storagePath?: string | null; }

export default function ExpensesPage() {
  const { t } = useTranslation();
  const methodLabel: Record<string, string> = {
    credit_card: t('payments.methodCreditCard'), cash: t('payments.methodCash'), bank_transfer: t('payments.methodBankTransfer'),
    check: t('payments.methodCheck'), bit: t('payments.methodBit'), standing_order: t('payments.methodStandingOrder'),
  };
  const [tab, setTab] = useState<'expenses' | 'supplier-invoices'>('expenses');
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoiceRow[]>([]);
  const [showCreateExpense, setShowCreateExpense] = useState(false);
  const [showCreateSupplierInvoice, setShowCreateSupplierInvoice] = useState(false);
  const [markPaidTarget, setMarkPaidTarget] = useState<number | null>(null);
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

  async function markPaid(id: number, method: PayMethod, details: PayMethodDetails) {
    try {
      await apiFetch(`/supplier-invoices/${id}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({
          method,
          cardLast4: details.cardLast4 || undefined,
          cardType: details.cardType || undefined,
          approvalNumber: details.approvalNumber || undefined,
          installments: details.installments ? Number(details.installments) : undefined,
          checkNumber: details.checkNumber || undefined,
          bankName: details.bankName || undefined,
          branchNumber: details.branchNumber || undefined,
          accountNumber: details.accountNumber || undefined,
          checkDate: details.checkDate || undefined,
          referenceNumber: details.referenceNumber || undefined,
        }),
      });
      setMarkPaidTarget(null);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to mark paid');
    }
  }

  async function attachFile(kind: 'expenses' | 'supplier-invoices', id: number, file: File) {
    const path = kind === 'expenses' ? `/expenses/${id}/receipt` : `/supplier-invoices/${id}/bill`;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: formData });
      if (!res.ok) throw new Error('Upload failed');
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to attach file');
    }
  }

  async function viewFile(kind: 'expenses' | 'supplier-invoices', id: number) {
    const path = kind === 'expenses' ? `/expenses/${id}/receipt` : `/supplier-invoices/${id}/bill`;
    try {
      const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error('Not found');
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to open file');
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
                <th style={{ padding: '8px 12px' }}>{t('expenses.receipt')}</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                  <td style={{ padding: '8px 12px' }}>{e.date}</td>
                  <td style={{ padding: '8px 12px' }}>{e.description}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--ink-soft)' }}>{e.category ?? ''}</td>
                  <td style={{ padding: '8px 12px' }}>{methodLabel[e.method] ?? e.method}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 700 }}>₪{Number(e.amount).toFixed(2)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {e.receiptStoragePath && (
                      <button type="button" className="ghost" onClick={() => viewFile('expenses', e.id)} title={t('expenses.viewReceipt')} style={{ marginInlineEnd: 6 }}>
                        <Paperclip size={15} />
                      </button>
                    )}
                    <label className="ghost" style={{ cursor: 'pointer', display: 'inline-flex', padding: '4px 8px' }}>
                      <Upload size={14} />
                      <input type="file" style={{ display: 'none' }} onChange={(ev) => { const f = ev.target.files?.[0]; if (f) attachFile('expenses', e.id, f); ev.target.value = ''; }} />
                    </label>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && <tr><td colSpan={6} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('expenses.noExpenses')}</td></tr>}
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
                      <button type="button" className="ghost" onClick={() => setMarkPaidTarget(si.id)} title={t('expenses.markPaid')} style={{ marginInlineEnd: 6 }}>
                        <CheckCircle2 size={15} />
                      </button>
                    )}
                    {si.storagePath && (
                      <button type="button" className="ghost" onClick={() => viewFile('supplier-invoices', si.id)} title={t('expenses.viewBill')} style={{ marginInlineEnd: 6 }}>
                        <Paperclip size={15} />
                      </button>
                    )}
                    <label className="ghost" style={{ cursor: 'pointer', display: 'inline-flex', padding: '4px 8px' }}>
                      <Upload size={14} />
                      <input type="file" style={{ display: 'none' }} onChange={(ev) => { const f = ev.target.files?.[0]; if (f) attachFile('supplier-invoices', si.id, f); ev.target.value = ''; }} />
                    </label>
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
      {markPaidTarget != null && (
        <MarkPaidModal
          onClose={() => setMarkPaidTarget(null)}
          onConfirm={(method, details) => markPaid(markPaidTarget, method, details)}
        />
      )}
    </div>
  );
}

function MarkPaidModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (method: PayMethod, details: PayMethodDetails) => void }) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<PayMethod>('cash');
  const [details, setDetails] = useState<PayMethodDetails>({});

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div className="card" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{t('expenses.markPaid')}</h2>
          <button className="ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <PaymentMethodFields method={method} setMethod={setMethod} details={details} setDetails={setDetails} />
        <button type="button" onClick={() => onConfirm(method, details)} style={{ width: '100%' }}>
          {t('expenses.markPaid')}
        </button>
      </div>
    </div>
  );
}
type PayMethod = 'cash' | 'credit_card' | 'bank_transfer' | 'check' | 'bit' | 'standing_order';

interface PayMethodDetails {
  cardLast4?: string; cardType?: string; approvalNumber?: string; installments?: string;
  checkNumber?: string; bankName?: string; branchNumber?: string; accountNumber?: string; checkDate?: string;
  referenceNumber?: string;
}

/** Shared method selector + conditional detail fields — same 6
 * methods and per-method fields as the mobile app's payment form,
 * reused here for expenses and supplier-invoice payments rather than
 * each screen inventing its own subset. */
function PaymentMethodFields({ method, setMethod, details, setDetails }: {
  method: PayMethod; setMethod: (m: PayMethod) => void;
  details: PayMethodDetails; setDetails: (d: PayMethodDetails) => void;
}) {
  const { t } = useTranslation();
  const set = (patch: Partial<PayMethodDetails>) => setDetails({ ...details, ...patch });

  return (
    <>
      <label>{t('expenses.method')}</label>
      <select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)} style={{ width: '100%', marginBottom: 10 }}>
        <option value="cash">{t('payments.methodCash')}</option>
        <option value="credit_card">{t('payments.methodCreditCard')}</option>
        <option value="bank_transfer">{t('payments.methodBankTransfer')}</option>
        <option value="check">{t('payments.methodCheck')}</option>
        <option value="bit">{t('payments.methodBit')}</option>
        <option value="standing_order">{t('payments.methodStandingOrder')}</option>
      </select>

      {method === 'credit_card' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <input placeholder={t('payments.cardLast4')} value={details.cardLast4 ?? ''} onChange={(e) => set({ cardLast4: e.target.value })} maxLength={4} />
          <input placeholder={t('payments.cardType')} value={details.cardType ?? ''} onChange={(e) => set({ cardType: e.target.value })} />
          <input placeholder={t('payments.approvalNumber')} value={details.approvalNumber ?? ''} onChange={(e) => set({ approvalNumber: e.target.value })} />
          <input type="number" placeholder={t('payments.installments')} value={details.installments ?? ''} onChange={(e) => set({ installments: e.target.value })} />
        </div>
      )}
      {method === 'check' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <input placeholder={t('payments.checkNumber')} value={details.checkNumber ?? ''} onChange={(e) => set({ checkNumber: e.target.value })} />
          <input placeholder={t('payments.bankName')} value={details.bankName ?? ''} onChange={(e) => set({ bankName: e.target.value })} />
          <input placeholder={t('payments.branchNumber')} value={details.branchNumber ?? ''} onChange={(e) => set({ branchNumber: e.target.value })} />
          <input placeholder={t('payments.accountNumber')} value={details.accountNumber ?? ''} onChange={(e) => set({ accountNumber: e.target.value })} />
          <input type="date" placeholder={t('payments.checkDate')} value={details.checkDate ?? ''} onChange={(e) => set({ checkDate: e.target.value })} />
        </div>
      )}
      {method === 'bank_transfer' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <input placeholder={t('payments.bankName')} value={details.bankName ?? ''} onChange={(e) => set({ bankName: e.target.value })} />
          <input placeholder={t('payments.referenceNumber')} value={details.referenceNumber ?? ''} onChange={(e) => set({ referenceNumber: e.target.value })} />
        </div>
      )}
      {(method === 'bit' || method === 'standing_order') && (
        <input placeholder={t('payments.referenceNumber')} value={details.referenceNumber ?? ''} onChange={(e) => set({ referenceNumber: e.target.value })} style={{ width: '100%', marginBottom: 10 }} />
      )}
    </>
  );
}

function CreateExpenseModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayMethod>('cash');
  const [details, setDetails] = useState<PayMethodDetails>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true); setError(null);
    try {
      await apiFetch('/expenses', {
        method: 'POST',
        body: JSON.stringify({
          description, category: category || undefined, amount: Number(amount), method,
          cardLast4: details.cardLast4 || undefined,
          cardType: details.cardType || undefined,
          approvalNumber: details.approvalNumber || undefined,
          installments: details.installments ? Number(details.installments) : undefined,
          checkNumber: details.checkNumber || undefined,
          bankName: details.bankName || undefined,
          branchNumber: details.branchNumber || undefined,
          accountNumber: details.accountNumber || undefined,
          checkDate: details.checkDate || undefined,
          referenceNumber: details.referenceNumber || undefined,
        }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create expense');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div className="card" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
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
        <PaymentMethodFields method={method} setMethod={setMethod} details={details} setDetails={setDetails} />
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
