import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, TrendingUp, Receipt, CreditCard, AlertTriangle, Calendar, Download } from 'lucide-react';
import { apiFetch, apiFetchBlob } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface Org { id: number; name: string; }
interface ReportData {
  period: { from: string; to: string };
  vatEnabled: boolean;
  revenue: { subtotal: number; vat: number; total: number };
  payments: { total: number; count: number; byMethod: Record<string, { count: number; total: number }> };
  outstandingInvoices: { count: number; total: number };
  documentCounts: { quotes: number; invoices: number; payments: number };
}
interface AgingBucket { count: number; total: number; invoices: { id: number; invoiceNumber?: string; clientName: string; date?: string; total: number }[]; }
interface AgingData {
  current: AgingBucket; days31to60: AgingBucket; days61to90: AgingBucket; days91to120: AgingBucket; over120: AgingBucket;
  totalOutstanding: number;
}

type PeriodPreset = 'month' | 'quarter' | 'half-year' | 'year' | 'custom';

function pad(n: number) { return String(n).padStart(2, '0'); }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function computeRange(preset: PeriodPreset): { from: string; to: string } {
  const now = new Date();
  const to = toDateStr(now);
  switch (preset) {
    case 'month':
      return { from: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), to };
    case 'quarter': {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      return { from: toDateStr(new Date(now.getFullYear(), qStartMonth, 1)), to };
    }
    case 'half-year': {
      const hStartMonth = now.getMonth() < 6 ? 0 : 6;
      return { from: toDateStr(new Date(now.getFullYear(), hStartMonth, 1)), to };
    }
    case 'year':
      return { from: toDateStr(new Date(now.getFullYear(), 0, 1)), to };
    default:
      return { from: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  }
}

const methodLabels: Record<string, string> = {
  cash: 'methodCash', credit_card: 'methodCreditCard', bank_transfer: 'methodBankTransfer',
  check: 'methodCheck', bit: 'methodBit', standing_order: 'methodStandingOrder',
};

