import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, FileText, Building2, CreditCard, Banknote, ArrowLeftRight, Receipt, Smartphone, Repeat, ShieldCheck, PackageOpen, Settings, Plus, X } from 'lucide-react';
import { apiFetch, apiFetchBlob } from '../services/api';
import { useAuth } from '../context/AuthContext';
import SettingsModal from '../components/SettingsModal';
import PaymentSettingsPage from './PaymentSettingsPage';
import BankBranchPicker, { BankNamePicker } from '../components/BankBranchPicker';

interface PaymentRow {
  id: number;
  paymentNumber?: string;
  date?: string;
  clientName: string;
  amount: number;
  method: 'cash' | 'credit_card' | 'bank_transfer' | 'check' | 'bit' | 'standing_order';
  invoiceId?: number;
  chainSummaryPath?: string | null;
  createdAt: string;
}
interface Org { id: number; name: string; }
type PayMethod = PaymentRow['method'];
interface PayMethodDetails {
  cardLast4?: string; cardType?: string; approvalNumber?: string; installments?: string;
  checkNumber?: string; bankName?: string; branchNumber?: string; accountNumber?: string; checkDate?: string; referenceNumber?: string;
}

const methodIcon: Record<string, JSX.Element> = {
  credit_card: <CreditCard size={15} />, cash: <Banknote size={15} />, bank_transfer: <ArrowLeftRight size={15} />,
  check: <Receipt size={15} />, bit: <Smartphone size={15} />, standing_order: <Repeat size={15} />,
};

