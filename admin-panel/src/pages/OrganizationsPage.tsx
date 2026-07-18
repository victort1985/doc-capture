import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Upload, Building2, Pencil } from 'lucide-react';
import { apiFetch, apiFetchBlob, getToken, BASE_URL } from '../services/api';

interface Org {
  id: number;
  name: string;
  createdAt: string;
}

function LogoThumb({ orgId, version }: { orgId: number; version: number }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    apiFetchBlob(`/organizations/${orgId}/logo`).then((u) => {
      if (cancelled) return;
      objectUrl = u;
      setUrl(u);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, version]);

  return (
    <div style={{
      width: 40, height: 40, borderRadius: 8, overflow: 'hidden',
      background: url ? '#fff' : 'var(--surface-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: url ? '1px solid var(--border, #e5e5e5)' : undefined,
    }}>
      {url ? (
        <img src={url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      ) : (
        <Building2 size={18} color="var(--ink-soft)" />
      )}
    </div>
  );
}

export default function OrganizationsPage() {
  const { t } = useTranslation();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [showForm, setShowForm] = useState(false);
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});
  const [logoVersion, setLogoVersion] = useState(0); // bump to refetch the thumb after a new upload

  async function load() {
    try {
      setOrgs(await apiFetch<Org[]>('/organizations'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load organizations');
    }
  }

  useEffect(() => { load(); }, []);

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/organizations', { method: 'POST', body: JSON.stringify({ name: newName }) });
      setNewName('');
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    }
  }

  async function removeOrg(id: number) {
    if (!confirm(t('organizations.deleteConfirm'))) return;
    await apiFetch(`/organizations/${id}`, { method: 'DELETE' });
    setOrgs((prev: any[]) => prev.filter((x: any) => x.id !== id));
  }

  async function uploadLogo(id: number, file: File) {
    setError(null);
    const formData = new FormData();
    formData.append('logo', file);
    try {
      const res = await fetch(`${BASE_URL}/organizations/${id}/logo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      setLogoVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload logo');
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <span className="eyebrow">{t('organizations.eyebrow')}</span>
          <h1 className="page-title">{t('organizations.title')}</h1>
        </div>
        <button onClick={() => setShowForm((s) => !s)}>
          <Plus size={16} /> {t('organizations.createOrg')}
        </button>
      </div>

      <p style={{ color: 'var(--ink-soft)', marginTop: -8, marginBottom: 24, maxWidth: 640 }}>
        {t('organizations.description')}
      </p>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <form className="card form-card" onSubmit={createOrg} style={{ maxWidth: 420 }}>
          <label>{t('organizations.orgName')}</label>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} required autoFocus />
          <div className="form-actions">
            <button type="submit"><Plus size={16} /> {t('groups.create')}</button>
          </div>
        </form>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{t('organizations.logo')}</th>
              <th>{t('common.name')}</th>
              <th>{t('common.createdAt')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id}>
                <td><LogoThumb orgId={o.id} version={logoVersion} /></td>
                <td>
                  <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                    <input
                      defaultValue={o.name}
                      onBlur={async (e) => {
                        const newName = e.target.value.trim();
                        if (newName && newName !== o.name) {
                          await apiFetch(`/organizations/${o.id}`, { method: 'PATCH', body: JSON.stringify({ name: newName }) });
                          load();
                        }
                      }}
                      style={{
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        padding: '6px 28px 6px 8px',
                        borderRadius: 6,
                        width: '100%',
                      }}
                    />
                    <Pencil size={13} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', pointerEvents: 'none' }} />
                  </div>
                </td>
                <td className="mono">{new Date(o.createdAt).toLocaleDateString()}</td>
                <td>
                  <div className="row-actions">
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      ref={(el) => { fileInputs.current[o.id] = el; }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadLogo(o.id, file);
                        e.target.value = '';
                      }}
                    />
                    <button className="ghost" onClick={() => fileInputs.current[o.id]?.click()} title={t('organizations.uploadLogo')}>
                      <Upload size={15} />
                    </button>
                    <button className="ghost" onClick={() => removeOrg(o.id)} title={t('common.delete')} style={{ color: 'var(--danger)' }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {orgs.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 32, color: 'var(--ink-soft)' }}>
                <Building2 size={28} strokeWidth={1.5} style={{ marginBottom: 8 }} /><br />
                {t('organizations.empty')}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
