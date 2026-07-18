import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, X, Save, Phone, Search, Upload, Check, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
interface ParsedContact {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  organization?: string;
  city?: string;
  notes?: string;
}

const EMPTY_FORM = {
  category: 'client', firstName: '', lastName: '', cityId: '', organizationId: '',
  position: '', phone: '', email: '', notes: '',
};

export default function PhoneBookPage() {
  const { t } = useTranslation();
  const CATEGORY_LABEL: Record<string, string> = { client: t('phonebook.client'), technician: t('phonebook.technician'), supplier: t('phonebook.supplier') };
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [showImport, setShowImport] = useState(false);
  const [importParsing, setImportParsing] = useState(false);
  const [importParsed, setImportParsed] = useState<ParsedContact[] | null>(null);
  const [importSelected, setImportSelected] = useState<Set<number>>(new Set());
  const [importCategory, setImportCategory] = useState('client');
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkCategory, setBulkCategory] = useState('client');
  const [bulkBusy, setBulkBusy] = useState(false);

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
      setSelectedIds(new Set());
      setCities(ci);
      setLocations(lo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load phone book');
    }
  }

  useEffect(() => { load(); }, [categoryFilter]);

  // Picks up where the Google OAuth flow left off: Google redirects the
  // whole browser back here (not an XHR, so there's no other way to get
  // the fetched contact list into this page) with either a one-time
  // session id to read the parsed contacts from, or an error message.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('googleImportSession');
    const googleError = params.get('googleImportError');
    if (!sessionId && !googleError) return;

    window.history.replaceState({}, '', window.location.pathname);
    setShowImport(true);
    setImportResult(null);

    if (googleError) {
      setError(t('phonebook.googleImportFailed', { error: googleError }));
      return;
    }
    (async () => {
      setImportParsing(true);
      try {
        const data = await apiFetch<{ contacts: ParsedContact[]; error?: string }>(
          `/phonebook/import/google/${sessionId}`,
        );
        if (data.error) {
          setError(t('phonebook.googleImportFailed', { error: data.error }));
        } else {
          setImportParsed(data.contacts);
          setImportSelected(new Set(data.contacts.map((_, i) => i).filter((i) => data.contacts[i].phone?.trim())));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load Google contacts');
      } finally {
        setImportParsing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connectGoogleContacts() {
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>('/phonebook/import/google/auth-url');
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Google connection');
    }
  }
  useEffect(() => {
    const timeoutId = setTimeout(load, 250);
    return () => clearTimeout(timeoutId);
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
    if (!confirm(t('phonebook.deleteContactConfirm'))) return;
    await apiFetch(`/phonebook/${id}`, { method: 'DELETE' });
    setContacts((prev: any[]) => prev.filter((x: any) => x.id !== id));
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === contacts.length ? new Set() : new Set(contacts.map((c) => c.id)),
    );
  }

  async function applyBulkCategory() {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      await apiFetch('/phonebook/bulk/category', {
        method: 'POST',
        body: JSON.stringify({ ids: [...selectedIds], category: bulkCategory }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move contacts');
    } finally {
      setBulkBusy(false);
    }
  }

  async function applyBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(t('phonebook.bulkDeleteConfirm', { count: selectedIds.size }))) return;
    setBulkBusy(true);
    setError(null);
    try {
      await apiFetch('/phonebook/bulk/delete', {
        method: 'POST',
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete contacts');
    } finally {
      setBulkBusy(false);
    }
  }

  function openImport() {
    setShowImport(true);
    setImportParsed(null);
    setImportSelected(new Set());
    setImportResult(null);
    setError(null);
  }

  function closeImport() {
    setShowImport(false);
    setImportParsed(null);
    setImportSelected(new Set());
    setImportResult(null);
  }

  async function handleVcfFile(file: File) {
    setImportParsing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const parsed = await apiFetch<ParsedContact[]>('/phonebook/import/parse', {
        method: 'POST',
        body: formData,
      });
      setImportParsed(parsed);
      // Pre-select everything with a phone number — the admin already
      // curated this file on their phone by choosing which contacts to
      // export, so defaulting to "all selected" saves re-clicking
      // through the same list; anything missing a phone (can't be
      // saved — the schema requires one) starts unchecked instead.
      setImportSelected(new Set(parsed.map((_, i) => i).filter((i) => parsed[i].phone?.trim())));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse the file');
    } finally {
      setImportParsing(false);
    }
  }

  function toggleImportSelected(index: number) {
    setImportSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function submitImport() {
    if (!importParsed) return;
    const contacts = [...importSelected].map((i) => importParsed[i]);
    if (contacts.length === 0) return;
    setImportSubmitting(true);
    setError(null);
    try {
      const result = await apiFetch<{ imported: number; skipped: number }>('/phonebook/import/commit', {
        method: 'POST',
        body: JSON.stringify({ category: importCategory, contacts }),
      });
      setImportResult(result);
      setImportParsed(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import contacts');
    } finally {
      setImportSubmitting(false);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <span className="eyebrow">{t('phonebook.eyebrow')}</span>
          <h1 className="page-title">{t('nav.phonebook')}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ghost" onClick={openImport}>
            <Upload size={16} /> {t('phonebook.importContacts')}
          </button>
          <button onClick={() => (showForm ? cancelForm() : setShowForm(true))}>
            {showForm ? <><X size={16} /> {t('common.cancel')}</> : <><Plus size={16} /> {t('phonebook.newContact')}</>}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--ink-soft)' }} />
          <input
            placeholder={t('phonebook.searchByName')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: 32, width: '100%' }}
          />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ width: 180 }}>
          <option value="">{t('phonebook.allCategories')}</option>
          <option value="client">{t('phonebook.clients')}</option>
          <option value="technician">{t('phonebook.technicians')}</option>
          <option value="supplier">{t('phonebook.suppliers')}</option>
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showImport && (
        <div className="card form-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ marginTop: 0 }}>{t('phonebook.importContacts')}</h3>
            <button className="ghost" onClick={closeImport}><X size={16} /></button>
          </div>

          {!importResult && (
            <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: -6 }}>
              {t('phonebook.importExplanation')}
            </p>
          )}

          {!importParsed && !importResult && (
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4 }}>{t('phonebook.fromVcf')}</label>
                <input
                  type="file"
                  accept=".vcf,text/vcard"
                  disabled={importParsing}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVcfFile(f); }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4 }}>{t('phonebook.fromGoogle')}</label>
                <button type="button" className="ghost" disabled={importParsing} onClick={connectGoogleContacts}>
                  <Globe size={15} /> {t('phonebook.connectGoogle')}
                </button>
              </div>
              {importParsing && <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{t('phonebook.loadingContacts')}</p>}
            </div>
          )}

          {importParsed && (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <label style={{ margin: 0 }}>{t('phonebook.categoryForAll')}</label>
                <select value={importCategory} onChange={(e) => setImportCategory(e.target.value)} style={{ width: 180 }}>
                  <option value="client">{t('phonebook.client')}</option>
                  <option value="technician">{t('phonebook.technician')}</option>
                  <option value="supplier">{t('phonebook.supplier')}</option>
                </select>
              </div>

              <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 32 }} />
                      <th>{t('common.name')}</th>
                      <th>{t('phonebook.phone')}</th>
                      <th>{t('phonebook.email')}</th>
                      <th>{t('phonebook.organization')}</th>
                      <th>{t('users.city')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importParsed.map((c, i) => {
                      const noPhone = !c.phone?.trim();
                      return (
                        <tr key={i} style={noPhone ? { opacity: 0.5 } : undefined}>
                          <td>
                            <input
                              type="checkbox"
                              checked={importSelected.has(i)}
                              disabled={noPhone}
                              onChange={() => toggleImportSelected(i)}
                            />
                          </td>
                          <td>{c.firstName} {c.lastName}</td>
                          <td className="mono">{c.phone || t('phonebook.noPhoneCantImport')}</td>
                          <td>{c.email ?? '—'}</td>
                          <td>{c.organization ?? '—'}</td>
                          <td>{c.city ?? '—'}</td>
                        </tr>
                      );
                    })}
                    {importParsed.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: 24 }}>
                        {t('phonebook.noContactsInFile')}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  disabled={importSelected.size === 0 || importSubmitting}
                  onClick={submitImport}
                >
                  <Check size={15} /> {importSubmitting ? t('phonebook.importing') : t('phonebook.importSelected', { count: importSelected.size })}
                </button>
              </div>
            </>
          )}

          {importResult && (
            <div>
              <p>
                {t('phonebook.importedCount', { count: importResult.imported })}
                {importResult.skipped > 0 && ` ${t('phonebook.skippedCount', { count: importResult.skipped })}`}
              </p>
              <div className="form-actions">
                <button type="button" onClick={closeImport}>{t('phonebook.done')}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <form className="card form-card" onSubmit={submitContact}>
          <h3 style={{ marginTop: 0 }}>{editingId ? t('phonebook.editContact') : t('phonebook.newContact')}</h3>
          <div className="form-grid">
            <div>
              <label>{t('phonebook.category')}</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="client">{t('phonebook.client')}</option>
                <option value="technician">{t('phonebook.technician')}</option>
                <option value="supplier">{t('phonebook.supplier')}</option>
              </select>
            </div>
            <div>
              <label>{t('users.firstName')}</label>
              <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
            </div>
            <div>
              <label>{t('users.lastName')}</label>
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
            </div>
            <div>
              <label>{t('users.city')}</label>
              <select value={form.cityId} onChange={(e) => setForm({ ...form, cityId: e.target.value })}>
                <option value="">—</option>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.region?.name})</option>)}
              </select>
            </div>
            <div>
              <label>{t('phonebook.organization')}</label>
              <select value={form.organizationId} onChange={(e) => setForm({ ...form, organizationId: e.target.value })}>
                <option value="">—</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.city?.name})</option>)}
              </select>
            </div>
            <div>
              <label>{t('phonebook.position')}</label>
              <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            </div>
            <div>
              <label>{t('phonebook.phone')}</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            </div>
            <div>
              <label>{t('phonebook.emailLabel')}</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>{t('phonebook.notes')}</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} style={{ width: '100%' }} />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit"><Save size={15} /> {editingId ? t('calls.saveChanges') : t('phonebook.createContact')}</button>
          </div>
        </form>
      )}

      {selectedIds.size > 0 && (
        <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, padding: '10px 16px' }}>
          <strong>{t('phonebook.selectedCount', { count: selectedIds.size })}</strong>
          <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} style={{ width: 160 }}>
            <option value="client">{t('phonebook.client')}</option>
            <option value="technician">{t('phonebook.technician')}</option>
            <option value="supplier">{t('phonebook.supplier')}</option>
          </select>
          <button type="button" className="ghost" disabled={bulkBusy} onClick={applyBulkCategory}>
            {t('phonebook.moveToCategory')}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={bulkBusy}
            onClick={applyBulkDelete}
            style={{ color: 'var(--danger)' }}
          >
            <Trash2 size={15} /> {t('phonebook.deleteSelected')}
          </button>
          <button type="button" className="ghost" onClick={() => setSelectedIds(new Set())} style={{ marginLeft: 'auto' }}>
            {t('phonebook.clearSelection')}
          </button>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input
                  type="checkbox"
                  checked={contacts.length > 0 && selectedIds.size === contacts.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>{t('common.name')}</th>
              <th>{t('phonebook.category')}</th>
              <th>{t('phonebook.organization')}</th>
              <th>{t('users.city')}</th>
              <th>{t('phonebook.phone')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id}>
                <td>
                  <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelected(c.id)} />
                </td>
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
                    <button className="ghost" onClick={() => openEditForm(c)} title={t('common.edit')}><Pencil size={15} /></button>
                    <button className="ghost" onClick={() => removeContact(c.id)} title={t('common.delete')} style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: 24 }}>{t('phonebook.noContacts')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
