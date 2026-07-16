import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { apiFetch } from '../services/api';

type Period = 'day' | 'week' | 'month' | 'year' | 'all';
type Dimension = 'none' | 'user' | 'location' | 'organization';

interface User { id: number; username: string; }
interface Vehicle { id: number; make: string; model: string; licensePlate: string; }
interface LocationOpt { id: number; name: string; }
interface OrgOpt { id: number; name: string; }

interface DomainResult {
  supported: boolean;
  summary: Record<string, any> | null;
  breakdown: Record<string, any>[] | null;
}
interface OverviewReport {
  dimension: Dimension;
  id: number | null;
  calls: DomainResult;
  orders: DomainResult;
  deliveryNotes: DomainResult;
  fleet: DomainResult;
  warehouse: DomainResult;
}

interface WorkReport {
  totals: Record<string, number>;
  byUser: { userId: number; username: string; callsWorked: number; totalSeconds: number; callsClosed: number }[];
  byDay: { day: string; count: number }[];
}

interface FuelReport {
  rows: any[];
  summary: { vehicleId: number; make: string; model: string; licensePlate: string; refuelCount: number; totalLiters: string; totalCost: string }[];
}

function DomainSection({
  title, result, dimension, fields,
}: {
  title: string;
  result: DomainResult;
  dimension: Dimension;
  fields: [string, string, ((v: any) => string)?][];
}) {
  if (!result.supported) {
    return (
      <div className="card" style={{ marginBottom: 16, opacity: 0.6 }}>
        <h3 style={{ margin: '0 0 4px' }}>{title}</h3>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Not tracked by client/location — no location field on this data.</div>
      </div>
    );
  }

  const fmt = (key: string, v: any, f?: (v: any) => string) => {
    if (v === null || v === undefined) return '—';
    return f ? f(v) : v;
  };

  const dimLabel = dimension === 'user' ? 'User' : dimension === 'location' ? 'Location' : dimension === 'organization' ? 'Firm' : '';

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 12px' }}>{title}</h3>

      {result.summary && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: result.breakdown ? 16 : 0 }}>
          {fields.map(([key, label, f]) => (
            <div key={key} style={{ flex: '1 0 100px', textAlign: 'center', padding: '10px 6px', background: 'var(--surface-muted)', borderRadius: 8 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>{fmt(key, result.summary![key], f)}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {result.breakdown && (
        <table>
          <thead>
            <tr>
              <th>{dimLabel}</th>
              {fields.map(([key, label]) => <th key={key}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {result.breakdown.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                {fields.map(([key, , f]) => <td key={key}>{fmt(key, row[key], f)}</td>)}
              </tr>
            ))}
            {result.breakdown.length === 0 && (
              <tr><td colSpan={fields.length + 1} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: 16 }}>No data for this period</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function tabLabel(tab: 'overview' | 'work' | 'fuel' | 'warehouse') {
  return tab === 'overview' ? 'Overview' : tab === 'work' ? 'Work report' : tab === 'fuel' ? 'Fuel report' : 'Warehouse report';
}

function dimensionLabel(dimension: Dimension, dimId: string, users: User[], locations: LocationOpt[], orgs: OrgOpt[]) {
  if (dimension === 'none') return 'Overall';
  const list = dimension === 'user' ? users : dimension === 'location' ? locations : orgs;
  const label = dimension === 'user' ? 'user' : dimension === 'location' ? 'client/location' : 'firm';
  if (!dimId) return `By ${label} — all (breakdown)`;
  const entity = list.find((x: any) => String(x.id) === dimId) as any;
  const name = entity ? (entity.username ?? entity.name) : `#${dimId}`;
  return `By ${label} — ${name}`;
}

function fmt(sec: number) {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function ReportsPage() {
  const [tab, setTab] = useState<'overview' | 'work' | 'fuel' | 'warehouse'>('overview');
  const [period, setPeriod] = useState<Period>('month');
  const [users, setUsers] = useState<User[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [locations, setLocations] = useState<LocationOpt[]>([]);
  const [orgs, setOrgs] = useState<OrgOpt[]>([]);
  const [selUser, setSelUser] = useState('');
  const [selVehicle, setSelVehicle] = useState('');
  const [dimension, setDimension] = useState<Dimension>('none');
  const [dimId, setDimId] = useState('');
  const [overview, setOverview] = useState<OverviewReport | null>(null);
  const [workData, setWorkData] = useState<WorkReport | null>(null);
  const [fuelData, setFuelData] = useState<FuelReport | null>(null);
  const [warehouseData, setWarehouseData] = useState<{rows: any[]; summary: any[]} | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<User[]>('/users').then(setUsers).catch(() => {});
    apiFetch<Vehicle[]>('/fleet/vehicles').then(setVehicles).catch(() => {});
    apiFetch<LocationOpt[]>('/locations').then(setLocations).catch(() => {});
    apiFetch<OrgOpt[]>('/organizations').then(setOrgs).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try {
      if (tab === 'overview') {
        const q = new URLSearchParams({ period, dimension });
        if (dimId) q.set('id', dimId);
        setOverview(await apiFetch(`/reports/overview?${q}`));
      } else if (tab === 'work') {
        const q = new URLSearchParams({ period });
        if (selUser) q.set('userId', selUser);
        setWorkData(await apiFetch(`/reports/work?${q}`));
      } else if (tab === 'fuel') {
        const q = new URLSearchParams({ period });
        if (selVehicle) q.set('vehicleId', selVehicle);
        if (selUser) q.set('userId', selUser);
        setFuelData(await apiFetch(`/reports/fuel?${q}`));
      } else {
        const q = new URLSearchParams({ period });
        setWarehouseData(await apiFetch(`/reports/warehouse?${q}`));
      }
    } finally { setLoading(false); }
  }

  useEffect(() => { setDimId(''); }, [dimension]);
  useEffect(() => { load(); }, [tab, period, selUser, selVehicle, dimension, dimId]);

  const periods: Period[] = ['day', 'week', 'month', 'year', 'all'];
  const periodLabel: Record<Period, string> = { day: 'Day', week: 'Week', month: 'Month', year: 'Year', all: 'All time' };

  function handlePrint() {
    const originalTitle = document.title;
    const parts = ['Vixor ERP', tabLabel(tab), periodLabel[period]];
    if (tab === 'overview') parts.push(dimensionLabel(dimension, dimId, users, locations, orgs));
    document.title = parts.join(' - ');
    window.print();
    setTimeout(() => { document.title = originalTitle; }, 500);
  }

  return (
    <div>
      <div className="topbar no-print">
        <div><span className="eyebrow">Admin</span><h1 className="page-title">Reports</h1></div>
        <button type="button" onClick={handlePrint}>
          <Printer size={15} /> Export / Print
        </button>
      </div>

      <div className="print-header">
        <h1>Vixor ERP — {tabLabel(tab)}</h1>
        <p>
          Period: {periodLabel[period]}
          {tab === 'overview' && ` · ${dimensionLabel(dimension, dimId, users, locations, orgs)}`}
          {' · '}Generated {new Date().toLocaleString()}
        </p>
      </div>

      {/* Tab + Filters */}
      <div className="card no-print" style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {(['overview', 'work', 'fuel', 'warehouse'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '7px 18px', background: tab === t ? 'var(--primary)' : 'var(--surface-muted)', color: tab === t ? '#fff' : 'var(--ink)', border: 'none', cursor: 'pointer',
                borderRadius: t === 'overview' ? '6px 0 0 6px' : t === 'warehouse' ? '0 6px 6px 0' : '0' }}>
              {t === 'overview' ? 'Overview' : t === 'work' ? 'Work report' : t === 'fuel' ? 'Fuel report' : 'Warehouse'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {periods.map(p => (
            <button key={p} className={period === p ? '' : 'ghost'} onClick={() => setPeriod(p)}
              style={{ padding: '5px 12px', fontSize: 12 }}>{periodLabel[p]}</button>
          ))}
        </div>

        {tab === 'overview' && (
          <>
            <select value={dimension} onChange={e => setDimension(e.target.value as Dimension)} style={{ minWidth: 160 }}>
              <option value="none">Overall (everything)</option>
              <option value="user">By user</option>
              <option value="location">By client / location</option>
              <option value="organization">By firm</option>
            </select>
            {dimension === 'user' && (
              <select value={dimId} onChange={e => setDimId(e.target.value)} style={{ minWidth: 160 }}>
                <option value="">All users (breakdown)</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
              </select>
            )}
            {dimension === 'location' && (
              <select value={dimId} onChange={e => setDimId(e.target.value)} style={{ minWidth: 160 }}>
                <option value="">All locations (breakdown)</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
            {dimension === 'organization' && (
              <select value={dimId} onChange={e => setDimId(e.target.value)} style={{ minWidth: 160 }}>
                <option value="">All firms (breakdown)</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            )}
          </>
        )}

        {tab !== 'overview' && (
        <select value={selUser} onChange={e => setSelUser(e.target.value)} style={{ minWidth: 140 }}>
          <option value="">All users</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
        </select>
        )}

        {tab === 'fuel' && (
          <select value={selVehicle} onChange={e => setSelVehicle(e.target.value)} style={{ minWidth: 160 }}>
            <option value="">All vehicles</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.make} {v.model} ({v.licensePlate})</option>)}
          </select>
        )}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-soft)' }}>Loading…</div>}

      {/* Overview */}
      {tab === 'overview' && overview && !loading && (
        <>
          <DomainSection title="Service calls" result={overview.calls} dimension={dimension}
            fields={[
              ['total', 'Total'], ['open', 'Open'], ['inProgress', 'In progress'], ['closed', 'Closed'],
              ['urgent', 'Urgent'], ['avgResolutionHours', 'Avg. resolution (h)'],
            ]} />
          <DomainSection title="Orders" result={overview.orders} dimension={dimension}
            fields={[
              ['total', 'Total'], ['completed', 'Completed'], ['pending', 'Pending'], ['avgCompletionHours', 'Avg. completion (h)'],
            ]} />
          <DomainSection title="Delivery notes" result={overview.deliveryNotes} dimension={dimension}
            fields={[['total', 'Total'], ['signed', 'Signed'], ['draft', 'Draft'], ['cancelled', 'Cancelled']]} />
          <DomainSection title="Fleet / fuel" result={overview.fleet} dimension={dimension}
            fields={[
              ['refuelCount', 'Refuels'],
              ['totalLiters', 'Total liters', (v) => v ? `${parseFloat(v).toFixed(1)} L` : '—'],
              ['totalCost', 'Total cost', (v) => v ? `₪${parseFloat(v).toFixed(0)}` : '—'],
            ]} />
          <DomainSection title="Warehouse" result={overview.warehouse} dimension={dimension}
            fields={[
              ['txCount', 'Transactions'], ['totalIn', 'Total in'], ['totalOut', 'Total out'], ['transferCount', 'Transfers'],
            ]} />
        </>
      )}

      {/* Work Report */}
      {tab === 'work' && workData && !loading && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            {[['Total', Object.values(workData.totals).reduce((a, b) => a + b, 0)],
              ['Open', workData.totals['open'] ?? 0],
              ['In Progress', workData.totals['in_progress'] ?? 0],
              ['Closed', workData.totals['closed'] ?? 0]].map(([l, v]) => (
              <div key={l} className="card" style={{ flex: 1, textAlign: 'center', padding: '12px 8px' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>{v}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{l}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px' }}>By technician</h3>
            <table>
              <thead><tr><th>Technician</th><th>Calls worked</th><th>Calls closed</th><th>Total time</th></tr></thead>
              <tbody>
                {workData.byUser.map(u => (
                  <tr key={u.userId}>
                    <td>{u.username}</td>
                    <td>{u.callsWorked}</td>
                    <td>{u.callsClosed}</td>
                    <td>{fmt(u.totalSeconds)}</td>
                  </tr>
                ))}
                {workData.byUser.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: 16 }}>No data for this period</td></tr>}
              </tbody>
            </table>
          </div>

          {workData.byDay.length > 0 && (
            <div className="card">
              <h3 style={{ margin: '0 0 12px' }}>Calls per day</h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
                {workData.byDay.map((d, i) => {
                  const max = Math.max(...workData.byDay.map(x => x.count), 1);
                  const h = (d.count / max) * 72;
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <div title={`${d.count}`} style={{ width: '100%', height: h, background: 'var(--primary)', opacity: 0.75, borderRadius: '2px 2px 0 0', minHeight: 2 }} />
                      <span style={{ fontSize: 9, color: 'var(--ink-soft)' }}>{d.day.slice(8, 10)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Fuel Report */}
      {tab === 'fuel' && fuelData && !loading && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px' }}>Summary by vehicle</h3>
            <table>
              <thead><tr><th>Vehicle</th><th>License plate</th><th>Refuels</th><th>Total liters</th><th>Total cost (₪)</th></tr></thead>
              <tbody>
                {fuelData.summary.map(s => (
                  <tr key={s.vehicleId}>
                    <td>{s.make} {s.model}</td>
                    <td className="mono">{s.licensePlate}</td>
                    <td>{s.refuelCount}</td>
                    <td>{parseFloat(s.totalLiters).toFixed(1)} L</td>
                    <td>{s.totalCost ? `₪${parseFloat(s.totalCost).toFixed(0)}` : '—'}</td>
                  </tr>
                ))}
                {fuelData.summary.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: 16 }}>No data</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3 style={{ margin: '0 0 12px' }}>All refuels</h3>
            <table>
              <thead><tr><th>Date</th><th>Vehicle</th><th>Liters</th><th>Cost</th><th>Odometer</th><th>Station</th><th>Registered by</th></tr></thead>
              <tbody>
                {fuelData.rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.date}</td>
                    <td>{r.make} {r.model} ({r.licensePlate})</td>
                    <td>{parseFloat(r.liters).toFixed(1)} L</td>
                    <td>{r.cost ? `₪${parseFloat(r.cost).toFixed(0)}` : '—'}</td>
                    <td>{r.odometer ? `${r.odometer} km` : '—'}</td>
                    <td>{r.station ?? '—'}</td>
                    <td>{r.registeredBy ?? '—'}</td>
                  </tr>
                ))}
                {fuelData.rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: 16 }}>No data</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {/* Warehouse Report */}
      {tab === 'warehouse' && warehouseData && !loading && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px' }}>Movement summary by item</h3>
            <table>
              <thead><tr><th>Item</th><th>Barcode</th><th>In</th><th>Out</th><th>Transactions</th></tr></thead>
              <tbody>
                {warehouseData.summary.map((s: any, i: number) => (
                  <tr key={i}>
                    <td>{s.itemName}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{s.barcode}</td>
                    <td style={{ color: 'green', fontWeight: 600 }}>+{s.totalIn}</td>
                    <td style={{ color: 'red', fontWeight: 600 }}>-{s.totalOut}</td>
                    <td>{s.txCount}</td>
                  </tr>
                ))}
                {warehouseData.summary.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: 16 }}>No data</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3 style={{ margin: '0 0 12px' }}>All movements</h3>
            <table>
              <thead><tr><th>Date</th><th>Item</th><th>Barcode</th><th>Type</th><th>Qty</th><th>Reason</th><th>By</th></tr></thead>
              <tbody>
                {warehouseData.rows.map((r: any, i: number) => (
                  <tr key={i}>
                    <td style={{ fontSize: 12 }}>{r.createdAt?.substring(0, 16)}</td>
                    <td>{r.itemName}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{r.barcode}</td>
                    <td><span style={{ color: r.type === 'in' ? 'green' : 'red', fontWeight: 600 }}>{r.type === 'in' ? '▼ In' : '▲ Out'}</span></td>
                    <td style={{ fontWeight: 700 }}>{r.quantity}</td>
                    <td>{r.reason ?? '—'}</td>
                    <td>{r.byUser ?? '—'}</td>
                  </tr>
                ))}
                {warehouseData.rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: 16 }}>No data</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
