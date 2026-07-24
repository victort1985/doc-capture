import { useEffect, useState } from 'react';
import { Save, Route, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

interface UserRow {
  id: number;
  username: string;
}

interface Connection {
  id: number;
  name: string;
  type: string;
}

interface ClientSettings {
  documentStorageConnection?: { id: number } | null;
  photoStorageConnection?: { id: number } | null;
  documentSubfolderPattern: string;
  photoSubfolderPattern: string;
}

const DEFAULT_FORM = {
  documentStorageConnectionId: '',
  photoStorageConnectionId: '',
  documentSubfolderPattern: '{date}/{place}',
  photoSubfolderPattern: '{date}/{place}',
};

const DOCUMENT_TYPE_KEYS = ['delivery_note', 'recount', 'transfer', 'fleet', 'warehouse', 'order'];

interface DocTypeSettings {
  documentType: string;
  storageConnection?: { id: number } | null;
  pathPattern: string;
  filenameTemplate: string;
}

interface TemplateVar { key: string; label: string; }

export default function StorageRoutingPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [docTypeSettings, setDocTypeSettings] = useState<Record<string, { storageConnectionId: string; pathPattern: string; filenameTemplate: string }>>({});
  const [templateVars, setTemplateVars] = useState<TemplateVar[]>([]);
  const [savedDocType, setSavedDocType] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DocTypeSettings[]>('/document-storage-settings').then((rows) => {
      const map: typeof docTypeSettings = {};
      rows.forEach((r) => {
        map[r.documentType] = {
          storageConnectionId: r.storageConnection?.id != null ? String(r.storageConnection.id) : '',
          pathPattern: r.pathPattern,
          filenameTemplate: r.filenameTemplate,
        };
      });
      setDocTypeSettings(map);
    }).catch((e) => setError(e.message));
    apiFetch<TemplateVar[]>('/document-storage-settings/template-variables').then(setTemplateVars).catch(() => {});
  }, []);

  async function saveDocType(documentType: string) {
    const s = docTypeSettings[documentType];
    setError(null);
    try {
      await apiFetch(`/document-storage-settings/${documentType}`, {
        method: 'PUT',
        body: JSON.stringify({
          storageConnectionId: s.storageConnectionId ? parseInt(s.storageConnectionId, 10) : null,
          pathPattern: s.pathPattern,
          filenameTemplate: s.filenameTemplate,
        }),
      });
      setSavedDocType(documentType);
      setTimeout(() => setSavedDocType(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save document type settings');
    }
  }

  useEffect(() => {
    apiFetch<UserRow[]>('/users').then(setUsers).catch((e) => setError(e.message));
    apiFetch<Connection[]>('/storage/connections').then(setConnections).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (selectedUserId == null) return;
    setSaved(false);
    apiFetch<ClientSettings | null>(`/storage/client-settings/${selectedUserId}`)
      .then((settings) => {
        if (!settings) {
          setForm(DEFAULT_FORM);
          return;
        }
        setForm({
          documentStorageConnectionId: settings.documentStorageConnection?.id != null
            ? String(settings.documentStorageConnection.id) : '',
          photoStorageConnectionId: settings.photoStorageConnection?.id != null
            ? String(settings.photoStorageConnection.id) : '',
          documentSubfolderPattern: settings.documentSubfolderPattern || '{date}/{place}',
          photoSubfolderPattern: settings.photoSubfolderPattern || '{date}/{place}',
        });
      })
      .catch((e) => setError(e.message));
  }, [selectedUserId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (selectedUserId == null) return;
    setError(null);
    try {
      await apiFetch(`/storage/client-settings/${selectedUserId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          documentStorageConnectionId: form.documentStorageConnectionId
            ? parseInt(form.documentStorageConnectionId, 10) : undefined,
          photoStorageConnectionId: form.photoStorageConnectionId
            ? parseInt(form.photoStorageConnectionId, 10) : undefined,
          documentSubfolderPattern: form.documentSubfolderPattern,
          photoSubfolderPattern: form.photoSubfolderPattern,
        }),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  }

  return (
    <div>
      <div className="topbar">
        <span className="eyebrow">{t('storageRouting.eyebrow')}</span>
        <h1 className="page-title">{t('storageRouting.title')}</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 8, marginBottom: 0 }}>
          {t('storageRouting.explanation')}
        </p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <label>{t('storageRouting.user')}</label>
        <select
          value={selectedUserId ?? ''}
          onChange={(e) => setSelectedUserId(e.target.value ? parseInt(e.target.value, 10) : null)}
        >
          <option value="">{t('storageRouting.selectUser')}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.username}</option>
          ))}
        </select>
      </div>

      {selectedUserId != null && (
        <form className="card form-card" onSubmit={save}>
          <div className="form-grid">
            <div>
              <label>{t('storageRouting.docStorageConn')}</label>
              <select
                value={form.documentStorageConnectionId}
                onChange={(e) => setForm({ ...form, documentStorageConnectionId: e.target.value })}
              >
                <option value="">— none —</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                ))}
              </select>
            </div>
            <div>
              <label>{t('storageRouting.photoStorageConn')}</label>
              <select
                value={form.photoStorageConnectionId}
                onChange={(e) => setForm({ ...form, photoStorageConnectionId: e.target.value })}
              >
                <option value="">— none —</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                ))}
              </select>
            </div>
            <div>
              <label>{t('storageRouting.docSubfolderPattern')}</label>
              <input
                className="mono"
                value={form.documentSubfolderPattern}
                onChange={(e) => setForm({ ...form, documentSubfolderPattern: e.target.value })}
              />
            </div>
            <div>
              <label>{t('storageRouting.photoSubfolderPattern')}</label>
              <input
                className="mono"
                value={form.photoSubfolderPattern}
                onChange={(e) => setForm({ ...form, photoSubfolderPattern: e.target.value })}
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit"><Save size={16} /> {t('storageRouting.saveRouting')}</button>
            {saved && <span className="stamp-badge on"><Check size={12} /> {t('storageRouting.saved')}</span>}
          </div>
        </form>
      )}

      {connections.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <Route size={32} strokeWidth={1.5} />
            <strong>{t('storage.emptyTitle')}</strong>
            <span>{t('storageRouting.createOneFirst')}</span>
          </div>
        </div>
      )}

      {/* Per-document-type storage path + filename template settings */}
      <div className="topbar" style={{ marginTop: 32 }}>
        <span className="eyebrow">{t('storageRouting.documentTypes')}</span>
        <h1 className="page-title" style={{ fontSize: 22 }}>{t('storageRouting.savePathsTitle')}</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 8, marginBottom: 0 }}>
          {t('storageRouting.docTypesExplanation')}
        </p>
      </div>

      {templateVars.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <strong>{t('storageRouting.availableVars')}</strong>
          <ul style={{ marginTop: 8, marginBottom: 0, paddingInlineStart: 20 }}>
            {templateVars.map((v) => (
              <li key={v.key} style={{ marginBottom: 4 }}>
                <code className="mono" style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: 4 }}>{'{' + v.key + '}'}</code>
                {' — '}{v.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {DOCUMENT_TYPE_KEYS.map((type) => {
        const s = docTypeSettings[type] ?? { storageConnectionId: '', pathPattern: '{location}/{date}', filenameTemplate: '{docType}-{number}' };
        return (
          <div className="card form-card" key={type} style={{ marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>{t(`storageRouting.docType.${type}`)}</h3>
            <div className="form-grid">
              <div>
                <label>{t('storageRouting.storageConnection')}</label>
                <select
                  value={s.storageConnectionId}
                  onChange={(e) => setDocTypeSettings({ ...docTypeSettings, [type]: { ...s, storageConnectionId: e.target.value } })}
                >
                  <option value="">— none —</option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                  ))}
                </select>
              </div>
              <div>
                <label>{t('storageRouting.folderPathPattern')}</label>
                <input
                  className="mono"
                  value={s.pathPattern}
                  onChange={(e) => setDocTypeSettings({ ...docTypeSettings, [type]: { ...s, pathPattern: e.target.value } })}
                />
              </div>
              <div>
                <label>{t('storageRouting.filenameTemplate')}</label>
                <input
                  className="mono"
                  value={s.filenameTemplate}
                  onChange={(e) => setDocTypeSettings({ ...docTypeSettings, [type]: { ...s, filenameTemplate: e.target.value } })}
                />
              </div>
            </div>
            <div className="form-actions">
              <button onClick={() => saveDocType(type)}><Save size={16} /> {t('common.save')}</button>
              {savedDocType === type && <span className="stamp-badge on"><Check size={12} /> {t('storageRouting.saved')}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
