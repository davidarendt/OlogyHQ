import { useState, useEffect } from 'react';

const API = process.env.REACT_APP_API_URL || '';

const KEGS = [
  { key: 'half_bbl',    label: '½ bbl',  sub: '(15.5 gal)' },
  { key: 'quarter_bbl', label: '¼ bbl',  sub: '(7.75 gal)' },
  { key: 'sixth_bbl',   label: '⅙ bbl',  sub: '(5.16 gal)' },
];

const CANS = [
  { key: 'cans_16oz_4pk', label: '16oz 4-pack' },
  { key: 'cans_12oz_6pk', label: '12oz 6-pack' },
  { key: 'cans_12oz_4pk', label: '12oz 4-pack' },
];

function today() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function kegSummary(row) {
  const parts = [];
  if (row.half_bbl    > 0) parts.push(`${row.half_bbl} × ½`);
  if (row.quarter_bbl > 0) parts.push(`${row.quarter_bbl} × ¼`);
  if (row.sixth_bbl   > 0) parts.push(`${row.sixth_bbl} × ⅙`);
  return parts.length ? parts.join(', ') : '—';
}

function canSummary(row) {
  const parts = [];
  if (row.cans_16oz_4pk > 0) parts.push(`${row.cans_16oz_4pk} × 16oz 4pk`);
  if (row.cans_12oz_6pk > 0) parts.push(`${row.cans_12oz_6pk} × 12oz 6pk`);
  if (row.cans_12oz_4pk > 0) parts.push(`${row.cans_12oz_4pk} × 12oz 4pk`);
  return parts.length ? parts.join(', ') : '—';
}

function totalKegs(row) {
  return (row.half_bbl || 0) + (row.quarter_bbl || 0) + (row.sixth_bbl || 0);
}

function totalCans(row) {
  return (row.cans_16oz_4pk || 0) + (row.cans_12oz_6pk || 0) + (row.cans_12oz_4pk || 0);
}

// ── Stepper ───────────────────────────────────────────────────────────────────
function Stepper({ value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))}
        className="w-8 h-8 rounded-lg bg-gray-600 hover:bg-gray-500 text-white text-lg leading-none transition flex items-center justify-center">−</button>
      <input
        type="number" min="0" value={value}
        onChange={e => onChange(Math.max(0, parseInt(e.target.value) || 0))}
        className="w-14 text-center bg-gray-700 text-white text-sm font-semibold rounded-lg py-1.5 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
      />
      <button type="button" onClick={() => onChange(value + 1)}
        className="w-8 h-8 rounded-lg bg-gray-600 hover:bg-gray-500 text-white text-lg leading-none transition flex items-center justify-center">+</button>
    </div>
  );
}

