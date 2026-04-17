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

// ── Activity Log Modal ─────────────────────────────────────────────────────

function ActivityLogModal({ account, activityTypes, onClose }) {
  const [activities, setActivities] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ activity_type_id: '', activity_date: '', notes: '', is_scheduled: false });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/crm/accounts/${account.id}/activities`);
    setActivities(await res.json());
  }, [account.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const openNew = (scheduled = false) => {
    setForm({
      activity_type_id: activityTypes[0]?.id || '',
      activity_date: new Date().toISOString().slice(0, 10),
      notes: '',
      is_scheduled: scheduled,
    });
    setEditingId(null);
    setShowFollowUp(false);
    setShowForm(true);
  };

  const openEdit = (act) => {
    setForm({
      activity_type_id: act.activity_type_id || '',
      activity_date: act.activity_date?.slice(0, 10) || '',
      notes: act.notes || '',
      is_scheduled: act.is_scheduled || false,
    });
    setEditingId(act.id);
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    const method = editingId ? 'PATCH' : 'POST';
    const url = editingId
      ? `/api/crm/accounts/${account.id}/activities/${editingId}`
      : `/api/crm/accounts/${account.id}/activities`;
    await jsonFetch(url, method, { ...form, activity_type_id: form.activity_type_id || null });
    setShowForm(false);
    setSaving(false);
    load();
    // Prompt for follow-up only after logging a completed (non-scheduled) activity
    if (!editingId && !form.is_scheduled) setShowFollowUp(true);
  };

  const del = async (id) => {
    if (!window.confirm('Delete this activity?')) return;
    await jsonFetch(`/api/crm/accounts/${account.id}/activities/${id}`, 'DELETE');
    load();
  };

  const completed = activities.filter(a => !a.is_scheduled);
  const scheduled = activities.filter(a => a.is_scheduled);

  return (
    <Modal title={`Activity — ${account.name}`} onClose={onClose} wide>
      <div className="flex gap-2 mb-4">
        <button onClick={() => openNew(false)} className="flex-1 sm:flex-none text-sm px-4 py-2.5 rounded-lg font-medium text-white" style={{ backgroundColor: '#F05A28' }}>
          + Log Activity
        </button>
        <button onClick={() => openNew(true)} className="flex-1 sm:flex-none text-sm px-4 py-2.5 rounded-lg border border-orange-500/50 text-orange-400 hover:bg-orange-900/20">
          + Schedule Visit
        </button>
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
            <Field label={form.is_scheduled ? 'Scheduled Date' : 'Date'}>
              <input type="date" className={inputCls} value={form.activity_date} onChange={e => setForm(f => ({ ...f, activity_date: e.target.value }))} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea className={`${inputCls} resize-none`} rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </Field>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-sm px-3 py-1.5 rounded-lg bg-gray-600 text-gray-300">Cancel</button>
            <button onClick={save} disabled={saving || !form.activity_date}
              className="text-sm px-4 py-1.5 rounded-lg font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#F05A28' }}>
              {form.is_scheduled ? 'Schedule' : 'Log'}
            </button>
          </div>
        </div>
      )}

      {showFollowUp && (
        <FollowUpPrompt
          accountId={account.id}
          accountName={account.name}
          activityTypes={activityTypes}
          onDone={() => { setShowFollowUp(false); load(); }}
        />
      )}

      {scheduled.length > 0 && (
        <div className="mb-4">
          <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Scheduled</p>
          <div className="space-y-2">
            {scheduled.map(act => (
              <ActivityRow key={act.id} act={act} onEdit={openEdit} onDelete={del} scheduled />
            ))}
          </div>
        </div>
      )}

      {completed.length === 0 && !showForm && scheduled.length === 0 && (
        <p className="text-gray-500 text-sm text-center py-6">No activity yet.</p>
      )}

      {completed.length > 0 && (
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">History</p>
          <div className="space-y-2">
            {completed.map(act => (
              <ActivityRow key={act.id} act={act} onEdit={openEdit} onDelete={del} />
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

function ActivityRow({ act, onEdit, onDelete, scheduled }) {
  return (
    <div className={`border rounded-lg p-3 flex gap-3 ${scheduled ? 'border-orange-500/20 bg-orange-900/10' : 'border-gray-600/40 bg-gray-700/40'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {act.activity_type_name && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-900/40 text-orange-300 font-medium">{act.activity_type_name}</span>
          )}
          <span className="text-gray-400 text-xs">{act.activity_date?.slice(0, 10)}</span>
          <span className="text-gray-600 text-xs">by {act.created_by_name}</span>
        </div>
        {act.notes && <p className="text-gray-300 text-sm">{act.notes}</p>}
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={() => onEdit(act)} className="text-gray-500 hover:text-gray-300 text-xs px-2 py-1">Edit</button>
        <button onClick={() => onDelete(act.id)} className="text-gray-500 hover:text-red-400 text-xs px-2 py-1">×</button>
      </div>
    </div>
  );
}

