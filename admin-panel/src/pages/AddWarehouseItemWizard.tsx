import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Check, X, RefreshCw } from 'lucide-react';
import { apiFetch } from '../services/api';

interface Category { id: number; name: string; }

interface WizardData {
  name: string;
  barcode: string;
  categoryId?: number;
  unit: string;
  location: string;
  price: string;
  description: string;
}

const STEPS = ['name', 'barcode', 'details', 'price', 'review'] as const;

export default function AddWarehouseItemWizard({ categories, onClose, onCreated }: {
  categories: Category[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<WizardData>({ name: '', barcode: '', unit: '', location: '', price: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const step = STEPS[stepIndex];
  function next() { setError(null); setStepIndex(i => Math.min(i + 1, STEPS.length - 1)); }
  function back() { setError(null); setStepIndex(i => Math.max(i - 1, 0)); }
  function set<K extends keyof WizardData>(key: K, value: WizardData[K]) { setData(d => ({ ...d, [key]: value })); }

  async function generateBarcode() {
    setGenerating(true);
    try {
      const b = await apiFetch<string>('/warehouse/generate-barcode');
      set('barcode', b);
    } catch { /* leave field as-is */ } finally { setGenerating(false); }
  }

  async function create() {
    setSaving(true); setError(null);
    try {
      await apiFetch('/warehouse/items', {
        method: 'POST',
        body: JSON.stringify({
          name: data.name.trim(),
          barcode: data.barcode.trim() || undefined,
          categoryId: data.categoryId,
          unit: data.unit.trim() || undefined,
          location: data.location.trim() || undefined,
          price: data.price ? Number(data.price) : undefined,
          description: data.description.trim() || undefined,
        }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create item');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,22,66,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 480, position: 'relative' }}>
        <button className="ghost" onClick={onClose} style={{ position: 'absolute', top: 14, insetInlineEnd: 14 }} aria-label="close"><X size={18} /></button>

        <div style={{ display: 'flex', gap: 5, marginBottom: 20 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ height: 4, flex: 1, borderRadius: 2, background: i <= stepIndex ? 'var(--primary)' : 'var(--border, #e5e5e5)' }} />
          ))}
        </div>

        {error && <div className="error-banner" style={{ marginBottom: 14 }}>{error}</div>}

        {step === 'name' && (
          <>
            <h2 style={{ marginTop: 0 }}>{t('warehouseWizard.nameTitle')}</h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginBottom: 16 }}>{t('warehouseWizard.nameBody')}</p>
            <label>{t('common.name')} *</label>
            <input autoFocus value={data.name} onChange={e => set('name', e.target.value)} placeholder={t('warehouseWizard.namePlaceholder')} />
            <div className="form-actions" style={{ marginTop: 18 }}>
              <button disabled={!data.name.trim()} onClick={next} style={{ width: '100%' }}>{t('wizard.next')} <ChevronRight size={15} /></button>
            </div>
          </>
        )}

        {step === 'barcode' && (
          <>
            <h2 style={{ marginTop: 0 }}>{t('warehouseWizard.barcodeTitle')}</h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginBottom: 16 }}>{t('warehouseWizard.barcodeBody')}</p>
            <label>{t('warehouse.barcode')}</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={data.barcode} onChange={e => set('barcode', e.target.value)} placeholder={t('warehouse.autoGenerate')} style={{ flex: 1 }} />
              <button type="button" disabled={generating} onClick={generateBarcode} style={{ padding: '6px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <RefreshCw size={13} /> {t('warehouse.generate')}
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 8 }}>{t('warehouseWizard.barcodeScanNote')}</p>
            <div className="form-actions" style={{ marginTop: 18 }}>
              <button className="ghost" onClick={back}><ChevronLeft size={15} /> {t('wizard.back')}</button>
              <button onClick={next}>{t('wizard.next')} <ChevronRight size={15} /></button>
            </div>
          </>
        )}

        {step === 'details' && (
          <>
            <h2 style={{ marginTop: 0 }}>{t('warehouseWizard.detailsTitle')}</h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginBottom: 16 }}>{t('warehouseWizard.detailsBody')}</p>
            <label>{t('warehouse.category')}</label>
            <select value={data.categoryId ?? ''} onChange={e => set('categoryId', e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">—</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="form-grid">
              <div><label>{t('warehouse.unit')}</label><input value={data.unit} onChange={e => set('unit', e.target.value)} placeholder="pcs, kg, m…" /></div>
              <div><label>{t('warehouse.locationShelf')}</label><input value={data.location} onChange={e => set('location', e.target.value)} /></div>
            </div>
            <div className="form-actions" style={{ marginTop: 18 }}>
              <button className="ghost" onClick={back}><ChevronLeft size={15} /> {t('wizard.back')}</button>
              <button onClick={next}>{t('wizard.next')} <ChevronRight size={15} /></button>
            </div>
          </>
        )}

        {step === 'price' && (
          <>
            <h2 style={{ marginTop: 0 }}>{t('warehouseWizard.priceTitle')}</h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginBottom: 16 }}>{t('warehouseWizard.priceBody')}</p>
            <label>{t('prices.price')}</label>
            <input type="number" step="0.01" value={data.price} onChange={e => set('price', e.target.value)} placeholder="0.00" />
            <label style={{ marginTop: 12 }}>{t('warehouse.description')}</label>
            <textarea value={data.description} onChange={e => set('description', e.target.value)} rows={2} style={{ width: '100%' }} />
            <div className="form-actions" style={{ marginTop: 18 }}>
              <button className="ghost" onClick={back}><ChevronLeft size={15} /> {t('wizard.back')}</button>
              <button onClick={next}>{t('wizard.next')} <ChevronRight size={15} /></button>
            </div>
          </>
        )}

        {step === 'review' && (
          <>
            <h2 style={{ marginTop: 0 }}>{t('warehouseWizard.reviewTitle')}</h2>
            <div style={{ background: 'var(--surface-muted)', borderRadius: 8, padding: 14, fontSize: 13.5, lineHeight: 1.8 }}>
              <div><strong>{t('common.name')}:</strong> {data.name}</div>
              <div><strong>{t('warehouse.barcode')}:</strong> {data.barcode || '—'}</div>
              <div><strong>{t('warehouse.category')}:</strong> {categories.find(c => c.id === data.categoryId)?.name ?? '—'}</div>
              <div><strong>{t('warehouse.unit')}:</strong> {data.unit || '—'}</div>
              <div><strong>{t('warehouse.locationShelf')}:</strong> {data.location || '—'}</div>
              <div><strong>{t('prices.price')}:</strong> {data.price ? `₪${Number(data.price).toFixed(2)}` : '—'}</div>
            </div>
            <div className="form-actions" style={{ marginTop: 18 }}>
              <button className="ghost" onClick={back}><ChevronLeft size={15} /> {t('wizard.back')}</button>
              <button disabled={saving} onClick={create}>
                {saving ? t('common.saving') : <><Check size={15} /> {t('warehouse.addItem')}</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
