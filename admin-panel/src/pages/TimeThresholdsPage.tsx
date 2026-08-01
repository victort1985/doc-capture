import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PhoneCall, Car, Package } from 'lucide-react';
import { apiFetch } from '../services/api';

interface TimeThresholds {
  callsWarningHours: number;
  callsDangerHours: number;
  vehicleWarningDays: number;
  vehicleDangerDays: number;
  rentalWarningDays: number;
  rentalDangerDays: number;
}

export default function TimeThresholdsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<TimeThresholds | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<TimeThresholds | null>('/time-thresholds')
      .then(setSettings)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoaded(true));
  }, []);

  async function save(patch: Partial<TimeThresholds>) {
    if (!settings) return;
    setSaving(true); setError(null);
    try {
      const updated = await apiFetch<TimeThresholds>('/time-thresholds', { method: 'POST', body: JSON.stringify(patch) });
      setSettings(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  if (!loaded) return <div className="page"><p>{t('common.loading')}</p></div>;

  // A super-admin account (organizationId === null) has no single
  // organization's thresholds to configure — the backend correctly
  // returns null rather than picking one arbitrarily. Show that
  // plainly instead of the infinite spinner this used to be, since
  // `settings` staying null was previously indistinguishable from
  // "still loading".
  if (!settings) {
    return (
      <div className="page">
        <div className="topbar">
          <div><div className="eyebrow">{t('timeThresholds.eyebrow')}</div><h1>{t('timeThresholds.title')}</h1></div>
        </div>
        <div className="card" style={{ padding: 16 }}>{error ?? t('timeThresholds.noOrgContext')}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('timeThresholds.eyebrow')}</div><h1>{t('timeThresholds.title')}</h1></div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16, fontSize: 13 }}>
        {t('timeThresholds.disclaimer')}
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}
      {saving && <p style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 12 }}>{t('common.saving')}</p>}

      <div style={{ display: 'grid', gap: 16 }}>
        <ThresholdCard
          icon={<PhoneCall size={18} />}
          title={t('timeThresholds.calls')}
          unit={t('timeThresholds.hours')}
          warningLabel={t('timeThresholds.warningAfter')}
          dangerLabel={t('timeThresholds.dangerAfter')}
          warningValue={settings.callsWarningHours}
          dangerValue={settings.callsDangerHours}
          onWarningChange={(v) => save({ callsWarningHours: v })}
          onDangerChange={(v) => save({ callsDangerHours: v })}
        />
        <ThresholdCard
          icon={<Car size={18} />}
          title={t('timeThresholds.vehicles')}
          unit={t('timeThresholds.days')}
          warningLabel={t('timeThresholds.warningBefore')}
          dangerLabel={t('timeThresholds.dangerBefore')}
          warningValue={settings.vehicleWarningDays}
          dangerValue={settings.vehicleDangerDays}
          onWarningChange={(v) => save({ vehicleWarningDays: v })}
          onDangerChange={(v) => save({ vehicleDangerDays: v })}
        />
        <ThresholdCard
          icon={<Package size={18} />}
          title={t('timeThresholds.rentals')}
          unit={t('timeThresholds.days')}
          warningLabel={t('timeThresholds.warningBefore')}
          dangerLabel={t('timeThresholds.dangerBefore')}
          warningValue={settings.rentalWarningDays}
          dangerValue={settings.rentalDangerDays}
          onWarningChange={(v) => save({ rentalWarningDays: v })}
          onDangerChange={(v) => save({ rentalDangerDays: v })}
        />
      </div>
    </div>
  );
}

function ThresholdCard({ icon, title, unit, warningLabel, dangerLabel, warningValue, dangerValue, onWarningChange, onDangerChange }: {
  icon: React.ReactNode; title: string; unit: string;
  warningLabel: string; dangerLabel: string;
  warningValue: number; dangerValue: number;
  onWarningChange: (v: number) => void; onDangerChange: (v: number) => void;
}) {
  const [warning, setWarning] = useState(warningValue);
  const [danger, setDanger] = useState(dangerValue);
  useEffect(() => setWarning(warningValue), [warningValue]);
  useEffect(() => setDanger(dangerValue), [dangerValue]);

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        {icon}
        <h3 style={{ margin: 0 }}>{title}</h3>
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, marginBottom: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: '#F2C94C', display: 'inline-block' }} />
            {warningLabel}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number" min={1} value={warning}
              onChange={(e) => setWarning(Number(e.target.value))}
              onBlur={() => onWarningChange(warning)}
              style={{ width: 80 }}
            />
            <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{unit}</span>
          </div>
        </div>
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, marginBottom: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: '#EB5757', display: 'inline-block' }} />
            {dangerLabel}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number" min={1} value={danger}
              onChange={(e) => setDanger(Number(e.target.value))}
              onBlur={() => onDangerChange(danger)}
              style={{ width: 80 }}
            />
            <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{unit}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
