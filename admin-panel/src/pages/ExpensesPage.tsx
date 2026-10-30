import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, CheckCircle2, Upload, Paperclip } from 'lucide-react';
import { apiFetch, BASE_URL, getToken } from '../services/api';
import BankBranchPicker, { BankNamePicker } from '../components/BankBranchPicker';

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
          <BankBranchPicker
            bankName={details.bankName ?? ''}
            branchNumber={details.branchNumber ?? ''}
            onChange={({ bankName, branchNumber }) => set({ bankName, branchNumber })}
          />
          <input placeholder={t('payments.accountNumber')} value={details.accountNumber ?? ''} onChange={(e) => set({ accountNumber: e.target.value })} />
          <input type="date" placeholder={t('payments.checkDate')} value={details.checkDate ?? ''} onChange={(e) => set({ checkDate: e.target.value })} />
        </div>
      )}
      {method === 'bank_transfer' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <BankNamePicker bankName={details.bankName ?? ''} onChange={(bankName) => set({ bankName })} />
          <input placeholder={t('payments.referenceNumber')} value={details.referenceNumber ?? ''} onChange={(e) => set({ referenceNumber: e.target.value })} />
        </div>
      )}
      {(method === 'bit' || method === 'standing_order') && (
        <input placeholder={t('payments.referenceNumber')} value={details.referenceNumber ?? ''} onChange={(e) => set({ referenceNumber: e.target.value })} style={{ width: '100%', marginBottom: 10 }} />
      )}
    </>
  );
}

type Conf = 'high' | 'low';
interface ScanFields {
  language: string; vendorName: string | null; brandName?: string | null; vendorTaxId: string | null; documentType: string | null; documentNumber: string | null;
  allocationNumber: string | null; transactionDate: string | null; total: number | null; vatAmount: number | null; vatRate: number | null;
  currency: string | null; paymentMethod: string | null; cardLast4: string | null; cardType: string | null; approvalNumber: string | null;
  installments: number | null; categoryCode: string | null; confidence: Record<string, Conf>;
}
interface ScanResponse { fields: ScanFields; cropped: boolean; warnings: string[]; ocrLanguages: string[]; rawText: string; scanImage: string | null; }

function CreateExpenseModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [date, setDate] = useState('');
  const [dateTouched, setDateTouched] = useState(false);
  const [transactionDate, setTransactionDate] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [vatAmount, setVatAmount] = useState('');
  const [vatTouched, setVatTouched] = useState(false);
  const [vatRate, setVatRate] = useState('18');
  const [vatDeductible, setVatDeductible] = useState('100');
  const [vendorName, setVendorName] = useState('');
  const [vendorTaxId, setVendorTaxId] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [allocationNumber, setAllocationNumber] = useState('');
  const [currency, setCurrency] = useState('ILS');
  const [foreignAmount, setForeignAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [method, setMethod] = useState<PayMethod>('cash');
  const [details, setDetails] = useState<PayMethodDetails>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [auto, setAuto] = useState<Record<string, Conf>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [costCenters, setCostCenters] = useState<{ id: number; name: string }[]>([]);
  const [costCenterId, setCostCenterId] = useState('');

  useEffect(() => { apiFetch<{ id: number; name: string }[]>('/cost-centers').then(setCostCenters).catch(() => {}); }, []);

  const foreign = currency !== 'ILS';
  const amountIls = foreign ? Math.round(Number(foreignAmount) * Number(exchangeRate) * 100) / 100 : Number(amount);
  const amountValid = Number.isFinite(amountIls) && amountIls > 0;

  // amount is always VAT-inclusive (matches a real receipt's printed total — see
  // Expense.vatAmount's backend doc comment). Until the person edits the VAT field
  // themselves, keep it in sync assuming the chosen rate.
  function syncVat(total: number, rate = Number(vatRate)) {
    if (!vatTouched && total > 0 && rate > 0) setVatAmount((Math.round((total * rate / (100 + rate)) * 100) / 100).toString());
    else if (!vatTouched && !(total > 0)) setVatAmount('');
  }
  function handleAmountChange(v: string) { setAmount(v); syncVat(Number(v)); markEdited('total'); }
  function markEdited(name: string) { setAuto(a => { if (!(name in a)) return a; const n = { ...a }; delete n[name]; return n; }); }

  // visual cue for scanner-filled fields: yellow = less certain, green edge = confident
  function cue(name: string): React.CSSProperties {
    const c = auto[name];
    if (c === 'low') return { background: 'rgba(250, 204, 21, 0.18)', borderColor: '#d9a400' };
    if (c === 'high') return { borderInlineStartWidth: 3, borderInlineStartColor: '#2e9e5b' };
    return {};
  }
  const fieldStyle = (name: string, extra: React.CSSProperties = {}): React.CSSProperties => ({ width: '100%', marginBottom: 10, ...cue(name), ...extra });

  function applyScan(res: ScanResponse) {
    const f = res.fields;
    const a: Record<string, Conf> = {};
    const mark = (name: string, v: unknown, c?: Conf) => { if (v != null && v !== '') a[name] = c ?? 'high'; };
    const conf = f.confidence ?? {};
    // store (trade) name -> vendor field; registered legal name -> description
    const storeName = f.brandName || f.vendorName;
    if (storeName) { setVendorName(storeName); mark('vendorName', storeName, f.brandName ? conf.brandName : conf.vendorName); }
    if (f.vendorName) { setDescription(prev => prev.trim() ? prev : f.vendorName!); mark('description', f.vendorName, conf.vendorName); }
    if (f.vendorTaxId) { setVendorTaxId(f.vendorTaxId); mark('vendorTaxId', f.vendorTaxId, conf.vendorTaxId); }
    if (f.documentType) { setDocumentType(f.documentType); mark('documentType', f.documentType, conf.documentType); }
    if (f.documentNumber) { setDocumentNumber(f.documentNumber); mark('documentNumber', f.documentNumber, conf.documentNumber); }
    if (f.allocationNumber) { setAllocationNumber(f.allocationNumber); mark('allocationNumber', f.allocationNumber, conf.allocationNumber); }
    if (f.transactionDate) {
      setTransactionDate(f.transactionDate); mark('transactionDate', f.transactionDate, conf.transactionDate);
      if (!dateTouched) setDate(f.transactionDate);
    }
    const cur = f.currency && /^[A-Z]{3}$/.test(f.currency) ? f.currency : 'ILS';
    setCurrency(cur); if (f.currency) mark('currency', cur, conf.currency);
    let totalForVat = 0;
    if (f.total != null) {
      if (cur === 'ILS') { setAmount(String(f.total)); setForeignAmount(''); totalForVat = f.total; }
      else { setForeignAmount(String(f.total)); setAmount(''); mark('foreignAmount', f.total, conf.total); }
      mark('total', f.total, conf.total);
    }
    if (f.vatRate != null) { setVatRate(String(f.vatRate)); mark('vatRate', f.vatRate, conf.vatRate); }
    if (f.vatAmount != null) { setVatAmount(String(f.vatAmount)); setVatTouched(true); mark('vatAmount', f.vatAmount, conf.vatAmount); }
    else { setVatTouched(false); if (totalForVat > 0) setVatAmount(String(Math.round((totalForVat * (f.vatRate ?? 18) / (100 + (f.vatRate ?? 18))) * 100) / 100)); }
    if (f.paymentMethod) { setMethod(f.paymentMethod as PayMethod); mark('method', f.paymentMethod, conf.paymentMethod); }
    setDetails(d => ({
      ...d,
      ...(f.cardLast4 ? { cardLast4: f.cardLast4 } : {}), ...(f.cardType ? { cardType: f.cardType } : {}),
      ...(f.approvalNumber ? { approvalNumber: f.approvalNumber } : {}), ...(f.installments ? { installments: String(f.installments) } : {}),
    }));
    if (f.categoryCode) { setCategory(prev => prev.trim() ? prev : t(`expenses.category_${f.categoryCode}`)); mark('category', f.categoryCode, 'low'); }
    setAuto(a);
    setConfirmed(false);
  }

  /** Sends the photo/PDF to the scanner (POST /expenses/scan): the server crops,
   * straightens and cleans it, detects the language, reads it and returns the fields. */
  async function handleFileSelect(file: File) {
    setReceiptFile(file);
    setParsing(true); setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${BASE_URL}/expenses/scan`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: formData });
      if (!res.ok) throw new Error('Scan failed');
      const data: ScanResponse = await res.json();
      setScan(data);
      applyScan(data);
    } catch (e) {
      console.warn('Receipt scan failed:', e);
      setScan(null);
      setError(t('expenses.scanFailed'));
    } finally { setParsing(false); }
  }

  async function submit() {
    setSaving(true); setError(null);
    try {
      if (foreign && !(Number(exchangeRate) > 0)) throw new Error(t('expenses.exchangeRate'));
      const res = await apiFetch<{ id: number }>('/expenses', {
        method: 'POST',
        body: JSON.stringify({
          date: date || transactionDate || undefined, transactionDate: transactionDate || undefined,
          description, category: category || undefined, amount: amountIls, method,
          vatAmount: vatAmount ? Number(vatAmount) : undefined,
          vatRate: vatRate ? Number(vatRate) : undefined,
          vatDeductiblePercent: vatDeductible !== '100' ? Number(vatDeductible) : undefined,
          vendorName: vendorName || undefined, vendorTaxId: vendorTaxId || undefined,
          documentType: documentType || undefined, documentNumber: documentNumber || undefined, allocationNumber: allocationNumber || undefined,
          currency: foreign ? currency : undefined, foreignAmount: foreign ? Number(foreignAmount) : undefined, exchangeRate: foreign ? Number(exchangeRate) : undefined,
          scanLanguage: scan?.fields.language || undefined,
          costCenterId: costCenterId ? Number(costCenterId) : undefined,
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
      // store the cleaned scan (falls back to the original upload) in the Expenses folder
      const formData = new FormData();
      if (scan?.scanImage) formData.append('file', await (await fetch(scan.scanImage)).blob(), 'receipt.jpg');
      else if (receiptFile) formData.append('file', receiptFile);
      if (formData.has('file')) {
        await fetch(`${BASE_URL}/expenses/${res.id}/receipt`, {
          method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: formData,
        }).catch(() => {}); // the expense itself is already saved — a failed receipt attach shouldn't block that
      }
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create expense');
    } finally { setSaving(false); }
  }

  const camRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const needsConfirm = !!scan;
  const docTypes = ['tax_invoice', 'tax_invoice_receipt', 'receipt', 'invoice', 'credit_note', 'cash_slip', 'other'];
  const row2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div className="card" style={{ width: scan ? 'min(980px, 96vw)' : 460, maxHeight: '94vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{t('expenses.newExpense')}</h2>
          <button className="ghost" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input ref={el => { camRef.current = el; }} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }} />
          <input ref={el => { fileRef.current = el; }} type="file" accept="image/*,.pdf" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }} />
          <button type="button" disabled={parsing} onClick={() => camRef.current?.click()} style={{ flex: 1 }}>{t('expenses.takePhoto')}</button>
          <button type="button" className="ghost" disabled={parsing} onClick={() => fileRef.current?.click()} style={{ flex: 1, border: '1px dashed var(--border)' }}>
            <Upload size={15} /> {scan ? t('expenses.retake') : t('expenses.chooseFile')}
          </button>
        </div>
        {parsing && <div style={{ marginBottom: 12, color: 'var(--muted)' }}>{t('expenses.scanningReceipt')}</div>}

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {scan && (
            <div style={{ flex: '1 1 300px', minWidth: 260, maxWidth: 420 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, fontSize: 13 }}>
                <span style={{ background: 'var(--surface-muted)', padding: '3px 8px', borderRadius: 6 }}>{t('expenses.scanLanguage')}: <b>{t(`expenses.lang_${scan.fields.language}`)}</b></span>
                <span style={{ background: 'var(--surface-muted)', padding: '3px 8px', borderRadius: 6 }}>{scan.cropped ? t('expenses.scanCropped') : t('expenses.scanNotCropped')}</span>
              </div>
              {scan.scanImage && <img src={scan.scanImage} alt={t('expenses.scanTitle')} style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />}
              {scan.warnings.length > 0 && <div className="error-banner" style={{ marginTop: 8, fontSize: 12 }}>{scan.warnings.join(' · ')}</div>}
              <button type="button" className="ghost" style={{ marginTop: 8 }} onClick={() => setShowRaw(v => !v)}>{t('expenses.recognizedText')}</button>
              {showRaw && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 220, overflow: 'auto', background: 'var(--surface-muted)', padding: 8, borderRadius: 6 }}>{scan.rawText}</pre>}
            </div>
          )}

          <div style={{ flex: '2 1 380px', minWidth: 300 }}>
            {scan && <div style={{ marginBottom: 10, fontSize: 13, color: 'var(--muted)' }}>{t('expenses.scanReviewNotice')}</div>}

            <div style={row2}>
              <div>
                <label>{t('expenses.transactionDate')}</label>
                <input type="date" value={transactionDate} style={fieldStyle('transactionDate')}
                  onChange={e => { setTransactionDate(e.target.value); markEdited('transactionDate'); if (!dateTouched) setDate(e.target.value); }} />
              </div>
              <div>
                <label>{t('expenses.date')}</label>
                <input type="date" value={date} title={t('expenses.dateHint')} style={fieldStyle('date')}
                  onChange={e => { setDate(e.target.value); setDateTouched(true); }} />
              </div>
            </div>
            <label>{t('expenses.vendorName')}</label>
            <input value={vendorName} onChange={e => { setVendorName(e.target.value); markEdited('vendorName'); }} style={fieldStyle('vendorName')} />
            <label>{t('expenses.description')}</label>
            <input value={description} onChange={e => { setDescription(e.target.value); markEdited('description'); }} style={fieldStyle('description')} />
            <label>{t('expenses.category')}</label>
            <input value={category} onChange={e => { setCategory(e.target.value); markEdited('category'); }} style={fieldStyle('category')} />

            <div style={row2}>
              <div>
                <label>{t('expenses.currency')}</label>
                <input value={currency} maxLength={3} onChange={e => { setCurrency(e.target.value.toUpperCase() || 'ILS'); markEdited('currency'); }} style={fieldStyle('currency')} />
              </div>
              <div>
                <label>{foreign ? t('expenses.foreignAmount') : t('expenses.amount')}</label>
                <input type="number" value={foreign ? foreignAmount : amount} style={fieldStyle(foreign ? 'foreignAmount' : 'total')}
                  onChange={e => { if (foreign) { setForeignAmount(e.target.value); markEdited('foreignAmount'); markEdited('total'); } else handleAmountChange(e.target.value); }} />
              </div>
            </div>
            {foreign && (
              <div style={row2}>
                <div>
                  <label>{t('expenses.exchangeRate')}</label>
                  <input type="number" step="0.0001" value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
                </div>
                <div>
                  <label>{t('expenses.amountIlsComputed')}</label>
                  <input readOnly value={amountValid ? String(amountIls) : ''} style={{ width: '100%', marginBottom: 10, opacity: 0.8 }} />
                </div>
              </div>
            )}

            <div style={row2}>
              <div>
                <label>{t('expenses.vatAmount')}</label>
                <input type="number" value={vatAmount} placeholder={t('expenses.vatAmountHint')} style={fieldStyle('vatAmount')}
                  onChange={e => { setVatTouched(true); setVatAmount(e.target.value); markEdited('vatAmount'); }} />
              </div>
              <div>
                <label>{t('expenses.vatRate')}</label>
                <input type="number" step="0.01" value={vatRate} style={fieldStyle('vatRate')}
                  onChange={e => { setVatRate(e.target.value); markEdited('vatRate'); syncVat(foreign ? 0 : Number(amount), Number(e.target.value)); }} />
              </div>
            </div>
            <label>{t('expenses.vatDeductible')}</label>
            <select value={vatDeductible} onChange={e => setVatDeductible(e.target.value)} style={{ width: '100%', marginBottom: 10 }}>
              <option value="100">{t('expenses.vatDeductibleFull')}</option>
              <option value="66.67">{t('expenses.vatDeductible2of3')}</option>
              <option value="25">{t('expenses.vatDeductibleQuarter')}</option>
              <option value="0">{t('expenses.vatDeductibleNone')}</option>
            </select>

            <div style={{ fontWeight: 600, margin: '6px 0' }}>{t('expenses.taxSection')}</div>
            <label>{t('expenses.vendorTaxId')}</label>
            <input value={vendorTaxId} onChange={e => { setVendorTaxId(e.target.value); markEdited('vendorTaxId'); }} style={fieldStyle('vendorTaxId')} />
            <div style={row2}>
              <div>
                <label>{t('expenses.documentType')}</label>
                <select value={documentType} onChange={e => { setDocumentType(e.target.value); markEdited('documentType'); }} style={fieldStyle('documentType')}>
                  <option value="">{t('expenses.docType_none')}</option>
                  {docTypes.map(d => <option key={d} value={d}>{t(`expenses.docType_${d}`)}</option>)}
                </select>
              </div>
              <div>
                <label>{t('expenses.documentNumber')}</label>
                <input value={documentNumber} onChange={e => { setDocumentNumber(e.target.value); markEdited('documentNumber'); }} style={fieldStyle('documentNumber')} />
              </div>
            </div>
            <label>{t('expenses.allocationNumber')}</label>
            <input value={allocationNumber} onChange={e => { setAllocationNumber(e.target.value); markEdited('allocationNumber'); }} style={fieldStyle('allocationNumber')} />

            {costCenters.length > 0 && (
              <>
                <label>{t('expenses.costCenter')}</label>
                <select value={costCenterId} onChange={e => setCostCenterId(e.target.value)} style={{ width: '100%', marginBottom: 10 }}>
                  <option value="">{t('expenses.costCenterNone')}</option>
                  {costCenters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </>
            )}
            <PaymentMethodFields method={method} setMethod={(m) => { setMethod(m); markEdited('method'); }} details={details} setDetails={setDetails} />
            {error && <div className="error-banner" style={{ marginBottom: 10 }}>{error}</div>}
            {needsConfirm && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ width: 'auto' }} />
                {t('expenses.confirmChecked')}
              </label>
            )}
            <button type="button" disabled={saving || parsing || !description.trim() || !amountValid || (needsConfirm && !confirmed)} onClick={submit} style={{ width: '100%' }}>
              {saving ? t('common.saving') : needsConfirm ? t('expenses.confirmAndSave') : t('expenses.submit')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface SupplierInvoiceInitialData { supplierName?: string; invoiceNumber?: string; }

export function CreateSupplierInvoiceModal({ onClose, onCreated, initialData }: { onClose: () => void; onCreated: () => void; initialData?: SupplierInvoiceInitialData }) {
  const { t } = useTranslation();
  const [supplierName, setSupplierName] = useState(initialData?.supplierName ?? '');
  const [invoiceNumber, setInvoiceNumber] = useState(initialData?.invoiceNumber ?? '');
  const [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [vatAmount, setVatAmount] = useState('');
  const [vatTouched, setVatTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  function handleAmountChange(v: string) {
    setAmount(v);
    if (!vatTouched) {
      const n = Number(v);
      setVatAmount(n > 0 ? (Math.round((n * 18 / 118) * 100) / 100).toString() : '');
    }
  }
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true); setError(null);
    try {
      await apiFetch('/supplier-invoices', {
        method: 'POST',
        body: JSON.stringify({ supplierName, invoiceNumber: invoiceNumber || undefined, dueDate: dueDate || undefined, amount: Number(amount), vatAmount: vatAmount ? Number(vatAmount) : undefined }),
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
        <input type="number" value={amount} onChange={e => handleAmountChange(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <label>{t('expenses.vatAmount')}</label>
        <input
          type="number"
          value={vatAmount}
          onChange={e => { setVatTouched(true); setVatAmount(e.target.value); }}
          placeholder={t('expenses.vatAmountHint')}
          style={{ width: '100%', marginBottom: 12 }}
        />
        {error && <div className="error-banner" style={{ marginBottom: 10 }}>{error}</div>}
        <button type="button" disabled={saving || !supplierName.trim() || !amount} onClick={submit} style={{ width: '100%' }}>
          {saving ? t('common.saving') : t('expenses.submit')}
        </button>
      </div>
    </div>
  );
}