// ── Event Modal ────────────────────────────────────────────────────────────

function EventModal({ event, eventTypes, onClose, onSaved }) {
  const isNew = !event;
  const [form, setForm] = useState({
    event_type_id: event?.event_type_id || '',
    title: event?.title || '',
    event_date: event?.event_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    location: event?.location || '',
    notes: event?.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.title.trim() || !form.event_date) return;
    setSaving(true);
    const method = isNew ? 'POST' : 'PATCH';
    const url = isNew ? '/api/crm/events' : `/api/crm/events/${event.id}`;
    await jsonFetch(url, method, { ...form, event_type_id: form.event_type_id || null });
    onSaved();
  };

  return (
    <Modal title={isNew ? 'Log Event' : 'Edit Event'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title *">
            <input className={inputCls} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </Field>
          <Field label="Type">
            <select className={selectCls} value={form.event_type_id} onChange={e => setForm(f => ({ ...f, event_type_id: e.target.value }))}>
              <option value="">— select —</option>
              {eventTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Date *">
            <input type="date" className={inputCls} value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
          </Field>
          <Field label="Location">
            <input className={inputCls} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea className={`${inputCls} resize-none`} rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </Field>
        <div className="flex gap-3 justify-end pt-2">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600">Cancel</button>
          <button onClick={save} disabled={saving || !form.title.trim() || !form.event_date}
            className="text-sm px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#F05A28' }}>
            {saving ? 'Saving…' : isNew ? 'Log Event' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Dashboard Tab ──────────────────────────────────────────────────────────

function buildChartData(activityByDay, eventsByDay, days) {
  const dateArr = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dateArr.push(d.toISOString().slice(0, 10));
  }

  const repNames = [...new Set(activityByDay.map(r => r.created_by_name))];

  return dateArr.map(date => {
    const label = date.slice(5); // MM-DD
    const entry = { date: label };
    repNames.forEach(rep => {
      const row = activityByDay.find(r => r.date === date && r.created_by_name === rep);
      entry[rep] = row ? row.count : 0;
    });
    const evRow = eventsByDay.filter(r => r.date === date);
    entry._events = evRow.reduce((s, r) => s + r.count, 0);
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
  const events_by_day  = data.events_by_day   || [];
  const scheduled_visits= data.scheduled_visits|| [];
  const upcoming_events= data.upcoming_events  || [];
  const rep_summary    = data.rep_summary      || [];
  const repNames = [...new Set(activity_by_day.map(r => r.created_by_name))];
  const chartData = buildChartData(activity_by_day, events_by_day, days);
  const upcoming = [
    ...scheduled_visits.map(v => ({ ...v, _kind: 'visit' })),
    ...upcoming_events.map(e => ({ ...e, _kind: 'event' })),
  ].sort((a, b) => (a.date || a.event_date) > (b.date || b.event_date) ? 1 : -1);

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
        <StatCard label="Events" value={stats.events_count} />
        <StatCard label="New Accounts" value={stats.new_accounts} sub="added to CRM" />
      </div>

      {/* Chart */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4">Activity by Day</h3>
        {chartData.every(d => repNames.every(r => d[r] === 0) && d._events === 0)
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
                <Bar dataKey="_events" name="Events" stackId="b" fill="#6b7280" radius={[3, 3, 0, 0]} />
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
              {upcoming.slice(0, 8).map((item, i) => (
                <div key={`${item._kind}-${item.id}`} className="flex items-start gap-3">
                  <div className={`text-xs px-2 py-0.5 rounded-full shrink-0 mt-0.5 font-medium ${item._kind === 'visit' ? 'bg-orange-900/40 text-orange-300' : 'bg-blue-900/40 text-blue-300'}`}>
                    {item._kind === 'visit' ? (item.activity_type_name || 'Visit') : (item.event_type_name || 'Event')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{item._kind === 'visit' ? item.account_name : item.title}</p>
                    {item.location && <p className="text-gray-500 text-xs">{item.location}</p>}
                  </div>
                  <span className="text-gray-500 text-xs shrink-0">{(item.date || item.event_date)?.slice(5)}</span>
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
    phone: account?.phone || '', email: account?.email || '',
    contact_name: account?.contact_name || '', contact_title: account?.contact_title || '',
    distributor_id: account?.distributor_id || '', notes: account?.notes || '',
  });
  const [selectedProducts, setSelectedProducts] = useState((account?.product_lines || []).map(p => p.id));
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [nearbyPlaces, setNearbyPlaces] = useState(null); // null = not searched, [] = no results
  const [locError, setLocError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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
    setForm(f => ({
      ...f,
      name:    place.name    || f.name,
      address: place.address || f.address,
      city:    place.city    || f.city,
      state:   place.state   || f.state,
      phone:   place.phone   || f.phone,
      type:    place.type    || f.type,
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
          <Field label="City"><input className={inputCls} value={form.city} onChange={e => set('city', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact Name"><input className={inputCls} value={form.contact_name} onChange={e => set('contact_name', e.target.value)} /></Field>
          <Field label="Contact Title"><input className={inputCls} value={form.contact_title} onChange={e => set('contact_title', e.target.value)} /></Field>
          <Field label="Phone"><input className={inputCls} value={form.phone} onChange={e => set('phone', e.target.value)} /></Field>
          <Field label="Email"><input className={inputCls} type="email" value={form.email} onChange={e => set('email', e.target.value)} /></Field>
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

function AccountDetail({ account, onClose, onEdit, onDelete, onActivity }) {
  return (
    <Modal title={account.name} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2 items-center">
          <TypeBadge type={account.type} />
          {account.distributor_name && <span className="text-xs text-gray-400">via {account.distributor_name}</span>}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {account.contact_name && (<><span className="text-gray-500">Contact</span><span className="text-gray-200">{account.contact_name}{account.contact_title ? `, ${account.contact_title}` : ''}</span></>)}
          {account.phone && (<><span className="text-gray-500">Phone</span><a href={`tel:${account.phone}`} className="text-orange-400 hover:underline">{account.phone}</a></>)}
          {account.email && (<><span className="text-gray-500">Email</span><a href={`mailto:${account.email}`} className="text-orange-400 hover:underline">{account.email}</a></>)}
          {(account.address || account.city) && (<><span className="text-gray-500">Address</span><span className="text-gray-200">{[account.address, account.city, account.state].filter(Boolean).join(', ')}</span></>)}
        </div>
        {account.product_lines?.length > 0 && (
          <div>
            <p className="text-gray-500 text-xs mb-2">Products Carried</p>
            <div className="flex flex-wrap gap-1.5">{account.product_lines.map(pl => <ProductPill key={pl.id} line={pl} />)}</div>
          </div>
        )}
        {account.notes && <div><p className="text-gray-500 text-xs mb-1">Notes</p><p className="text-gray-300 text-sm whitespace-pre-wrap">{account.notes}</p></div>}
        <div className="flex gap-2 flex-wrap pt-1">
          <button onClick={onActivity} className="text-sm px-4 py-2 rounded-lg font-medium text-white" style={{ backgroundColor: '#F05A28' }}>Activity Log</button>
          <button onClick={onEdit} className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600">Edit</button>
          <button onClick={onDelete} className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-red-400 hover:bg-red-900/30 ml-auto">Delete</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Distributor Modal ──────────────────────────────────────────────────────

function DistributorModal({ distributor, productLines, onClose, onSaved }) {
  const isNew = !distributor;
  const [form, setForm] = useState({ name: distributor?.name || '', territory: distributor?.territory || '', notes: distributor?.notes || '' });
  const [contacts, setContacts] = useState(distributor?.contacts || []);
  const [selectedProducts, setSelectedProducts] = useState((distributor?.product_lines || []).map(p => p.id));
  const [contactForm, setContactForm] = useState(null);
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

  const addContact = async () => {
    if (!contactForm?.name?.trim() || isNew) return;
    await jsonFetch(`/api/crm/distributors/${distributor.id}/contacts`, 'POST', contactForm);
    setContactForm(null);
    const res = await apiFetch('/api/crm/distributors');
    const all = await res.json();
    const updated = all.find(d => d.id === distributor.id);
    if (updated) setContacts(updated.contacts);
  };

  const removeContact = async (cId) => {
    if (!window.confirm('Remove this contact?')) return;
    await jsonFetch(`/api/crm/distributors/${distributor.id}/contacts/${cId}`, 'DELETE');
    setContacts(prev => prev.filter(c => c.id !== cId));
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
        {!isNew && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-gray-400 text-xs">Key Contacts</label>
              <button onClick={() => setContactForm({ name: '', title: '', phone: '', email: '', is_primary: false })} className="text-xs text-orange-400 hover:text-orange-300">+ Add Contact</button>
            </div>
            {contactForm && (
              <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-3 mb-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Name *"><input className={inputCls} value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} /></Field>
                  <Field label="Title"><input className={inputCls} value={contactForm.title} onChange={e => setContactForm(f => ({ ...f, title: e.target.value }))} /></Field>
                  <Field label="Phone"><input className={inputCls} value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} /></Field>
                  <Field label="Email"><input className={inputCls} value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} /></Field>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={contactForm.is_primary} onChange={e => setContactForm(f => ({ ...f, is_primary: e.target.checked }))} />
                  Primary contact
                </label>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setContactForm(null)} className="text-xs px-3 py-1 rounded bg-gray-600 text-gray-300">Cancel</button>
                  <button onClick={addContact} disabled={!contactForm.name?.trim()} className="text-xs px-3 py-1 rounded text-white disabled:opacity-50" style={{ backgroundColor: '#F05A28' }}>Add</button>
                </div>
              </div>
            )}
            {contacts.length === 0 && !contactForm && <p className="text-gray-600 text-xs">No contacts yet.</p>}
            <div className="space-y-1">
              {contacts.map(c => (
                <div key={c.id} className="flex items-center justify-between bg-gray-700/40 rounded-lg px-3 py-2">
                  <div>
                    <span className="text-white text-sm font-medium">{c.name}</span>
                    {c.is_primary && <span className="ml-2 text-xs text-orange-400">primary</span>}
                    {c.title && <span className="text-gray-400 text-xs ml-2">{c.title}</span>}
                    <div className="text-gray-500 text-xs">{[c.phone, c.email].filter(Boolean).join(' · ')}</div>
                  </div>
                  <button onClick={() => removeContact(c.id)} className="text-gray-600 hover:text-red-400 text-sm ml-2">×</button>
                </div>
              ))}
            </div>
          </div>
        )}
        {isNew && <p className="text-gray-600 text-xs">Save the distributor first, then you can add contacts.</p>}
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

function ManageTab({ productLines, activityTypes, eventTypes, onRefreshProductLines, onRefreshActivityTypes, onRefreshEventTypes }) {
  const [section, setSection] = useState('products');
  const [plForm, setPlForm] = useState({ name: '', type: 'beer' });
  const [editingPl, setEditingPl] = useState(null);
  const [atForm, setAtForm] = useState('');
  const [editingAt, setEditingAt] = useState(null);
  const [etForm, setEtForm] = useState('');
  const [editingEt, setEditingEt] = useState(null);

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

  const addEt = async () => {
    if (!etForm.trim()) return;
    await jsonFetch('/api/crm/event-types', 'POST', { name: etForm });
    setEtForm('');
    onRefreshEventTypes();
  };
  const saveEt = async () => {
    if (!editingEt?.name?.trim()) return;
    await jsonFetch(`/api/crm/event-types/${editingEt.id}`, 'PATCH', { name: editingEt.name });
    setEditingEt(null);
    onRefreshEventTypes();
  };
  const deleteEt = async (id) => {
    if (!window.confirm('Delete this event type?')) return;
    await jsonFetch(`/api/crm/event-types/${id}`, 'DELETE');
    onRefreshEventTypes();
  };

  const sections = [
    { id: 'products', label: 'Product Lines' },
    { id: 'activity-types', label: 'Activity Types' },
    { id: 'event-types', label: 'Event Types' },
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
            <div key={pl.id} className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
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

      {section === 'event-types' && (
        <div className="max-w-xs space-y-3">
          <div className="flex gap-2">
            <input className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
              placeholder="Event type name…" value={etForm} onChange={e => setEtForm(e.target.value)} onKeyDown={e => e.key === 'Enter' && addEt()} />
            <button onClick={addEt} disabled={!etForm.trim()} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 shrink-0" style={{ backgroundColor: '#F05A28' }}>Add</button>
          </div>
          {eventTypes.map(et => (
            <div key={et.id} className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
              {editingEt?.id === et.id ? (
                <>
                  <input className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm focus:outline-none" value={editingEt.name} onChange={e => setEditingEt(f => ({ ...f, name: e.target.value }))} autoFocus />
                  <button onClick={saveEt} className="text-xs px-2 py-1 rounded text-white" style={{ backgroundColor: '#F05A28' }}>Save</button>
                  <button onClick={() => setEditingEt(null)} className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300">Cancel</button>
                </>
              ) : (
                <>
                  <span className="text-white text-sm flex-1">{et.name}</span>
                  <button onClick={() => setEditingEt({ id: et.id, name: et.name })} className="text-gray-500 hover:text-gray-300 text-xs">Edit</button>
                  <button onClick={() => deleteEt(et.id)} className="text-gray-500 hover:text-red-400 text-xs">×</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Events Tab ─────────────────────────────────────────────────────────────

function EventsTab({ eventTypes }) {
  const [events, setEvents] = useState([]);
  const [editingEvent, setEditingEvent] = useState(null); // null=closed, false=new, obj=edit

  const load = async () => {
    const res = await apiFetch('/api/crm/events');
    setEvents(await res.json());
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const del = async (id) => {
    if (!window.confirm('Delete this event?')) return;
    await jsonFetch(`/api/crm/events/${id}`, 'DELETE');
    load();
  };

  const upcoming = events.filter(e => e.event_date >= new Date().toISOString().slice(0, 10));
  const past = events.filter(e => e.event_date < new Date().toISOString().slice(0, 10));

  return (
    <div>
      <div className="flex justify-end mb-5">
        <button onClick={() => setEditingEvent(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: '#F05A28' }}>
          + Log Event
        </button>
      </div>

      {events.length === 0 && <p className="text-center text-gray-500 py-16">No events logged yet.</p>}

      {upcoming.length > 0 && (
        <div className="mb-6">
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">Upcoming</p>
          <div className="space-y-2">
            {upcoming.map(e => <EventRow key={e.id} event={e} onEdit={() => setEditingEvent(e)} onDelete={() => del(e.id)} />)}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">Past</p>
          <div className="space-y-2">
            {past.map(e => <EventRow key={e.id} event={e} onEdit={() => setEditingEvent(e)} onDelete={() => del(e.id)} />)}
          </div>
        </div>
      )}

      {editingEvent !== null && (
        <EventModal
          event={editingEvent || null}
          eventTypes={eventTypes}
          onClose={() => setEditingEvent(null)}
          onSaved={() => { setEditingEvent(null); load(); }}
        />
      )}
    </div>
  );
}

function EventRow({ event, onEdit, onDelete }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 flex items-start gap-4">
      <div className="text-center shrink-0 w-12">
        <div className="text-orange-400 text-xs font-medium">{event.event_date?.slice(5, 7)}/{event.event_date?.slice(8, 10)}</div>
        <div className="text-gray-500 text-xs">{event.event_date?.slice(0, 4)}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-white font-medium text-sm">{event.title}</span>
          {event.event_type_name && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-300">{event.event_type_name}</span>
          )}
        </div>
        {event.location && <p className="text-gray-400 text-xs">{event.location}</p>}
        {event.notes && <p className="text-gray-500 text-xs mt-0.5">{event.notes}</p>}
        <p className="text-gray-600 text-xs mt-0.5">by {event.created_by_name}</p>
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={onEdit} className="text-gray-500 hover:text-gray-300 text-xs px-2 py-1">Edit</button>
        <button onClick={onDelete} className="text-gray-500 hover:text-red-400 text-xs px-2 py-1">×</button>
      </div>
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
  const [eventTypes, setEventTypes] = useState([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDist, setFilterDist] = useState('');

  const [accountDetail, setAccountDetail] = useState(null);
  const [accountEdit, setAccountEdit] = useState(null);
  const [activityAccount, setActivityAccount] = useState(null);
  const [distEdit, setDistEdit] = useState(null);
  const [distDetail, setDistDetail] = useState(null);

  const loadAccounts    = async () => { const r = await apiFetch('/api/crm/accounts');      setAccounts(await r.json()); };
  const loadDistributors= async () => { const r = await apiFetch('/api/crm/distributors');  setDistributors(await r.json()); };
  const loadProductLines= async () => { const r = await apiFetch('/api/crm/product-lines'); setProductLines(await r.json()); };
  const loadActivityTypes=async () => { const r = await apiFetch('/api/crm/activity-types');setActivityTypes(await r.json()); };
  const loadEventTypes  = async () => { const r = await apiFetch('/api/crm/event-types');   setEventTypes(await r.json()); };

  useEffect(() => {
    loadAccounts(); loadDistributors(); loadProductLines(); loadActivityTypes(); loadEventTypes();
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
    setDistDetail(null);
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
    { id: 'events', label: 'Events' },
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
                    <div key={d.id} onClick={() => setDistDetail(d)} className="bg-gray-800 border border-gray-700 rounded-xl p-5 cursor-pointer hover:border-orange-500/50 transition group">
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

        {tab === 'events' && <EventsTab eventTypes={eventTypes} />}

        {tab === 'manage' && canUpload && (
          <ManageTab
            productLines={productLines} activityTypes={activityTypes} eventTypes={eventTypes}
            onRefreshProductLines={loadProductLines} onRefreshActivityTypes={loadActivityTypes} onRefreshEventTypes={loadEventTypes}
          />
        )}
      </main>

      {/* Modals */}
      {accountDetail && !accountEdit && !activityAccount && (
        <AccountDetail account={accountDetail} onClose={() => setAccountDetail(null)}
          onEdit={() => setAccountEdit(accountDetail)} onDelete={() => deleteAccount(accountDetail.id)}
          onActivity={() => setActivityAccount(accountDetail)} />
      )}
      {accountEdit !== null && (
        <AccountModal account={accountEdit || null} distributors={distributors} productLines={productLines}
          onClose={() => setAccountEdit(null)}
          onSaved={() => { setAccountEdit(null); setAccountDetail(null); loadAccounts(); }} />
      )}
      {activityAccount && (
        <ActivityLogModal account={activityAccount} activityTypes={activityTypes} onClose={() => setActivityAccount(null)} />
      )}
      {distDetail && !distEdit && (
        <Modal title={distDetail.name} onClose={() => setDistDetail(null)} wide>
          <div className="space-y-4">
            {distDetail.territory && <p className="text-gray-400 text-sm">{distDetail.territory}</p>}
            {distDetail.product_lines.length > 0 && (
              <div><p className="text-gray-500 text-xs mb-2">Brands Carried</p><div className="flex flex-wrap gap-1.5">{distDetail.product_lines.map(pl => <ProductPill key={pl.id} line={pl} />)}</div></div>
            )}
            {distDetail.contacts.length > 0 && (
              <div>
                <p className="text-gray-500 text-xs mb-2">Key Contacts</p>
                <div className="space-y-2">
                  {distDetail.contacts.map(c => (
                    <div key={c.id} className="bg-gray-700/40 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-medium">{c.name}</span>
                        {c.is_primary && <span className="text-xs text-orange-400">primary</span>}
                        {c.title && <span className="text-gray-500 text-xs">{c.title}</span>}
                      </div>
                      <div className="text-gray-400 text-xs mt-0.5 flex gap-3">
                        {c.phone && <a href={`tel:${c.phone}`} className="hover:text-orange-400">{c.phone}</a>}
                        {c.email && <a href={`mailto:${c.email}`} className="hover:text-orange-400">{c.email}</a>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {distDetail.notes && <div><p className="text-gray-500 text-xs mb-1">Notes</p><p className="text-gray-300 text-sm whitespace-pre-wrap">{distDetail.notes}</p></div>}
            {canUpload && (
              <div className="flex gap-2 pt-1">
                <button onClick={() => setDistEdit(distDetail)} className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600">Edit</button>
                <button onClick={() => deleteDistributor(distDetail.id)} className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-red-400 hover:bg-red-900/30 ml-auto">Delete</button>
              </div>
            )}
          </div>
        </Modal>
      )}
      {distEdit !== null && (
        <DistributorModal distributor={distEdit || null} productLines={productLines}
          onClose={() => setDistEdit(null)}
          onSaved={() => { setDistEdit(null); setDistDetail(null); loadDistributors(); }} />
      )}
    </div>
  );
}

export default SalesCRM;
