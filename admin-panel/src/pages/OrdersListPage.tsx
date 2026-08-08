import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, RefreshCw, Settings, Plus, X, Upload, FileCheck2 } from 'lucide-react';
import SettingsModal from '../components/SettingsModal';
import OrdersEmailSettingsPage from './OrdersEmailSettingsPage';
import { CreateSupplierInvoiceModal } from './ExpensesPage';
import type { SupplierInvoiceInitialData } from './ExpensesPage';
import { apiFetch, apiFetchBlob, BASE_URL, getToken } from '../services/api';

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

/** Upload -> OCR preview -> confirm flow (see OrdersService.parseUpload
 * / confirmCreate on the backend for why this is two steps rather than
 * one): the file is only uploaded once, at step 1 — step 2 just sends
 * back the (possibly hand-corrected) fields plus the token the server
 * gave out, never the file again. */
function CreateOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [orderDate, setOrderDate] = useState('');
  const [organization, setOrganization] = useState('');
  const [poNumberLast4, setPoNumberLast4] = useState('');

  async function handleFileSelect(file: File) {
    setParsing(true); setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${BASE_URL}/orders/parse`, {
        method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: formData,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || 'Parse failed');
      const data: { token: string; fields: { orderDate: string; organization: string; poNumberLast4: string } } = await res.json();
      setToken(data.token);
      setOrderDate(data.fields.orderDate);
      setOrganization(data.fields.organization);
      setPoNumberLast4(data.fields.poNumberLast4);
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to scan document');
    } finally {
      setParsing(false);
    }
  }

  async function confirm() {
    if (!token) return;
    setSaving(true); setError(null);
    try {
      await apiFetch('/orders/confirm', {
        method: 'POST',
        body: JSON.stringify({ token, orderDate, organization, poNumberLast4 }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create order');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div className="card" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{t('orders.newOrder')}</h2>
          <button className="ghost" onClick={onClose}><X size={16} /></button>
        </div>

        {step === 'upload' && (
          <label className="ghost" style={{ cursor: parsing ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '24px 0', border: '1px dashed var(--border)', borderRadius: 8 }}>
            <Upload size={15} />
            {parsing ? t('orders.scanningDocument') : t('orders.uploadToAutofill')}
            <input
              type="file"
              accept="image/*,.pdf"
              disabled={parsing}
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
            />
          </label>
        )}

        {step === 'review' && (
          <>
            <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 0 }}>{t('orders.reviewHint')}</p>
            <label>{t('orders.date')}</label>
            <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
            <label>{t('orders.organization')}</label>
            <input value={organization} onChange={e => setOrganization(e.target.value)} dir="rtl" style={{ width: '100%', marginBottom: 10 }} />
            <label>{t('orders.po')}</label>
            <input value={poNumberLast4} onChange={e => setPoNumberLast4(e.target.value)} style={{ width: '100%', marginBottom: 14 }} />
            <button type="button" disabled={saving} onClick={confirm} style={{ width: '100%' }}>
              {saving ? t('common.saving') : t('orders.confirmCreate')}
            </button>
          </>
        )}

        {error && <div className="error-banner" style={{ marginTop: 10 }}>{error}</div>}
      </div>
    </div>
  );
}

export default function OrdersListPage() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [convertTarget, setConvertTarget] = useState<OrderListItem | null>(null);
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
          <button type="button" onClick={() => setShowCreate(true)}>
            <Plus size={15} /> {t('orders.newOrder')}
          </button>
          <button type="button" onClick={load} disabled={loading}>
            <RefreshCw size={15} /> {loading ? t('common.loading') : t('common.refresh')}
          </button>
          <button type="button" className="ghost" onClick={() => setShowSettings(true)} title={t('nav.orderIntakeEmail')}><Settings size={15} /></button>
        </div>
      </div>
      {showCreate && (
        <CreateOrderModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
      )}
      {convertTarget && (
        <CreateSupplierInvoiceModal
          onClose={() => setConvertTarget(null)}
          onCreated={() => setConvertTarget(null)}
          initialData={{ supplierName: convertTarget.organization, invoiceNumber: convertTarget.invoiceNumber ?? undefined } as SupplierInvoiceInitialData}
        />
      )}
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
                  <button type="button" onClick={() => setConvertTarget(o)} title={t('orders.convertToSupplierInvoice')} style={{ color: 'var(--primary)' }}>
                    <FileCheck2 size={15} />
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
