import { NavLink, Outlet } from 'react-router-dom';
import { Users, HardDrive, Route, FileSliders, FileStack, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import StampMark from './StampMark';
import CopyrightFooter from './CopyrightFooter';

const NAV = [
  { to: '/users', label: 'Users', icon: Users },
  { to: '/storage', label: 'Storage connections', icon: HardDrive },
  { to: '/storage-routing', label: 'Storage routing', icon: Route },
  { to: '/templates', label: 'Naming templates', icon: FileSliders },
  { to: '/files', label: 'File log', icon: FileStack },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const initial = user?.username?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <StampMark size={30} />
          <div className="wordmark">
            Doc Capture
            <small>admin console</small>
          </div>
        </div>
        <nav>
          {NAV.map((item) => {
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
