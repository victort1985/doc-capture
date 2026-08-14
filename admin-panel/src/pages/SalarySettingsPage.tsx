import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { apiFetch } from '../services/api';

interface Employee { id: number; username: string; }
interface SalarySettings {
  salaryType: 'hourly' | 'global';
  standardWorkdayHours: number;
  hourlyRate?: number | null;
  globalMonthlySalary?: number | null;
  overtimeFirst2HoursPercent: number;
  overtimeBeyond2HoursPercent: number;
  restDayPercent: number;
  restDayOvertimeFirst2HoursPercent: number;
  restDayOvertimeBeyond2HoursPercent: number;
}

type PercentField =
  | 'overtimeFirst2HoursPercent'
  | 'overtimeBeyond2HoursPercent'
  | 'restDayPercent'
  | 'restDayOvertimeFirst2HoursPercent'
  | 'restDayOvertimeBeyond2HoursPercent';

const LEGAL_MINIMUMS: Record<PercentField, number> = {
  overtimeFirst2HoursPercent: 125,
  overtimeBeyond2HoursPercent: 150,
  restDayPercent: 150,
  restDayOvertimeFirst2HoursPercent: 175,
  restDayOvertimeBeyond2HoursPercent: 200,
};

const PERCENT_FIELDS: PercentField[] = [
  'overtimeFirst2HoursPercent',
  'overtimeBeyond2HoursPercent',
  'restDayPercent',
  'restDayOvertimeFirst2HoursPercent',
  'restDayOvertimeBeyond2HoursPercent',
];

