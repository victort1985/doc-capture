import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Users, HardDrive, Route, FileSliders, FileStack, LogOut, MapPin, PhoneCall,
  Building2, Contact, Car, Package, BarChart2, ShieldCheck, FileSignature,
  FileText, CalendarDays, Menu, X, Mail, ReceiptText, Users2, FileSpreadsheet, Banknote, CalendarClock, Settings2,
  ChevronDown, Settings, Globe, Smartphone,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.png';
import CopyrightFooter from './CopyrightFooter';
import LicenseWarningBanner from './LicenseWarningBanner';

// Flat top-level items. `officeGroup` is rendered separately as a
// collapsible section — delivery notes / quotes / invoices and their
// settings live together since they're all "office paperwork" a
// non-technical admin thinks of as one area, not six unrelated pages.
const BASE_NAV = [
  { to: '/calls',             labelKey: 'nav.calls',           icon: PhoneCall },
  { to: '/users',             labelKey: 'nav.users',           icon: Users },
  { to: '/phonebook',         labelKey: 'nav.phonebook',       icon: Contact },
  { to: '/locations',         labelKey: 'nav.locations',       icon: MapPin },
  { to: '/fleet',             labelKey: 'nav.fleet',           icon: Car },
  { to: '/warehouse',         labelKey: 'nav.warehouse',       icon: Package },
  { to: '/reports',           labelKey: 'nav.reports',         icon: BarChart2 },
  { to: '/permissions',       labelKey: 'nav.permissions',     icon: ShieldCheck },
  { to: '/groups',            labelKey: 'nav.groups',          icon: Users2 },
  { to: '/calendar-sync',     labelKey: 'nav.calendarSync',    icon: CalendarDays },
  { to: '/orders',            labelKey: 'nav.orders',          icon: ReceiptText },
  { to: '/maintenance',       labelKey: 'nav.maintenance',     icon: CalendarClock },
  { to: '/orders-email-settings', labelKey: 'nav.orderIntakeEmail', icon: Mail },
  { to: '/storage',           labelKey: 'nav.storage',         icon: HardDrive },
  { to: '/storage-routing',   labelKey: 'nav.routing',         icon: Route },
  { to: '/templates',         labelKey: 'nav.templates',       icon: FileSliders },
  { to: '/files',             labelKey: 'nav.fileLog',         icon: FileStack },
  { to: '/devices',           labelKey: 'nav.devices',         icon: Smartphone },
];

const OFFICE_GROUP = [
  { to: '/delivery-notes',    labelKey: 'nav.deliveryNotes',        icon: FileText },
  { to: '/delivery-settings', labelKey: 'nav.deliveryNoteSettings', icon: FileSignature },
  { to: '/quotes',            labelKey: 'nav.quotes',               icon: FileSpreadsheet },
  { to: '/quote-settings',    labelKey: 'nav.quoteSettings',        icon: Settings2 },
  { to: '/invoices',          labelKey: 'nav.invoices',             icon: Banknote },
  { to: '/invoice-settings',  labelKey: 'nav.invoiceSettings',      icon: Settings2 },
];

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'he', label: 'עברית' },
];

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
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
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [officeOpen, setOfficeOpen] = useState(location.pathname.match(/delivery|quote|invoice/) != null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const sidebarRef = React.useRef<HTMLElement>(null);
  const initial = user?.username?.[0]?.toUpperCase() ?? '?';

  const nav = user?.organizationId == null
    ? [{ to: '/organizations', labelKey: 'nav.organizations', icon: Building2 }, ...BASE_NAV]
    : BASE_NAV;

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

        <nav aria-label="Main navigation">
          {nav.map(item => {
            const Icon = item.icon;
            const label = t(item.labelKey);
            return (
              <NavLink key={item.to} to={item.to} aria-label={label}>
                <Icon size={16} strokeWidth={2} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            );
          })}

          <button
            type="button"
            onClick={() => setOfficeOpen(v => !v)}
            aria-expanded={officeOpen}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              background: 'none', border: 'none', cursor: 'pointer', textAlign: 'start',
              padding: '9px 14px', color: 'inherit', font: 'inherit', opacity: 0.85,
            }}
          >
            <FileSpreadsheet size={16} strokeWidth={2} aria-hidden="true" />
            <span style={{ flex: 1 }}>{t('nav.groupOffice')}</span>
            <ChevronDown size={14} style={{ transform: officeOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </button>
          {officeOpen && (
            <div style={{ marginInlineStart: 12, borderInlineStart: '1px solid rgba(255,255,255,0.14)' }}>
              {OFFICE_GROUP.map(item => {
                const Icon = item.icon;
                const label = t(item.labelKey);
                return (
                  <NavLink key={item.to} to={item.to} aria-label={label} style={{ paddingInlineStart: 20 }}>
                    <Icon size={15} strokeWidth={2} aria-hidden="true" />
                    <span>{label}</span>
                  </NavLink>
                );
              })}
            </div>
          )}
        </nav>

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
