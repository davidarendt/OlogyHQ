import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const API = process.env.REACT_APP_API_URL || '';

const ACCOUNT_TYPES = ['bar', 'restaurant', 'retail', 'hotel', 'other'];
const PRODUCT_TYPE_COLORS = {
  beer:   'bg-amber-900/40 text-amber-300 border-amber-700/40',
  spirit: 'bg-purple-900/40 text-purple-300 border-purple-700/40',
  other:  'bg-gray-700 text-gray-300 border-gray-600',
};
const REP_COLORS = [
  '#F05A28', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

function apiFetch(path, opts = {}) {
  return fetch(`${API}${path}`, { credentials: 'include', ...opts });
}
function jsonFetch(path, method, body) {
  return apiFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── Shared components ──────────────────────────────────────────────────────

function ProductPill({ line }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border font-medium ${PRODUCT_TYPE_COLORS[line.type] || PRODUCT_TYPE_COLORS.other}`}>
      {line.name}
    </span>
  );
}

function TypeBadge({ type }) {
  const colors = {
    bar: 'bg-blue-900/40 text-blue-300', restaurant: 'bg-green-900/40 text-green-300',
    retail: 'bg-yellow-900/40 text-yellow-300', hotel: 'bg-teal-900/40 text-teal-300',
    other: 'bg-gray-700 text-gray-400',
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${colors[type] || colors.other}`}>{type}</span>;
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className={`bg-gray-800 rounded-xl border border-gray-600 shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h3 className="text-white font-semibold text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-gray-400 text-xs mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500';
const selectCls = `${inputCls} cursor-pointer`;

const formatPhone = (val) => {
  const d = val.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};

// ── Follow-up prompt ───────────────────────────────────────────────────────

function FollowUpPrompt({ accountId, accountName, activityTypes, onDone }) {
  const [form, setForm] = useState({
    activity_type_id: activityTypes[0]?.id || '',
    activity_date: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const schedule = async () => {
    if (!form.activity_date) return;
    setSaving(true);
    await jsonFetch(`/api/crm/accounts/${accountId}/activities`, 'POST', {
      ...form,
      activity_type_id: form.activity_type_id || null,
      is_scheduled: true,
    });
    setSaving(false);
    onDone();
  };

  return (
    <div className="mt-4 bg-gray-700/60 border border-orange-500/30 rounded-lg p-4">
      <p className="text-orange-300 text-sm font-medium mb-3">Schedule a follow-up for {accountName}?</p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Type</label>
          <select className={selectCls} value={form.activity_type_id} onChange={e => setForm(f => ({ ...f, activity_type_id: e.target.value }))}>
            <option value="">— select —</option>
            {activityTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Date *</label>
          <input type="date" className={inputCls} value={form.activity_date} onChange={e => setForm(f => ({ ...f, activity_date: e.target.value }))} />
        </div>
      </div>
      <input className={`${inputCls} mb-3`} placeholder="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      <div className="flex gap-2">
        <button onClick={schedule} disabled={saving || !form.activity_date}
          className="text-sm px-3 py-1.5 rounded-lg font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#F05A28' }}>
          {saving ? 'Scheduling…' : 'Schedule'}
        </button>
        <button onClick={onDone} className="text-sm px-3 py-1.5 rounded-lg bg-gray-600 text-gray-300 hover:bg-gray-500">
          Skip
        </button>
      </div>
    </div>
  );
}


function ActivityRow({ act, onEdit, onDelete }) {
  return (
    <div className="border border-gray-600/40 bg-gray-700/40 rounded-lg p-3 flex gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {act.activity_type_name && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-900/40 text-orange-300 font-medium">{act.activity_type_name}</span>
          )}
          <span className="text-gray-400 text-xs">{act.activity_date?.slice(0, 10)}</span>
          <span className="text-gray-600 text-xs">by {act.created_by_name}</span>
        </div>
        {(act.contact_name || act.contact_title) && (
          <p className="text-gray-400 text-xs mb-1">
            Spoke with: <span className="text-gray-200">{act.contact_name}{act.contact_title ? ` (${act.contact_title})` : ''}</span>
          </p>
        )}
        {act.samples && <p className="text-gray-400 text-xs mb-1">Samples: <span className="text-gray-200">{act.samples}</span></p>}
        {act.notes && <p className="text-gray-300 text-sm mt-1">{act.notes}</p>}
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={() => onEdit(act)} className="text-gray-500 hover:text-gray-300 text-xs px-2 py-1">Edit</button>
        <button onClick={() => onDelete(act.id)} className="text-gray-500 hover:text-red-400 text-xs px-2 py-1">×</button>
      </div>
    </div>
  );
}

// ── Dashboard Tab ──────────────────────────────────────────────────────────

function buildChartData(activityByDay, days) {
  const dateArr = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dateArr.push(d.toISOString().slice(0, 10));
  }
  const repNames = [...new Set(activityByDay.map(r => r.created_by_name))];
  return dateArr.map(date => {
    const label = date.slice(5);
    const entry = { date: label };
    repNames.forEach(rep => {
      const row = activityByDay.find(r => r.date === date && r.created_by_name === rep);
      entry[rep] = row ? row.count : 0;
    });
    return entry;
  });
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
      <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-white text-3xl font-bold">{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function DashboardTab() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/crm/dashboard?days=${days}`);
    setData(await res.json());
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="text-gray-500 text-sm py-16 text-center">Loading…</div>;

  const stats          = data.stats           || {};
  const activity_by_day= data.activity_by_day || [];
  const scheduled_visits= data.scheduled_visits|| [];
  const rep_summary    = data.rep_summary      || [];
  const repNames = [...new Set(activity_by_day.map(r => r.created_by_name))];
  const chartData = buildChartData(activity_by_day, days);
  const upcoming = scheduled_visits.map(v => ({ ...v, _kind: 'visit' })).sort((a, b) => a.date > b.date ? 1 : -1);

  return (
    <div className="space-y-6">
      {/* Period toggle */}
      <div className="flex items-center gap-2">
        <span className="text-gray-400 text-sm">Showing:</span>
        {[7, 30].map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition ${days === d ? 'text-white' : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'}`}
            style={days === d ? { backgroundColor: '#F05A28' } : {}}>
            Last {d} days
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Accounts Visited" value={stats.accounts_visited} sub={`${days}-day window`} />
        <StatCard label="Total Activities" value={stats.total_activities} />
        <StatCard label="New Accounts" value={stats.new_accounts} sub="added to CRM" />
      </div>

      {/* Chart */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4">Activity by Day</h3>
        {chartData.every(d => repNames.every(r => d[r] === 0))
          ? <p className="text-gray-500 text-sm text-center py-8">No activity in this period.</p>
          : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} interval={days === 7 ? 0 : 'preserveStartEnd'} />
                <YAxis allowDecimals={false} tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} labelStyle={{ color: '#f9fafb' }} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                {repNames.map((rep, i) => (
                  <Bar key={rep} dataKey={rep} stackId="a" fill={REP_COLORS[i % REP_COLORS.length]} radius={i === repNames.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )
        }
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rep summary */}
        {rep_summary.length > 0 && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <h3 className="text-white font-semibold mb-4">Rep Activity</h3>
            <div className="space-y-2">
              {rep_summary.map((rep, i) => (
                <div key={rep.created_by_name} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: REP_COLORS[i % REP_COLORS.length] }} />
                  <span className="text-white text-sm flex-1">{rep.created_by_name}</span>
                  <span className="text-gray-400 text-sm">{rep.accounts_visited} accts</span>
                  <span className="text-gray-500 text-sm">{rep.total_activities} activities</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <h3 className="text-white font-semibold mb-4">Upcoming</h3>
            <div className="space-y-2">
              {upcoming.slice(0, 8).map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <div className="text-xs px-2 py-0.5 rounded-full shrink-0 mt-0.5 font-medium bg-orange-900/40 text-orange-300">
                    {item.activity_type_name || 'Visit'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{item.account_name}</p>
                  </div>
                  <span className="text-gray-500 text-xs shrink-0">{item.date?.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Haversine distance (miles) ─────────────────────────────────────────────

function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const AMENITY_TO_TYPE = {
  bar: 'bar', pub: 'bar', nightclub: 'bar', brewery: 'bar',
  restaurant: 'restaurant', cafe: 'restaurant', fast_food: 'restaurant',
  hotel: 'hotel', hostel: 'hotel',
};

async function fetchNearbyVenues(lat, lng) {
  const r = 800; // metres
  const query = `
    [out:json][timeout:10];
    (
      node["amenity"~"bar|pub|restaurant|nightclub|cafe|brewery|hotel"](around:${r},${lat},${lng});
      way["amenity"~"bar|pub|restaurant|nightclub|cafe|brewery|hotel"](around:${r},${lat},${lng});
    );
    out center 30;
  `;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query),
  });
  const json = await res.json();
  return (json.elements || [])
    .filter(el => el.tags?.name)
    .map(el => {
      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;
      const tags = el.tags;
      const num  = tags['addr:housenumber'] || '';
      const street = tags['addr:street'] || '';
      return {
        name:    tags.name,
        address: [num, street].filter(Boolean).join(' '),
        city:    tags['addr:city'] || '',
        state:   tags['addr:state'] || '',
        phone:   tags.phone || tags['contact:phone'] || '',
        type:    AMENITY_TO_TYPE[tags.amenity] || 'other',
        dist:    elLat != null ? distanceMiles(lat, lng, elLat, elLon) : 99,
      };
    })
    .sort((a, b) => a.dist - b.dist);
}

// ── Account Modal ──────────────────────────────────────────────────────────

function AccountModal({ account, distributors, productLines, onClose, onSaved }) {
  const isNew = !account;
  const [form, setForm] = useState({
    name: account?.name || '', type: account?.type || 'bar',
    address: account?.address || '', city: account?.city || '', state: account?.state || 'FL',
    distributor_id: account?.distributor_id || '', notes: account?.notes || '',
  });
  const [selectedProducts, setSelectedProducts] = useState((account?.product_lines || []).map(p => p.id));
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [nearbyPlaces, setNearbyPlaces] = useState(null); // null = not searched, [] = no results
  const [locError, setLocError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const findDistributorForCity = (city) => {
    if (!city.trim()) return null;
    const normalized = city.trim().toLowerCase();
    return distributors.find(d =>
      d.territory && d.territory.split(',').some(t => t.trim().toLowerCase() === normalized)
    ) || null;
  };

  const setCity = (city) => {
    const match = findDistributorForCity(city);
    setForm(f => ({ ...f, city, ...(match ? { distributor_id: match.id } : {}) }));
  };

  const toggleProduct = (id) => setSelectedProducts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const findNearby = () => {
    if (!navigator.geolocation) {
      setLocError('Geolocation is not supported by this browser.');
      return;
    }
    setLocating(true);
    setLocError('');
    setNearbyPlaces(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const places = await fetchNearbyVenues(pos.coords.latitude, pos.coords.longitude);
          setNearbyPlaces(places);
        } catch {
          setLocError('Could not fetch nearby venues. Try again or enter manually.');
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocError('Location access denied. Enter details manually.');
        setLocating(false);
      },
      { timeout: 10000 }
    );
  };

  const selectPlace = (place) => {
    const city = place.city || '';
    const match = findDistributorForCity(city);
    setForm(f => ({
      ...f,
      name:    place.name    || f.name,
      address: place.address || f.address,
      city:    city          || f.city,
      state:   place.state   || f.state,
      phone:   place.phone   || f.phone,
      type:    place.type    || f.type,
      ...(match ? { distributor_id: match.id } : {}),
    }));
    setNearbyPlaces(null);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const method = isNew ? 'POST' : 'PATCH';
    const url = isNew ? '/api/crm/accounts' : `/api/crm/accounts/${account.id}`;
    const res = await jsonFetch(url, method, { ...form, distributor_id: form.distributor_id || null });
    const saved = await res.json();
    await jsonFetch(`/api/crm/accounts/${saved.id}/products`, 'PUT', { product_line_ids: selectedProducts });
    onSaved();
  };

  return (
    <Modal title={isNew ? 'Add Account' : 'Edit Account'} onClose={onClose} wide>
      <div className="space-y-4">

        {/* GPS lookup — new accounts only */}
        {isNew && (
          <div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={findNearby} disabled={locating}
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg border border-orange-500/50 text-orange-400 hover:bg-orange-900/20 disabled:opacity-50 transition">
                <span>{locating ? '📡' : '📍'}</span>
                {locating ? 'Locating…' : 'Find Locations Near Me'}
              </button>
            </div>
            {locError && <p className="text-red-400 text-xs mt-2">{locError}</p>}
            {nearbyPlaces !== null && (
              <div className="mt-2 bg-gray-700/60 border border-gray-600 rounded-lg overflow-hidden">
                {nearbyPlaces.length === 0
                  ? <p className="text-gray-400 text-sm px-4 py-3">No venues found nearby. Enter details manually.</p>
                  : (
                    <div className="max-h-52 overflow-y-auto divide-y divide-gray-600/50">
                      {nearbyPlaces.map((place, i) => (
                        <button key={i} type="button" onClick={() => selectPlace(place)}
                          className="w-full text-left px-4 py-3 hover:bg-gray-600/50 transition">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-white text-sm font-medium">{place.name}</span>
                            <span className="text-gray-500 text-xs shrink-0">{place.dist.toFixed(2)} mi</span>
                          </div>
                          <div className="text-gray-400 text-xs mt-0.5">
                            {[place.address, place.city].filter(Boolean).join(', ')}
                            {place.type && <span className="ml-2 capitalize text-gray-600">· {place.type}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )
                }
                <button type="button" onClick={() => setNearbyPlaces(null)}
                  className="w-full text-center text-xs text-gray-500 hover:text-gray-300 py-2 border-t border-gray-600/50">
                  Dismiss
                </button>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Account Name *"><input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} /></Field>
          <Field label="Type">
            <select className={selectCls} value={form.type} onChange={e => set('type', e.target.value)}>
              {ACCOUNT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="col-span-2"><Field label="Address"><input className={inputCls} value={form.address} onChange={e => set('address', e.target.value)} /></Field></div>
          <Field label="City"><input className={inputCls} value={form.city} onChange={e => setCity(e.target.value)} /></Field>
        </div>
        <Field label="Distributor">
          <select className={selectCls} value={form.distributor_id} onChange={e => set('distributor_id', e.target.value)}>
            <option value="">— none —</option>
            {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        {productLines.length > 0 && (
          <div>
            <label className="block text-gray-400 text-xs mb-2">Products Carried</label>
            <div className="flex flex-wrap gap-2">
              {productLines.map(pl => {
                const active = selectedProducts.includes(pl.id);
                return (
                  <button key={pl.id} type="button" onClick={() => toggleProduct(pl.id)}
                    className={`px-3 py-1 rounded text-xs font-medium border transition ${active ? 'border-orange-500 text-orange-300 bg-orange-900/30' : 'border-gray-600 text-gray-400 bg-gray-700 hover:border-gray-500'}`}>
                    {pl.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <Field label="Notes"><textarea className={`${inputCls} resize-none`} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} /></Field>
        <div className="flex gap-3 justify-end pt-2">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600">Cancel</button>
          <button onClick={save} disabled={saving || !form.name.trim()} className="text-sm px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#F05A28' }}>
            {saving ? 'Saving…' : isNew ? 'Add Account' : 'Save Changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Account Contacts Section ───────────────────────────────────────────────

function AccountContactsSection({ accountId, contacts, onRefresh }) {
  const emptyForm = { name: '', title: '', phone: '', email: '', is_primary: false };
  const [contactForm, setContactForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const openNew = () => { setContactForm({ ...emptyForm }); setEditingId(null); };
  const openEdit = (c) => {
    setContactForm({ name: c.name, title: c.title || '', phone: c.phone || '', email: c.email || '', is_primary: c.is_primary });
    setEditingId(c.id);
  };

  const save = async () => {
    if (!contactForm.name.trim()) return;
    setSaving(true);
    const method = editingId ? 'PATCH' : 'POST';
    const url = editingId ? `/api/crm/accounts/${accountId}/contacts/${editingId}` : `/api/crm/accounts/${accountId}/contacts`;
    await jsonFetch(url, method, contactForm);
    setContactForm(null); setEditingId(null); setSaving(false);
    onRefresh();
  };

  const remove = async (cId) => {
    if (!window.confirm('Remove this contact?')) return;
    await jsonFetch(`/api/crm/accounts/${accountId}/contacts/${cId}`, 'DELETE');
    onRefresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-gray-500 text-xs uppercase tracking-wider">Contacts</p>
        {!contactForm && <button onClick={openNew} className="text-xs text-orange-400 hover:text-orange-300">+ Add</button>}
      </div>

      {contactForm && (
        <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-3 mb-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name *"><input className={inputCls} value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} autoFocus /></Field>
            <Field label="Title"><input className={inputCls} value={contactForm.title} onChange={e => setContactForm(f => ({ ...f, title: e.target.value }))} /></Field>
            <Field label="Phone"><input className={inputCls} value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: formatPhone(e.target.value) }))} /></Field>
            <Field label="Email"><input className={inputCls} type="email" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" checked={contactForm.is_primary} onChange={e => setContactForm(f => ({ ...f, is_primary: e.target.checked }))} className="accent-orange-500" />
            Primary contact
          </label>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setContactForm(null); setEditingId(null); }} className="text-xs px-3 py-1.5 rounded bg-gray-600 text-gray-300">Cancel</button>
            <button onClick={save} disabled={saving || !contactForm.name.trim()} className="text-xs px-3 py-1.5 rounded text-white disabled:opacity-50" style={{ backgroundColor: '#F05A28' }}>Save</button>
          </div>
        </div>
      )}

      {contacts.length === 0 && !contactForm && <p className="text-gray-600 text-sm">No contacts yet.</p>}
      <div className="space-y-2">
        {contacts.map(c => (
          <div key={c.id} className="flex items-start gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white text-sm font-medium">{c.name}</span>
                {c.is_primary && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-900/40 text-orange-300">Primary</span>}
                {c.title && <span className="text-gray-400 text-xs">{c.title}</span>}
              </div>
              <div className="flex gap-3 mt-0.5 flex-wrap">
                {c.phone && <a href={`tel:${c.phone}`} className="text-orange-400 hover:underline text-xs">{c.phone}</a>}
                {c.email && <a href={`mailto:${c.email}`} className="text-orange-400 hover:underline text-xs">{c.email}</a>}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => openEdit(c)} className="text-gray-500 hover:text-gray-300 text-xs px-1">Edit</button>
              <button onClick={() => remove(c.id)} className="text-gray-500 hover:text-red-400 text-xs px-1">×</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Merge Account Modal ────────────────────────────────────────────────────

function MergeAccountModal({ account, accounts, onClose, onMerged }) {
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [merging, setMerging] = useState(false);
  const others = accounts.filter(a => a.id !== account.id && a.name.toLowerCase().includes(search.toLowerCase()));
  const selected = accounts.find(a => a.id === Number(selectedId));

  const doMerge = async () => {
    if (!selectedId) return;
    setMerging(true);
    await jsonFetch(`/api/crm/accounts/${account.id}/merge`, 'POST', { source_id: Number(selectedId) });
    onMerged();
  };

  return (
    <Modal title="Merge Accounts" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-gray-400 text-sm">
          Select the duplicate account to absorb into <span className="text-white font-medium">{account.name}</span>.
          All its activity history and contacts will be moved here, then it will be deleted.
        </p>
        <Field label="Search accounts">
          <input className={inputCls} placeholder="Type to filter…" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        </Field>
        <div className="max-h-52 overflow-y-auto space-y-1">
          {others.length === 0 && <p className="text-gray-500 text-sm text-center py-4">No accounts found.</p>}
          {others.map(a => (
            <label key={a.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer border transition ${Number(selectedId) === a.id ? 'border-orange-500 bg-orange-900/20' : 'border-gray-700 bg-gray-800 hover:border-gray-600'}`}>
              <input type="radio" name="merge-target" value={a.id} checked={Number(selectedId) === a.id} onChange={e => setSelectedId(e.target.value)} className="accent-orange-500" />
              <span className="text-white text-sm">{a.name}</span>
              {a.city && <span className="text-gray-500 text-xs">{a.city}</span>}
            </label>
          ))}
        </div>
        {selected && (
          <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3 text-sm text-yellow-300">
            <strong>{selected.name}</strong> will be deleted. Its {selected.contacts?.length || 0} contact(s) and all activity history will move to <strong>{account.name}</strong>.
          </div>
        )}
        <div className="flex gap-3 justify-end pt-1">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-gray-300">Cancel</button>
          <button onClick={doMerge} disabled={!selectedId || merging} className="text-sm px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#F05A28' }}>
            {merging ? 'Merging…' : 'Merge'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Account Detail ─────────────────────────────────────────────────────────

function AccountDetail({ account, activityTypes, canUpload, accounts, onClose, onEdit, onDelete, onRefreshAccounts }) {
  const [contacts, setContacts] = useState(account.contacts || []);
  const [activities, setActivities] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ activity_type_id: '', activity_date: '', notes: '', contact_name: '', contact_title: '', samples: '' });
  const [saving, setSaving] = useState(false);

  const loadActivities = useCallback(async () => {
    const res = await apiFetch(`/api/crm/accounts/${account.id}/activities`);
    setActivities(await res.json());
  }, [account.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadContacts = useCallback(async () => {
    const res = await apiFetch(`/api/crm/accounts/${account.id}/contacts`);
    setContacts(await res.json());
  }, [account.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadActivities(); }, [loadActivities]);

  const openNew = () => {
    setForm({ activity_type_id: activityTypes[0]?.id || '', activity_date: new Date().toISOString().slice(0, 10), notes: '', contact_name: '', contact_title: '', samples: '' });
    setEditingId(null);
    setShowFollowUp(false);
    setShowForm(true);
  };

  const openEdit = (act) => {
    setForm({
      activity_type_id: act.activity_type_id || '',
      activity_date: act.activity_date?.slice(0, 10) || '',
      notes: act.notes || '',
      contact_name: act.contact_name || '',
      contact_title: act.contact_title || '',
      samples: act.samples || '',
    });
    setEditingId(act.id);
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    const method = editingId ? 'PATCH' : 'POST';
    const url = editingId ? `/api/crm/accounts/${account.id}/activities/${editingId}` : `/api/crm/accounts/${account.id}/activities`;
    await jsonFetch(url, method, { ...form, activity_type_id: form.activity_type_id || null });
    setShowForm(false);
    setSaving(false);
    loadActivities();
    if (!editingId) setShowFollowUp(true);
  };

  const del = async (id) => {
    if (!window.confirm('Delete this activity?')) return;
    await jsonFetch(`/api/crm/accounts/${account.id}/activities/${id}`, 'DELETE');
    loadActivities();
  };

  const completed = activities.filter(a => !a.is_scheduled);

  return (
    <Modal title={account.name} onClose={onClose} wide>
      {/* Info + contacts */}
      <div className="space-y-4 pb-5 mb-5 border-b border-gray-700">
        <div className="flex flex-wrap gap-2 items-center">
          <TypeBadge type={account.type} />
          {account.distributor_name && <span className="text-xs text-gray-400">via {account.distributor_name}</span>}
          {(account.address || account.city) && <span className="text-gray-500 text-xs">{[account.address, account.city, account.state].filter(Boolean).join(', ')}</span>}
        </div>

        {account.product_lines?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">{account.product_lines.map(pl => <ProductPill key={pl.id} line={pl} />)}</div>
        )}
        {account.notes && <p className="text-gray-300 text-sm whitespace-pre-wrap">{account.notes}</p>}

        <AccountContactsSection accountId={account.id} contacts={contacts} onRefresh={loadContacts} />

        <div className="flex gap-2 flex-wrap pt-1">
          <button onClick={onEdit} className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600">Edit</button>
          {canUpload && (
            <>
              <button onClick={() => setShowMerge(true)} className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600">Merge…</button>
              <button onClick={onDelete} className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-red-400 hover:bg-red-900/30 ml-auto">Delete</button>
            </>
          )}
        </div>
      </div>

      {/* Activity log */}
      <div className="flex gap-2 mb-4">
        <button onClick={openNew} className="flex-1 sm:flex-none text-sm px-4 py-2.5 rounded-lg font-medium text-white" style={{ backgroundColor: '#F05A28' }}>+ Log Activity</button>
      </div>

      {showForm && (
        <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select className={selectCls} value={form.activity_type_id} onChange={e => setForm(f => ({ ...f, activity_type_id: e.target.value }))}>
                <option value="">— select —</option>
                {activityTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Date">
              <input type="date" className={inputCls} value={form.activity_date} onChange={e => setForm(f => ({ ...f, activity_date: e.target.value }))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Who did you talk to?">
              <input className={inputCls} list="contact-names" value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Contact name" />
              <datalist id="contact-names">{contacts.map(c => <option key={c.id} value={c.name} />)}</datalist>
            </Field>
            <Field label="Their position">
              <input className={inputCls} value={form.contact_title}
                onChange={e => setForm(f => ({ ...f, contact_title: e.target.value }))}
                placeholder="e.g. Bar Manager" />
            </Field>
          </div>
          <Field label="Products tried / Samples delivered">
            <textarea className={`${inputCls} resize-none`} rows={2} value={form.samples} onChange={e => setForm(f => ({ ...f, samples: e.target.value }))} placeholder="e.g. Hazy IPA pint, 2 cases of Lager" />
          </Field>
          <Field label="Notes">
            <textarea className={`${inputCls} resize-none`} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </Field>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-sm px-3 py-1.5 rounded-lg bg-gray-600 text-gray-300">Cancel</button>
            <button onClick={save} disabled={saving || !form.activity_date} className="text-sm px-4 py-1.5 rounded-lg font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#F05A28' }}>
              {saving ? 'Saving…' : 'Log'}
            </button>
          </div>
        </div>
      )}

      {showFollowUp && (
        <FollowUpPrompt accountId={account.id} accountName={account.name} activityTypes={activityTypes} onDone={() => { setShowFollowUp(false); loadActivities(); }} />
      )}

      {completed.length === 0 && !showForm && (
        <p className="text-gray-500 text-sm text-center py-6">No activity yet.</p>
      )}

      {completed.length > 0 && (
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">History</p>
          <div className="space-y-2">{completed.map(act => <ActivityRow key={act.id} act={act} onEdit={openEdit} onDelete={del} />)}</div>
        </div>
      )}

      {showMerge && (
        <MergeAccountModal account={account} accounts={accounts} onClose={() => setShowMerge(false)}
          onMerged={() => { setShowMerge(false); onClose(); onRefreshAccounts(); }} />
      )}
    </Modal>
  );
}

// ── Distributor Contacts Section ───────────────────────────────────────────

function DistributorContactsSection({ distributorId, contacts, contactRoles, onRefresh }) {
  const emptyForm = { name: '', title: '', phone: '', email: '', is_primary: false, role_id: '' };
  const [contactForm, setContactForm] = useState(null); // null=closed, obj=open
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const openNew = () => { setContactForm({ ...emptyForm }); setEditingId(null); };
  const openEdit = (c) => {
    setContactForm({ name: c.name, title: c.title || '', phone: c.phone || '', email: c.email || '', is_primary: c.is_primary, role_id: c.role_id || '' });
    setEditingId(c.id);
  };

  const save = async () => {
    if (!contactForm.name.trim()) return;
    setSaving(true);
    const method = editingId ? 'PATCH' : 'POST';
    const url = editingId
      ? `/api/crm/distributors/${distributorId}/contacts/${editingId}`
      : `/api/crm/distributors/${distributorId}/contacts`;
    await jsonFetch(url, method, { ...contactForm, role_id: contactForm.role_id || null });
    setContactForm(null);
    setEditingId(null);
    setSaving(false);
    onRefresh();
  };

  const remove = async (cId) => {
    if (!window.confirm('Remove this contact?')) return;
    await jsonFetch(`/api/crm/distributors/${distributorId}/contacts/${cId}`, 'DELETE');
    onRefresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-gray-500 text-xs uppercase tracking-wider">Contacts</p>
        {!contactForm && (
          <button onClick={openNew} className="text-xs text-orange-400 hover:text-orange-300">+ Add Contact</button>
        )}
      </div>

      {contactForm && (
        <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-3 mb-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name *"><input className={inputCls} value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} autoFocus /></Field>
            <Field label="Role">
              <select className={selectCls} value={contactForm.role_id} onChange={e => setContactForm(f => ({ ...f, role_id: e.target.value }))}>
                <option value="">— select —</option>
                {contactRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="Phone"><input className={inputCls} value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: formatPhone(e.target.value) }))} /></Field>
            <Field label="Email"><input className={inputCls} type="email" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} /></Field>
            <div className="col-span-2"><Field label="Title"><input className={inputCls} value={contactForm.title} onChange={e => setContactForm(f => ({ ...f, title: e.target.value }))} /></Field></div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input type="checkbox" checked={contactForm.is_primary} onChange={e => setContactForm(f => ({ ...f, is_primary: e.target.checked }))} />
            Primary contact
          </label>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setContactForm(null); setEditingId(null); }} className="text-xs px-3 py-1.5 rounded bg-gray-600 text-gray-300">Cancel</button>
            <button onClick={save} disabled={saving || !contactForm.name.trim()} className="text-xs px-3 py-1.5 rounded text-white disabled:opacity-50" style={{ backgroundColor: '#F05A28' }}>
              {saving ? 'Saving…' : editingId ? 'Save' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {contacts.length === 0 && !contactForm && (
        <p className="text-gray-600 text-xs">No contacts yet.</p>
      )}
      <div className="space-y-2">
        {contacts.map(c => (
          <div key={c.id} className="bg-gray-700/40 rounded-lg px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white text-sm font-medium">{c.name}</span>
                  {c.is_primary && <span className="text-xs text-orange-400 font-medium">primary</span>}
                  {c.role_name && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-600 text-gray-300">{c.role_name}</span>}
                  {c.title && <span className="text-gray-400 text-xs">{c.title}</span>}
                </div>
                <div className="flex flex-wrap gap-3 mt-1">
                  {c.phone && <a href={`tel:${c.phone}`} className="text-orange-400 text-xs hover:underline">{c.phone}</a>}
                  {c.email && <a href={`mailto:${c.email}`} className="text-orange-400 text-xs hover:underline">{c.email}</a>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(c)} className="text-gray-500 hover:text-gray-300 text-xs px-2 py-1">Edit</button>
                <button onClick={() => remove(c.id)} className="text-gray-500 hover:text-red-400 text-xs px-2 py-1">×</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Distributor Modal ──────────────────────────────────────────────────────

function DistributorModal({ distributor, productLines, onClose, onSaved }) {
  const isNew = !distributor;
  const [form, setForm] = useState({ name: distributor?.name || '', territory: distributor?.territory || '', notes: distributor?.notes || '' });
  const [selectedProducts, setSelectedProducts] = useState((distributor?.product_lines || []).map(p => p.id));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleProduct = (id) => setSelectedProducts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const saveDistributor = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const method = isNew ? 'POST' : 'PATCH';
    const url = isNew ? '/api/crm/distributors' : `/api/crm/distributors/${distributor.id}`;
    const res = await jsonFetch(url, method, form);
    const saved = await res.json();
    await jsonFetch(`/api/crm/distributors/${saved.id}/products`, 'PUT', { product_line_ids: selectedProducts });
    onSaved();
  };

  return (
    <Modal title={isNew ? 'Add Distributor' : 'Edit Distributor'} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name *"><input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} /></Field>
          <Field label="Territory"><input className={inputCls} value={form.territory} onChange={e => set('territory', e.target.value)} placeholder="e.g. Tampa Bay Area" /></Field>
        </div>
        {productLines.length > 0 && (
          <div>
            <label className="block text-gray-400 text-xs mb-2">Brands Carried</label>
            <div className="flex flex-wrap gap-2">
              {productLines.map(pl => {
                const active = selectedProducts.includes(pl.id);
                return (
                  <button key={pl.id} type="button" onClick={() => toggleProduct(pl.id)}
                    className={`px-3 py-1 rounded text-xs font-medium border transition ${active ? 'border-orange-500 text-orange-300 bg-orange-900/30' : 'border-gray-600 text-gray-400 bg-gray-700 hover:border-gray-500'}`}>
                    {pl.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <Field label="Notes"><textarea className={`${inputCls} resize-none`} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} /></Field>
        {isNew && <p className="text-gray-500 text-xs">You can add contacts after saving the distributor.</p>}
        <div className="flex gap-3 justify-end pt-2">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600">Cancel</button>
          <button onClick={saveDistributor} disabled={saving || !form.name.trim()} className="text-sm px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#F05A28' }}>
            {saving ? 'Saving…' : isNew ? 'Add Distributor' : 'Save Changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Manage Tab ─────────────────────────────────────────────────────────────

function ManageTab({ productLines, activityTypes, contactRoles, onRefreshProductLines, onRefreshActivityTypes, onRefreshContactRoles }) {
  const [section, setSection] = useState('products');
  const [plForm, setPlForm] = useState({ name: '', type: 'beer' });
  const [editingPl, setEditingPl] = useState(null);
  const [draggedPlId, setDraggedPlId] = useState(null);
  const [overPlId, setOverPlId] = useState(null);
  const [atForm, setAtForm] = useState('');
  const [editingAt, setEditingAt] = useState(null);
  const [crForm, setCrForm] = useState('');
  const [editingCr, setEditingCr] = useState(null);

  const addProductLine = async () => {
    if (!plForm.name.trim()) return;
    await jsonFetch('/api/crm/product-lines', 'POST', plForm);
    setPlForm({ name: '', type: 'beer' });
    onRefreshProductLines();
  };
  const saveProductLine = async (id) => {
    await jsonFetch(`/api/crm/product-lines/${id}`, 'PATCH', editingPl);
    setEditingPl(null);
    onRefreshProductLines();
  };
  const deletePl = async (id) => {
    if (!window.confirm('Delete this product line?')) return;
    await jsonFetch(`/api/crm/product-lines/${id}`, 'DELETE');
    onRefreshProductLines();
  };

  const handlePlDrop = async (targetId) => {
    if (!draggedPlId || draggedPlId === targetId) { setDraggedPlId(null); setOverPlId(null); return; }
    const from = productLines.findIndex(p => p.id === draggedPlId);
    const to = productLines.findIndex(p => p.id === targetId);
    if (from === -1 || to === -1) return;
    const reordered = [...productLines];
    const [item] = reordered.splice(from, 1);
    reordered.splice(to, 0, item);
    setDraggedPlId(null);
    setOverPlId(null);
    await jsonFetch('/api/crm/product-lines/reorder', 'PATCH', { ids: reordered.map(p => p.id) });
    onRefreshProductLines();
  };

  const addAt = async () => {
    if (!atForm.trim()) return;
    await jsonFetch('/api/crm/activity-types', 'POST', { name: atForm });
    setAtForm('');
    onRefreshActivityTypes();
  };
  const saveAt = async () => {
    if (!editingAt?.name?.trim()) return;
    await jsonFetch(`/api/crm/activity-types/${editingAt.id}`, 'PATCH', { name: editingAt.name });
    setEditingAt(null);
    onRefreshActivityTypes();
  };
  const deleteAt = async (id) => {
    if (!window.confirm('Delete this activity type?')) return;
    await jsonFetch(`/api/crm/activity-types/${id}`, 'DELETE');
    onRefreshActivityTypes();
  };

  const addCr = async () => {
    if (!crForm.trim()) return;
    await jsonFetch('/api/crm/contact-roles', 'POST', { name: crForm });
    setCrForm('');
    onRefreshContactRoles();
  };
  const saveCr = async () => {
    if (!editingCr?.name?.trim()) return;
    await jsonFetch(`/api/crm/contact-roles/${editingCr.id}`, 'PATCH', { name: editingCr.name });
    setEditingCr(null);
    onRefreshContactRoles();
  };
  const deleteCr = async (id) => {
    if (!window.confirm('Delete this contact role?')) return;
    await jsonFetch(`/api/crm/contact-roles/${id}`, 'DELETE');
    onRefreshContactRoles();
  };

  const sections = [
    { id: 'products', label: 'Product Lines' },
    { id: 'activity-types', label: 'Activity Types' },
    { id: 'contact-roles', label: 'Contact Roles' },
  ];

  return (
    <div>
      <div className="flex gap-1 mb-6 border-b border-gray-700">
        {sections.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${section === s.id ? 'border-orange-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {section === 'products' && (
        <div className="max-w-md space-y-3">
          <div className="flex gap-2">
            <input className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
              placeholder="Product line name…" value={plForm.name} onChange={e => setPlForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addProductLine()} />
            <select className="shrink-0 w-28 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 cursor-pointer" value={plForm.type} onChange={e => setPlForm(f => ({ ...f, type: e.target.value }))}>
              <option value="beer">Beer</option><option value="spirit">Spirit</option><option value="other">Other</option>
            </select>
            <button onClick={addProductLine} disabled={!plForm.name.trim()} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 shrink-0" style={{ backgroundColor: '#F05A28' }}>Add</button>
          </div>
          {productLines.length === 0 && <p className="text-gray-600 text-sm">No product lines yet.</p>}
          {productLines.map(pl => (
            <div
              key={pl.id}
              draggable
              onDragStart={() => setDraggedPlId(pl.id)}
              onDragOver={e => { e.preventDefault(); setOverPlId(pl.id); }}
              onDragLeave={() => setOverPlId(null)}
              onDrop={() => handlePlDrop(pl.id)}
              onDragEnd={() => { setDraggedPlId(null); setOverPlId(null); }}
              className={`flex items-center gap-2 bg-gray-800 border rounded-lg px-3 py-2 transition-colors ${overPlId === pl.id && draggedPlId !== pl.id ? 'border-orange-500' : 'border-gray-700'} ${draggedPlId === pl.id ? 'opacity-40' : ''}`}
            >
              <span className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing select-none text-base leading-none">⠿</span>
              {editingPl?.id === pl.id ? (
                <>
                  <input className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm focus:outline-none" value={editingPl.name} onChange={e => setEditingPl(f => ({ ...f, name: e.target.value }))} autoFocus />
                  <select className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm w-24" value={editingPl.type} onChange={e => setEditingPl(f => ({ ...f, type: e.target.value }))}>
                    <option value="beer">Beer</option><option value="spirit">Spirit</option><option value="other">Other</option>
                  </select>
                  <button onClick={() => saveProductLine(pl.id)} className="text-xs px-2 py-1 rounded text-white" style={{ backgroundColor: '#F05A28' }}>Save</button>
                  <button onClick={() => setEditingPl(null)} className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300">Cancel</button>
                </>
              ) : (
                <>
                  <ProductPill line={pl} />
                  <span className="text-white text-sm flex-1">{pl.name}</span>
                  <button onClick={() => setEditingPl({ id: pl.id, name: pl.name, type: pl.type })} className="text-gray-500 hover:text-gray-300 text-xs">Edit</button>
                  <button onClick={() => deletePl(pl.id)} className="text-gray-500 hover:text-red-400 text-xs">×</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {section === 'activity-types' && (
        <div className="max-w-xs space-y-3">
          <div className="flex gap-2">
            <input className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
              placeholder="Type name…" value={atForm} onChange={e => setAtForm(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAt()} />
            <button onClick={addAt} disabled={!atForm.trim()} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 shrink-0" style={{ backgroundColor: '#F05A28' }}>Add</button>
          </div>
          {activityTypes.map(at => (
            <div key={at.id} className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
              {editingAt?.id === at.id ? (
                <>
                  <input className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm focus:outline-none" value={editingAt.name} onChange={e => setEditingAt(f => ({ ...f, name: e.target.value }))} autoFocus />
                  <button onClick={saveAt} className="text-xs px-2 py-1 rounded text-white" style={{ backgroundColor: '#F05A28' }}>Save</button>
                  <button onClick={() => setEditingAt(null)} className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300">Cancel</button>
                </>
              ) : (
                <>
                  <span className="text-white text-sm flex-1">{at.name}</span>
                  <button onClick={() => setEditingAt({ id: at.id, name: at.name })} className="text-gray-500 hover:text-gray-300 text-xs">Edit</button>
                  <button onClick={() => deleteAt(at.id)} className="text-gray-500 hover:text-red-400 text-xs">×</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {section === 'contact-roles' && (
        <div className="max-w-xs space-y-3">
          <p className="text-gray-500 text-xs">These roles appear as labels on distributor contacts (Sales Staff, Warehouse, etc.).</p>
          <div className="flex gap-2">
            <input className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
              placeholder="Role name…" value={crForm} onChange={e => setCrForm(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCr()} />
            <button onClick={addCr} disabled={!crForm.trim()} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 shrink-0" style={{ backgroundColor: '#F05A28' }}>Add</button>
          </div>
          {contactRoles.map(cr => (
            <div key={cr.id} className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
              {editingCr?.id === cr.id ? (
                <>
                  <input className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm focus:outline-none" value={editingCr.name} onChange={e => setEditingCr(f => ({ ...f, name: e.target.value }))} autoFocus />
                  <button onClick={saveCr} className="text-xs px-2 py-1 rounded text-white" style={{ backgroundColor: '#F05A28' }}>Save</button>
                  <button onClick={() => setEditingCr(null)} className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300">Cancel</button>
                </>
              ) : (
                <>
                  <span className="text-white text-sm flex-1">{cr.name}</span>
                  <button onClick={() => setEditingCr({ id: cr.id, name: cr.name })} className="text-gray-500 hover:text-gray-300 text-xs">Edit</button>
                  <button onClick={() => deleteCr(cr.id)} className="text-gray-500 hover:text-red-400 text-xs">×</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

function SalesCRM({ user, canUpload, onBack }) {
  const [tab, setTab] = useState('dashboard');
  const [accounts, setAccounts] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [productLines, setProductLines] = useState([]);
  const [activityTypes, setActivityTypes] = useState([]);
  const [contactRoles, setContactRoles] = useState([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDist, setFilterDist] = useState('');

  const [accountDetail, setAccountDetail] = useState(null);
  const [accountEdit, setAccountEdit] = useState(null);
  const [distEdit, setDistEdit] = useState(null);
  const [distDetailId, setDistDetailId] = useState(null);
  const distDetail = distDetailId ? distributors.find(d => d.id === distDetailId) || null : null;

  const loadAccounts     = async () => { const r = await apiFetch('/api/crm/accounts');       setAccounts(await r.json()); };
  const loadDistributors = async () => { const r = await apiFetch('/api/crm/distributors');   setDistributors(await r.json()); };
  const loadProductLines = async () => { const r = await apiFetch('/api/crm/product-lines');  setProductLines(await r.json()); };
  const loadActivityTypes= async () => { const r = await apiFetch('/api/crm/activity-types'); setActivityTypes(await r.json()); };
  const loadContactRoles = async () => { const r = await apiFetch('/api/crm/contact-roles');  setContactRoles(await r.json()); };

  useEffect(() => {
    loadAccounts(); loadDistributors(); loadProductLines(); loadActivityTypes(); loadContactRoles();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteAccount = async (id) => {
    if (!window.confirm('Delete this account and all its activity history?')) return;
    await jsonFetch(`/api/crm/accounts/${id}`, 'DELETE');
    setAccountDetail(null);
    loadAccounts();
  };

  const deleteDistributor = async (id) => {
    if (!window.confirm('Delete this distributor?')) return;
    await jsonFetch(`/api/crm/distributors/${id}`, 'DELETE');
    setDistDetailId(null);
    loadDistributors();
    loadAccounts();
  };

  const filteredAccounts = accounts.filter(a => {
    const q = search.toLowerCase();
    if (q && !a.name.toLowerCase().includes(q) && !(a.contact_name || '').toLowerCase().includes(q) && !(a.city || '').toLowerCase().includes(q)) return false;
    if (filterType && a.type !== filterType) return false;
    if (filterDist && String(a.distributor_id) !== filterDist) return false;
    return true;
  });

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'accounts', label: 'Accounts' },
    { id: 'distributors', label: 'Distributors' },
    ...(canUpload ? [{ id: 'manage', label: 'Manage' }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition">
          <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-xl">HQ</span>
        </button>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition">← Dashboard</button>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="mb-6 sm:mb-8 text-center">
          <h2 className="text-cream text-3xl sm:text-4xl font-bold">Sales CRM</h2>
          <p className="text-gray-400 mt-2">Distributor &amp; account relationships</p>
        </div>

        <div className="flex gap-1 border-b border-gray-700 mb-6 overflow-x-auto scrollbar-none">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px whitespace-nowrap shrink-0 ${tab === t.id ? 'border-orange-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'dashboard' && <DashboardTab />}

        {tab === 'accounts' && (
          <div>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3 mb-5">
              <div className="flex gap-2 sm:contents">
                <input className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500"
                  placeholder="Search accounts…" value={search} onChange={e => setSearch(e.target.value)} />
                <button onClick={() => setAccountEdit(false)} className="px-4 py-2.5 rounded-lg text-sm font-medium text-white shrink-0 sm:hidden" style={{ backgroundColor: '#F05A28' }}>+ Add</button>
              </div>
              <div className="flex gap-2 sm:contents">
                <select className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 cursor-pointer" value={filterType} onChange={e => setFilterType(e.target.value)}>
                  <option value="">All types</option>
                  {ACCOUNT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
                <select className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 cursor-pointer" value={filterDist} onChange={e => setFilterDist(e.target.value)}>
                  <option value="">All distributors</option>
                  {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <button onClick={() => setAccountEdit(false)} className="hidden sm:block px-4 py-2 rounded-lg text-sm font-medium text-white shrink-0" style={{ backgroundColor: '#F05A28' }}>+ Add Account</button>
            </div>

            {filteredAccounts.length === 0
              ? <div className="text-center py-16 text-gray-500">{accounts.length === 0 ? 'No accounts yet.' : 'No accounts match your filters.'}</div>
              : (
                <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700 text-left">
                        <th className="px-4 py-3 text-gray-400 text-xs font-medium">Account</th>
                        <th className="px-4 py-3 text-gray-400 text-xs font-medium hidden sm:table-cell">Type</th>
                        <th className="px-4 py-3 text-gray-400 text-xs font-medium hidden md:table-cell">Contact</th>
                        <th className="px-4 py-3 text-gray-400 text-xs font-medium hidden lg:table-cell">Distributor</th>
                        <th className="px-4 py-3 text-gray-400 text-xs font-medium hidden md:table-cell">Products</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAccounts.map(a => (
                        <tr key={a.id} onClick={() => setAccountDetail(a)} className="border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer transition">
                          <td className="px-4 py-3"><div className="text-white font-medium text-sm">{a.name}</div>{a.city && <div className="text-gray-500 text-xs">{a.city}</div>}</td>
                          <td className="px-4 py-3 hidden sm:table-cell"><TypeBadge type={a.type} /></td>
                          <td className="px-4 py-3 hidden md:table-cell">{a.contact_name ? <div className="text-gray-300 text-sm">{a.contact_name}{a.contact_title ? <span className="text-gray-500 text-xs ml-1">· {a.contact_title}</span> : ''}</div> : <span className="text-gray-600 text-xs">—</span>}</td>
                          <td className="px-4 py-3 hidden lg:table-cell"><span className="text-gray-400 text-sm">{a.distributor_name || <span className="text-gray-600">—</span>}</span></td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {(a.product_lines || []).slice(0, 3).map(pl => <ProductPill key={pl.id} line={pl} />)}
                              {(a.product_lines || []).length > 3 && <span className="text-gray-500 text-xs">+{a.product_lines.length - 3}</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>
        )}

        {tab === 'distributors' && (
          <div>
            {canUpload && (
              <div className="flex justify-end mb-5">
                <button onClick={() => setDistEdit(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: '#F05A28' }}>+ Add Distributor</button>
              </div>
            )}
            {distributors.length === 0
              ? <div className="text-center py-16 text-gray-500">No distributors yet.</div>
              : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {distributors.map(d => (
                    <div key={d.id} onClick={() => setDistDetailId(d.id)} className="bg-gray-800 border border-gray-700 rounded-xl p-5 cursor-pointer hover:border-orange-500/50 transition group">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-white font-semibold group-hover:text-orange-400 transition">{d.name}</h3>
                        {d.territory && <span className="text-gray-500 text-xs shrink-0 ml-2">{d.territory}</span>}
                      </div>
                      {d.contacts.length > 0 && (
                        <div className="mb-3 space-y-0.5">
                          {d.contacts.slice(0, 2).map(c => (
                            <div key={c.id} className="text-sm text-gray-400">{c.name}{c.is_primary ? <span className="text-orange-500/70 text-xs ml-1">●</span> : ''}{c.title ? <span className="text-gray-600 text-xs"> · {c.title}</span> : ''}</div>
                          ))}
                          {d.contacts.length > 2 && <div className="text-gray-600 text-xs">+{d.contacts.length - 2} more</div>}
                        </div>
                      )}
                      {d.product_lines.length > 0 && <div className="flex flex-wrap gap-1">{d.product_lines.map(pl => <ProductPill key={pl.id} line={pl} />)}</div>}
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        )}

{tab === 'manage' && canUpload && (
          <ManageTab
            productLines={productLines} activityTypes={activityTypes} contactRoles={contactRoles}
            onRefreshProductLines={loadProductLines} onRefreshActivityTypes={loadActivityTypes}
            onRefreshContactRoles={loadContactRoles}
          />
        )}
      </main>

      {/* Modals */}
      {accountDetail && !accountEdit && (
        <AccountDetail account={accountDetail} activityTypes={activityTypes} canUpload={canUpload}
          accounts={accounts} onClose={() => setAccountDetail(null)}
          onEdit={() => setAccountEdit(accountDetail)} onDelete={() => deleteAccount(accountDetail.id)}
          onRefreshAccounts={loadAccounts} />
      )}
      {accountEdit !== null && (
        <AccountModal account={accountEdit || null} distributors={distributors} productLines={productLines}
          onClose={() => setAccountEdit(null)}
          onSaved={() => { setAccountEdit(null); setAccountDetail(null); loadAccounts(); }} />
      )}
      {distDetail && !distEdit && (
        <Modal title={distDetail.name} onClose={() => setDistDetailId(null)} wide>
          <div className="space-y-5">
            {distDetail.territory && <p className="text-gray-400 text-sm">{distDetail.territory}</p>}
            {distDetail.product_lines.length > 0 && (
              <div><p className="text-gray-500 text-xs mb-2">Brands Carried</p><div className="flex flex-wrap gap-1.5">{distDetail.product_lines.map(pl => <ProductPill key={pl.id} line={pl} />)}</div></div>
            )}
            {distDetail.notes && <div><p className="text-gray-500 text-xs mb-1">Notes</p><p className="text-gray-300 text-sm whitespace-pre-wrap">{distDetail.notes}</p></div>}
            <DistributorContactsSection
              distributorId={distDetail.id}
              contacts={distDetail.contacts}
              contactRoles={contactRoles}
              onRefresh={loadDistributors}
            />
            {canUpload && (
              <div className="flex gap-2 pt-1 border-t border-gray-700">
                <button onClick={() => setDistEdit(distDetail)} className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600">Edit Distributor</button>
                <button onClick={() => deleteDistributor(distDetail.id)} className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-red-400 hover:bg-red-900/30 ml-auto">Delete</button>
              </div>
            )}
          </div>
        </Modal>
      )}
      {distEdit !== null && (
        <DistributorModal distributor={distEdit || null} productLines={productLines}
          onClose={() => setDistEdit(null)}
          onSaved={() => { setDistEdit(null); loadDistributors(); }} />
      )}
    </div>
  );
}

export default SalesCRM;
