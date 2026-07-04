import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, X, Save, Package, ArrowUp, ArrowDown } from 'lucide-react';
import { apiFetch } from '../services/api';

interface Category { id: number; name: string; }
interface Item {
  id: number; name: string; barcode: string; description?: string;
  category?: Category; quantity: number; unit?: string; location?: string; notes?: string;
  warehouseLocation?: { id: number; name: string };
}

export default function WarehousePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [catForm, setCatForm] = useState('');
  const [showCatForm, setShowCatForm] = useState(false);
  const [form, setForm] = useState<Partial<Item> & { categoryId?: number }>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [txModal, setTxModal] = useState<{ item: Item; type: 'in' | 'out' } | null>(null);
  const [txQty, setTxQty] = useState('1');
  const [txReason, setTxReason] = useState('');
  const [filter, setFilter] = useState('');

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
    if (!confirm('Delete category?')) return;
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
    if (!confirm('Delete item?')) return;
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
        <div><span className="eyebrow">Management</span><h1 className="page-title">Warehouse</h1></div>
        <button onClick={() => { setShowForm(s => !s); setForm({}); setEditingId(null); }}>
          {showForm ? <><X size={16} /> Cancel</> : <><Plus size={16} /> Add item</>}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Categories */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong>Categories</strong>
          <button className="ghost" onClick={() => setShowCatForm(s => !s)} style={{ fontSize: 12 }}><Plus size={13} /> Add</button>
        </div>
        {showCatForm && (
          <form onSubmit={addCategory} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input value={catForm} onChange={e => setCatForm(e.target.value)} placeholder="Category name" required style={{ flex: 1 }} />
            <button type="submit" style={{ padding: '6px 14px' }}>Add</button>
          </form>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {categories.map(c => (
            <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--surface-muted)', borderRadius: 6, padding: '3px 8px', fontSize: 13 }}>
              {c.name}
              <button className="ghost" onClick={() => removeCategory(c.id)} style={{ padding: 0, color: 'var(--danger)' }}><X size={12} /></button>
            </span>
          ))}
          {categories.length === 0 && <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>No categories yet</span>}
        </div>
      </div>

      {/* Add/Edit item form */}
      {showForm && (
        <form className="card form-card" onSubmit={submitItem} style={{ maxWidth: 600, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit item' : 'New item'}</h3>
          <div className="form-grid">
            <div><label>Name *</label><input value={form.name ?? ''} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
            <div>
              <label>Barcode</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={form.barcode ?? ''} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="Auto-generate" style={{ flex: 1 }} />
                <button type="button" onClick={generateBarcode} style={{ padding: '6px 10px', fontSize: 12 }}>Generate</button>
              </div>
            </div>
            <div>
              <label>Category</label>
              <select value={form.categoryId ?? ''} onChange={e => setForm({ ...form, categoryId: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">—</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label>Unit</label><input value={form.unit ?? ''} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="pcs, kg, m…" /></div>
            <div><label>Location / shelf</label><input value={form.location ?? ''} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
            <div style={{ gridColumn: '1/-1' }}><label>Description</label><textarea value={form.description ?? ''} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} style={{ width: '100%' }} /></div>
          </div>
          <div className="form-actions"><button type="submit"><Save size={15} /> {editingId ? 'Save' : 'Add item'}</button></div>
        </form>
      )}

      {/* Items table */}
      <div className="card">
        <div style={{ marginBottom: 12 }}>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search by name or barcode…" style={{ width: 280 }} />
        </div>
        <table>
          <thead><tr><th>Name</th><th>Barcode</th><th>Category</th><th>Warehouse</th><th>Location</th><th style={{ textAlign: 'right' }}>Qty</th><th /></tr></thead>
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
                <td>
                  <div className="row-actions">
                    <button className="ghost" title="Add to stock" onClick={() => setTxModal({ item, type: 'in' })} style={{ color: 'green' }}><ArrowDown size={15} /></button>
                    <button className="ghost" title="Remove from stock" onClick={() => setTxModal({ item, type: 'out' })} style={{ color: 'red' }}><ArrowUp size={15} /></button>
                    <button className="ghost" onClick={() => { setEditingId(item.id); setForm({ ...item, categoryId: item.category?.id }); setShowForm(true); }}><Pencil size={15} /></button>
                    <button className="ghost" onClick={() => removeItem(item.id)} style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--ink-soft)' }}><Package size={28} strokeWidth={1.5} /><br />No items</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Transaction modal */}
      {txModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={() => setTxModal(null)}>
          <div className="card" style={{ width: 360 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{txModal.type === 'in' ? '➕ Add to stock' : '➖ Remove from stock'} — {txModal.item.name}</h3>
            <label>Quantity</label>
            <input type="number" min="1" value={txQty} onChange={e => setTxQty(e.target.value)} style={{ marginBottom: 10 }} />
            <label>Reason (optional)</label>
            <input value={txReason} onChange={e => setTxReason(e.target.value)} placeholder="e.g. Purchase, Used in call #5…" />
            <div className="form-actions" style={{ marginTop: 14 }}>
              <button className="ghost" onClick={() => setTxModal(null)}>Cancel</button>
              <button onClick={doTx}><Save size={15} /> Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
