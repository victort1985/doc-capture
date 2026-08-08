import { useEffect, useState, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, ArrowLeft, Download, TrendingUp, Upload, Check, X, Ban } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { apiFetch, apiFetchBlob, BASE_URL, getToken } from '../services/api';

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
interface MutualSettlementRow { clientName: string; invoiced: number; paid: number; balance: number; }
interface LedgerCardRow { date: string; type: string; documentNumber: string; debit: number; credit: number; balance: number; }
interface LedgerCardData { clientName?: string; supplierName?: string; rows: LedgerCardRow[]; closingBalance: number; }
interface VatSummaryData { period: { from: string; to: string }; outputVat: number; inputVat: number; netVat: number; }
interface CashFlowRow { name: string; amount: number; }
interface CashFlowData {
  period: { from: string; to: string }; openingBalance: number;
  inflows: CashFlowRow[]; totalIn: number; outflows: CashFlowRow[]; totalOut: number;
  netChange: number; closingBalance: number;
}
interface BankLine {
  id: number; date: string; description: string; amount: number; reference?: string;
  status: 'unmatched' | 'matched' | 'ignored'; importBatchId: string;
  matchedLedgerEntry?: { id: number; date: string; description: string; amount: number } | null;
}
interface BankSummary { unmatchedCount: number; unmatchedAmount: number; matchedCount: number; }
interface MatchSuggestion { ledgerEntryId: number; date: string; description: string; amount: number; daysApart: number; }

type Tab = 'trial-balance' | 'pnl' | 'cash-flow' | 'balance-sheet' | 'vat' | 'bank-recon' | 'ledger-card' | 'mutual-settlements';

