import { NavLink, Outlet } from 'react-router-dom';
import { Users, HardDrive, Route, FileSliders, FileStack, LogOut, MapPin, PhoneCall, Building2, Contact, Car, Package, BarChart2, ShieldCheck, FileSignature } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import StampMark from './StampMark';
import CopyrightFooter from './CopyrightFooter';

const BASE_NAV = [
  { to: '/calls', label: 'Calls', icon: PhoneCall },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/phonebook', label: 'Phone book', icon: Contact },
  { to: '/locations', label: 'Locations', icon: MapPin },
  { to: '/fleet', label: 'Fleet', icon: Car },
  { to: '/warehouse', label: 'Warehouse', icon: Package },
  { to: '/reports', label: 'Reports', icon: BarChart2 },
  { to: '/permissions', label: 'Permissions', icon: ShieldCheck },
  { to: '/delivery-settings', label: 'Note settings', icon: FileSignature },
  { to: '/storage', label: 'Storage connections', icon: HardDrive },
  { to: '/storage-routing', label: 'Storage routing', icon: Route },
  { to: '/templates', label: 'Naming templates', icon: FileSliders },
  { to: '/files', label: 'File log', icon: FileStack },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const initial = user?.username?.[0]?.toUpperCase() ?? '?';
  // Organizations management is super-admin only (organizationId === null)
  // — an org-scoped admin would just get a 403 from the API anyway, so
  // don't show the nav item at all rather than show a dead end.
  const nav = user?.organizationId == null
    ? [{ to: '/organizations', label: 'Organizations', icon: Building2 }, ...BASE_NAV]
    : BASE_NAV;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <StampMark size={30} />
          <div className="wordmark">
            Operix ERP
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
