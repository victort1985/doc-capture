import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { visibleGroups } from '../config/navConfig';
import logo from '../assets/logo.png';

const TILE_COLORS = ['#1D3557', '#2F6F4E', '#B5471B', '#3D5A80', '#6D597A', '#2C4A73', '#7A6C3E', '#5C665F'];

export default function HomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = user?.organizationId == null;
  const isAdmin = user?.role === 'admin';
  const groups = visibleGroups(isSuperAdmin, isAdmin);
  const [activeKey, setActiveKey] = useState(groups[isSuperAdmin ? 1 : 0]?.key ?? groups[0]?.key);
  const activeGroup = groups.find((g) => g.key === activeKey) ?? groups[0];

  return (
    <div className="page home-page">
      <div className="home-header">
        <img src={logo} alt="" className="home-logo" />
        <div>
          <div className="eyebrow">{t('home.welcome')}</div>
          <h1 className="home-title">{t('home.title')}</h1>
        </div>
      </div>

      <div className="home-tiles-grid">
        {groups.map((g, i) => {
          const Icon = g.icon;
          const color = TILE_COLORS[i % TILE_COLORS.length];
          const active = g.key === activeGroup?.key;
          return (
            <div
              key={g.key}
              className={`home-tile ${active ? 'active' : ''}`}
              style={{ '--tile-color': color } as React.CSSProperties}
              onClick={() => setActiveKey(g.key)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') setActiveKey(g.key); }}
            >
              <div className="home-tile-icon">
                <Icon size={21} strokeWidth={2} />
              </div>
              <div className="home-tile-title">{t(g.labelKey)}</div>
              <div className="home-tile-count">{t('home.itemCount', { count: g.items.length })}</div>
            </div>
          );
        })}
      </div>

      {activeGroup && (
        <div className="home-subsection">
          <div className="home-subsection-head">
            <span className="home-subsection-dash" />
            <h2>{t(activeGroup.labelKey)}</h2>
          </div>
          <div className="home-subgrid">
            {activeGroup.items.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.to} className="home-item-card" onClick={() => navigate(item.to)} role="button" tabIndex={0}>
                  <div className="home-item-icon">
                    <Icon size={16} strokeWidth={2} />
                  </div>
                  <div className="home-item-label">{t(item.labelKey)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
