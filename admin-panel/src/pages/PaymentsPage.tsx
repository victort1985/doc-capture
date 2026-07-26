import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, RefreshCw, FileText, Building2, CreditCard, Banknote, ArrowLeftRight, Receipt, Smartphone, Repeat, ShieldCheck, PackageOpen, Settings } from 'lucide-react';
import { apiFetch, apiFetchBlob } from '../services/api';
import { useAuth } from '../context/AuthContext';
import SettingsModal from '../components/SettingsModal';
import PaymentSettingsPage from './PaymentSettingsPage';

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

const methodIcon: Record<string, JSX.Element> = {
  credit_card: <CreditCard size={15} />, cash: <Banknote size={15} />, bank_transfer: <ArrowLeftRight size={15} />,
  check: <Receipt size={15} />, bit: <Smartphone size={15} />, standing_order: <Repeat size={15} />,
};

export default function PaymentsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperAdmin = user?.organizationId == null;
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selOrgId, setSelOrgId] = useState<number | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
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
  async function remove(id: number, name: string) {
    if (!confirm(t('payments.deleteConfirm', { name }))) return;
    await apiFetch(`/payments/${id}`, { method: 'DELETE' });
    setPayments((prev) => prev.filter((p) => p.id !== id));
  }

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
          <button type="button" onClick={load} disabled={loading}><RefreshCw size={15} /> {loading ? t('payments.loading') : t('payments.refresh')}</button>
          <button type="button" className="ghost" onClick={() => setShowSettings(true)} title={t('documentSeries.numbering')}><Settings size={15} /></button>
        </div>
      </div>
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
                  <button type="button" onClick={() => remove(p.id, p.clientName)} title={t('payments.delete')} style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button>
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