function pad(n: number) { return String(n).padStart(2, '0'); }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export default function AccountingPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('trial-balance');
  const [from, setFrom] = useState(toDateStr(new Date(new Date().getFullYear(), 0, 1)));
  const [to, setTo] = useState(toDateStr(new Date()));
  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [pnl, setPnl] = useState<PnlData | null>(null);
  const [prevPnl, setPrevPnl] = useState<PnlData | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetData | null>(null);
  const [mutualSettlements, setMutualSettlements] = useState<MutualSettlementRow[]>([]);
  const [ledgerCardType, setLedgerCardType] = useState<'client' | 'supplier'>('client');
  const [ledgerCardContacts, setLedgerCardContacts] = useState<string[]>([]);
  const [ledgerCardSelected, setLedgerCardSelected] = useState('');
  const [ledgerCard, setLedgerCard] = useState<LedgerCardData | null>(null);
  const [vatSummary, setVatSummary] = useState<VatSummaryData | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowData | null>(null);
  const [bankLines, setBankLines] = useState<BankLine[]>([]);
  const [bankSummary, setBankSummary] = useState<BankSummary | null>(null);
  const [uploadingStatement, setUploadingStatement] = useState(false);
  const [expandedLineId, setExpandedLineId] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
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
      // Compare against the immediately-preceding period of the SAME
      // length (e.g. viewing August 1-31 compares to July 1-31, not a
      // fixed "last calendar month") — this matches what an
      // accountant actually wants when they've picked a custom range,
      // not just whole-month presets. A failed comparison fetch
      // (e.g. no data exists yet for the prior period) shouldn't
      // block the main P&L from showing, so it's caught separately.
      const fromDate = new Date(from);
      const toDate = new Date(to);
      const spanMs = toDate.getTime() - fromDate.getTime();
      const prevTo = new Date(fromDate.getTime() - 24 * 60 * 60 * 1000);
      const prevFrom = new Date(prevTo.getTime() - spanMs);
      try {
        setPrevPnl(await apiFetch<PnlData>(`/accounting/profit-and-loss?${new URLSearchParams({ from: toDateStr(prevFrom), to: toDateStr(prevTo) }).toString()}`));
      } catch {
        setPrevPnl(null);
      }
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

  async function loadMutualSettlements() {
    setLoading(true); setError(null);
    try {
      setMutualSettlements(await apiFetch<MutualSettlementRow[]>('/financial-reports/mutual-settlements'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load mutual settlements');
    } finally { setLoading(false); }
  }

  async function loadLedgerCardContacts(type: 'client' | 'supplier') {
    setLedgerCardSelected(''); setLedgerCard(null);
    try {
      setLedgerCardContacts(await apiFetch<string[]>(`/financial-reports/contacts?type=${type}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load contacts');
    }
  }

  async function loadLedgerCard(type: 'client' | 'supplier', name: string) {
    if (!name) { setLedgerCard(null); return; }
    setLoading(true); setError(null);
    try {
      const param = type === 'client' ? 'clientName' : 'supplierName';
      setLedgerCard(await apiFetch<LedgerCardData>(`/financial-reports/${type}-ledger?${param}=${encodeURIComponent(name)}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ledger card');
    } finally { setLoading(false); }
  }

  async function loadVatSummary() {
    setLoading(true); setError(null);
    try {
      setVatSummary(await apiFetch<VatSummaryData>(`/accounting/vat-summary?${new URLSearchParams({ from, to }).toString()}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load VAT summary');
    } finally { setLoading(false); }
  }

  async function loadCashFlow() {
    setLoading(true); setError(null);
    try {
      setCashFlow(await apiFetch<CashFlowData>(`/accounting/cash-flow?${new URLSearchParams({ from, to }).toString()}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cash flow statement');
    } finally { setLoading(false); }
  }

  async function loadBankLines() {
    setLoading(true); setError(null);
    try {
      const [linesData, summaryData] = await Promise.all([
        apiFetch<BankLine[]>('/bank-reconciliation/lines'),
        apiFetch<BankSummary>('/bank-reconciliation/summary'),
      ]);
      setBankLines(linesData);
      setBankSummary(summaryData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bank reconciliation data');
    } finally { setLoading(false); }
  }

  async function uploadStatement(file: File) {
    setUploadingStatement(true); setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${BASE_URL}/bank-reconciliation/import`, {
        method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: formData,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || 'Import failed');
      await loadBankLines();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import statement');
    } finally { setUploadingStatement(false); }
  }

  async function toggleSuggestions(lineId: number) {
    if (expandedLineId === lineId) { setExpandedLineId(null); setSuggestions([]); return; }
    setExpandedLineId(lineId); setLoadingSuggestions(true); setSuggestions([]);
    try {
      setSuggestions(await apiFetch<MatchSuggestion[]>(`/bank-reconciliation/${lineId}/suggestions`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load match suggestions');
    } finally { setLoadingSuggestions(false); }
  }

  async function confirmMatch(lineId: number, ledgerEntryId: number) {
    try {
      await apiFetch(`/bank-reconciliation/${lineId}/match`, { method: 'POST', body: JSON.stringify({ ledgerEntryId }) });
      setExpandedLineId(null);
      await loadBankLines();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to confirm match');
    }
  }

  async function unmatchLine(lineId: number) {
    try {
      await apiFetch(`/bank-reconciliation/${lineId}/unmatch`, { method: 'POST' });
      await loadBankLines();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unmatch');
    }
  }

  async function ignoreLine(lineId: number) {
    try {
      await apiFetch(`/bank-reconciliation/${lineId}/ignore`, { method: 'POST' });
      await loadBankLines();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to ignore line');
    }
  }

  useEffect(() => {
    setSelectedAccount(null);
    if (tab === 'trial-balance') loadTrialBalance();
    else if (tab === 'pnl') loadPnl();
    else if (tab === 'balance-sheet') loadBalanceSheet();
    else if (tab === 'vat') loadVatSummary();
    else if (tab === 'cash-flow') loadCashFlow();
    else if (tab === 'bank-recon') loadBankLines();
    else if (tab === 'ledger-card') loadLedgerCardContacts(ledgerCardType);
    else loadMutualSettlements();
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
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="ghost"
            onClick={async () => {
              try {
                const url = await apiFetchBlob(`/accounting/export.xlsx?${new URLSearchParams({ from, to }).toString()}`);
                const a = document.createElement('a');
                a.href = url; a.download = `accounting_${from}_${to}.xlsx`;
                a.click();
              } catch (e) {
                alert(e instanceof Error ? e.message : 'Export failed');
              }
            }}
          >
            <Download size={15} /> {t('accounting.exportExcel')}
          </button>
          <button type="button" className="ghost" onClick={seedDefaults}>{t('accounting.seedDefaults')}</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16, fontSize: 13 }}>
        {t('accounting.disclaimer')}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['trial-balance', 'pnl', 'cash-flow', 'balance-sheet', 'vat', 'bank-recon', 'ledger-card', 'mutual-settlements'] as Tab[]).map((tKey) => (
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

      {tab !== 'mutual-settlements' && tab !== 'bank-recon' && tab !== 'ledger-card' && (
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
      )}

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
          {prevPnl && (
            <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
              {([
                ['totalRevenue', pnl.totalRevenue, prevPnl.totalRevenue, true],
                ['totalExpenses', pnl.totalExpenses, prevPnl.totalExpenses, false],
                ['netProfit', pnl.netProfit, prevPnl.netProfit, true],
              ] as [string, number, number, boolean][]).map(([key, cur, prev, higherIsGood]) => {
                const delta = prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : (cur !== 0 ? 100 : 0);
                const isGood = higherIsGood ? delta >= 0 : delta <= 0;
                return (
                  <div key={key} style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
                    {t(`accounting.${key}`)}{' '}
                    <span style={{ fontWeight: 700, color: delta === 0 ? 'var(--ink-soft)' : isGood ? 'var(--success, #2E7D32)' : 'var(--danger, #C62828)' }}>
                      {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
                    </span>
                    {' '}{t('accounting.vsPreviousPeriod')}
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ width: '100%', height: 260, marginBottom: 20 }}>
            <ResponsiveContainer>
              <BarChart
                data={
                  prevPnl
                    ? [
                        { name: t('accounting.totalRevenue'), current: pnl.totalRevenue, previous: prevPnl.totalRevenue },
                        { name: t('accounting.totalExpenses'), current: pnl.totalExpenses, previous: prevPnl.totalExpenses },
                        { name: t('accounting.netProfit'), current: pnl.netProfit, previous: prevPnl.netProfit },
                      ]
                    : [
                        { name: t('accounting.totalRevenue'), current: pnl.totalRevenue, fill: '#2E7D32' },
                        { name: t('accounting.totalExpenses'), current: pnl.totalExpenses, fill: '#C62828' },
                        { name: t('accounting.netProfit'), current: pnl.netProfit, fill: pnl.netProfit >= 0 ? '#1D3557' : '#C62828' },
                      ]
                }
                margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #eee)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: any) => `₪${Number(v).toFixed(2)}`} />
                {prevPnl && <Legend wrapperStyle={{ fontSize: 12 }} />}
                {prevPnl ? (
                  <>
                    <Bar dataKey="previous" name={t('accounting.previousPeriod')} fill="#B0BEC5" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="current" name={t('accounting.currentPeriod')} fill="#1D3557" radius={[6, 6, 0, 0]} />
                  </>
                ) : (
                  <Bar dataKey="current" radius={[6, 6, 0, 0]}>
                    {[pnl.totalRevenue, pnl.totalExpenses, pnl.netProfit].map((_, i) => (
                      <Cell key={i} />
                    ))}
                  </Bar>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
          {pnl.expenses.length > 0 && (
            <div style={{ width: '100%', height: 220, marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>{t('accounting.expenseBreakdown')}</div>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={pnl.expenses.map((r) => ({ name: r.name, value: r.amount }))}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={80}
                    label={(entry: any) => `${entry.name}: ₪${entry.value.toFixed(0)}`}
                  >
                    {pnl.expenses.map((_, i) => (
                      <Cell key={i} fill={['#1D3557', '#457B9D', '#F2701C', '#C62828', '#6A4C93', '#2E7D32'][i % 6]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => `₪${Number(v).toFixed(2)}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
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

      {tab === 'cash-flow' && cashFlow && (
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>{t('accounting.tab_cash_flow')}</h3>
          <div style={{ width: '100%', height: 220, marginBottom: 20 }}>
            <ResponsiveContainer>
              <BarChart
                data={[
                  { name: t('accounting.cashOpening'), value: cashFlow.openingBalance, fill: '#457B9D' },
                  { name: t('accounting.cashIn'), value: cashFlow.totalIn, fill: '#2E7D32' },
                  { name: t('accounting.cashOut'), value: -cashFlow.totalOut, fill: '#C62828' },
                  { name: t('accounting.cashClosing'), value: cashFlow.closingBalance, fill: '#1D3557' },
                ]}
                margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #eee)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: any) => `₪${Number(v).toLocaleString()}`} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {[0, 1, 2, 3].map((i) => <Cell key={i} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border, #ccc)' }}>
                <td style={{ padding: '6px 0' }}>{t('accounting.cashOpening')}</td>
                <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 600 }}>₪{cashFlow.openingBalance.toLocaleString()}</td>
              </tr>
              <tr style={{ fontWeight: 700 }}><td colSpan={2} style={{ padding: '12px 0 6px' }}>{t('accounting.cashIn')}</td></tr>
              {cashFlow.inflows.map((r) => (
                <tr key={r.name}><td style={{ padding: '4px 0 4px 16px' }}>{r.name}</td><td style={{ padding: '4px 0', textAlign: 'right' }}>₪{r.amount.toLocaleString()}</td></tr>
              ))}
              <tr style={{ borderTop: '1px solid var(--border, #eee)', fontWeight: 700 }}>
                <td style={{ padding: '6px 0' }}>{t('accounting.cashTotalIn')}</td><td style={{ padding: '6px 0', textAlign: 'right' }}>₪{cashFlow.totalIn.toLocaleString()}</td>
              </tr>
              <tr style={{ fontWeight: 700 }}><td colSpan={2} style={{ padding: '12px 0 6px' }}>{t('accounting.cashOut')}</td></tr>
              {cashFlow.outflows.map((r) => (
                <tr key={r.name}><td style={{ padding: '4px 0 4px 16px' }}>{r.name}</td><td style={{ padding: '4px 0', textAlign: 'right' }}>₪{r.amount.toLocaleString()}</td></tr>
              ))}
              <tr style={{ borderTop: '1px solid var(--border, #eee)', fontWeight: 700 }}>
                <td style={{ padding: '6px 0' }}>{t('accounting.cashTotalOut')}</td><td style={{ padding: '6px 0', textAlign: 'right' }}>₪{cashFlow.totalOut.toLocaleString()}</td>
              </tr>
              <tr style={{ borderTop: '2px solid var(--border, #999)', fontWeight: 800, fontSize: 15 }}>
                <td style={{ padding: '8px 0' }}>{t('accounting.cashClosing')}</td>
                <td style={{ padding: '8px 0', textAlign: 'right', color: cashFlow.closingBalance >= 0 ? 'var(--success, green)' : 'var(--danger, crimson)' }}>
                  ₪{cashFlow.closingBalance.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === 'vat' && vatSummary && (
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>{t('accounting.tab_vat')}</h3>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>{t('accounting.vatDisclaimer')}</p>
          <div style={{ width: '100%', height: 240, marginBottom: 20 }}>
            <ResponsiveContainer>
              <BarChart
                data={[
                  { name: t('accounting.vatOutput'), value: vatSummary.outputVat, fill: '#2E7D32' },
                  { name: t('accounting.vatInput'), value: vatSummary.inputVat, fill: '#457B9D' },
                  { name: t('accounting.vatNet'), value: vatSummary.netVat, fill: vatSummary.netVat >= 0 ? '#F2701C' : '#2E7D32' },
                ]}
                margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #eee)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: any) => `₪${Number(v).toFixed(2)}`} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {[vatSummary.outputVat, vatSummary.inputVat, vatSummary.netVat].map((_, i) => (
                    <Cell key={i} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={{ padding: '6px 0' }}>{t('accounting.vatOutput')}</td><td style={{ padding: '6px 0', textAlign: 'right' }}>₪{vatSummary.outputVat.toFixed(2)}</td></tr>
              <tr><td style={{ padding: '6px 0' }}>{t('accounting.vatInput')}</td><td style={{ padding: '6px 0', textAlign: 'right' }}>₪{vatSummary.inputVat.toFixed(2)}</td></tr>
              <tr style={{ borderTop: '1px solid var(--border, #ccc)', fontWeight: 800, fontSize: 15 }}>
                <td style={{ padding: '8px 0' }}>{t('accounting.vatNet')}</td>
                <td style={{ padding: '8px 0', textAlign: 'right', color: vatSummary.netVat >= 0 ? 'var(--stamp, #F2701C)' : 'var(--success, green)' }}>
                  ₪{vatSummary.netVat.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === 'bank-recon' && (
        <div>
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{t('accounting.bankUnmatchedCount')}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: bankSummary && bankSummary.unmatchedCount > 0 ? 'var(--stamp, #F2701C)' : 'var(--success, #2E7D32)' }}>
                    {bankSummary?.unmatchedCount ?? 0}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{t('accounting.bankUnmatchedAmount')}</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>₪{(bankSummary?.unmatchedAmount ?? 0).toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{t('accounting.bankMatchedCount')}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--success, #2E7D32)' }}>{bankSummary?.matchedCount ?? 0}</div>
                </div>
              </div>
              <label className="ghost" style={{ cursor: uploadingStatement ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px dashed var(--border)', borderRadius: 8 }}>
                <Upload size={15} />
                {uploadingStatement ? t('accounting.bankUploading') : t('accounting.bankUploadStatement')}
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  disabled={uploadingStatement}
                  style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadStatement(f); e.target.value = ''; }}
                />
              </label>
            </div>
          </div>

          <div className="card" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
                  <th style={{ padding: '8px 12px' }}>{t('accounting.date')}</th>
                  <th style={{ padding: '8px 12px' }}>{t('accounting.description')}</th>
                  <th style={{ padding: '8px 12px' }}>{t('accounting.bankAmount')}</th>
                  <th style={{ padding: '8px 12px' }}>{t('accounting.bankStatus')}</th>
                  <th style={{ padding: '8px 12px' }}></th>
                </tr>
              </thead>
              <tbody>
                {bankLines.map((line) => (
                  <Fragment key={line.id}>
                    <tr style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{line.date}</td>
                      <td style={{ padding: '8px 12px' }}>{line.description}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: line.amount >= 0 ? 'var(--success, #2E7D32)' : 'var(--danger, #C62828)' }}>
                        {line.amount >= 0 ? '+' : ''}₪{line.amount.toLocaleString()}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 10,
                          background: line.status === 'matched' ? '#d4edda' : line.status === 'ignored' ? '#e2e3e5' : '#fff3cd',
                          color: line.status === 'matched' ? '#155724' : line.status === 'ignored' ? '#6c757d' : '#856404',
                        }}>
                          {t(`accounting.bankStatus_${line.status}`)}
                        </span>
                        {line.matchedLedgerEntry && (
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{line.matchedLedgerEntry.description}</div>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        {line.status === 'unmatched' && (
                          <>
                            <button className="ghost" title={t('accounting.bankFindMatch')} onClick={() => toggleSuggestions(line.id)} style={{ marginRight: 6 }}>
                              <Check size={14} />
                            </button>
                            <button className="ghost" title={t('accounting.bankIgnore')} onClick={() => ignoreLine(line.id)}>
                              <Ban size={14} />
                            </button>
                          </>
                        )}
                        {line.status === 'matched' && (
                          <button className="ghost" title={t('accounting.bankUnmatch')} onClick={() => unmatchLine(line.id)}><X size={14} /></button>
                        )}
                      </td>
                    </tr>
                    {expandedLineId === line.id && (
                      <tr>
                        <td colSpan={5} style={{ padding: '8px 12px 16px', background: 'var(--surface-muted, #f7f7f7)' }}>
                          {loadingSuggestions ? (
                            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{t('common.loading')}</div>
                          ) : suggestions.length === 0 ? (
                            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{t('accounting.bankNoSuggestions')}</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {suggestions.map((s) => (
                                <div key={s.ledgerEntryId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--surface, #fff)', borderRadius: 6, fontSize: 12.5 }}>
                                  <span>{s.date} — {s.description} — ₪{Math.abs(s.amount).toLocaleString()} ({s.daysApart === 0 ? t('accounting.bankSameDay') : t('accounting.bankDaysApart', { count: s.daysApart })})</span>
                                  <button type="button" onClick={() => confirmMatch(line.id, s.ledgerEntryId)} style={{ fontSize: 12 }}>{t('accounting.bankConfirmMatch')}</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {bankLines.length === 0 && !loading && (
                  <tr><td colSpan={5} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('accounting.bankEmpty')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'ledger-card' && (
        <div>
          <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={ledgerCardType}
              onChange={(e) => { const t2 = e.target.value as 'client' | 'supplier'; setLedgerCardType(t2); loadLedgerCardContacts(t2); }}
            >
              <option value="client">{t('accounting.ledgerClient')}</option>
              <option value="supplier">{t('accounting.ledgerSupplier')}</option>
            </select>
            <select
              value={ledgerCardSelected}
              onChange={(e) => { setLedgerCardSelected(e.target.value); loadLedgerCard(ledgerCardType, e.target.value); }}
              style={{ minWidth: 220 }}
            >
              <option value="">{t('accounting.ledgerPickContact')}</option>
              {ledgerCardContacts.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {ledgerCard && (
            <div className="card" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
                    <th style={{ padding: '8px 12px' }}>{t('accounting.date')}</th>
                    <th style={{ padding: '8px 12px' }}>{t('accounting.ledgerDocType')}</th>
                    <th style={{ padding: '8px 12px' }}>{t('accounting.ledgerDocNumber')}</th>
                    <th style={{ padding: '8px 12px' }}>{t('accounting.ledgerDebit')}</th>
                    <th style={{ padding: '8px 12px' }}>{t('accounting.ledgerCredit')}</th>
                    <th style={{ padding: '8px 12px' }}>{t('accounting.balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerCard.rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                      <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}>{r.date}</td>
                      <td style={{ padding: '6px 12px' }}>{t(`accounting.ledgerType_${r.type.replace(/-/g, '_')}`)}</td>
                      <td style={{ padding: '6px 12px' }}>{r.documentNumber}</td>
                      <td style={{ padding: '6px 12px' }}>{r.debit > 0 ? `₪${r.debit.toLocaleString()}` : ''}</td>
                      <td style={{ padding: '6px 12px' }}>{r.credit > 0 ? `₪${r.credit.toLocaleString()}` : ''}</td>
                      <td style={{ padding: '6px 12px', fontWeight: 600 }}>₪{r.balance.toLocaleString()}</td>
                    </tr>
                  ))}
                  {ledgerCard.rows.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('accounting.noEntries')}</td></tr>
                  )}
                  <tr style={{ fontWeight: 800, fontSize: 15, borderTop: '2px solid var(--border, #999)' }}>
                    <td colSpan={5} style={{ padding: '8px 12px' }}>{t('accounting.ledgerClosingBalance')}</td>
                    <td style={{ padding: '8px 12px', color: ledgerCard.closingBalance >= 0 ? 'var(--danger, crimson)' : 'var(--success, green)' }}>
                      ₪{ledgerCard.closingBalance.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'mutual-settlements' && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <h3 style={{ marginTop: 0, padding: '0 16px' }}>{t('accounting.tab_mutual_settlements')}</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
                <th style={{ padding: '8px 12px' }}>{t('accounting.client')}</th>
                <th style={{ padding: '8px 12px' }}>{t('accounting.invoiced')}</th>
                <th style={{ padding: '8px 12px' }}>{t('accounting.paid')}</th>
                <th style={{ padding: '8px 12px' }}>{t('accounting.balance')}</th>
              </tr>
            </thead>
            <tbody>
              {mutualSettlements.map((r) => (
                <tr key={r.clientName} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                  <td style={{ padding: '8px 12px' }}>{r.clientName}</td>
                  <td style={{ padding: '8px 12px' }}>₪{r.invoiced.toFixed(2)}</td>
                  <td style={{ padding: '8px 12px' }}>₪{r.paid.toFixed(2)}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 700, color: r.balance > 0 ? 'var(--danger, crimson)' : 'inherit' }}>₪{r.balance.toFixed(2)}</td>
                </tr>
              ))}
              {mutualSettlements.length === 0 && !loading && (
                <tr><td colSpan={4} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('accounting.noAccounts')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
