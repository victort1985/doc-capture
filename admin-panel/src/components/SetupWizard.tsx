import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ChevronLeft, ChevronRight, Check, Building2, Users2, UserPlus, CalendarDays, HardDrive, FileStack } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import TemplatePicker from './TemplatePicker';

const STEPS = ['welcome', 'profile', 'organization', 'group', 'users', 'calendar', 'storage', 'templates', 'done'] as const;
type Step = typeof STEPS[number];

export default function SetupWizard({ onClose }: { onClose: (completed: boolean) => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];

  // Collected as we go
  const [orgId, setOrgId] = useState<number | null>(null);
  const [orgName, setOrgName] = useState('');
  const [groupId, setGroupId] = useState<number | null>(null);
  const [groupName, setGroupName] = useState('Users');
  const [template, setTemplate] = useState('classic');

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function next() { setError(null); setStepIndex(i => Math.min(i + 1, STEPS.length - 1)); }
  function back() { setError(null); setStepIndex(i => Math.max(i - 1, 0)); }

  async function finish() {
    try { await apiFetch('/auth/complete-setup-wizard', { method: 'POST' }); } catch { /* non-fatal */ }
    onClose(true);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,22,66,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600, padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}>
        <button className="ghost" onClick={() => onClose(false)} style={{ position: 'absolute', top: 14, insetInlineEnd: 14 }} aria-label="close"><X size={18} /></button>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 22 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ height: 4, flex: 1, borderRadius: 2, background: i <= stepIndex ? 'var(--primary)' : 'var(--border, #e5e5e5)' }} />
          ))}
        </div>

        {error && <div className="error-banner" style={{ marginBottom: 14 }}>{error}</div>}

        {step === 'welcome' && (
          <StepShell icon={<Check size={22} />} title={t('wizard.welcomeTitle')} body={t('wizard.welcomeBody')}>
            <button onClick={next} style={{ width: '100%' }}>{t('wizard.start')}</button>
          </StepShell>
        )}

        {step === 'profile' && (
          <ProfileStep
            onDone={next}
            onError={setError}
            saving={saving}
            setSaving={setSaving}
          />
        )}

        {step === 'organization' && (
          <OrganizationStep
            orgName={orgName}
            setOrgName={setOrgName}
            onCreated={(id) => { setOrgId(id); next(); }}
            onError={setError}
            saving={saving}
            setSaving={setSaving}
          />
        )}

        {step === 'group' && orgId && (
          <GroupStep
            orgId={orgId}
            groupName={groupName}
            setGroupName={setGroupName}
            onCreated={(id) => { setGroupId(id); next(); }}
            onSkip={next}
            onError={setError}
            saving={saving}
            setSaving={setSaving}
          />
        )}

        {step === 'users' && orgId && (
          <UsersStep orgId={orgId} groupId={groupId} onDone={next} onError={setError} />
        )}

        {step === 'calendar' && (
          <StepShell icon={<CalendarDays size={22} />} title={t('wizard.calendarTitle')} body={t('wizard.calendarBody')}>
            <div className="form-actions">
              <button className="ghost" onClick={back}><ChevronLeft size={15} /> {t('wizard.back')}</button>
              <a href="/calendar-sync" target="_blank" rel="noreferrer" className="ghost" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: '1px solid var(--primary)', color: 'var(--primary)' }}>
                {t('wizard.calendarOpenLink')}
              </a>
              <button onClick={next}>{t('wizard.next')} <ChevronRight size={15} /></button>
            </div>
          </StepShell>
        )}

        {step === 'storage' && orgId && (
          <StorageStep orgId={orgId} onDone={next} onSkip={next} onError={setError} onBack={back} />
        )}

        {step === 'templates' && orgId && (
          <StepShell icon={<FileStack size={22} />} title={t('wizard.templatesTitle')} body={t('wizard.templatesBody')}>
            <TemplatePicker
              value={template}
              onChange={setTemplate}
              labels={{ classic: t('documentSeries.templateClassic'), modern: t('documentSeries.templateModern'), minimalist: t('documentSeries.templateMinimalist') }}
            />
            <div className="form-actions" style={{ marginTop: 18 }}>
              <button className="ghost" onClick={back}><ChevronLeft size={15} /> {t('wizard.back')}</button>
              <button
                disabled={saving}
                onClick={async () => {
                  setSaving(true); setError(null);
                  try {
                    await Promise.all([
                      apiFetch(`/quote-settings/${orgId}`, { method: 'PUT', body: JSON.stringify({ template }) }),
                      apiFetch(`/invoice-settings/${orgId}`, { method: 'PUT', body: JSON.stringify({ template }) }),
                      apiFetch(`/delivery-note-settings/${orgId}`, { method: 'PUT', body: JSON.stringify({ template }) }),
                    ]);
                    next();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Failed to save templates');
                  } finally { setSaving(false); }
                }}
              >
                {saving ? t('common.saving') : t('wizard.next')} <ChevronRight size={15} />
              </button>
            </div>
          </StepShell>
        )}

        {step === 'done' && (
          <StepShell icon={<Check size={22} />} title={t('wizard.doneTitle')} body={t('wizard.doneBody')}>
            <button onClick={finish} style={{ width: '100%' }}>{t('wizard.finish')}</button>
          </StepShell>
        )}
      </div>
    </div>
  );
}

