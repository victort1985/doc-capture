import { useEffect, useState } from 'react';
import { Plus, Trash2, MapPin, Link2, Copy } from 'lucide-react';
import { apiFetch } from '../services/api';

interface Region {
  id: number;
  name: string;
}
interface City {
  id: number;
  name: string;
  region: Region;
}
interface Location {
  id: number;
  name: string;
  city: City;
  isMainWarehouse: boolean;
  portalToken?: string | null;
}

export default function LocationsPage() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newRegion, setNewRegion] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newCityRegionId, setNewCityRegionId] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newLocationCityId, setNewLocationCityId] = useState('');

  async function load() {
    try {
      const [r, c, l] = await Promise.all([
        apiFetch<Region[]>('/locations/regions'),
        apiFetch<City[]>('/locations/cities'),
        apiFetch<Location[]>('/locations'),
      ]);
      setRegions(r);
      setCities(c);
      setLocations(l);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load locations');
    }
  }

  useEffect(() => { load(); }, []);

  async function addRegion(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/locations/regions', { method: 'POST', body: JSON.stringify({ name: newRegion }) });
      setNewRegion('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add region');
    }
  }

  async function addCity(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/locations/cities', {
        method: 'POST',
        body: JSON.stringify({ name: newCity, regionId: Number(newCityRegionId) }),
      });
      setNewCity('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add city');
    }
  }

  async function addLocation(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/locations', {
        method: 'POST',
        body: JSON.stringify({ name: newLocation, cityId: Number(newLocationCityId) }),
      });
      setNewLocation('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add location');
    }
  }

  async function removeRegion(id: number) {
    if (!confirm('Delete this region? Cities assigned to it must be removed first.')) return;
    try {
      await apiFetch(`/locations/regions/${id}`, { method: 'DELETE' });
      setCities((prev: any[]) => prev.filter((x: any) => x.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete region');
    }
  }

  async function removeCity(id: number) {
    if (!confirm('Delete this city? Locations assigned to it must be removed first.')) return;
    try {
      await apiFetch(`/locations/cities/${id}`, { method: 'DELETE' });
      setCities((prev: any[]) => prev.filter((x: any) => x.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete city');
    }
  }

  async function removeLocation(id: number) {
    if (!confirm('Delete this location?')) return;
    await apiFetch(`/locations/${id}`, { method: 'DELETE' });
    setCities((prev: any[]) => prev.filter((x: any) => x.id !== id));
  }

  async function toggleMainWarehouse(loc: Location) {
    setError(null);
    try {
      await apiFetch(`/locations/${loc.id}/main-warehouse`, {
        method: 'PATCH',
        body: JSON.stringify({ isMainWarehouse: !loc.isMainWarehouse }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update main warehouse');
    }
  }

  async function generatePortalLink(id: number) {
    setError(null);
    try {
      await apiFetch(`/locations/${id}/portal-token`, { method: 'POST' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate portal link');
    }
  }

  async function revokePortalLink(id: number) {
    if (!confirm('Revoke this client portal link? The current link will stop working immediately.')) return;
    setError(null);
    try {
      await apiFetch(`/locations/${id}/portal-token`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke portal link');
    }
  }

  function copyPortalLink(token: string) {
    const url = `${window.location.origin}/portal/${token}`;
    navigator.clipboard.writeText(url);
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <span className="eyebrow">Shared directory</span>
          <h1 className="page-title">Regions, cities &amp; locations</h1>
        </div>
      </div>
      <p style={{ color: 'var(--ink-soft)', marginTop: -8, marginBottom: 24, maxWidth: 640 }}>
        One shared directory, used as "Place" on calls/inventory and as
        "Organization" on phone book contacts. Regions also drive which
        technicians get notified about a new call (see Users).
      </p>

      {error && <div className="error-banner">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
        {/* Regions */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Regions</h3>
          <form onSubmit={addRegion} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input
              placeholder="New region name"
              value={newRegion}
              onChange={(e) => setNewRegion(e.target.value)}
              required
              style={{ flex: 1 }}
            />
            <button type="submit"><Plus size={15} /></button>
          </form>
          {regions.length === 0 ? (
            <div className="empty-state" style={{ padding: 16 }}>
              <MapPin size={24} strokeWidth={1.5} />
              <span>No regions yet</span>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {regions.map((r) => (
                <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                  <span>{r.name}</span>
                  <button className="ghost" onClick={() => removeRegion(r.id)} style={{ color: 'var(--danger)' }}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Cities */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Cities</h3>
          <form onSubmit={addCity} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            <input
              placeholder="New city name"
              value={newCity}
              onChange={(e) => setNewCity(e.target.value)}
              required
            />
            <select value={newCityRegionId} onChange={(e) => setNewCityRegionId(e.target.value)} required>
              <option value="">Region…</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <button type="submit"><Plus size={15} /> Add city</button>
          </form>
          {cities.length === 0 ? (
            <div className="empty-state" style={{ padding: 16 }}>
              <MapPin size={24} strokeWidth={1.5} />
              <span>No cities yet</span>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {cities.map((c) => (
                <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                  <span>{c.name} <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>({c.region?.name})</span></span>
                  <button className="ghost" onClick={() => removeCity(c.id)} style={{ color: 'var(--danger)' }}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Locations */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Locations</h3>
          <form onSubmit={addLocation} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            <input
              placeholder="New location name"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              required
            />
            <select value={newLocationCityId} onChange={(e) => setNewLocationCityId(e.target.value)} required>
              <option value="">City…</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.region?.name})</option>
              ))}
            </select>
            <button type="submit"><Plus size={15} /> Add location</button>
          </form>
          {locations.length === 0 ? (
            <div className="empty-state" style={{ padding: 16 }}>
              <MapPin size={24} strokeWidth={1.5} />
              <span>No locations yet</span>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {locations.map((l) => (
                <li key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                  <span>{l.name} <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>({l.city?.name})</span></span>
                  <button className="ghost" onClick={() => removeLocation(l.id)} style={{ color: 'var(--danger)' }}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Main warehouses — separate block: mark which locations are the
          company's primary stock, used as defaults for new equipment
          registration and equipment search on regular накладные. */}
      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>Main warehouses</h3>
        <p style={{ color: 'var(--ink-soft)', marginTop: -6, marginBottom: 14, maxWidth: 640 }}>
          These are the default stock locations used when registering new equipment
          and when searching for equipment while filling out a regular накладная.
          Other locations still have their own independent warehouse, but aren't
          used as a default.
        </p>
        {locations.length === 0 ? (
          <div className="empty-state" style={{ padding: 16 }}>
            <MapPin size={24} strokeWidth={1.5} />
            <span>No locations yet</span>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
            {locations.map((l) => (
              <li key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={l.isMainWarehouse}
                    onChange={() => toggleMainWarehouse(l)}
                  />
                  <span>{l.name} <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>({l.city?.name})</span></span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Client portal — a read-only public link per location where a
          client can check their own service-call status without
          logging in. */}
      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>Client portal</h3>
        <p style={{ color: 'var(--ink-soft)', marginTop: -6, marginBottom: 14, maxWidth: 640 }}>
          Generate a link for a location's client to check their service-call status —
          no login required. Revoking invalidates the link immediately.
        </p>
        {locations.length === 0 ? (
          <div className="empty-state" style={{ padding: 16 }}>
            <Link2 size={24} strokeWidth={1.5} />
            <span>No locations yet</span>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {locations.map((l) => (
              <li key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                <span style={{ minWidth: 200 }}>{l.name} <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>({l.city?.name})</span></span>
                {l.portalToken ? (
                  <>
                    <code style={{ fontSize: 12, color: 'var(--ink-soft)' }}>/portal/{l.portalToken.slice(0, 10)}…</code>
                    <button type="button" onClick={() => copyPortalLink(l.portalToken!)} title="Copy link"><Copy size={14} /> Copy link</button>
                    <button type="button" onClick={() => revokePortalLink(l.id)} title="Revoke" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                  </>
                ) : (
                  <button type="button" onClick={() => generatePortalLink(l.id)}><Link2 size={14} /> Generate link</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
