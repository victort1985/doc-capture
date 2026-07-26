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
    <div className="page" style={{ maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
        <img src={logo} alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} />
        <div>
          <div className="eyebrow">{t('home.welcome')}</div>
          <h1 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontWeight: 600 }}>{t('home.title')}</h1>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 14,
          margin: '28px 0 8px',
        }}
      >
        {groups.map((g, i) => {
          const Icon = g.icon;
          const color = TILE_COLORS[i % TILE_COLORS.length];
          const active = g.key === activeGroup?.key;
          return (
            <div
              key={g.key}
              onClick={() => setActiveKey(g.key)}
              style={{
                background: 'var(--surface)',
                border: `1px solid ${active ? color : 'var(--border)'}`,
                borderRadius: 'var(--radius-lg)',
                padding: 20,
                cursor: 'pointer',
                boxShadow: active ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                transition: 'all .15s',
              }}
            >
              <div
                style={{
                  width: 42, height: 42, borderRadius: 12, marginBottom: 14,
                  background: `${color}1A`, color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Icon size={21} strokeWidth={2} />
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15.5, marginBottom: 2 }}>{t(g.labelKey)}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                {t('home.itemCount', { count: g.items.length })}
              </div>
            </div>
          );
        })}
      </div>

      {activeGroup && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ width: 22, height: 2, background: 'var(--stamp, #B5471B)', display: 'inline-block' }} />
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--ink)' }}>
              {t(activeGroup.labelKey)}
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {activeGroup.items.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.to}
                  onClick={() => navigate(item.to)}
                  style={{
                    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    padding: '16px 12px', textAlign: 'center', cursor: 'pointer', transition: 'all .12s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--primary-wash)'; e.currentTarget.style.borderColor = 'var(--primary-soft)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                >
                  <div style={{ width: 34, height: 34, margin: '0 auto 8px', borderRadius: 9, background: 'var(--surface-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={16} strokeWidth={2} style={{ color: 'var(--ink-soft)' }} />
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{t(item.labelKey)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
