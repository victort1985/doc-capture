import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, RefreshCw, FileText, Building2, CreditCard, Banknote, ArrowLeftRight } from 'lucide-react';
import { apiFetch, apiFetchBlob } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface PaymentRow {
  id: number;
  paymentNumber?: string;
  date?: string;
  clientName: string;
  amount: number;
  method: 'card' | 'cash' | 'transfer';
  invoiceId?: number;
  createdAt: string;
}
interface Org { id: number; name: string; }

const methodIcon: Record<string, JSX.Element> = {
  card: <CreditCard size={15} />, cash: <Banknote size={15} />, transfer: <ArrowLeftRight size={15} />,
};

export default function PaymentsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperAdmin = user?.organizationId == null;
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selOrgId, setSelOrgId] = useState<number | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const methodLabel: Record<string, string> = {
    card: t('payments.methodCard'), cash: t('payments.methodCash'), transfer: t('payments.methodTransfer'),
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
        </div>
      </div>
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
