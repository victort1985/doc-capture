import { useEffect, useState } from 'react';
import { Plus, Trash2, MapPin } from 'lucide-react';
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
    </div>
  );
}
