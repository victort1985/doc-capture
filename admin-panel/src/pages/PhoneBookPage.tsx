import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, X, Save, Phone, Search } from 'lucide-react';
import { apiFetch, BASE_URL, getToken } from '../services/api';

interface City { id: number; name: string; region?: { id: number; name: string } }
interface Location { id: number; name: string; city?: City }
interface Contact {
  id: number;
  category: 'client' | 'technician' | 'supplier';
  firstName: string;
  lastName: string;
  city?: City;
  organization?: Location;
  position?: string;
  phone: string;
  email?: string;
  notes?: string;
  photoRelativePath?: string;
}

const EMPTY_FORM = {
  category: 'client', firstName: '', lastName: '', cityId: '', organizationId: '',
  position: '', phone: '', email: '', notes: '',
};

const CATEGORY_LABEL: Record<string, string> = { client: 'Client', technician: 'Technician', supplier: 'Supplier' };

export default function PhoneBookPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.set('category', categoryFilter);
      if (query) params.set('q', query);
      const [c, ci, lo] = await Promise.all([
        apiFetch<Contact[]>(`/phonebook?${params.toString()}`),
        apiFetch<City[]>('/locations/cities'),
        apiFetch<Location[]>('/locations'),
      ]);
      setContacts(c);
      setCities(ci);
      setLocations(lo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load phone book');
    }
  }

  useEffect(() => { load(); }, [categoryFilter]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function openEditForm(c: Contact) {
    setEditingId(c.id);
    setForm({
      category: c.category,
      firstName: c.firstName,
      lastName: c.lastName,
      cityId: c.city ? String(c.city.id) : '',
      organizationId: c.organization ? String(c.organization.id) : '',
      position: c.position || '',
      phone: c.phone,
      email: c.email || '',
      notes: c.notes || '',
    });
    setShowForm(true);
  }

  function cancelForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  }

  async function submitContact(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const formData = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (v !== '' && v !== undefined) formData.append(k, String(v));
    });
    try {
      const res = await fetch(`${BASE_URL}/phonebook${editingId ? `/${editingId}` : ''}`, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Save failed');
      cancelForm();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save contact');
    }
  }

  async function removeContact(id: number) {
    if (!confirm('Delete this contact?')) return;
    await apiFetch(`/phonebook/${id}`, { method: 'DELETE' });
    setContacts((prev: any[]) => prev.filter((x: any) => x.id !== id));
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <span className="eyebrow">Directory</span>
          <h1 className="page-title">Phone book</h1>
        </div>
        <button onClick={() => (showForm ? cancelForm() : setShowForm(true))}>
          {showForm ? <><X size={16} /> Cancel</> : <><Plus size={16} /> New contact</>}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--ink-soft)' }} />
          <input
            placeholder="Search by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: 32, width: '100%' }}
          />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ width: 180 }}>
          <option value="">All categories</option>
          <option value="client">Clients</option>
          <option value="technician">Technicians</option>
          <option value="supplier">Suppliers</option>
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <form className="card form-card" onSubmit={submitContact}>
          <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit contact' : 'New contact'}</h3>
          <div className="form-grid">
            <div>
              <label>Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="client">Client</option>
                <option value="technician">Technician</option>
                <option value="supplier">Supplier</option>
              </select>
            </div>
            <div>
              <label>First name</label>
              <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
            </div>
            <div>
              <label>Last name</label>
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
            </div>
            <div>
              <label>City</label>
              <select value={form.cityId} onChange={(e) => setForm({ ...form, cityId: e.target.value })}>
                <option value="">—</option>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.region?.name})</option>)}
              </select>
            </div>
            <div>
              <label>Organization</label>
              <select value={form.organizationId} onChange={(e) => setForm({ ...form, organizationId: e.target.value })}>
                <option value="">—</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.city?.name})</option>)}
              </select>
            </div>
            <div>
              <label>Position</label>
              <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            </div>
            <div>
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            </div>
            <div>
              <label>E-mail</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} style={{ width: '100%' }} />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit"><Save size={15} /> {editingId ? 'Save changes' : 'Create contact'}</button>
          </div>
        </form>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Organization</th>
              <th>City</th>
              <th>Phone</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.firstName} {c.lastName}
                  {c.position && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{c.position}</div>}
                </td>
                <td><span className="stamp-badge neutral">{CATEGORY_LABEL[c.category]}</span></td>
                <td>{c.organization?.name ?? '—'}</td>
                <td>{c.city?.name ?? '—'}</td>
                <td className="mono"><Phone size={12} style={{ marginRight: 4, verticalAlign: -1 }} />{c.phone}</td>
                <td>
                  <div className="row-actions">
                    <button className="ghost" onClick={() => openEditForm(c)} title="Edit"><Pencil size={15} /></button>
                    <button className="ghost" onClick={() => removeContact(c.id)} title="Delete" style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: 24 }}>No contacts</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
