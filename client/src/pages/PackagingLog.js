import { useState, useEffect } from 'react';

const API = process.env.REACT_APP_API_URL || '';

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function kegSummary(row) {
  const parts = [];
  if (row.half_bbl  > 0) parts.push(`${row.half_bbl} × ½`);
  if (row.sixth_bbl > 0) parts.push(`${row.sixth_bbl} × ⅙`);
  return parts.length ? parts.join(', ') : '—';
}

function totalKegs(row) {
  return (row.half_bbl || 0) + (row.sixth_bbl || 0);
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
function EntryModal({ entry, onClose, onSaved }) {
  const isEdit = !!entry;

  // For new entries, sheetBeers drives the dropdown
  const [sheetBeers, setSheetBeers]   = useState([]);
  const [loadingBeers, setLoadingBeers] = useState(!isEdit);
  const [beerError, setBeerError]     = useState('');

  // Selected row index from sheet (null when editing — locked to existing)
  const [selectedRow, setSelectedRow] = useState(null);

  const [beerName, setBeerName]   = useState(entry?.beer_name || '');
  const [date, setDate]           = useState(entry?.package_date || '');
  const [halfBbl, setHalfBbl]     = useState(entry?.half_bbl  || 0);
  const [sixthBbl, setSixthBbl]   = useState(entry?.sixth_bbl || 0);
  const [cases, setCases]         = useState(entry?.cases     || 0);
  const [notes, setNotes]         = useState(entry?.notes     || '');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    if (isEdit) return;
    fetch(`${API}/api/packaging-log/sheet-beers`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setSheetBeers(data);
        else setBeerError('Could not load schedule from sheet.');
      })
      .catch(() => setBeerError('Could not load schedule from sheet.'))
      .finally(() => setLoadingBeers(false));
  }, [isEdit]);

  const handleBeerSelect = (e) => {
    const rowIndex = parseInt(e.target.value);
    if (!rowIndex) { setSelectedRow(null); setBeerName(''); setDate(''); return; }
    const beer = sheetBeers.find(b => b.rowIndex === rowIndex);
    if (!beer) return;
    setSelectedRow(rowIndex);
    setBeerName(beer.beerName);
    setDate(beer.plannedDate);
  };

  const handleSave = async () => {
    if (!beerName.trim()) { setError('Select a beer.'); return; }
    if (!date)            { setError('Date is required.'); return; }
    if (halfBbl + sixthBbl + cases === 0) { setError('Enter at least one count.'); return; }
    setSaving(true); setError('');

    const body = isEdit
      ? { beer_name: beerName, package_date: date, half_bbl: halfBbl, sixth_bbl: sixthBbl, cases, notes: notes.trim() || null }
      : { beer_name: beerName, package_date: date, half_bbl: halfBbl, sixth_bbl: sixthBbl, cases, notes: notes.trim() || null, sheet_row_index: selectedRow };

    const url    = isEdit ? `${API}/api/packaging-log/${entry.id}` : `${API}/api/packaging-log`;
    const method = isEdit ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.message || 'Save failed.'); setSaving(false); return;
    }
    if (data._sheetError) {
      setError(`Saved to log, but sheet write failed: ${data._sheetError}`);
      setSaving(false); return;
    }
    onSaved(); onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center px-4">
      <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="px-6 pt-6 pb-2 flex-shrink-0 flex items-center justify-between">
          <h3 className="text-white font-semibold text-lg">{isEdit ? 'Edit Entry' : 'Log Packaging'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-sm">{error}</div>
          )}

          {/* Beer selector (new) or locked name (edit) */}
          {isEdit ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-400 text-sm mb-1.5">Beer</label>
                <div className="w-full bg-gray-700/50 text-white px-3 py-2.5 rounded-lg text-sm border border-gray-600">
                  {beerName}
                </div>
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1.5">Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
            </div>
          ) : loadingBeers ? (
            <div className="text-gray-500 text-sm">Loading schedule…</div>
          ) : beerError ? (
            <div className="px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-sm">{beerError}</div>
          ) : (
            <div>
              <label className="block text-gray-400 text-sm mb-1.5">Beer</label>
              {sheetBeers.length === 0 ? (
                <div className="text-gray-500 text-sm">No beers scheduled within ±10 days without packaging numbers.</div>
              ) : (
                <select value={selectedRow || ''} onChange={handleBeerSelect}
                  className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                  <option value="">Select beer…</option>
                  {sheetBeers.map(b => (
                    <option key={b.rowIndex} value={b.rowIndex}>
                      {b.beerName}{b.tankSize ? ` — ${b.tankSize} bbl` : ''} — {fmtDate(b.plannedDate)}
                    </option>
                  ))}
                </select>
              )}
              {selectedRow && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-gray-400 text-sm">Date:</span>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  <span className="text-gray-600 text-xs">(adjust if actual date differs)</span>
                </div>
              )}
            </div>
          )}

          {/* Counts */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-gray-300 text-sm font-semibold uppercase tracking-wide">Kegs</span>
              {(halfBbl + sixthBbl) > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                  {halfBbl + sixthBbl} total
                </span>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-white text-sm font-medium">½ bbl</span>
                  <span className="text-gray-500 text-xs ml-1.5">(15.5 gal)</span>
                </div>
                <Stepper value={halfBbl} onChange={setHalfBbl} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-white text-sm font-medium">⅙ bbl</span>
                  <span className="text-gray-500 text-xs ml-1.5">(5.16 gal)</span>
                </div>
                <Stepper value={sixthBbl} onChange={setSixthBbl} />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-700" />

          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-gray-300 text-sm font-semibold uppercase tracking-wide">Cases</span>
              {cases > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                  {cases} cases
                </span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white text-sm font-medium">Cases</span>
              <Stepper value={cases} onChange={setCases} />
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
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Log'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function PackagingLog({ user, canUpload, onBack }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | entry object
  const [search, setSearch]   = useState('');

  const fetchAll = async () => {
    const r = await fetch(`${API}/api/packaging-log`, { credentials: 'include' });
    const data = await r.json();
    setEntries(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete packaging run for ${name}? This will also clear the numbers in the schedule sheet.`)) return;
    const res = await fetch(`${API}/api/packaging-log/${id}`, { method: 'DELETE', credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    setEntries(p => p.filter(e => e.id !== id));
    if (data._sheetError) alert(`Deleted from log, but sheet clear failed: ${data._sheetError}`);
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
            <p className="text-gray-400 mt-2">Track kegs and cases packaged from each beer</p>
          </div>
          {canUpload && (
            <button onClick={() => setEditing('new')}
              className="px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition"
              style={{ backgroundColor: '#F05A28' }}>
              + Add Packaging
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
                    ? canUpload ? 'No runs logged yet. Use "+ Add Packaging" to get started.' : 'No runs logged yet.'
                    : 'No runs match your search.'}
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Date</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4">Beer</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4">½ bbl</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4">⅙ bbl</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4">Cases</th>
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
                          {entry.half_bbl > 0
                            ? <span className="text-white text-sm font-semibold">{entry.half_bbl}</span>
                            : <span className="text-gray-600 text-sm">—</span>}
                        </td>
                        <td className="px-4 py-4">
                          {entry.sixth_bbl > 0
                            ? <span className="text-white text-sm font-semibold">{entry.sixth_bbl}</span>
                            : <span className="text-gray-600 text-sm">—</span>}
                        </td>
                        <td className="px-4 py-4">
                          {entry.cases > 0
                            ? <span className="text-white text-sm font-semibold">{entry.cases}</span>
                            : <span className="text-gray-600 text-sm">—</span>}
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
                  <div className="grid grid-cols-3 gap-2">
                    {entry.half_bbl > 0 && (
                      <div className="bg-gray-700/50 rounded-lg px-3 py-2">
                        <p className="text-gray-400 text-xs mb-0.5">½ bbl</p>
                        <p className="text-white text-sm font-semibold">{entry.half_bbl}</p>
                      </div>
                    )}
                    {entry.sixth_bbl > 0 && (
                      <div className="bg-gray-700/50 rounded-lg px-3 py-2">
                        <p className="text-gray-400 text-xs mb-0.5">⅙ bbl</p>
                        <p className="text-white text-sm font-semibold">{entry.sixth_bbl}</p>
                      </div>
                    )}
                    {entry.cases > 0 && (
                      <div className="bg-gray-700/50 rounded-lg px-3 py-2">
                        <p className="text-gray-400 text-xs mb-0.5">Cases</p>
                        <p className="text-white text-sm font-semibold">{entry.cases}</p>
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
          onClose={() => setEditing(null)}
          onSaved={fetchAll}
        />
      )}
    </div>
  );
}