export default function FinancialReportsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperAdmin = user?.organizationId == null;
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selOrgId, setSelOrgId] = useState<number | null>(null);
  const [preset, setPreset] = useState<PeriodPreset>('month');
  const [from, setFrom] = useState(computeRange('month').from);
  const [to, setTo] = useState(computeRange('month').to);
  const [data, setData] = useState<ReportData | null>(null);
  const [aging, setAging] = useState<AgingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isSuperAdmin) {
      apiFetch<Org[]>('/organizations').then(os => { setOrgs(os); if (os.length) setSelOrgId(os[0].id); }).catch(() => {});
    }
  }, [isSuperAdmin]);

  function selectPreset(p: PeriodPreset) {
    setPreset(p);
    if (p !== 'custom') {
      const r = computeRange(p);
      setFrom(r.from); setTo(r.to);
    }
  }

  async function load() {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams({ from, to });
      const orgQs = new URLSearchParams();
      if (isSuperAdmin && selOrgId) { qs.set('orgId', String(selOrgId)); orgQs.set('orgId', String(selOrgId)); }
      setData(await apiFetch<ReportData>(`/financial-reports?${qs.toString()}`));
      setAging(await apiFetch<AgingData>(`/financial-reports/aging?${orgQs.toString()}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report');
    } finally { setLoading(false); }
  }

  useEffect(() => { if (!isSuperAdmin || selOrgId) load(); }, [selOrgId, from, to]);

  const presets: { key: PeriodPreset; labelKey: string }[] = [
    { key: 'month', labelKey: 'periodMonth' },
    { key: 'quarter', labelKey: 'periodQuarter' },
    { key: 'half-year', labelKey: 'periodHalfYear' },
    { key: 'year', labelKey: 'periodYear' },
    { key: 'custom', labelKey: 'periodCustom' },
  ];

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('financialReports.eyebrow')}</div><h1>{t('financialReports.title')}</h1></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isSuperAdmin && orgs.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Building2 size={15} style={{ color: 'var(--ink-soft)' }} />
              <select value={selOrgId ?? ''} onChange={(e) => setSelOrgId(Number(e.target.value))} style={{ minWidth: 160 }}>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          <button type="button" className="ghost" onClick={async () => {
            const qs = new URLSearchParams({ from, to });
            if (isSuperAdmin && selOrgId) qs.set('orgId', String(selOrgId));
            try {
              const url = await apiFetchBlob(`/financial-reports/export.csv?${qs.toString()}`);
              const a = document.createElement('a');
              a.href = url; a.download = `invoices_${from}_${to}.csv`;
              a.click();
            } catch (e) {
              alert(e instanceof Error ? e.message : 'Export failed');
            }
          }}>
            <Download size={15} /> {t('financialReports.exportCsv')}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => selectPreset(p.key)}
              style={{
                background: preset === p.key ? 'var(--primary)' : 'var(--surface-muted)',
                color: preset === p.key ? '#fff' : 'var(--ink)',
                border: 'none',
              }}
            >
              {t(`financialReports.${p.labelKey}`)}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Calendar size={15} style={{ color: 'var(--ink-soft)' }} />
            <label style={{ fontSize: 13 }}>{t('financialReports.from')}</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <label style={{ fontSize: 13 }}>{t('financialReports.to')}</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        )}
        {preset !== 'custom' && (
          <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: 0 }}>{from} — {to}</p>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading && <p>{t('financialReports.loading')}</p>}

      {data && !loading && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--primary)' }}>
                <TrendingUp size={18} />
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{t('financialReports.revenue')}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>₪{data.revenue.total.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                {t('financialReports.subtotal')}: ₪{data.revenue.subtotal.toLocaleString()}
                {data.vatEnabled && <> · {t('financialReports.vat')}: ₪{data.revenue.vat.toLocaleString()}</>}
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--success, green)' }}>
                <CreditCard size={18} />
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{t('financialReports.paymentsReceived')}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>₪{data.payments.total.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>{data.payments.count} {t('financialReports.paymentsCount')}</div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--danger, crimson)' }}>
                <AlertTriangle size={18} />
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{t('financialReports.outstanding')}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>₪{data.outstandingInvoices.total.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>{data.outstandingInvoices.count} {t('financialReports.outstandingCount')}</div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--ink-soft)' }}>
                <Receipt size={18} />
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{t('financialReports.documents')}</span>
              </div>
              <div style={{ fontSize: 13 }}>{t('financialReports.quotes')}: <b>{data.documentCounts.quotes}</b></div>
              <div style={{ fontSize: 13 }}>{t('financialReports.invoices')}: <b>{data.documentCounts.invoices}</b></div>
              <div style={{ fontSize: 13 }}>{t('financialReports.payments')}: <b>{data.documentCounts.payments}</b></div>
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>{t('financialReports.byMethod')}</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
                  <th style={{ padding: '6px 10px' }}>{t('financialReports.method')}</th>
                  <th style={{ padding: '6px 10px' }}>{t('financialReports.count')}</th>
                  <th style={{ padding: '6px 10px' }}>{t('financialReports.total')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.payments.byMethod).map(([method, v]) => (
                  <tr key={method} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                    <td style={{ padding: '6px 10px' }}>{t(`financialReports.${methodLabels[method] ?? method}`)}</td>
                    <td style={{ padding: '6px 10px' }}>{v.count}</td>
                    <td style={{ padding: '6px 10px', fontWeight: 600 }}>₪{v.total.toLocaleString()}</td>
                  </tr>
                ))}
                {Object.keys(data.payments.byMethod).length === 0 && (
                  <tr><td colSpan={3} style={{ padding: '10px', color: 'var(--ink-soft)' }}>{t('financialReports.noPayments')}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {aging && (
            <div className="card" style={{ padding: 16, marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>{t('financialReports.agingTitle')}</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
                    <th style={{ padding: '6px 10px' }}>{t('financialReports.agingBucket')}</th>
                    <th style={{ padding: '6px 10px' }}>{t('financialReports.count')}</th>
                    <th style={{ padding: '6px 10px' }}>{t('financialReports.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['current', aging.current], ['days31to60', aging.days31to60], ['days61to90', aging.days61to90],
                    ['days91to120', aging.days91to120], ['over120', aging.over120],
                  ].map(([key, bucket]) => {
                    const b = bucket as AgingBucket;
                    return (
                      <tr key={key as string} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                        <td style={{ padding: '6px 10px' }}>{t(`financialReports.agingBucket_${key}`)}</td>
                        <td style={{ padding: '6px 10px' }}>{b.count}</td>
                        <td style={{ padding: '6px 10px', fontWeight: 600 }}>₪{b.total.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ fontWeight: 800 }}>
                    <td style={{ padding: '6px 10px' }}>{t('financialReports.totalOutstanding')}</td>
                    <td style={{ padding: '6px 10px' }}></td>
                    <td style={{ padding: '6px 10px' }}>₪{aging.totalOutstanding.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
