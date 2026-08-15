import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { Printer, AlertTriangle, Calendar } from 'lucide-react';
import { apiFetch } from '../services/api';

interface Employee { id: number; username: string; }
interface PayslipLine { category: string; categoryKey: string; hours: number; ratePercent: number; amount: number; }
interface Payslip {
  userId: number;
  username: string;
  period: { from: string; to: string };
  salaryType: 'hourly' | 'global';
  lines: PayslipLine[];
  grossPay: number;
  globalFloorCheck?: {
    statedGlobalAmount: number;
    impliedHourlyRate: number;
    itemizedEquivalent: number;
    belowFloor: boolean;
  };
}

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }

/** The document itself (header, disclaimer, table, category labels,
 * gross-pay line) is ALWAYS rendered in Hebrew, regardless of the
 * admin's own chosen UI language — a payslip is a document that may
 * be handed to the employee or kept on file, and per direct request
 * it must read consistently in Hebrew every time, not follow
 * whatever language the person generating it happens to have their
 * own interface set to. i18next's getFixedT('he') returns a
 * translator pinned to Hebrew independent of the app's active
 * language, so the surrounding CONTROLS (employee picker, date
 * range, print button — all wrapped in .no-print and therefore never
 * part of the actual printed output anyway) can still follow the
 * admin's own language via the normal `t`, while everything inside
 * the .payslip-document card below uses `th` instead. This same
 * Hebrew-forced content is what both renders on screen AND prints
 * (window.print() only ever outputs what's already on screen, so
 * fixing the document's own generation covers both cases in one
 * place). */
const th = i18n.getFixedT('he');

export default function PayslipPage() {
  const { t } = useTranslation();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [payslip, setPayslip] = useState<Payslip | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const [from, setFrom] = useState(toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)));

  useEffect(() => {
    apiFetch<Employee[]>('/users').then((list) => {
      setEmployees(list);
      if (list.length && selectedUserId == null) setSelectedUserId(list[0].id);
    }).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load employees'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedUserId == null) return;
    setLoading(true); setError(null); setPayslip(null);
    apiFetch<Payslip>(`/payroll/payslip/${selectedUserId}?${new URLSearchParams({ from, to }).toString()}`)
      .then(setPayslip)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load payslip'))
      .finally(() => setLoading(false));
  }, [selectedUserId, from, to]);

  return (
    <div className="page">
      <div className="topbar no-print">
        <div>
          <div className="eyebrow">{t('payslip.eyebrow')}</div>
          <h1>{t('payslip.title')}</h1>
        </div>
        <button type="button" onClick={() => window.print()} disabled={!payslip}>
          <Printer size={15} /> {t('payslip.print')}
        </button>
      </div>

      <div className="card no-print" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={selectedUserId ?? ''} onChange={(e) => setSelectedUserId(Number(e.target.value))}>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.username}</option>)}
        </select>
        <Calendar size={15} style={{ color: 'var(--ink-soft)' }} />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span style={{ color: 'var(--ink-soft)' }}>–</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {error && <div className="error-banner no-print" style={{ marginBottom: 12 }}>{error}</div>}

      {payslip && !loading && (
        <div className="card payslip-document" dir="rtl" style={{ padding: 32, maxWidth: 640, margin: '0 auto', textAlign: 'right' }}>
          <div style={{ textAlign: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '2px solid var(--border, #333)' }}>
            <h2 style={{ margin: 0 }}>{th('payslip.documentTitle')}</h2>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 4 }}>
              {payslip.username} — {payslip.period.from} {th('payslip.periodTo')} {payslip.period.to}
            </div>
          </div>

          <div className="notice-banner" style={{ marginBottom: 20, fontSize: 12.5 }}>
            {th('payslip.grossOnlyDisclaimer')}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
            <thead>
              <tr style={{ textAlign: 'right', borderBottom: '1px solid var(--border, #999)' }}>
                <th style={{ padding: '6px 8px' }}>{th('payslip.category')}</th>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>{th('payslip.hours')}</th>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>{th('payslip.rate')}</th>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>{th('payslip.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {payslip.lines.map((l, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border, #eee)' }}>
                  <td style={{ padding: '6px 8px' }}>{th(`timekeeper.cat_${l.categoryKey}`)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'left' }}>{l.hours}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'left' }}>{l.ratePercent}%</td>
                  <td style={{ padding: '6px 8px', textAlign: 'left' }}>₪{(l.amount ?? 0).toLocaleString()}</td>
                </tr>
              ))}
              {payslip.lines.length === 0 && (
                <tr><td colSpan={4} style={{ padding: '12px 8px', color: 'var(--ink-soft)' }}>{th('payslip.noHours')}</td></tr>
              )}
            </tbody>
          </table>

          {payslip.salaryType === 'global' && (
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 16, padding: 10, background: 'var(--surface-muted, #f7f7f7)', borderRadius: 6 }}>
              {th('payslip.globalNote')}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18, paddingTop: 12, borderTop: '2px solid var(--border, #333)', marginBottom: payslip.globalFloorCheck ? 16 : 0 }}>
            <span>{th('payslip.grossPay')}</span>
            <span>₪{(payslip.grossPay ?? 0).toLocaleString()}</span>
          </div>

          {payslip.globalFloorCheck?.belowFloor && (
            <div className="no-print" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--surface-muted, #fdecea)', border: '1px solid var(--danger, #C62828)', borderRadius: 8, padding: 12, marginTop: 8 }}>
              <AlertTriangle size={18} style={{ color: 'var(--danger, #C62828)', flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12.5 }}>
                <strong>{th('payslip.floorWarningTitle')}</strong><br />
                {th('payslip.floorWarningBody', {
                  stated: (payslip.globalFloorCheck.statedGlobalAmount ?? 0).toLocaleString(),
                  itemized: (payslip.globalFloorCheck.itemizedEquivalent ?? 0).toLocaleString(),
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
