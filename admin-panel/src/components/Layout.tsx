import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Users, HardDrive, Route, FileSliders, FileStack, LogOut, MapPin, PhoneCall,
  Building2, Contact, Car, Package, BarChart2, ShieldCheck, FileSignature,
  FileText, CalendarDays, Menu, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import StampMark from './StampMark';
import CopyrightFooter from './CopyrightFooter';

const BASE_NAV = [
  { to: '/calls',             label: 'Calls',           icon: PhoneCall },
  { to: '/users',             label: 'Users',           icon: Users },
  { to: '/phonebook',         label: 'Phone book',      icon: Contact },
  { to: '/locations',         label: 'Locations',       icon: MapPin },
  { to: '/fleet',             label: 'Fleet',           icon: Car },
  { to: '/warehouse',         label: 'Warehouse',       icon: Package },
  { to: '/reports',           label: 'Reports',         icon: BarChart2 },
  { to: '/permissions',       label: 'Permissions',     icon: ShieldCheck },
  { to: '/delivery-notes',    label: 'Delivery notes',  icon: FileText },
  { to: '/delivery-settings', label: 'Note settings',   icon: FileSignature },
  { to: '/calendar-sync',     label: 'Calendar sync',   icon: CalendarDays },
  { to: '/storage',           label: 'Storage',         icon: HardDrive },
  { to: '/storage-routing',   label: 'Routing',         icon: Route },
  { to: '/templates',         label: 'Templates',       icon: FileSliders },
  { to: '/files',             label: 'File log',        icon: FileStack },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const initial = user?.username?.[0]?.toUpperCase() ?? '?';

  const nav = user?.organizationId == null
    ? [{ to: '/organizations', label: 'Organizations', icon: Building2 }, ...BASE_NAV]
    : BASE_NAV;

  // Close on route change
  useEffect(() => { setOpen(false); }, [location.pathname]);

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
    <div className="layout">

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
          <StampMark size={22} />
          <span className="mobile-brand-name">VIXOR <span style={{ color: '#F2701C', fontWeight: 300 }}>ERP</span></span>
        </div>

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
        id="sidebar"
        className={`sidebar ${open ? 'sidebar--open' : ''}`}
        aria-label="Navigation"
      >
        <div className="sidebar-brand">
          <StampMark size={30} />
          <div className="wordmark">
            <span style={{ fontWeight: 800, letterSpacing: '0.12em' }}>VIXOR</span>
            <span style={{ fontWeight: 300, color: '#F2701C', letterSpacing: '0.08em' }}> ERP</span>
            <small>admin console</small>
          </div>
        </div>

        <nav aria-label="Main navigation">
          {nav.map(item => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} aria-label={item.label}>
                <Icon size={16} strokeWidth={2} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">{initial}</div>
            <span>{user?.username}</span>
          </div>
          <button className="ghost" onClick={logout} aria-label="Sign out" title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="main" role="main">
        <Outlet />
        <CopyrightFooter />
      </main>

    </div>
  );
}
