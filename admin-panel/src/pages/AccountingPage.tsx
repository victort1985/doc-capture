import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, ArrowLeft } from 'lucide-react';
import { apiFetch } from '../services/api';

interface TrialBalanceRow { accountId: number; code: string; name: string; type: string; debit: number; credit: number; }
interface LedgerRow { id: number; date: string; description: string; debit: number; credit: number; balance: number; sourceType?: string; sourceId?: number; }
interface PnlRow { code: string; name: string; amount: number; }
interface PnlData { revenue: PnlRow[]; totalRevenue: number; expenses: PnlRow[]; totalExpenses: number; netProfit: number; }
interface BalanceRow { code: string; name: string; balance: number; }
interface BalanceSheetData {
  assets: BalanceRow[]; totalAssets: number;
  liabilities: BalanceRow[]; totalLiabilities: number;
  equity: BalanceRow[]; retainedEarnings: number; totalEquity: number;
  balances: boolean;
}

type Tab = 'trial-balance' | 'pnl' | 'balance-sheet';

function pad(n: number) { return String(n).padStart(2, '0'); }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export default function AccountingPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('trial-balance');
  const [from, setFrom] = useState(toDateStr(new Date(new Date().getFullYear(), 0, 1)));
  const [to, setTo] = useState(toDateStr(new Date()));
  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [pnl, setPnl] = useState<PnlData | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetData | null>(null);
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

  async function loadPnl() {
    setLoading(true); setError(null);
    try {
      setPnl(await apiFetch<PnlData>(`/accounting/profit-and-loss?${new URLSearchParams({ from, to }).toString()}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load profit & loss');
    } finally { setLoading(false); }
  }

  async function loadBalanceSheet() {
    setLoading(true); setError(null);
    try {
      setBalanceSheet(await apiFetch<BalanceSheetData>(`/accounting/balance-sheet?${new URLSearchParams({ asOf: to }).toString()}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load balance sheet');
    } finally { setLoading(false); }
  }

  useEffect(() => {
    setSelectedAccount(null);
    if (tab === 'trial-balance') loadTrialBalance();
    else if (tab === 'pnl') loadPnl();
    else loadBalanceSheet();
  }, [tab, from, to]);

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

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['trial-balance', 'pnl', 'balance-sheet'] as Tab[]).map((tKey) => (
          <button
            key={tKey}
            type="button"
            onClick={() => setTab(tKey)}
            style={{
              background: tab === tKey ? 'var(--primary)' : 'var(--surface-muted)',
              color: tab === tKey ? '#fff' : 'var(--ink)',
              border: 'none',
            }}
          >
            {t(`accounting.tab_${tKey.replace('-', '_')}`)}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
        <Calendar size={15} style={{ color: 'var(--ink-soft)' }} />
        {tab !== 'balance-sheet' && (
          <>
            <label style={{ fontSize: 13 }}>{t('accounting.from')}</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </>
        )}
        <label style={{ fontSize: 13 }}>{tab === 'balance-sheet' ? t('accounting.asOf') : t('accounting.to')}</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading && <p>{t('common.loading')}</p>}

      {tab === 'trial-balance' && (
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
      )}

      {tab === 'pnl' && pnl && (
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>{t('accounting.tab_pnl')}</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
            <tbody>
              <tr style={{ fontWeight: 700 }}><td colSpan={2} style={{ padding: '6px 0' }}>{t('accounting.revenue')}</td></tr>
              {pnl.revenue.map((r) => (
                <tr key={r.code}><td style={{ padding: '4px 0 4px 16px' }}>{r.code} — {r.name}</td><td style={{ padding: '4px 0', textAlign: 'right' }}>₪{r.amount.toFixed(2)}</td></tr>
              ))}
              <tr style={{ borderTop: '1px solid var(--border, #ccc)', fontWeight: 700 }}>
                <td style={{ padding: '6px 0' }}>{t('accounting.totalRevenue')}</td><td style={{ padding: '6px 0', textAlign: 'right' }}>₪{pnl.totalRevenue.toFixed(2)}</td>
              </tr>
              <tr style={{ fontWeight: 700 }}><td colSpan={2} style={{ padding: '12px 0 6px' }}>{t('accounting.expenses')}</td></tr>
              {pnl.expenses.map((r) => (
                <tr key={r.code}><td style={{ padding: '4px 0 4px 16px' }}>{r.code} — {r.name}</td><td style={{ padding: '4px 0', textAlign: 'right' }}>₪{r.amount.toFixed(2)}</td></tr>
              ))}
              <tr style={{ borderTop: '1px solid var(--border, #ccc)', fontWeight: 700 }}>
                <td style={{ padding: '6px 0' }}>{t('accounting.totalExpenses')}</td><td style={{ padding: '6px 0', textAlign: 'right' }}>₪{pnl.totalExpenses.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ fontSize: 18, fontWeight: 800, padding: '12px 0', borderTop: '2px solid var(--border, #999)', color: pnl.netProfit >= 0 ? 'var(--success, green)' : 'var(--danger, crimson)' }}>
            {t('accounting.netProfit')}: ₪{pnl.netProfit.toFixed(2)}
          </div>
        </div>
      )}

      {tab === 'balance-sheet' && balanceSheet && (
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>{t('accounting.tab_balance_sheet')}</h3>
          {!balanceSheet.balances && (
            <div style={{ padding: '8px 12px', background: 'var(--danger-bg, #fbeae8)', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              {t('accounting.doesNotBalance')}
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr style={{ fontWeight: 700 }}><td colSpan={2} style={{ padding: '6px 0' }}>{t('accounting.assets')}</td></tr>
              {balanceSheet.assets.map((r) => (
                <tr key={r.code}><td style={{ padding: '4px 0 4px 16px' }}>{r.code} — {r.name}</td><td style={{ padding: '4px 0', textAlign: 'right' }}>₪{r.balance.toFixed(2)}</td></tr>
              ))}
              <tr style={{ borderTop: '1px solid var(--border, #ccc)', fontWeight: 700 }}>
                <td style={{ padding: '6px 0' }}>{t('accounting.totalAssets')}</td><td style={{ padding: '6px 0', textAlign: 'right' }}>₪{balanceSheet.totalAssets.toFixed(2)}</td>
              </tr>

              <tr style={{ fontWeight: 700 }}><td colSpan={2} style={{ padding: '12px 0 6px' }}>{t('accounting.liabilities')}</td></tr>
              {balanceSheet.liabilities.map((r) => (
                <tr key={r.code}><td style={{ padding: '4px 0 4px 16px' }}>{r.code} — {r.name}</td><td style={{ padding: '4px 0', textAlign: 'right' }}>₪{r.balance.toFixed(2)}</td></tr>
              ))}
              <tr style={{ borderTop: '1px solid var(--border, #ccc)', fontWeight: 700 }}>
                <td style={{ padding: '6px 0' }}>{t('accounting.totalLiabilities')}</td><td style={{ padding: '6px 0', textAlign: 'right' }}>₪{balanceSheet.totalLiabilities.toFixed(2)}</td>
              </tr>

              <tr style={{ fontWeight: 700 }}><td colSpan={2} style={{ padding: '12px 0 6px' }}>{t('accounting.equity')}</td></tr>
              {balanceSheet.equity.map((r) => (
                <tr key={r.code}><td style={{ padding: '4px 0 4px 16px' }}>{r.code} — {r.name}</td><td style={{ padding: '4px 0', textAlign: 'right' }}>₪{r.balance.toFixed(2)}</td></tr>
              ))}
              <tr><td style={{ padding: '4px 0 4px 16px' }}>{t('accounting.retainedEarnings')}</td><td style={{ padding: '4px 0', textAlign: 'right' }}>₪{balanceSheet.retainedEarnings.toFixed(2)}</td></tr>
              <tr style={{ borderTop: '1px solid var(--border, #ccc)', fontWeight: 700 }}>
                <td style={{ padding: '6px 0' }}>{t('accounting.totalEquity')}</td><td style={{ padding: '6px 0', textAlign: 'right' }}>₪{balanceSheet.totalEquity.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