// ── Entry Modal ───────────────────────────────────────────────────────────────
function EntryModal({ entry, beers, onClose, onSaved }) {
  const isEdit = !!entry;
  const [beerId, setBeerId]   = useState(entry?.beer_id || '');
  const [beerName, setBeerName] = useState(entry?.beer_name || '');
  const [date, setDate]       = useState(entry?.package_date || today());
  const [counts, setCounts]   = useState({
    half_bbl:     entry?.half_bbl     || 0,
    quarter_bbl:  entry?.quarter_bbl  || 0,
    sixth_bbl:    entry?.sixth_bbl    || 0,
    cans_16oz_4pk: entry?.cans_16oz_4pk || 0,
    cans_12oz_6pk: entry?.cans_12oz_6pk || 0,
    cans_12oz_4pk: entry?.cans_12oz_4pk || 0,
  });
  const [notes, setNotes]   = useState(entry?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = key => val => setCounts(p => ({ ...p, [key]: val }));

  const handleBeerSelect = e => {
    const id = e.target.value;
    setBeerId(id);
    const beer = beers.find(b => String(b.id) === id);
    setBeerName(beer ? beer.name : '');
  };

  const handleSave = async () => {
    if (!beerId) { setError('Select a beer.'); return; }
    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    if (total === 0) { setError('Enter at least one keg or case count.'); return; }
    setSaving(true); setError('');
    const body = { beer_id: beerId, beer_name: beerName, package_date: date, ...counts, notes: notes.trim() || null };
    const url    = isEdit ? `${API}/api/packaging-log/${entry.id}` : `${API}/api/packaging-log`;
    const method = isEdit ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.message || 'Save failed.'); setSaving(false); return;
    }
    onSaved(); onClose();
  };

  const hasKegs = KEGS.some(k => counts[k.key] > 0);
  const hasCans = CANS.some(c => counts[c.key] > 0);

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center px-4">
      <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="px-6 pt-6 pb-2 flex-shrink-0 flex items-center justify-between">
          <h3 className="text-white font-semibold text-lg">{isEdit ? 'Edit Entry' : 'Log Packaging Run'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-sm">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 text-sm mb-1.5">Beer</label>
              <select value={beerId} onChange={handleBeerSelect}
                className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="">Select beer…</option>
                {beers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1.5">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>

          {/* Kegs */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-gray-300 text-sm font-semibold uppercase tracking-wide">Kegs</span>
              {hasKegs && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                  {KEGS.reduce((s, k) => s + counts[k.key], 0)} total
                </span>
              )}
            </div>
            <div className="space-y-2">
              {KEGS.map(k => (
                <div key={k.key} className="flex items-center justify-between">
                  <div>
                    <span className="text-white text-sm font-medium">{k.label}</span>
                    <span className="text-gray-500 text-xs ml-1.5">{k.sub}</span>
                  </div>
                  <Stepper value={counts[k.key]} onChange={set(k.key)} />
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-700" />

          {/* Cans */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-gray-300 text-sm font-semibold uppercase tracking-wide">Cans</span>
              {hasCans && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                  {CANS.reduce((s, c) => s + counts[c.key], 0)} total packs
                </span>
              )}
            </div>
            <div className="space-y-2">
              {CANS.map(c => (
                <div key={c.key} className="flex items-center justify-between">
                  <span className="text-white text-sm font-medium">{c.label}</span>
                  <Stepper value={counts[c.key]} onChange={set(c.key)} />
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-700" />

          <div>
            <label className="block text-gray-400 text-sm mb-1.5">Notes <span className="text-gray-600">(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Batch notes, tank number, etc."
              className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none placeholder-gray-600" />
          </div>
        </div>

        <div className="px-6 pb-6 pt-4 border-t border-gray-700 flex-shrink-0 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-600 text-gray-300 text-sm hover:bg-gray-700 transition">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition disabled:opacity-50"
            style={{ backgroundColor: '#F05A28' }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Log Run'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function PackagingLog({ user, canUpload, onBack }) {
  const [entries, setEntries] = useState([]);
  const [beers, setBeers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | entry object
  const [search, setSearch]   = useState('');

  const fetchAll = async () => {
    const [eRes, bRes] = await Promise.all([
      fetch(`${API}/api/packaging-log`, { credentials: 'include' }),
      fetch(`${API}/api/packaging-log/beers`, { credentials: 'include' }),
    ]);
    const [eData, bData] = await Promise.all([eRes.json(), bRes.json()]);
    setEntries(Array.isArray(eData) ? eData : []);
    setBeers(Array.isArray(bData) ? bData : []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleDelete = async (id, beerName) => {
    if (!window.confirm(`Delete packaging run for ${beerName}?`)) return;
    await fetch(`${API}/api/packaging-log/${id}`, { method: 'DELETE', credentials: 'include' });
    setEntries(p => p.filter(e => e.id !== id));
  };

  const q = search.trim().toLowerCase();
  const filtered = q ? entries.filter(e => e.beer_name.toLowerCase().includes(q)) : entries;

  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition">
          <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-xl">HQ</span>
        </button>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition">
          ← Back to Dashboard
        </button>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h2 className="text-cream text-4xl font-bold">Packaging Log</h2>
            <p className="text-gray-400 mt-2">Track kegs and cans packaged from each beer</p>
          </div>
          {canUpload && (
            <button onClick={() => setEditing('new')}
              className="px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition"
              style={{ backgroundColor: '#F05A28' }}>
              + Log Run
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-gray-500 text-sm">Loading…</div>
        ) : (
          <>
            {entries.length > 0 && (
              <div className="mb-4 relative max-w-sm">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Filter by beer…"
                  className="w-full bg-gray-800 border border-gray-700 text-white pl-9 pr-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
            )}

            {/* Desktop table */}
            <div className="hidden sm:block bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              {filtered.length === 0 ? (
                <div className="py-20 text-center text-gray-500 text-sm">
                  {entries.length === 0
                    ? canUpload ? 'No runs logged yet. Use "+ Log Run" to get started.' : 'No runs logged yet.'
                    : 'No runs match your search.'}
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Date</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4">Beer</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4">Kegs</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4">Cans</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4 hidden lg:table-cell">Logged By</th>
                      {canUpload && <th className="px-4 py-4" />}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(entry => (
                      <tr key={entry.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/20 transition">
                        <td className="px-6 py-4 text-gray-300 text-sm whitespace-nowrap">{fmtDate(entry.package_date)}</td>
                        <td className="px-4 py-4 text-white text-sm font-medium">{entry.beer_name}</td>
                        <td className="px-4 py-4">
                          {totalKegs(entry) > 0 ? (
                            <div>
                              <span className="text-white text-sm font-semibold">{totalKegs(entry)}</span>
                              <span className="text-gray-500 text-xs ml-1.5">{kegSummary(entry)}</span>
                            </div>
                          ) : <span className="text-gray-600 text-sm">—</span>}
                        </td>
                        <td className="px-4 py-4">
                          {totalCans(entry) > 0 ? (
                            <div>
                              <span className="text-white text-sm font-semibold">{totalCans(entry)}</span>
                              <span className="text-gray-500 text-xs ml-1.5">{canSummary(entry)}</span>
                            </div>
                          ) : <span className="text-gray-600 text-sm">—</span>}
                        </td>
                        <td className="px-4 py-4 text-gray-400 text-sm hidden lg:table-cell">{entry.submitted_by_name}</td>
                        {canUpload && (
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3 justify-end">
                              <button onClick={() => setEditing(entry)}
                                className="text-sm text-gray-400 hover:text-white transition">Edit</button>
                              <button onClick={() => handleDelete(entry.id, entry.beer_name)}
                                className="text-sm text-red-500 hover:text-red-400 transition">Delete</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-3">
              {filtered.length === 0 ? (
                <div className="py-16 text-center text-gray-500 text-sm">
                  {entries.length === 0 ? 'No runs logged yet.' : 'No runs match your search.'}
                </div>
              ) : filtered.map(entry => (
                <div key={entry.id} className="bg-gray-800 rounded-xl border border-gray-700 p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-white font-semibold">{entry.beer_name}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{fmtDate(entry.package_date)} · {entry.submitted_by_name}</p>
                    </div>
                    {canUpload && (
                      <div className="flex gap-3">
                        <button onClick={() => setEditing(entry)} className="text-sm text-gray-400 hover:text-white transition">Edit</button>
                        <button onClick={() => handleDelete(entry.id, entry.beer_name)} className="text-sm text-red-500 hover:text-red-400 transition">Delete</button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {totalKegs(entry) > 0 && (
                      <div className="bg-gray-700/50 rounded-lg px-3 py-2">
                        <p className="text-gray-400 text-xs mb-0.5">Kegs</p>
                        <p className="text-white text-sm font-semibold">{totalKegs(entry)}</p>
                        <p className="text-gray-500 text-xs">{kegSummary(entry)}</p>
                      </div>
                    )}
                    {totalCans(entry) > 0 && (
                      <div className="bg-gray-700/50 rounded-lg px-3 py-2">
                        <p className="text-gray-400 text-xs mb-0.5">Cans</p>
                        <p className="text-white text-sm font-semibold">{totalCans(entry)}</p>
                        <p className="text-gray-500 text-xs">{canSummary(entry)}</p>
                      </div>
                    )}
                  </div>
                  {entry.notes && (
                    <p className="text-gray-400 text-xs border-t border-gray-700 pt-2">{entry.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {editing && (
        <EntryModal
          entry={editing === 'new' ? null : editing}
          beers={beers}
          onClose={() => setEditing(null)}
          onSaved={fetchAll}
        />
      )}
    </div>
  );
}