function PaymentMethodFields({ method, setMethod, details, setDetails }: {
  method: PayMethod; setMethod: (m: PayMethod) => void;
  details: PayMethodDetails; setDetails: (d: PayMethodDetails) => void;
}) {
  const { t } = useTranslation();
  const set = (patch: Partial<PayMethodDetails>) => setDetails({ ...details, ...patch });

  return (
    <>
      <label>{t('payments.method')}</label>
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

function CreatePaymentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [clientName, setClientName] = useState('');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayMethod>('cash');
  const [details, setDetails] = useState<PayMethodDetails>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true); setError(null);
    try {
      await apiFetch('/payments', {
        method: 'POST',
        body: JSON.stringify({
          clientName, date: date || undefined, amount: Number(amount), method, notes: notes || undefined,
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
      setError(e instanceof Error ? e.message : 'Failed to create payment');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div className="card" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{t('payments.newPayment')}</h2>
          <button className="ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <label>{t('payments.client')}</label>
        <input value={clientName} onChange={e => setClientName(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <label>{t('payments.date')}</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <label>{t('payments.amount')}</label>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <PaymentMethodFields method={method} setMethod={setMethod} details={details} setDetails={setDetails} />
        <label>{t('payments.notes')}</label>
        <input value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', marginBottom: 14 }} />
        {error && <div className="error-banner" style={{ marginBottom: 10 }}>{error}</div>}
        <button type="button" disabled={saving || !clientName.trim() || !amount} onClick={submit} style={{ width: '100%' }}>
          {saving ? t('common.saving') : t('payments.submit')}
        </button>
      </div>
    </div>
  );
}

export default function PaymentsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperAdmin = user?.organizationId == null;
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selOrgId, setSelOrgId] = useState<number | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const methodLabel: Record<string, string> = {
    credit_card: t('payments.methodCreditCard'), cash: t('payments.methodCash'), bank_transfer: t('payments.methodBankTransfer'),
    check: t('payments.methodCheck'), bit: t('payments.methodBit'), standing_order: t('payments.methodStandingOrder'),
  };

  useEffect(() => {
    if (isSuperAdmin) {
      apiFetch<Org[]>('/organizations').then(os => { setOrgs(os); if (os.length) setSelOrgId(os[0].id); }).catch(() => {});
    } else if (user?.organizationId) {
      setSelOrgId(user.organizationId);
    }
  }, [isSuperAdmin, user?.organizationId]);

  async function load() {
    setLoading(true); setError(null);
    try {
      const qs = isSuperAdmin && selOrgId ? `?orgId=${selOrgId}` : '';
      setPayments(await apiFetch<PaymentRow[]>(`/payments${qs}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payments');
    } finally { setLoading(false); }
  }
  useEffect(() => { if (!isSuperAdmin || selOrgId) load(); }, [selOrgId]);

  async function viewPdf(id: number) {
    try {
      const url = await apiFetchBlob(`/payments/${id}/pdf`);
      window.open(url, '_blank');
    } catch (e) {
      alert(e instanceof Error ? e.message : t('payments.noPdf'));
    }
  }
  async function viewCopyPdf(id: number) {
    try {
      const url = await apiFetchBlob(`/payments/${id}/pdf?copy=true`);
      window.open(url, '_blank');
    } catch (e) {
      alert(e instanceof Error ? e.message : t('payments.noPdf'));
    }
  }
  async function viewSummaryPdf(id: number) {
    try {
      const url = await apiFetchBlob(`/payments/${id}/chain-summary-pdf`);
      window.open(url, '_blank');
    } catch (e) {
      alert(e instanceof Error ? e.message : t('payments.summaryUnavailable'));
    }
  }
  async function regeneratePdf(id: number) {
    try {
      await apiFetch(`/payments/${id}/regenerate-pdf`, { method: 'POST' });
      alert(t('payments.regenerated'));
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to regenerate PDF');
    }
  }
  // Payments cannot be deleted once recorded (see
  // PaymentsService.remove() on the backend, which now hard-blocks
  // deletion regardless).

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('payments.eyebrow')}</div><h1>{t('payments.title')}</h1></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isSuperAdmin && orgs.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Building2 size={15} style={{ color: 'var(--ink-soft)' }} />
              <select value={selOrgId ?? ''} onChange={(e) => setSelOrgId(Number(e.target.value))} style={{ minWidth: 160 }}>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          <button type="button" onClick={() => setShowCreate(true)}><Plus size={15} /> {t('payments.newPayment')}</button>
          <button type="button" onClick={load} disabled={loading}><RefreshCw size={15} /> {loading ? t('payments.loading') : t('payments.refresh')}</button>
          <button type="button" className="ghost" onClick={() => setShowSettings(true)} title={t('documentSeries.numbering')}><Settings size={15} /></button>
        </div>
      </div>
      {showCreate && (
        <CreatePaymentModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
      )}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)}>
          <PaymentSettingsPage />
        </SettingsModal>
      )}
      <div className="card" style={{ marginBottom: 16, padding: '10px 16px', background: 'var(--surface-muted)', fontSize: 13 }}>
        {t('payments.simulatorDisclaimer')}
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>{t('payments.client')}</th>
              <th style={{ padding: '8px 12px' }}>{t('payments.number')}</th>
              <th style={{ padding: '8px 12px' }}>{t('payments.amount')}</th>
              <th style={{ padding: '8px 12px' }}>{t('payments.method')}</th>
              <th style={{ padding: '8px 12px' }}>{t('payments.date')}</th>
              <th style={{ padding: '8px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                <td style={{ padding: '8px 12px' }}>{p.clientName}</td>
                <td style={{ padding: '8px 12px' }}>{p.paymentNumber || `#${p.id}`}</td>
                <td style={{ padding: '8px 12px', fontWeight: 700 }}>₪{Number(p.amount).toFixed(2)}</td>
                <td style={{ padding: '8px 12px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{methodIcon[p.method]} {methodLabel[p.method]}</span></td>
                <td style={{ padding: '8px 12px' }}>{p.date}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => viewPdf(p.id)} title={t('payments.viewPdf')} style={{ marginRight: 8 }}><FileText size={15} /></button>
                  <button type="button" onClick={() => viewCopyPdf(p.id)} title={t('payments.viewCopy')} style={{ marginRight: 8 }}><ShieldCheck size={15} /></button>
                  {p.chainSummaryPath && (
                    <button type="button" onClick={() => viewSummaryPdf(p.id)} title={t('payments.viewSummary')} style={{ marginRight: 8 }}><PackageOpen size={15} /></button>
                  )}
                  <button type="button" onClick={() => regeneratePdf(p.id)} title={t('payments.regeneratePdf')} style={{ marginRight: 8 }}><RefreshCw size={15} /></button>
                </td>
              </tr>
            ))}
            {payments.length === 0 && !loading && (
              <tr><td colSpan={6} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('payments.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
