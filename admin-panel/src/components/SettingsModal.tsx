import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Wraps an EXISTING settings page component (QuoteSettingsPage,
 * DeliveryNoteSettingsPage, etc.) in a modal overlay, so it can be
 * opened via a "Settings" button on the document's own list page
 * instead of living as a separate top-level nav item — per the
 * navigation audit's recommendation to fold each "-settings" page
 * into its parent document type rather than sitting alongside it as
 * an unrelated sibling.
 *
 * Deliberately just wraps the page as-is rather than rewriting each
 * settings page's internals: every settings page already renders its
 * own topbar/save-button/error-banner correctly, so there's no
 * duplicated logic to keep in sync between "standalone route" and
 * "opened from a button" — same component, different container.
 */
export default function SettingsModal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'flex', justifyContent: 'flex-end' }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg)', width: 'min(880px, 100vw)', height: '100%', overflowY: 'auto',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.18)', position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="ghost"
          onClick={onClose}
          aria-label={t('common.close')}
          title={t('common.close')}
          style={{
            position: 'absolute', top: 16, insetInlineEnd: 16, zIndex: 1,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '50%',
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          }}
        >
          <X size={17} />
        </button>
        <div style={{ padding: '24px 28px 60px' }}>{children}</div>
      </div>
    </div>
  );
}
