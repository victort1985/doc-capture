import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, X, Save, Package, ArrowUp, ArrowDown, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';
import AddWarehouseItemWizard from './AddWarehouseItemWizard';

interface Category { id: number; name: string; }
interface Item {
  id: number; name: string; barcode: string; description?: string;
  category?: Category; quantity: number; unit?: string; location?: string; notes?: string; price?: number;
  warehouseLocation?: { id: number; name: string };
}

interface HistoryEvent {
  kind: 'transaction' | 'repair' | 'transfer';
  date: string;
  transactionType?: 'in' | 'out';
  quantity?: number;
  reason?: string | null;
  byUser?: string | null;
  call?: { id: number; place: string; status: string } | null;
  returnedAt?: string | null;
  supplierName?: string | null;
  notes?: string | null;
  fromLocationName?: string | null;
  toLocationName?: string | null;
}

export default function WarehousePage() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [catForm, setCatForm] = useState('');
  const [showCatForm, setShowCatForm] = useState(false);
  const [form, setForm] = useState<Partial<Item> & { categoryId?: number }>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [txModal, setTxModal] = useState<{ item: Item; type: 'in' | 'out' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: 'item' | 'category'; id: number; label: string } | null>(null);
  const [txQty, setTxQty] = useState('1');
  const [txReason, setTxReason] = useState('');
  const [filter, setFilter] = useState('');
  const [historyItem, setHistoryItem] = useState<Item | null>(null);
  const [historyEvents, setHistoryEvents] = useState<HistoryEvent[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function openHistory(item: Item) {
    setHistoryItem(item);
    setHistoryEvents(null);
    setHistoryLoading(true);
    try {
      const res = await apiFetch<{ events: HistoryEvent[] }>(`/warehouse/items/${item.id}/history`);
      setHistoryEvents(res.events);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history');
      setHistoryItem(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function load() {
    try {
      const [cats, its] = await Promise.all([
        apiFetch<Category[]>('/warehouse/categories'),
        apiFetch<Item[]>('/warehouse/items'),
      ]);
      setCategories(cats); setItems(its);
    } catch (e) { setError(e instanceof Error ? e.message : 'Load failed'); }
  }

  useEffect(() => { load(); }, []);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    await apiFetch('/warehouse/categories', { method: 'POST', body: JSON.stringify({ name: catForm }) });
    setCatForm(''); setShowCatForm(false); load();
  }

  async function removeCategory(id: number) {
    try {
      await apiFetch(`/warehouse/categories/${id}`, { method: 'DELETE' });
      setCategories((prev: any[]) => prev.filter(x => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete category');
    }
  }

  async function generateBarcode() {
    const b = await apiFetch<string>('/warehouse/generate-barcode');
    setForm(f => ({ ...f, barcode: b }));
  }

  async function submitItem(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    try {
      if (editingId) {
        await apiFetch(`/warehouse/items/${editingId}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await apiFetch('/warehouse/items', { method: 'POST', body: JSON.stringify(form) });
      }
      setForm({}); setEditingId(null); setShowForm(false); load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
  }

  async function removeItem(id: number) {
    try {
      await apiFetch(`/warehouse/items/${id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete item');
    }
  }

  async function doTx() {
    if (!txModal) return;
    await apiFetch(`/warehouse/items/${txModal.item.id}/transactions`, {
      method: 'POST',
      body: JSON.stringify({ type: txModal.type, quantity: parseInt(txQty) || 1, reason: txReason || undefined }),
    });
    setTxModal(null); setTxQty('1'); setTxReason(''); load();
  }

  const filtered = items.filter(i => !filter || i.name.toLowerCase().includes(filter.toLowerCase()) || i.barcode.includes(filter));

  return (
    <div>
      <div className="topbar">
        <div><span className="eyebrow">{t('warehouse.eyebrow')}</span><h1 className="page-title">{t('warehouse.title')}</h1></div>
        <button onClick={() => setShowWizard(true)}>
          <Plus size={16} /> {t('warehouse.addItem')}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Categories */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong>{t('warehouse.categories')}</strong>
          <button className="ghost" onClick={() => setShowCatForm(s => !s)} style={{ fontSize: 12 }}><Plus size={13} /> {t('warehouse.add')}</button>
        </div>
        {showCatForm && (
          <form onSubmit={addCategory} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input value={catForm} onChange={e => setCatForm(e.target.value)} placeholder={t('warehouse.categoryName')} required style={{ flex: 1 }} />
            <button type="submit" style={{ padding: '6px 14px' }}>{t('warehouse.add')}</button>
          </form>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {categories.map(c => (
            <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--surface-muted)', borderRadius: 6, padding: '3px 8px', fontSize: 13 }}>
              {c.name}
              <button className="ghost" onClick={() => setConfirmDelete({ kind: 'category', id: c.id, label: c.name })} style={{ padding: 0, color: 'var(--danger)' }}><X size={12} /></button>
            </span>
          ))}
          {categories.length === 0 && <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{t('warehouse.noCategories')}</span>}
        </div>
      </div>

      {/* Add/Edit item form */}
      {showForm && (
        <form className="card form-card" onSubmit={submitItem} style={{ maxWidth: 600, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>{editingId ? t('warehouse.editItem') : t('warehouse.newItem')}</h3>
          <div className="form-grid">
            <div><label>{t('common.name')} *</label><input value={form.name ?? ''} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
            <div>
              <label>{t('warehouse.barcode')}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={form.barcode ?? ''} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder={t('warehouse.autoGenerate')} style={{ flex: 1 }} />
                <button type="button" onClick={generateBarcode} style={{ padding: '6px 10px', fontSize: 12 }}>{t('warehouse.generate')}</button>
              </div>
            </div>
            <div>
              <label>{t('warehouse.category')}</label>
              <select value={form.categoryId ?? ''} onChange={e => setForm({ ...form, categoryId: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">—</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label>{t('warehouse.unit')}</label><input value={form.unit ?? ''} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="pcs, kg, m…" /></div>
            <div><label>{t('warehouse.locationShelf')}</label><input value={form.location ?? ''} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
            <div><label>{t('prices.price')}</label><input type="number" step="0.01" value={form.price ?? ''} onChange={e => setForm({ ...form, price: e.target.value ? Number(e.target.value) : undefined })} /></div>
            <div style={{ gridColumn: '1/-1' }}><label>{t('warehouse.description')}</label><textarea value={form.description ?? ''} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} style={{ width: '100%' }} /></div>
          </div>
          <div className="form-actions">
            <button type="button" className="ghost" onClick={() => { setForm({}); setEditingId(null); setShowForm(false); }}>{t('common.cancel')}</button>
            <button type="submit"><Save size={15} /> {editingId ? t('common.save') : t('warehouse.addItem')}</button>
          </div>
        </form>
      )}

      {/* Items table */}
      <div className="card">
        <div style={{ marginBottom: 12 }}>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder={t('warehouse.searchPlaceholder')} style={{ width: 280 }} />
        </div>
        <table>
          <thead><tr><th>{t('common.name')}</th><th>{t('warehouse.barcode')}</th><th>{t('warehouse.category')}</th><th>{t('warehouse.warehouse')}</th><th>{t('warehouse.location')}</th><th style={{ textAlign: 'right' }}>{t('warehouse.qty')}</th><th style={{ textAlign: 'right' }}>{t('prices.price')}</th><th /></tr></thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td className="mono" style={{ fontSize: 12 }}>{item.barcode}</td>
                <td>{item.category?.name ?? '—'}</td>
                <td>{item.warehouseLocation?.name ?? '—'}</td>
                <td>{item.location ?? '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: item.quantity === 0 ? 'var(--danger)' : 'var(--primary)' }}>
                  {item.quantity}{item.unit ? ` ${item.unit}` : ''}
                </td>
                <td style={{ textAlign: 'right' }}>{item.price != null ? `₪${Number(item.price).toFixed(2)}` : '—'}</td>
                <td>
                  <div className="row-actions">
                    <button className="ghost" title={t('warehouse.serviceHistory')} onClick={() => openHistory(item)}><History size={15} /></button>
                    <button className="ghost" title={t('warehouse.addToStock')} onClick={() => setTxModal({ item, type: 'in' })} style={{ color: 'green' }}><ArrowDown size={15} /></button>
                    <button className="ghost" title={t('warehouse.removeFromStock')} onClick={() => setTxModal({ item, type: 'out' })} style={{ color: 'red' }}><ArrowUp size={15} /></button>
                    <button className="ghost" onClick={() => { setEditingId(item.id); setForm({ ...item, categoryId: item.category?.id }); setShowForm(true); }}><Pencil size={15} /></button>
                    <button className="ghost" onClick={() => setConfirmDelete({ kind: 'item', id: item.id, label: `${item.name} (${item.barcode})` })} style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--ink-soft)' }}><Package size={28} strokeWidth={1.5} /><br />{t('warehouse.noItems')}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Transaction modal */}
      {txModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={() => setTxModal(null)}>
          <div className="card" style={{ width: 360 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{txModal.type === 'in' ? `➕ ${t('warehouse.addToStock')}` : `➖ ${t('warehouse.removeFromStock')}`} — {txModal.item.name}</h3>
            <label>{t('warehouse.quantity')}</label>
            <input type="number" min="1" value={txQty} onChange={e => setTxQty(e.target.value)} style={{ marginBottom: 10 }} />
            <label>{t('warehouse.reasonOptional')}</label>
            <input value={txReason} onChange={e => setTxReason(e.target.value)} placeholder={t('warehouse.reasonPlaceholder')} />
            <div className="form-actions" style={{ marginTop: 14 }}>
              <button className="ghost" onClick={() => setTxModal(null)}>{t('common.cancel')}</button>
              <button onClick={doTx}><Save size={15} /> {t('warehouse.confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {/* History modal */}
      {historyItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={() => setHistoryItem(null)}>
          <div className="card" style={{ width: 480, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0 }}>{historyItem.name}</h3>
                <div className="mono" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{historyItem.barcode}</div>
              </div>
              <button className="ghost" onClick={() => setHistoryItem(null)}><X size={16} /></button>
            </div>

            {historyLoading && <p style={{ color: 'var(--ink-soft)', marginTop: 16 }}>{t('common.loading')}</p>}

            {historyEvents && (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {historyEvents.map((ev, i) => (
                  <div key={i} style={{ borderLeft: '2px solid var(--border, #e5e5e5)', paddingLeft: 12, fontSize: 13 }}>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{new Date(ev.date).toLocaleString()}</div>
                    {ev.kind === 'transaction' && (
                      <div>
                        <span style={{ color: ev.transactionType === 'in' ? 'green' : 'red', fontWeight: 600 }}>
                          {ev.transactionType === 'in' ? `+${ev.quantity} ${t('warehouse.in')}` : `-${ev.quantity} ${t('warehouse.out')}`}
                        </span>
                        {ev.reason && <> — {ev.reason}</>}
                        {ev.byUser && <span style={{ color: 'var(--ink-soft)' }}> · {ev.byUser}</span>}
                        {ev.call && <div style={{ color: 'var(--ink-soft)' }}>{t('warehouse.usedOnCall')} #{ev.call.id} — {ev.call.place} ({ev.call.status})</div>}
                      </div>
                    )}
                    {ev.kind === 'repair' && (
                      <div>
                        <span style={{ fontWeight: 600, color: ev.returnedAt ? 'green' : 'var(--stamp, orange)' }}>
                          {ev.returnedAt ? t('warehouse.returnedFromRepair') : t('warehouse.sentToRepair')}
                        </span>
                        {ev.supplierName && <> — {ev.supplierName}</>}
                        {ev.reason && <div style={{ color: 'var(--ink-soft)' }}>{ev.reason}</div>}
                        {ev.returnedAt && <div style={{ color: 'var(--ink-soft)' }}>{t('warehouse.returned')} {new Date(ev.returnedAt).toLocaleDateString()}</div>}
                      </div>
                    )}
                    {ev.kind === 'transfer' && (
                      <div>
                        <span style={{ fontWeight: 600 }}>{t('warehouse.transferred')}</span>: {ev.fromLocationName ?? '—'} → {ev.toLocationName ?? '—'}
                        {ev.byUser && <span style={{ color: 'var(--ink-soft)' }}> · {ev.byUser}</span>}
                      </div>
                    )}
                  </div>
                ))}
                {historyEvents.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>{t('warehouse.noHistory')}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation modal — not window.confirm(), which some
          browsers silently suppress after the user dismisses one dialog
          with "prevent this page from creating additional dialogs". */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={() => setConfirmDelete(null)}>
          <div className="card" style={{ width: 360 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{t('warehouse.deleteConfirmTitle', { kind: confirmDelete.kind })}</h3>
            <p style={{ color: 'var(--ink-soft)' }}>{confirmDelete.label}</p>
            <div className="form-actions" style={{ marginTop: 14 }}>
              <button className="ghost" onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</button>
              <button
                style={{ background: 'var(--danger)' }}
                onClick={async () => {
                  const { kind, id } = confirmDelete;
                  setConfirmDelete(null);
                  if (kind === 'item') await removeItem(id);
                  else await removeCategory(id);
                }}
              >
                <Trash2 size={15} /> {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showWizard && (
        <AddWarehouseItemWizard
          categories={categories}
          onClose={() => setShowWizard(false)}
          onCreated={() => { setShowWizard(false); load(); }}
        />
      )}
    </div>
  );
}
