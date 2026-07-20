import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Upload, X, Building2 } from 'lucide-react';
import { apiFetch } from '../services/api';
import TemplatePicker from '../components/TemplatePicker';

interface Organization { id: number; name: string; }
interface StorageConnection { id: number; name: string; }

interface Settings {
  id?: number;
  companyName?: string;
  companySubtitle?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyFax?: string;
  companyMobile?: string;
  companyPoBox?: string;
  companyTaxId?: string;
  logoBase64?: string;
  notePrefix?: string;
  startingNumber?: number;
  termsText?: string;
  template?: string;
  storageConnection?: StorageConnection;
}

export default function DeliveryNoteSettingsPage() {
  const { t } = useTranslation();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [connections, setConnections] = useState<StorageConnection[]>([]);
  const [selOrgId, setSelOrgId] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageConnectionId, setStorageConnectionId] = useState<number | ''>('');
  const logoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch<Organization[]>('/organizations').then(os => {
      setOrgs(os);
      if (os.length) { setSelOrgId(os[0].id); }
    }).catch(() => {});
    apiFetch<StorageConnection[]>('/storage/connections').then(setConnections).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selOrgId) return;
    apiFetch<Settings>(`/delivery-note-settings/${selOrgId}`)
      .then(s => { setSettings(s ?? {}); setStorageConnectionId(s?.storageConnection?.id ?? ''); })
      .catch(() => { setSettings({}); setStorageConnectionId(''); });
  }, [selOrgId]);

  async function save() {
    if (!selOrgId) return;
    setSaving(true); setSaved(false); setError(null);
    try {
      await apiFetch(`/delivery-note-settings/${selOrgId}`, {
        method: 'PUT',
        body: JSON.stringify({ ...settings, storageConnectionId: storageConnectionId || null }),
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  }

  async function uploadLogo(file: File) {
    if (!selOrgId) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const updated = await apiFetch<Settings>(`/delivery-note-settings/${selOrgId}/logo`, {
        method: 'POST',
        body: fd,
      });
      setSettings(s => ({ ...s, logoBase64: updated.logoBase64 }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); }
  }

  const set = (k: keyof Settings, v: any) => { setSettings(s => ({ ...s, [k]: v })); setSaved(false); };
  const inp = (k: keyof Settings, placeholder = '') => (
    <input
      value={(settings[k] as string | number | undefined) ?? ''}
      placeholder={placeholder}
      onChange={e => set(k, e.target.value)}
    />
  );

  return (
    <div>
      <div className="topbar">
        <div>
          <span className="eyebrow">{t('deliveryNoteSettings.eyebrow')}</span>
          <h1 className="page-title">{t('deliveryNoteSettings.title')}</h1>
        </div>
        <button onClick={save} disabled={saving}>
          <Save size={15} /> {saving ? t('deliveryNoteSettings.saving') : saved ? t('deliveryNoteSettings.saved') : t('deliveryNoteSettings.save')}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="split-layout">
        {/* Org selector */}
        <div className="card split-sidebar">
          <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ink-soft)', marginBottom: 8 }}>{t('deliveryNoteSettings.organization')}</div>
          {orgs.map(o => (
            <div key={o.id} onClick={() => setSelOrgId(o.id)}
              style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', background: selOrgId === o.id ? 'var(--primary)' : 'transparent', color: selOrgId === o.id ? '#fff' : 'inherit', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building2 size={14} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{o.name}</span>
            </div>
          ))}
        </div>

        {/* Settings form */}
        {selOrgId && (
          <div className="split-content">
            {/* Logo */}
            <div className="card" style={{ marginBottom: 14 }}>
              <h3 style={{ margin: '0 0 12px' }}>{t('deliveryNoteSettings.logo')}</h3>
              <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                {settings.logoBase64 ? (
                  <div style={{ position: 'relative' }}>
                    <img src={settings.logoBase64} alt="logo" style={{ height: 72, maxWidth: 180, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 6, padding: 4 }} />
                    <button className="ghost" onClick={() => set('logoBase64', undefined)}
                      style={{ position: 'absolute', top: -8, right: -8, padding: 3, background: 'var(--danger)', color: '#fff', borderRadius: '50%' }}>
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <div style={{ width: 120, height: 72, border: '2px dashed var(--border)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)', fontSize: 12 }}>
                    {t('deliveryNoteSettings.noLogo')}
                  </div>
                )}
                <div>
                  <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => { if (e.target.files?.[0]) uploadLogo(e.target.files[0]); }} />
                  <button onClick={() => logoRef.current?.click()}>
                    <Upload size={14} /> {t('deliveryNoteSettings.uploadLogo')}
                  </button>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 6 }}>{t('deliveryNoteSettings.logoHint')}</div>
                </div>
              </div>
            </div>

            {/* Company info */}
            <div className="card" style={{ marginBottom: 14 }}>
              <h3 style={{ margin: '0 0 14px' }}>{t('deliveryNoteSettings.companyInfo')}</h3>
              <div className="form-grid">
                <div><label>{t('deliveryNoteSettings.companyName')}</label>{inp('companyName', 'e.g. אם.סי. אילת מיוזיק בע"מ')}</div>
                <div><label>{t('deliveryNoteSettings.subtitle')}</label>{inp('companySubtitle', 'e.g. THE MUSICAL CONNECTION')}</div>
                <div style={{ gridColumn: '1/-1' }}><label>{t('deliveryNoteSettings.address')}</label>{inp('companyAddress', 'e.g. נחל חיון 3/3, אילת, מיקוד 8813501')}</div>
                <div><label>{t('deliveryNoteSettings.phone')}</label>{inp('companyPhone', '08-6315342')}</div>
                <div><label>{t('deliveryNoteSettings.fax')}</label>{inp('companyFax', '08-6318461')}</div>
                <div><label>{t('deliveryNoteSettings.mobile')}</label>{inp('companyMobile', '052-4702008')}</div>
                <div><label>{t('deliveryNoteSettings.poBox')}</label>{inp('companyPoBox')}</div>
                <div><label>{t('deliveryNoteSettings.taxId')}</label>{inp('companyTaxId')}</div>
              </div>
            </div>

            {/* Document numbering */}
            <div className="card" style={{ marginBottom: 14 }}>
              <h3 style={{ margin: '0 0 14px' }}>{t('deliveryNoteSettings.numbering')}</h3>
              <div className="form-grid">
                <div>
                  <label>{t('deliveryNoteSettings.notePrefix')}</label>
                  {inp('notePrefix', 'e.g. DN- or leave empty')}
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>
                    {t('deliveryNoteSettings.notePrefixHint')}
                  </div>
                </div>
                <div>
                  <label>{t('deliveryNoteSettings.startingNumber')}</label>
                  <input type="number" value={settings.startingNumber ?? 10000}
                    onChange={e => set('startingNumber', parseInt(e.target.value) || 10000)} />
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>
                    {t('deliveryNoteSettings.startingNumberHint')}
                  </div>
                </div>
              </div>
            </div>

            {/* Storage */}
            <div className="card" style={{ marginBottom: 14 }}>
              <h3 style={{ margin: '0 0 12px' }}>{t('deliveryNoteSettings.storage')}</h3>
              <label>{t('deliveryNoteSettings.storageLabel')}</label>
              <select value={storageConnectionId} onChange={e => setStorageConnectionId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">{t('deliveryNoteSettings.storageNotConfigured')}</option>
                {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Template */}
            <div className="card" style={{ marginBottom: 14 }}>
              <h3 style={{ margin: '0 0 12px' }}>{t('deliveryNoteSettings.template')}</h3>
              <TemplatePicker
                value={settings.template ?? 'classic'}
                onChange={(v) => set('template', v)}
                labels={{ classic: t('documentSeries.templateClassic'), modern: t('documentSeries.templateModern'), minimalist: t('documentSeries.templateMinimalist') }}
              />
              <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 10 }}>{t('deliveryNoteSettings.templateMobileNote')}</p>
            </div>

            {/* Terms */}
            <div className="card">
              <h3 style={{ margin: '0 0 12px' }}>{t('deliveryNoteSettings.terms')}</h3>
              <textarea
                value={settings.termsText ?? ''}
                onChange={e => set('termsText', e.target.value)}
                rows={8}
                style={{ width: '100%', fontFamily: 'var(--font-ui)', fontSize: 13, resize: 'vertical' }}
                placeholder={t('deliveryNoteSettings.termsPlaceholder')}
              />
            </div>

            {/* Live preview — kept in Hebrew regardless of admin UI language,
                since this is a preview of the actual printed document. */}
            <div className="card" style={{ marginTop: 14 }}>
              <h3 style={{ margin: '0 0 12px' }}>{t('deliveryNoteSettings.headerPreview')}</h3>
              <div style={{
                border: '1px solid var(--border)', borderRadius: 8, padding: 16,
                background: '#fff', fontFamily: 'serif', direction: 'rtl',
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              }}>
                <div>
                  {settings.logoBase64 && <img src={settings.logoBase64} alt="" style={{ height: 52, marginBottom: 6 }} />}
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{settings.companyName || t('deliveryNoteSettings.companyName')}</div>
                  {settings.companySubtitle && <div style={{ fontSize: 11, color: '#666' }}>{settings.companySubtitle}</div>}
                  <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>{settings.companyAddress}</div>
                  {(settings.companyPhone || settings.companyFax) && (
                    <div style={{ fontSize: 11, color: '#666' }}>
                      {settings.companyPhone && `Tel: ${settings.companyPhone}`}
                      {settings.companyFax && ` | Fax: ${settings.companyFax}`}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>תעודת משלוח/ו/אי</div>
                  <div style={{ fontSize: 11 }}>הסכם שכירות ו/או ביצוע עבודה</div>
                  <div style={{ fontWeight: 700, fontSize: 18, marginTop: 4 }}>
                    {settings.notePrefix ?? ''}{settings.startingNumber ?? 10000}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
