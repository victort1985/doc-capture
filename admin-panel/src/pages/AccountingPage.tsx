import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, ArrowLeft } from 'lucide-react';
import { apiFetch } from '../services/api';

interface TrialBalanceRow { accountId: number; code: string; name: string; type: string; debit: number; credit: number; }
interface LedgerRow { id: number; date: string; description: string; debit: number; credit: number; balance: number; sourceType?: string; sourceId?: number; }

function pad(n: number) { return String(n).padStart(2, '0'); }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export default function AccountingPage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(toDateStr(new Date(new Date().getFullYear(), 0, 1)));
  const [to, setTo] = useState(toDateStr(new Date()));
  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<TrialBalanceRow | null>(null);
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);

  async function loadTrialBalance() {
    setLoading(true); setError(null);
    try {
      setRows(await apiFetch<TrialBalanceRow[]>(`/accounting/trial-balance?${new URLSearchParams({ from, to }).toString()}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trial balance');
    } finally { setLoading(false); }
  }
  useEffect(() => { loadTrialBalance(); }, [from, to]);

  async function openLedger(row: TrialBalanceRow) {
    setSelectedAccount(row);
    try {
      setLedgerRows(await apiFetch<LedgerRow[]>(`/accounting/general-ledger/${row.accountId}?${new URLSearchParams({ from, to }).toString()}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load general ledger');
    }
  }

  async function seedDefaults() {
    try {
      await apiFetch('/accounting/accounts/seed-defaults', { method: 'POST' });
      loadTrialBalance();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to seed default accounts');
    }
  }

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

  if (selectedAccount) {
    return (
      <div className="page">
        <div className="topbar">
          <div>
            <button className="ghost" onClick={() => setSelectedAccount(null)} style={{ marginBottom: 8 }}>
              <ArrowLeft size={15} /> {t('accounting.back')}
            </button>
            <h1>{selectedAccount.code} — {selectedAccount.name}</h1>
          </div>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
                <th style={{ padding: '8px 12px' }}>{t('accounting.date')}</th>
                <th style={{ padding: '8px 12px' }}>{t('accounting.description')}</th>
                <th style={{ padding: '8px 12px' }}>{t('accounting.debit')}</th>
                <th style={{ padding: '8px 12px' }}>{t('accounting.credit')}</th>
                <th style={{ padding: '8px 12px' }}>{t('accounting.balance')}</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                  <td style={{ padding: '8px 12px' }}>{r.date}</td>
                  <td style={{ padding: '8px 12px' }}>{r.description}</td>
                  <td style={{ padding: '8px 12px' }}>{r.debit ? `₪${r.debit.toFixed(2)}` : ''}</td>
                  <td style={{ padding: '8px 12px' }}>{r.credit ? `₪${r.credit.toFixed(2)}` : ''}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>₪{r.balance.toFixed(2)}</td>
                </tr>
              ))}
              {ledgerRows.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('accounting.noEntries')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('accounting.eyebrow')}</div><h1>{t('accounting.title')}</h1></div>
        <button type="button" className="ghost" onClick={seedDefaults}>{t('accounting.seedDefaults')}</button>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16, fontSize: 13 }}>
        {t('accounting.disclaimer')}
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
        <Calendar size={15} style={{ color: 'var(--ink-soft)' }} />
        <label style={{ fontSize: 13 }}>{t('accounting.from')}</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label style={{ fontSize: 13 }}>{t('accounting.to')}</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading && <p>{t('common.loading')}</p>}

      <div className="card" style={{ overflowX: 'auto' }}>
        <h3 style={{ marginTop: 0, padding: '0 16px' }}>{t('accounting.trialBalance')}</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>{t('accounting.code')}</th>
              <th style={{ padding: '8px 12px' }}>{t('accounting.account')}</th>
              <th style={{ padding: '8px 12px' }}>{t('accounting.type')}</th>
              <th style={{ padding: '8px 12px' }}>{t('accounting.debit')}</th>
              <th style={{ padding: '8px 12px' }}>{t('accounting.credit')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.accountId} style={{ borderBottom: '1px solid var(--border, #f0f0f0)', cursor: 'pointer' }} onClick={() => openLedger(r)}>
                <td style={{ padding: '8px 12px' }}>{r.code}</td>
                <td style={{ padding: '8px 12px' }}>{r.name}</td>
                <td style={{ padding: '8px 12px', color: 'var(--ink-soft)', fontSize: 12.5 }}>{t(`accounting.type_${r.type}`)}</td>
                <td style={{ padding: '8px 12px' }}>{r.debit ? `₪${r.debit.toFixed(2)}` : ''}</td>
                <td style={{ padding: '8px 12px' }}>{r.credit ? `₪${r.credit.toFixed(2)}` : ''}</td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={5} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('accounting.noAccounts')}</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 800, borderTop: '2px solid var(--border, #ccc)' }}>
                <td style={{ padding: '8px 12px' }} colSpan={3}>{t('accounting.totals')}</td>
                <td style={{ padding: '8px 12px' }}>₪{totalDebit.toFixed(2)}</td>
                <td style={{ padding: '8px 12px' }}>₪{totalCredit.toFixed(2)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
