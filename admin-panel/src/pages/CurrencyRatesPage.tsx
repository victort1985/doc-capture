import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

interface RateRow { id: number; currency: string; date: string; rateToIls: number; source: 'boi' | 'manual'; }

export default function CurrencyRatesPage() {
  const { t } = useTranslation();
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [selected, setSelected] = useState('USD');
  const [rows, setRows] = useState<RateRow[]>([]);
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10));
  const [manualRate, setManualRate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<string[]>('/currency/supported').then((c) => setCurrencies(c.filter((x) => x !== 'ILS'))).catch(() => {});
  }, []);

  async function load() {
    setLoading(true); setError(null);
    try {
      setRows(await apiFetch<RateRow[]>(`/currency/history?currency=${selected}&days=30`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rates');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [selected]);

  async function saveManual() {
    if (!manualRate) return;
    setError(null);
    try {
      await apiFetch('/currency/manual-rate', { method: 'POST', body: JSON.stringify({ currency: selected, date: manualDate, rateToIls: Number(manualRate) }) });
      setManualRate('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save rate');
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('currency.eyebrow')}</div><h1>{t('currency.title')}</h1></div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16, fontSize: 13 }}>
        {t('currency.disclaimer')}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {currencies.map((c) => (
          <button key={c} type="button" onClick={() => setSelected(c)} style={{ background: selected === c ? 'var(--primary)' : 'var(--surface-muted)', color: selected === c ? '#fff' : 'var(--ink)', border: 'none' }}>
            {c}
          </button>
        ))}
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('currency.addManual')}</h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12 }}>{t('common.date')}</label>
            <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12 }}>{t('currency.rateToIls', { currency: selected })}</label>
            <input type="number" step="0.0001" value={manualRate} onChange={(e) => setManualRate(e.target.value)} style={{ width: 120 }} />
          </div>
          <button type="button" onClick={saveManual} disabled={!manualRate}>{t('common.save')}</button>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>{t('common.date')}</th>
              <th style={{ padding: '8px 12px' }}>{t('currency.rate')}</th>
              <th style={{ padding: '8px 12px' }}>{t('currency.source')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                <td style={{ padding: '8px 12px' }}>{r.date}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{Number(r.rateToIls).toFixed(4)}</td>
                <td style={{ padding: '8px 12px' }}>
                  {r.source === 'manual' ? <span style={{ color: 'var(--danger, crimson)' }}>{t('currency.manual')}</span> : <span style={{ color: 'var(--ink-soft)' }}>{t('currency.boi')}</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={3} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('currency.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