function StepShell({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--primary-wash, #eef0fa)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>{icon}</div>
      <h2 style={{ marginTop: 0, marginBottom: 8 }}>{title}</h2>
      <p style={{ color: 'var(--ink-soft)', fontSize: 14.5, marginBottom: 20, whiteSpace: 'pre-line' }}>{body}</p>
      {children}
    </div>
  );
}

function ProfileStep({ onDone, onError, saving, setSaving }: { onDone: () => void; onError: (e: string | null) => void; saving: boolean; setSaving: (v: boolean) => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  async function save() {
    if (!user) return;
    setSaving(true); onError(null);
    try {
      await apiFetch(`/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ firstName, lastName, phone, email: email || undefined }) });
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to save profile');
    } finally { setSaving(false); }
  }

  return (
    <StepShell icon={<Users2 size={22} />} title={t('wizard.profileTitle')} body={t('wizard.profileBody')}>
      <div className="form-grid">
        <div><label>{t('users.firstName')}</label><input value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
        <div><label>{t('users.lastName')}</label><input value={lastName} onChange={e => setLastName(e.target.value)} /></div>
        <div><label>{t('users.phone')}</label><input value={phone} onChange={e => setPhone(e.target.value)} /></div>
        <div><label>{t('phonebook.email')}</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
      </div>
      <div className="form-actions" style={{ marginTop: 18 }}>
        <button className="ghost" onClick={onDone}>{t('wizard.skip')}</button>
        <button disabled={saving} onClick={save}>{saving ? t('common.saving') : t('wizard.next')} <ChevronRight size={15} /></button>
      </div>
    </StepShell>
  );
}

function OrganizationStep({ orgName, setOrgName, onCreated, onError, saving, setSaving }: {
  orgName: string; setOrgName: (v: string) => void; onCreated: (id: number) => void;
  onError: (e: string | null) => void; saving: boolean; setSaving: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  async function create() {
    if (!orgName.trim()) { onError(t('wizard.orgNameRequired')); return; }
    setSaving(true); onError(null);
    try {
      const org = await apiFetch<{ id: number }>('/organizations', { method: 'POST', body: JSON.stringify({ name: orgName.trim() }) });
      onCreated(org.id);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to create organization');
    } finally { setSaving(false); }
  }
  return (
    <StepShell icon={<Building2 size={22} />} title={t('wizard.orgTitle')} body={t('wizard.orgBody')}>
      <label>{t('wizard.orgName')}</label>
      <input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder={t('wizard.orgNamePlaceholder')} />
      <div className="form-actions" style={{ marginTop: 18 }}>
        <button disabled={saving} onClick={create} style={{ width: '100%' }}>{saving ? t('common.saving') : t('wizard.createAndContinue')}</button>
      </div>
    </StepShell>
  );
}

function GroupStep({ orgId, groupName, setGroupName, onCreated, onSkip, onError, saving, setSaving }: {
  orgId: number; groupName: string; setGroupName: (v: string) => void; onCreated: (id: number) => void; onSkip: () => void;
  onError: (e: string | null) => void; saving: boolean; setSaving: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  async function create() {
    if (!groupName.trim()) { onError(t('wizard.groupNameRequired')); return; }
    setSaving(true); onError(null);
    try {
      const group = await apiFetch<{ id: number }>(`/groups?orgId=${orgId}`, { method: 'POST', body: JSON.stringify({ name: groupName.trim() }) });
      onCreated(group.id);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to create group');
    } finally { setSaving(false); }
  }
  return (
    <StepShell icon={<Users2 size={22} />} title={t('wizard.groupTitle')} body={t('wizard.groupBody')}>
      <label>{t('wizard.groupName')}</label>
      <input value={groupName} onChange={e => setGroupName(e.target.value)} />
      <div className="form-actions" style={{ marginTop: 18 }}>
        <button className="ghost" onClick={onSkip}>{t('wizard.skip')}</button>
        <button disabled={saving} onClick={create}>{saving ? t('common.saving') : t('wizard.createAndContinue')}</button>
      </div>
    </StepShell>
  );
}

function UsersStep({ orgId, groupId, onDone, onError }: {
  orgId: number; groupId: number | null; onDone: () => void; onError: (e: string | null) => void;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState([{ username: '', password: '', email: '' }]);
  const [saving, setSaving] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);

  function updateRow(i: number, field: 'username' | 'password' | 'email', v: string) {
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, [field]: v } : r));
  }
  function addRow() { setRows(rs => [...rs, { username: '', password: '', email: '' }]); }
  function removeRow(i: number) { setRows(rs => rs.filter((_, idx) => idx !== i)); }

  async function createAll() {
    const valid = rows.filter(r => r.username.trim() && r.password.trim());
    if (valid.length === 0) { onDone(); return; }
    setSaving(true); onError(null);
    let created = 0;
    try {
      for (const r of valid) {
        await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify({
            username: r.username.trim(), password: r.password.trim(),
            email: r.email.trim() || undefined,
            organizationId: orgId, groupId: groupId ?? undefined,
          }),
        });
        created++;
      }
      setCreatedCount(created);
      onDone();
    } catch (e) {
      onError(e instanceof Error ? `${e instanceof Error ? e.message : 'Failed'} (${created}/${valid.length} ${t('wizard.usersCreatedSoFar')})` : 'Failed to create users');
    } finally { setSaving(false); }
  }

  return (
    <StepShell icon={<UserPlus size={22} />} title={t('wizard.usersTitle')} body={t('wizard.usersBody')}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <input placeholder={t('users.username')} value={r.username} onChange={e => updateRow(i, 'username', e.target.value)} style={{ flex: 1 }} />
          <input placeholder={t('users.password')} type="password" value={r.password} onChange={e => updateRow(i, 'password', e.target.value)} style={{ flex: 1 }} />
          <input placeholder={t('phonebook.email')} type="email" value={r.email} onChange={e => updateRow(i, 'email', e.target.value)} style={{ flex: 1 }} />
          {rows.length > 1 && <button className="ghost" onClick={() => removeRow(i)} style={{ flexShrink: 0 }}><X size={14} /></button>}
        </div>
      ))}
      <button className="ghost" type="button" onClick={addRow} style={{ fontSize: 13, marginBottom: 12 }}>+ {t('wizard.addAnotherUser')}</button>
      <div className="form-actions">
        <button className="ghost" onClick={onDone}>{t('wizard.skip')}</button>
        <button disabled={saving} onClick={createAll}>{saving ? t('common.saving') : t('wizard.createAndContinue')}</button>
      </div>
    </StepShell>
  );
}

function StorageStep({ orgId, onDone, onSkip, onError, onBack }: {
  orgId: number; onDone: () => void; onSkip: () => void; onError: (e: string | null) => void; onBack: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('Main storage');
  const [type, setType] = useState<'local' | 'ftp' | 'sftp' | 'synology'>('local');
  const [basePath, setBasePath] = useState('/documents');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true); onError(null);
    try {
      await apiFetch('/storage/connections', {
        method: 'POST',
        body: JSON.stringify({
          name, type, basePath,
          ...(type !== 'local' ? { host, port: port ? Number(port) : undefined, username, password } : {}),
        }),
      });
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to create storage connection');
    } finally { setSaving(false); }
  }

  return (
    <StepShell icon={<HardDrive size={22} />} title={t('wizard.storageTitle')} body={t('wizard.storageBody')}>
      <label>{t('common.name')}</label>
      <input value={name} onChange={e => setName(e.target.value)} />
      <label>{t('storage.type')}</label>
      <select value={type} onChange={e => setType(e.target.value as any)}>
        <option value="local">{t('storage.local')}</option>
        <option value="ftp">FTP</option>
        <option value="sftp">SFTP</option>
        <option value="synology">{t('storage.synology')}</option>
      </select>
      {type !== 'local' && (
        <div className="form-grid">
          <div><label>{t('storage.host')}</label><input value={host} onChange={e => setHost(e.target.value)} /></div>
          <div><label>{t('storage.port')}</label><input value={port} onChange={e => setPort(e.target.value)} /></div>
          <div><label>{t('storage.username')}</label><input value={username} onChange={e => setUsername(e.target.value)} /></div>
          <div><label>{t('storage.password')}</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} /></div>
        </div>
      )}
      <label>{t('storage.basePath')}</label>
      <input value={basePath} onChange={e => setBasePath(e.target.value)} />
      <div className="form-actions" style={{ marginTop: 18 }}>
        <button className="ghost" onClick={onBack}><ChevronLeft size={15} /> {t('wizard.back')}</button>
        <button className="ghost" onClick={onSkip}>{t('wizard.skip')}</button>
        <button disabled={saving} onClick={create}>{saving ? t('common.saving') : t('wizard.createAndContinue')}</button>
      </div>
    </StepShell>
  );
}
