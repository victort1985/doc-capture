import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, RefreshCw, Settings } from 'lucide-react';
import SettingsModal from '../components/SettingsModal';
import OrdersEmailSettingsPage from './OrdersEmailSettingsPage';
import { apiFetch, apiFetchBlob } from '../services/api';

interface OrderListItem {
  id: number;
  orderDate: string;
  organization: string;
  poNumberLast4: string;
  invoiceNumber?: string | null;
  completed: boolean;
  generatedName: string;
  createdAt: string;
}

export default function OrdersListPage() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Orders cannot be deleted once created (see OrdersService.remove()
  // on the backend, which now hard-blocks deletion regardless).

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<OrderListItem[]>('/orders');
      setOrders(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function viewPdf(id: number) {
    try {
      const url = await apiFetchBlob(`/orders/${id}/pdf`);
      window.open(url, '_blank');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to load PDF');
    }
  }


  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="eyebrow">{t('orders.eyebrow')}</div>
          <h1>{t('orders.title')}</h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={load} disabled={loading}>
            <RefreshCw size={15} /> {loading ? t('common.loading') : t('common.refresh')}
          </button>
          <button type="button" className="ghost" onClick={() => setShowSettings(true)} title={t('nav.orderIntakeEmail')}><Settings size={15} /></button>
        </div>
      </div>
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)}>
          <OrdersEmailSettingsPage />
        </SettingsModal>
      )}

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>{t('orders.date')}</th>
              <th style={{ padding: '8px 12px' }}>{t('orders.organization')}</th>
              <th style={{ padding: '8px 12px' }}>{t('orders.po')}</th>
              <th style={{ padding: '8px 12px' }}>{t('orders.invoice')}</th>
              <th style={{ padding: '8px 12px' }}>{t('common.status')}</th>
              <th style={{ padding: '8px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{o.orderDate}</td>
                <td style={{ padding: '8px 12px' }} dir="rtl">{o.organization}</td>
                <td style={{ padding: '8px 12px' }}>{o.poNumberLast4}</td>
                <td style={{ padding: '8px 12px' }}>{o.invoiceNumber || '—'}</td>
                <td style={{ padding: '8px 12px' }}>
                  {o.completed ? (
                    <span style={{ color: 'var(--success, green)' }}>{t('orders.completed')}</span>
                  ) : (
                    <span style={{ color: 'var(--ink-soft)' }}>{t('orders.pending')}</span>
                  )}
                </td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => viewPdf(o.id)} title={t('orders.viewPdf')} style={{ marginRight: 8 }}>
                    <FileText size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {orders.length === 0 && !loading && (
              <tr>
                <td colSpan={6} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>
                  {t('orders.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
