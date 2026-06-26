import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Users, HardDrive, Route, FileSliders, FileStack, LogOut, MapPin, PhoneCall,
  Building2, Contact, Car, Package, BarChart2, ShieldCheck, FileSignature, FileText,
  CalendarDays, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import StampMark from './StampMark';
import CopyrightFooter from './CopyrightFooter';

const BASE_NAV = [
  { to: '/calls',            label: 'Calls',              icon: PhoneCall },
  { to: '/users',            label: 'Users',              icon: Users },
  { to: '/phonebook',        label: 'Phone book',         icon: Contact },
  { to: '/locations',        label: 'Locations',          icon: MapPin },
  { to: '/fleet',            label: 'Fleet',              icon: Car },
  { to: '/warehouse',        label: 'Warehouse',          icon: Package },
  { to: '/reports',          label: 'Reports',            icon: BarChart2 },
  { to: '/permissions',      label: 'Permissions',        icon: ShieldCheck },
  { to: '/delivery-notes',   label: 'Delivery notes',     icon: FileText },
  { to: '/delivery-settings',label: 'Note settings',      icon: FileSignature },
  { to: '/calendar-sync',    label: 'Calendar sync',      icon: CalendarDays },
  { to: '/storage',          label: 'Storage connections', icon: HardDrive },
  { to: '/storage-routing',  label: 'Storage routing',    icon: Route },
  { to: '/templates',        label: 'Naming templates',   icon: FileSliders },
  { to: '/files',            label: 'File log',           icon: FileStack },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const initial = user?.username?.[0]?.toUpperCase() ?? '?';

  const nav = user?.organizationId == null
    ? [{ to: '/organizations', label: 'Organizations', icon: Building2 }, ...BASE_NAV]
    : BASE_NAV;

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  return (
    <div className="layout">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 99,
                   display: 'none' }}
          className="sidebar-overlay"
        />
      )}

      {/* Mobile topbar */}
      <div className="mobile-topbar">
        <button className="ghost" onClick={() => setSidebarOpen(v => !v)} style={{ padding: 8 }}>
          {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StampMark size={24} />
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '0.12em' }}>VIXOR</span>
          <span style={{ fontWeight: 300, color: '#F2701C', fontSize: 15 }}>ERP</span>
        </div>
        <div className="avatar" style={{ width: 30, height: 30, fontSize: 13 }}>{initial}</div>
      </div>

      <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar-brand">
          <StampMark size={30} />
          <div className="wordmark">
            <span style={{ fontWeight: 800, letterSpacing: '0.12em' }}>VIXOR</span>
            <span style={{ fontWeight: 300, color: '#F2701C', letterSpacing: '0.08em' }}> ERP</span>
            <small>admin console</small>
          </div>
        </div>
        <nav>
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to}>
                <Icon size={16} strokeWidth={2} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">{initial}</div>
            <span>{user?.username}</span>
          </div>
          <button className="ghost" onClick={logout} title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
        <CopyrightFooter />
      </main>
    </div>
  );
}
