import { useEffect, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Building2, Lock, Save, TriangleAlert, X } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import TemplatePicker from './TemplatePicker';
import AppPasswordHelp from './AppPasswordHelp';

interface Organization { id: number; name: string; }
interface StorageConnection { id: number; name: string; }
interface HeaderPreview {
  companyName?: string;
  companySubtitle?: string;
  companyAddress?: string;
  logoBase64?: string;
}
interface SeriesSettings {
  numberPrefix?: string | null;
  startingNumber?: number | null;
  numberLocked?: boolean;
  footerText?: string | null;
  storageConnection?: StorageConnection;
  template?: string;
  autoSendEmail?: boolean;
}

export default function DocumentSeriesSettings({ kind, navLabelKey }: { kind: 'quote' | 'invoice'; navLabelKey: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperAdmin = user?.organizationId == null;
  const apiBase = `/${kind}-settings`;

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [connections, setConnections] = useState<StorageConnection[]>([]);
  const [selOrgId, setSelOrgId] = useState<number | null>(null);
  const [header, setHeader] = useState<HeaderPreview>({});
  const [settings, setSettings] = useState<SeriesSettings>({});
  const [footerText, setFooterText] = useState('');
  const [template, setTemplate] = useState('classic');
  const [autoSendEmail, setAutoSendEmail] = useState(false);
  const [primaryEmail, setPrimaryEmail] = useState('');
  const [primaryEmailPassword, setPrimaryEmailPassword] = useState('');
  const [primaryEmailSaving, setPrimaryEmailSaving] = useState(false);
  const [primaryEmailSaved, setPrimaryEmailSaved] = useState(false);
  const [storageConnectionId, setStorageConnectionId] = useState<number | ''>('');
  const [prefixDraft, setPrefixDraft] = useState('');
  const [startingNumberDraft, setStartingNumberDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [password, setPassword] = useState('');
  const [locking, setLocking] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  useEffect(() => {
    if (isSuperAdmin) {
      apiFetch<Organization[]>('/organizations').then(os => { setOrgs(os); if (os.length) setSelOrgId(os[0].id); }).catch(() => {});
    } else if (user?.organizationId) {
      setSelOrgId(user.organizationId);
    }
    apiFetch<StorageConnection[]>('/storage/connections').then(setConnections).catch(() => {});
    apiFetch<{ emailAddress?: string }>('/document-email-settings').then(s => setPrimaryEmail(s?.emailAddress ?? '')).catch(() => {});
  }, [isSuperAdmin, user?.organizationId]);

  useEffect(() => {
    if (!selOrgId) return;
    setError(null);
    apiFetch<HeaderPreview>(`/delivery-note-settings/${selOrgId}`).then(h => setHeader(h ?? {})).catch(() => setHeader({}));
    apiFetch<SeriesSettings>(`${apiBase}/${selOrgId}`).then(s => {
      setSettings(s ?? {});
      setFooterText(s?.footerText ?? '');
      setTemplate(s?.template ?? 'classic');
      setAutoSendEmail(s?.autoSendEmail ?? false);
      setStorageConnectionId(s?.storageConnection?.id ?? '');
      setPrefixDraft(s?.numberPrefix ?? '');
      setStartingNumberDraft(s?.startingNumber != null ? String(s.startingNumber) : '');
    }).catch(() => setSettings({}));
  }, [selOrgId]);

  async function savePrimaryEmail() {
    setPrimaryEmailSaving(true); setPrimaryEmailSaved(false);
    try {
      await apiFetch('/document-email-settings', {
        method: 'PUT',
        body: JSON.stringify({ emailAddress: primaryEmail, ...(primaryEmailPassword.trim() ? { appPassword: primaryEmailPassword.trim() } : {}) }),
      });
      setPrimaryEmailPassword('');
      setPrimaryEmailSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save primary email');
    } finally { setPrimaryEmailSaving(false); }
  }

  async function saveEveryday() {
    if (!selOrgId) return;
    setSaving(true); setSaved(false); setError(null);
    try {
      await apiFetch(`${apiBase}/${selOrgId}`, {
        method: 'PUT',
        body: JSON.stringify({ footerText, storageConnectionId: storageConnectionId || null, template, autoSendEmail }),
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  }

  function openConfirm() {
    setLockError(null);
    setAgreed(false);
    setPassword('');
    setConfirmOpen(true);
  }

  async function confirmLock() {
    if (!selOrgId || !agreed || !password) return;
    setLocking(true);
    setLockError(null);
    try {
      const updated = await apiFetch<SeriesSettings>(`${apiBase}/${selOrgId}/lock-numbering`, {
        method: 'POST',
        body: JSON.stringify({
          prefix: prefixDraft || undefined,
          startingNumber: Number(startingNumberDraft),
          password,
        }),
      });
      setSettings(updated);
      setConfirmOpen(false);
    } catch (e) {
      setLockError(e instanceof Error ? e.message : 'Failed to lock numbering');
    } finally { setLocking(false); }
  }

  const startingNumberValid = startingNumberDraft.trim() !== '' && Number.isInteger(Number(startingNumberDraft)) && Number(startingNumberDraft) >= 0;

  return (
    <div>
      <div className="topbar">
        <div><span className="eyebrow">{t(navLabelKey)}</span><h1 className="page-title">{t('documentSeries.numbering')}</h1></div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="split-layout">
        {isSuperAdmin && (
          <div className="card split-sidebar">
            <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ink-soft)', marginBottom: 8 }}>{t('documentSeries.organization')}</div>
            {orgs.map(o => (
              <div key={o.id} onClick={() => setSelOrgId(o.id)}
                style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', background: selOrgId === o.id ? 'var(--primary)' : 'transparent', color: selOrgId === o.id ? '#fff' : 'inherit', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Building2 size={14} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{o.name}</span>
              </div>
            ))}
          </div>
        )}

        {selOrgId && (
          <div className="split-content">
            {/* Header preview — read-only, pulled from Delivery note settings */}
            <div className="card" style={{ marginBottom: 14 }}>
              <h3 style={{ margin: '0 0 6px' }}>{t('documentSeries.header')}</h3>
              <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 0, marginBottom: 12 }}>
                {t('documentSeries.headerHint')}
              </p>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, background: '#fff', display: 'flex', gap: 14, alignItems: 'center' }}>
                {header.logoBase64 && <img src={header.logoBase64} alt="" style={{ height: 48 }} />}
                <div>
                  <div style={{ fontWeight: 700 }}>{header.companyName || t('documentSeries.headerEmpty')}</div>
                  {header.companySubtitle && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{header.companySubtitle}</div>}
                  {header.companyAddress && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{header.companyAddress}</div>}
                </div>
              </div>
            </div>

            {/* Numbering */}
            <div className="card" style={{ marginBottom: 14 }}>
              <h3 style={{ margin: '0 0 12px' }}>{t('documentSeries.numbering')}</h3>
              {settings.numberLocked ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface-muted)', borderRadius: 8 }}>
                  <Lock size={16} />
                  <div>
                    <div style={{ fontWeight: 700 }}>{settings.numberPrefix}{settings.startingNumber}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{t('documentSeries.numberingLocked')}</div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="form-grid">
                    <div>
                      <label>{t('documentSeries.prefix')}</label>
                      <input value={prefixDraft} onChange={e => setPrefixDraft(e.target.value)} placeholder={t('documentSeries.prefixPlaceholder')} />
                    </div>
                    <div>
                      <label>{t('documentSeries.startingNumber')}</label>
                      <input type="number" value={startingNumberDraft} onChange={e => setStartingNumberDraft(e.target.value)} placeholder={t('documentSeries.startingNumberPlaceholder')} />
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                    {t('documentSeries.numberingHint')}
                  </p>
                  <button type="button" onClick={openConfirm} disabled={!startingNumberValid}>
                    <Lock size={15} /> {t('documentSeries.applyAndLock')}
                  </button>
                </>
              )}
            </div>

            {/* Template */}
            <div className="card" style={{ marginBottom: 14 }}>
              <h3 style={{ margin: '0 0 12px' }}>{t('documentSeries.template')}</h3>
              <TemplatePicker
                value={template}
                onChange={setTemplate}
                labels={{ classic: t('documentSeries.templateClassic'), modern: t('documentSeries.templateModern'), minimalist: t('documentSeries.templateMinimalist') }}
              />
            </div>

            {/* Primary email — shared across quotes/invoices/delivery notes */}
            <div className="card" style={{ marginBottom: 14 }}>
              <h3 style={{ margin: '0 0 6px' }}>{t('documentSeries.primaryEmail')}</h3>
              <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 0, marginBottom: 12 }}>{t('documentSeries.primaryEmailHint')}</p>
              <label>{t('documentSeries.primaryEmailAddress')}</label>
              <input type="email" value={primaryEmail} onChange={e => setPrimaryEmail(e.target.value)} placeholder="documents@yourcompany.com" />
              <label>{t('documentSeries.primaryEmailAppPassword')}<AppPasswordHelp /></label>
              <input type="password" value={primaryEmailPassword} onChange={e => setPrimaryEmailPassword(e.target.value)} placeholder={t('ordersEmail.appPasswordKeepPlaceholder')} />
              <div className="form-actions">
                <button type="button" disabled={primaryEmailSaving} onClick={savePrimaryEmail}>
                  {primaryEmailSaving ? t('common.saving') : t('common.save')}
                </button>
                {primaryEmailSaved && <span className="stamp-badge on">{t('deliveryNoteSettings.saved') ?? t('documentSeries.saved')}</span>}
              </div>
            </div>

            {/* Auto-send toggle for this document type */}
            <div className="card" style={{ marginBottom: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" checked={autoSendEmail} onChange={e => setAutoSendEmail(e.target.checked)} />
                {t('documentSeries.autoSendEmail', { kind })}
              </label>
              <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 6 }}>{t('documentSeries.autoSendEmailHint')}</p>
            </div>

            {/* Storage */}
            <div className="card" style={{ marginBottom: 14 }}>
              <h3 style={{ margin: '0 0 12px' }}>{t('documentSeries.storage')}</h3>
              <label>{t('documentSeries.storageLabel', { kind })}</label>
              <select value={storageConnectionId} onChange={e => setStorageConnectionId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">{t('documentSeries.storageNotConfigured')}</option>
                {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Footer */}
            <div className="card" style={{ marginBottom: 14 }}>
              <h3 style={{ margin: '0 0 12px' }}>{t('documentSeries.footer', { kind })}</h3>
              <textarea
                value={footerText}
                onChange={e => setFooterText(e.target.value)}
                rows={6}
                style={{ width: '100%', fontFamily: 'var(--font-ui)', fontSize: 13, resize: 'vertical' }}
                placeholder={t('documentSeries.footerPlaceholder', { kind })}
              />
            </div>

            <button onClick={saveEveryday} disabled={saving}>
              <Save size={15} /> {saving ? t('documentSeries.saving') : saved ? t('documentSeries.saved') : t('documentSeries.save')}
            </button>
          </div>
        )}
      </div>

      {/* Irreversible-action confirm modal */}
      {confirmOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={() => !locking && setConfirmOpen(false)}>
          <div className="card" style={{ width: 420, border: '2px solid var(--danger, crimson)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={() => setConfirmOpen(false)} disabled={locking}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: -10 }}>
              <TriangleAlert size={56} color="var(--danger, crimson)" strokeWidth={1.5} />
              <h3 style={{ margin: '14px 0 6px', color: 'var(--danger, crimson)' }}>{t('documentSeries.confirmTitle')}</h3>
              <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginBottom: 4 }}>
                <Trans i18nKey="documentSeries.confirmBody" values={{ org: orgs.find(o => o.id === selOrgId)?.name }} components={{ b: <b /> }} />
              </p>
              <p style={{ fontSize: 20, fontWeight: 800, margin: '4px 0 14px' }}>{prefixDraft}{startingNumberDraft || '0'}</p>
              <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 16 }}>
                {t('documentSeries.confirmWarning')}
              </p>
            </div>

            {lockError && <div className="error-banner" style={{ marginBottom: 12 }}>{lockError}</div>}

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, marginBottom: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 2 }} />
              {t('documentSeries.confirmCheckbox')}
            </label>

            <label>{t('documentSeries.confirmPasswordLabel')}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus />

            <button
              onClick={confirmLock}
              disabled={!agreed || !password || locking}
              style={{ width: '100%', marginTop: 14, background: 'var(--danger, crimson)', borderColor: 'var(--danger, crimson)' }}
            >
              <Lock size={15} /> {locking ? t('documentSeries.confirmApplying') : t('documentSeries.confirmApply')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