export default function SalarySettingsPage() {
  const { t } = useTranslation();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [settings, setSettings] = useState<SalarySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Employee[]>('/users').then((list) => {
      setEmployees(list);
      if (list.length && selectedUserId == null) setSelectedUserId(list[0].id);
    }).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load employees'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedUserId == null) return;
    setLoading(true); setError(null); setNotice(null);
    apiFetch<SalarySettings>(`/payroll/salary/${selectedUserId}`)
      .then(setSettings)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load salary settings'))
      .finally(() => setLoading(false));
  }, [selectedUserId]);

  function updateField<K extends keyof SalarySettings>(key: K, value: SalarySettings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
  }

  async function save() {
    if (!settings || selectedUserId == null) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      // Send ONLY the fields the DTO actually declares — `settings`
      // in state came from the GET response, which (correctly, for
      // display purposes) includes the full entity's `user` relation
      // object. Spreading that whole object back into the PUT body
      // sent a `user` field the backend's whitelist validation
      // doesn't recognize (SalarySettingsDto has no such field),
      // which failed every save with "property user should not
      // exist" — caught from a real screenshot, not something the
      // earlier live-server testing happened to exercise since that
      // testing called the API directly rather than round-tripping
      // through this exact save-what-you-loaded UI pattern.
      const payload = {
        salaryType: settings.salaryType,
        standardWorkdayHours: settings.standardWorkdayHours,
        hourlyRate: settings.hourlyRate ?? undefined,
        globalMonthlySalary: settings.globalMonthlySalary ?? undefined,
        overtimeFirst2HoursPercent: settings.overtimeFirst2HoursPercent,
        overtimeBeyond2HoursPercent: settings.overtimeBeyond2HoursPercent,
        restDayPercent: settings.restDayPercent,
        restDayOvertimeFirst2HoursPercent: settings.restDayOvertimeFirst2HoursPercent,
        restDayOvertimeBeyond2HoursPercent: settings.restDayOvertimeBeyond2HoursPercent,
      };
      const saved = await apiFetch<SalarySettings>(`/payroll/salary/${selectedUserId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setSettings(saved);
      setNotice(t('salarySettings.saved'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const belowMinimum = (field: PercentField, value: number) => value < LEGAL_MINIMUMS[field];

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="eyebrow">{t('salarySettings.eyebrow')}</div>
          <h1>{t('salarySettings.title')}</h1>
        </div>
      </div>

      <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, marginTop: -8, marginBottom: 16 }}>{t('salarySettings.explainer')}</p>

      <div className="card" style={{ padding: 16, marginBottom: 16, maxWidth: 200 }}>
        <label>{t('salarySettings.employee')}</label>
        <select value={selectedUserId ?? ''} onChange={(e) => setSelectedUserId(Number(e.target.value))} style={{ width: '100%' }}>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.username}</option>)}
        </select>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}
      {notice && <div className="notice-banner" style={{ marginBottom: 12 }}>{notice}</div>}

      {settings && !loading && (
        <div className="card" style={{ padding: 16, maxWidth: 480 }}>
          <label>{t('salarySettings.salaryType')}</label>
          <select
            value={settings.salaryType}
            onChange={(e) => updateField('salaryType', e.target.value as 'hourly' | 'global')}
            style={{ width: '100%', marginBottom: 12 }}
          >
            <option value="hourly">{t('salarySettings.typeHourly')}</option>
            <option value="global">{t('salarySettings.typeGlobal')}</option>
          </select>

          <label>{t('salarySettings.standardWorkdayHours')}</label>
          <select
            value={settings.standardWorkdayHours}
            onChange={(e) => updateField('standardWorkdayHours', Number(e.target.value))}
            style={{ width: '100%', marginBottom: 4 }}
          >
            <option value={8}>{t('salarySettings.workday8')}</option>
            <option value={6}>{t('salarySettings.workday6')}</option>
          </select>
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 0, marginBottom: 12 }}>{t('salarySettings.standardWorkdayHint')}</p>

          {settings.salaryType === 'hourly' ? (
            <>
              <label>{t('salarySettings.hourlyRate')}</label>
              <input
                type="number" step="0.01"
                value={settings.hourlyRate ?? ''}
                onChange={(e) => updateField('hourlyRate', e.target.value ? Number(e.target.value) : null)}
                style={{ width: '100%', marginBottom: 16 }}
              />
            </>
          ) : (
            <>
              <label>{t('salarySettings.globalMonthlySalary')}</label>
              <input
                type="number" step="0.01"
                value={settings.globalMonthlySalary ?? ''}
                onChange={(e) => updateField('globalMonthlySalary', e.target.value ? Number(e.target.value) : null)}
                style={{ width: '100%', marginBottom: 8 }}
              />
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--surface-muted, #fff8e6)', border: '1px solid var(--stamp-wash, #f2d98a)', borderRadius: 8, padding: 10, marginBottom: 16 }}>
                <AlertTriangle size={16} style={{ color: 'var(--stamp, #F2701C)', flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{t('salarySettings.globalWarning')}</span>
              </div>
            </>
          )}

          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{t('salarySettings.premiumsTitle')}</div>
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 0, marginBottom: 12 }}>{t('salarySettings.premiumsExplainer')}</p>

          {PERCENT_FIELDS.map((field) => (
            <div key={field} style={{ marginBottom: 12 }}>
              <label>{t(`salarySettings.field_${field}`)} <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}>({t('salarySettings.minimum')}: {LEGAL_MINIMUMS[field]}%)</span></label>
              <input
                type="number" step="0.01"
                value={settings[field]}
                onChange={(e) => updateField(field, Number(e.target.value))}
                style={{
                  width: '100%',
                  borderColor: belowMinimum(field, settings[field]) ? 'var(--danger, #C62828)' : undefined,
                }}
              />
              {belowMinimum(field, settings[field]) && (
                <div style={{ fontSize: 11, color: 'var(--danger, #C62828)', marginTop: 2 }}>{t('salarySettings.belowMinimumWarning')}</div>
              )}
            </div>
          ))}

          <button type="button" onClick={save} disabled={saving} style={{ width: '100%', marginTop: 8 }}>
            {saving ? t('common.saving') : t('salarySettings.save')}
          </button>
        </div>
      )}
    </div>
  );
}
