import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LogOut, Menu, X, Settings, Globe, ChevronDown, ChevronRight, LayoutGrid, ListTree,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import { useSetupWizard } from './SetupWizardGate';
import TermsOfServiceContent from './TermsOfServiceContent';
import logo from '../assets/logo.png';
import CopyrightFooter from './CopyrightFooter';
import LicenseWarningBanner from './LicenseWarningBanner';
import { visibleGroups, type NavGroup } from '../config/navConfig';

const NAV_STYLE_KEY = 'vixor-admin-nav-style';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'he', label: 'עברית' },
  { code: 'ar', label: 'العربية' },
];

/** Requirement #16 ("двухфакторная аутентификация") — self-contained
 * so it can carry its own multi-step state (idle -> QR shown ->
 * confirming -> enabled) without cluttering SettingsPanel's own
 * (already sizeable) state. */
function TwoFactorSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisable, setShowDisable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) setEnabled(user.totpEnabled ?? false);
  }, [user]);

  async function startSetup() {
    setError(null); setBusy(true);
    try {
      const res = await apiFetch<{ secret: string; qrDataUrl: string }>('/auth/2fa/setup', { method: 'POST' });
      setSecret(res.secret);
      setQrDataUrl(res.qrDataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start 2FA setup');
    } finally { setBusy(false); }
  }

  async function confirmSetup() {
    setError(null); setBusy(true);
    try {
      await apiFetch('/auth/2fa/confirm', { method: 'POST', body: JSON.stringify({ code: confirmCode }) });
      setEnabled(true);
      setQrDataUrl(null); setSecret(null); setConfirmCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid code');
    } finally { setBusy(false); }
  }

  async function disable() {
    setError(null); setBusy(true);
    try {
      await apiFetch('/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ password: disablePassword }) });
      setEnabled(false);
      setShowDisable(false); setDisablePassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disable 2FA');
    } finally { setBusy(false); }
  }

  return (
    <div>
      <label>{t('settings.twoFactor')}</label>
      {error && <div style={{ color: 'var(--danger, #b3261e)', fontSize: 12.5, marginBottom: 8 }}>{error}</div>}

      {enabled === true && !showDisable && (
        <>
          <p style={{ fontSize: 12.5, color: 'var(--success, green)', marginBottom: 8 }}>{t('settings.twoFactorEnabled')}</p>
          <button type="button" className="ghost" onClick={() => setShowDisable(true)} style={{ width: '100%' }}>{t('settings.twoFactorDisable')}</button>
        </>
      )}
      {enabled === true && showDisable && (
        <>
          <input type="password" placeholder={t('settings.currentPassword')} value={disablePassword} onChange={e => setDisablePassword(e.target.value)} style={{ marginBottom: 8 }} />
          <button type="button" disabled={busy || !disablePassword} onClick={disable} style={{ width: '100%' }}>{t('settings.twoFactorConfirmDisable')}</button>
        </>
      )}

      {enabled === false && !qrDataUrl && (
        <button type="button" disabled={busy} onClick={startSetup} style={{ width: '100%' }}>{t('settings.twoFactorEnable')}</button>
      )}
      {enabled === false && qrDataUrl && (
        <>
          <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 8 }}>{t('settings.twoFactorScanHint')}</p>
          <img src={qrDataUrl} alt="QR" style={{ width: '100%', maxWidth: 200, display: 'block', margin: '0 auto 8px' }} />
          {secret && <p style={{ fontSize: 11, fontFamily: 'monospace', textAlign: 'center', marginBottom: 8, wordBreak: 'break-all' }}>{secret}</p>}
          <input value={confirmCode} onChange={e => setConfirmCode(e.target.value)} placeholder="000000" inputMode="numeric" maxLength={6} style={{ marginBottom: 8 }} />
          <button type="button" disabled={busy || confirmCode.length < 6} onClick={confirmSetup} style={{ width: '100%' }}>{t('settings.twoFactorConfirm')}</button>
        </>
      )}
    </div>
  );
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { open: openWizard } = useSetupWizard();
  const isSuperAdmin = user?.organizationId == null;
  const [showTos, setShowTos] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);

  async function changePassword() {
    setPwError(null); setPwSaved(false);
    if (newPassword.length < 8) { setPwError(t('settings.passwordTooShort')); return; }
    if (newPassword !== confirmPassword) { setPwError(t('settings.passwordMismatch')); return; }
    setPwSaving(true);
    try {
      await apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setPwSaved(true);
    } catch (e) {
      setPwError(e instanceof Error ? e.message : 'Failed to change password');
    } finally { setPwSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div className="card" style={{ width: 320 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{t('settings.title')}</h3>
          <button className="ghost" onClick={onClose} aria-label={t('settings.close')}><X size={16} /></button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Globe size={14} /> {t('settings.language')}</label>
        <select value={i18n.language} onChange={e => i18n.changeLanguage(e.target.value)}>
          {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>

        {isSuperAdmin && (
          <>
            <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid var(--border, #e5e5e5)' }} />
            <button type="button" onClick={() => { onClose(); openWizard(); }} style={{ width: '100%' }}>
              {t('settings.openSetupWizard')}
            </button>
          </>
        )}

        <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid var(--border, #e5e5e5)' }} />
        <button type="button" className="ghost" onClick={() => { onClose(); setShowTos(true); }} style={{ width: '100%' }}>
          {t('settings.viewTos')}
        </button>

        <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid var(--border, #e5e5e5)' }} />

        <label>{t('settings.changePassword')}</label>
        <input type="password" placeholder={t('settings.currentPassword')} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} style={{ marginBottom: 8 }} />
        <input type="password" placeholder={t('settings.newPassword')} value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ marginBottom: 8 }} />
        <input type="password" placeholder={t('settings.confirmPassword')} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={{ marginBottom: 8 }} />
        {pwError && <div style={{ color: 'var(--danger, #b3261e)', fontSize: 12.5, marginBottom: 8 }}>{pwError}</div>}
        {pwSaved && <div style={{ color: 'var(--success, green)', fontSize: 12.5, marginBottom: 8 }}>{t('settings.passwordChanged')}</div>}
        <button type="button" disabled={pwSaving || !currentPassword || !newPassword} onClick={changePassword} style={{ width: '100%' }}>
          {pwSaving ? t('common.saving') : t('settings.changePassword')}
        </button>

        <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid var(--border, #e5e5e5)' }} />
        <TwoFactorSection />
      </div>

      {showTos && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={() => setShowTos(false)}>
          <div className="card" style={{ width: '100%', maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button className="ghost" onClick={() => setShowTos(false)} aria-label={t('settings.close')}><X size={16} /></button>
            </div>
            <div style={{ overflowY: 'auto' }}>
              <TermsOfServiceContent />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const navigateTo = useNavigate();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [navStyle, setNavStyle] = useState<'sidebar' | 'tiles'>(() => (localStorage.getItem(NAV_STYLE_KEY) as 'sidebar' | 'tiles') || 'sidebar');
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const match = location.pathname.match(/delivery|quote|invoice|order|return|payment|credit|debit/) ? 'documents' : null;
    return new Set(match ? [match] : []);
  });
  const sidebarRef = React.useRef<HTMLElement>(null);
  const initial = user?.username?.[0]?.toUpperCase() ?? '?';

  const isSuperAdmin = user?.organizationId == null;
  const isAdmin = user?.role === 'admin';
  const groups = visibleGroups(isSuperAdmin, isAdmin);

  function toggleGroup(key: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function switchNavStyle(style: 'sidebar' | 'tiles') {
    setNavStyle(style);
    localStorage.setItem(NAV_STYLE_KEY, style);
    if (style === 'tiles') navigateTo('/');
  }

  // Close on route change
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Reset sidebar scroll to top when opening
  useEffect(() => {
    if (open && sidebarRef.current) {
      sidebarRef.current.scrollTop = 0;
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, []);

  // Lock body scroll when sidebar open on mobile
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const isHome = location.pathname === '/';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <LicenseWarningBanner />
      <div className="layout" style={{ flex: 1, minHeight: 0 }}>

      {/* ── Mobile topbar ── */}
      <header className="mobile-topbar" role="banner">
        <button
          className="ghost hamburger"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="sidebar"
          onClick={() => setOpen(v => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>

        <div className="mobile-brand">
          <img src={logo} alt="" className="brand-logo brand-logo--sm" />
          <span className="mobile-brand-name">VIXOR <span style={{ color: '#F2701C', fontWeight: 300 }}>ERP</span></span>
        </div>

        <button className="ghost" onClick={() => setSettingsOpen(true)} aria-label={t('settings.title')} title={t('settings.title')} style={{ marginInlineEnd: 4 }}>
          <Settings size={18} />
        </button>
        <div className="avatar" aria-label={`User: ${user?.username}`}>{initial}</div>
      </header>

      {/* ── Overlay ── */}
      {open && (
        <div
          className="sidebar-overlay"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        ref={sidebarRef}
        id="sidebar"
        className={`sidebar ${open ? 'sidebar--open' : ''}`}
        aria-label="Navigation"
      >
        <div className="sidebar-brand">
          <img src={logo} alt="" className="brand-logo" />
          <div className="wordmark">
            <span style={{ fontWeight: 800, letterSpacing: '0.12em' }}>VIXOR</span>
            <span style={{ fontWeight: 300, color: '#F2701C', letterSpacing: '0.08em' }}> ERP</span>
            <small>{t('app.adminConsole')}</small>
          </div>
        </div>

        {/* Nav-style toggle — persisted preference, switching to "tiles"
            jumps to "/" since that's the only place the tile-hub view
            lives; the list view stays wherever the person already is. */}
        <div className="nav-style-toggle" role="tablist" aria-label={t('app.navStyleToggle')}>
          <button
            type="button"
            role="tab"
            aria-selected={navStyle === 'sidebar'}
            className={navStyle === 'sidebar' ? 'active' : ''}
            onClick={() => switchNavStyle('sidebar')}
            title={t('app.navStyleList')}
          >
            <ListTree size={14} strokeWidth={2} /> {t('app.navStyleList')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={navStyle === 'tiles'}
            className={navStyle === 'tiles' ? 'active' : ''}
            onClick={() => switchNavStyle('tiles')}
            title={t('app.navStyleTiles')}
          >
            <LayoutGrid size={14} strokeWidth={2} /> {t('app.navStyleTiles')}
          </button>
        </div>

        {navStyle === 'sidebar' ? (
          <nav aria-label="Main navigation">
            {groups.map((group) => (
              <NavGroupSection key={group.key} group={group} open={openGroups.has(group.key)} onToggle={() => toggleGroup(group.key)} />
            ))}
          </nav>
        ) : (
          <nav aria-label="Main navigation" style={{ padding: '4px 14px' }}>
            {!isHome && (
              <NavLink to="/" className="tiles-home-link">
                <LayoutGrid size={16} strokeWidth={2} aria-hidden="true" />
                <span>{t('home.backToHome')}</span>
              </NavLink>
            )}
            {isHome && (
              <p style={{ fontSize: 12, opacity: 0.6, padding: '10px 0' }}>{t('home.tilesHint')}</p>
            )}
          </nav>
        )}

        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">{initial}</div>
            <span>{user?.username}</span>
          </div>
          <button className="ghost" onClick={() => setSettingsOpen(true)} aria-label={t('settings.title')} title={t('settings.title')}>
            <Settings size={16} />
          </button>
          <button className="ghost" onClick={logout} aria-label={t('app.signOut')} title={t('app.signOut')}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}

      {/* ── Main content ── */}
      <main className="main" role="main">
        <Outlet />
        <CopyrightFooter />
      </main>

    </div>
    </div>
  );
}

/** One collapsible group in the grouped-sidebar (list) presentation —
 * a single-item group (e.g. Organizations) renders as a plain link
 * with no expand/collapse chrome, matching how a lone item shouldn't
 * pretend to be a section. */
function NavGroupSection({ group, open, onToggle }: { group: NavGroup; open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const GroupIcon = group.icon;

  if (group.items.length === 1) {
    const item = group.items[0];
    const Icon = item.icon;
    return (
      <NavLink to={item.to} aria-label={t(item.labelKey)}>
        <Icon size={16} strokeWidth={2} aria-hidden="true" />
        <span>{t(item.labelKey)}</span>
      </NavLink>
    );
  }

  return (
    <div className="nav-group">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="nav-group-toggle"
      >
        <GroupIcon size={16} strokeWidth={2} aria-hidden="true" />
        <span style={{ flex: 1 }}>{t(group.labelKey)}</span>
        <ChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div className="nav-group-items">
          {group.items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} aria-label={t(item.labelKey)} style={{ paddingInlineStart: 20 }}>
                <Icon size={15} strokeWidth={2} aria-hidden="true" />
                <span>{t(item.labelKey)}</span>
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
