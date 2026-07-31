import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, RotateCcw, RefreshCw } from 'lucide-react';
import { apiFetch } from '../services/api';

interface Rental {
  id: number;
  rentalNumber?: string;
  warehouseItem: { id: number; name: string; barcode: string };
  quantity: number;
  clientName: string;
  clientPhone?: string;
  description?: string;
  startDate: string;
  dueDate: string;
  status: 'active' | 'returned';
  returnedAt?: string;
}

interface Contact { id: number; firstName: string; lastName: string; phone: string; }
interface WarehouseItemLite { id: number; name: string; barcode: string; quantity: number; }

export default function RentalsPage() {
  const { t } = useTranslation();
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [statusFilter, setStatusFilter] = useState<'active' | 'returned' | ''>('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      setRentals(await apiFetch<Rental[]>(`/rentals${qs}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rentals');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [statusFilter]);

  async function markReturned(id: number) {
    if (!confirm(t('rentals.confirmReturn'))) return;
    try {
      await apiFetch(`/rentals/${id}/return`, { method: 'POST' });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to mark returned');
    }
  }

  function daysUntil(dueDate: string): number {
    const due = new Date(dueDate);
    const now = new Date();
    due.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    return Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('rentals.eyebrow')}</div><h1>{t('rentals.title')}</h1></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="ghost" onClick={load} disabled={loading}><RefreshCw size={15} /> {t('common.refresh')}</button>
          <button type="button" onClick={() => setShowCreate(true)}><Plus size={15} /> {t('rentals.newRental')}</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['active', 'returned', ''] as const).map((s) => (
          <button
            key={s || 'all'}
            type="button"
            className={statusFilter === s ? '' : 'ghost'}
            onClick={() => setStatusFilter(s)}
          >
            {s === 'active' ? t('rentals.statusActive') : s === 'returned' ? t('rentals.statusReturned') : t('rentals.statusAll')}
          </button>
        ))}
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>{t('rentals.number')}</th>
              <th style={{ padding: '8px 12px' }}>{t('rentals.item')}</th>
              <th style={{ padding: '8px 12px' }}>{t('rentals.client')}</th>
              <th style={{ padding: '8px 12px' }}>{t('rentals.dueDate')}</th>
              <th style={{ padding: '8px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {rentals.map((r) => {
              const days = daysUntil(r.dueDate);
              // Same color-coding rule as everywhere else in the app —
              // the whole row, not a small indicator. Uses hardcoded
              // fallback thresholds (3/1 days) matching the backend's
              // own defaults, since this list doesn't currently fetch
              // /time-thresholds itself — acceptable for a first pass
              // since an admin changing the org's thresholds is a rare
              // action, not something this page needs to react to live.
              const rowColor = r.status === 'returned' ? undefined : days <= 1 ? '#FDEDEC' : days <= 3 ? '#FEF9E7' : undefined;
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)', background: rowColor }}>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12.5 }}>{r.rentalNumber}</td>
                  <td style={{ padding: '8px 12px' }}>{r.warehouseItem?.name} × {r.quantity}</td>
                  <td style={{ padding: '8px 12px' }}>{r.clientName}{r.clientPhone ? ` · ${r.clientPhone}` : ''}</td>
                  <td style={{ padding: '8px 12px' }}>{r.dueDate}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {r.status === 'active' && (
                      <button type="button" className="ghost" onClick={() => markReturned(r.id)} title={t('rentals.markReturned')}>
                        <RotateCcw size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rentals.length === 0 && !loading && (
              <tr><td colSpan={5} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('rentals.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateRentalModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
      )}
    </div>
  );
}

function CreateRentalModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [contactQuery, setContactQuery] = useState('');
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  const [itemQuery, setItemQuery] = useState('');
  const [itemResults, setItemResults] = useState<WarehouseItemLite[]>([]);
  const [selectedItem, setSelectedItem] = useState<WarehouseItemLite | null>(null);
  const [quantity, setQuantity] = useState('1');

  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contactQuery.trim() || selectedContact) { setContactResults([]); return; }
    const handle = setTimeout(() => {
      // A purely-numeric query is almost certainly someone typing a
      // client identifier rather than searching by name — try the
      // exact-match lookup first and auto-select on a hit, so typing
      // the number is enough to fill in the rest without an extra
      // click. Falls through to the normal name/phone search either
      // way (a numeric string could coincidentally also be someone's
      // actual name search, however unlikely).
      const trimmed = contactQuery.trim();
      if (/^\d+$/.test(trimmed)) {
        apiFetch<Contact | null>(`/phonebook/by-identifier/${trimmed}`)
          .then((c) => { if (c) pickContact(c); })
          .catch(() => {});
      }
      apiFetch<Contact[]>(`/phonebook/search?q=${encodeURIComponent(contactQuery)}&type=client`)
        .then(setContactResults).catch(() => setContactResults([]));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactQuery, selectedContact]);

  useEffect(() => {
    if (!itemQuery.trim() || selectedItem) { setItemResults([]); return; }
    const handle = setTimeout(() => {
      apiFetch<WarehouseItemLite[]>(`/warehouse/items?q=${encodeURIComponent(itemQuery)}`)
        .then(setItemResults).catch(() => setItemResults([]));
    }, 300);
    return () => clearTimeout(handle);
  }, [itemQuery, selectedItem]);

  function pickContact(c: Contact) {
    setSelectedContact(c);
    setContactQuery(`${c.firstName} ${c.lastName}`);
    setClientName(`${c.firstName} ${c.lastName}`);
    setClientPhone(c.phone);
    setContactResults([]);
  }

  function pickItem(i: WarehouseItemLite) {
    setSelectedItem(i);
    setItemQuery(i.name);
    setItemResults([]);
  }

  async function submit() {
    if (!selectedItem || !clientName.trim() || !dueDate) {
      setError(t('rentals.formInvalid'));
      return;
    }
    setSaving(true); setError(null);
    try {
      await apiFetch('/rentals', {
        method: 'POST',
        body: JSON.stringify({
          warehouseItemId: selectedItem.id,
          quantity: Number(quantity) || 1,
          contactId: selectedContact?.id,
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim() || undefined,
          description: description.trim() || undefined,
          startDate,
          dueDate,
        }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create rental');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div className="card" style={{ width: 460, maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{t('rentals.newRental')}</h2>
          <button className="ghost" onClick={onClose}><X size={16} /></button>
        </div>

        <label>{t('rentals.equipment')}</label>
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <input
            value={itemQuery}
            onChange={(e) => { setItemQuery(e.target.value); setSelectedItem(null); }}
            placeholder={t('rentals.equipmentSearchHint')}
            style={{ width: '100%' }}
          />
          {itemResults.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--border, #ddd)', borderRadius: 6, zIndex: 10, maxHeight: 180, overflowY: 'auto' }}>
              {itemResults.map((i) => (
                <div key={i.id} onClick={() => pickItem(i)} style={{ padding: '8px 10px', cursor: 'pointer', fontSize: 13 }}>
                  {i.name} · {i.barcode} · {t('rentals.inStock')}: {i.quantity}
                </div>
              ))}
            </div>
          )}
        </div>
        <label>{t('rentals.quantity')}</label>
        <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />

        <label>{t('rentals.client')}</label>
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <input
            value={contactQuery}
            onChange={(e) => { setContactQuery(e.target.value); setSelectedContact(null); setClientName(e.target.value); }}
            placeholder={t('rentals.clientSearchHint')}
            style={{ width: '100%' }}
          />
          {contactResults.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--border, #ddd)', borderRadius: 6, zIndex: 10, maxHeight: 180, overflowY: 'auto' }}>
              {contactResults.map((c) => (
                <div key={c.id} onClick={() => pickContact(c)} style={{ padding: '8px 10px', cursor: 'pointer', fontSize: 13 }}>
                  {c.firstName} {c.lastName} · {c.phone}
                </div>
              ))}
            </div>
          )}
        </div>
        <label>{t('rentals.clientPhone')}</label>
        <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />

        <label>{t('rentals.description')}</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: '100%', marginBottom: 10, minHeight: 60 }} />

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label>{t('rentals.startDate')}</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label>{t('rentals.dueDate')}</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ width: '100%' }} />
          </div>
        </div>

        {error && <div className="error-banner" style={{ marginBottom: 10 }}>{error}</div>}
        <button type="button" disabled={saving} onClick={submit} style={{ width: '100%' }}>
          {saving ? t('common.saving') : t('rentals.submit')}
        </button>
      </div>
    </div>
  );
}
