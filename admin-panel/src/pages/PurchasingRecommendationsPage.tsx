import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, TrendingDown } from 'lucide-react';
import { apiFetch } from '../services/api';

interface Recommendation {
  itemId: number;
  itemName: string;
  currentQuantity: number;
  unit?: string;
  reorderPoint?: number | null;
  preferredSupplierName?: string | null;
  avgDailyConsumption: number;
  projectedDaysOfStock: number | null;
  reason: 'below_reorder_point' | 'projected_stockout';
  suggestedOrderQuantity: number;
}

export default function PurchasingRecommendationsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      setItems(await apiFetch<Recommendation[]>('/warehouse/purchasing-recommendations'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="eyebrow">{t('purchasing.eyebrow')}</div>
          <h1>{t('purchasing.title')}</h1>
        </div>
      </div>

      <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, marginTop: -8, marginBottom: 16 }}>{t('purchasing.explainer')}</p>

      {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}

      {!loading && items.length === 0 && !error && (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--ink-soft)' }}>
          {t('purchasing.allGood')}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((r) => (
          <div key={r.itemId} className="card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {r.reason === 'below_reorder_point'
                ? <AlertTriangle size={18} style={{ color: 'var(--stamp, #F2701C)', marginTop: 2 }} />
                : <TrendingDown size={18} style={{ color: '#C62828', marginTop: 2 }} />}
              <div>
                <div style={{ fontWeight: 700 }}>{r.itemName}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
                  {t('purchasing.currentStock', { count: r.currentQuantity, unit: r.unit ?? '' })}
                  {r.reason === 'below_reorder_point'
                    ? ` · ${t('purchasing.belowReorderPoint', { point: r.reorderPoint })}`
                    : ` · ${t('purchasing.projectedDays', { days: r.projectedDaysOfStock })}`}
                </div>
                {r.preferredSupplierName && (
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>{t('purchasing.supplier')}: {r.preferredSupplierName}</div>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{t('purchasing.suggestedOrder')}</div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{r.suggestedOrderQuantity} {r.unit}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
