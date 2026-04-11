import { useState, useEffect, useCallback, useRef } from 'react';

const LOCATIONS = [
  { id: 'midtown',    label: 'Midtown' },
  { id: 'power_mill', label: 'Power Mill' },
  { id: 'northside',  label: 'Northside' },
  { id: 'tampa',      label: 'Tampa' },
];

const today = () => new Date().toISOString().slice(0, 10);
const DEFAULT_THRESHOLDS = { four_pack_threshold: 8, sixth_bbl_threshold: 2, half_bbl_threshold: 1 };

function NavBar({ onBack }) {
  return (
    <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
      <button onClick={onBack} className="flex items-center gap-3">
        <span className="text-2xl font-bold" style={{ color: '#FF6B00' }}>OLOGY</span>
        <span className="text-white font-semibold text-xl">HQ</span>
        <span className="text-gray-400 ml-2">/ Taproom Inventory</span>
      </button>
      <div />
    </nav>
  );
}

// ── Count Tab ──────────────────────────────────────────────────────────────

function CountTab({ user, thresholds, canUpload, onDirtyChange }) {
  const [step, setStep] = useState('location'); // location | form | review | done
  const [location, setLocation] = useState(null);
  const [sessionDate, setSessionDate] = useState(today());
  const [beers, setBeers] = useState([]);
  const [counts, setCounts] = useState({}); // { beer_id: { four_pack, sixth_bbl, half_bbl } }
  const [previous, setPrevious] = useState(null);
  const [delivered, setDelivered] = useState({}); // { beer_id: { sixth_bbl, half_bbl } } since last session
  const [deliveryCount, setDeliveryCount] = useState(0);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [beerSearch, setBeerSearch] = useState('');
  const searchRef = useRef();

  // Dirty = on the form step with at least one count entered
  const isDirty = step === 'form' && Object.values(counts).some(c =>
    Object.values(c).some(v => v !== '' && v !== undefined)
  );
  const isDirtyRef = useRef(isDirty);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  // Warn on browser refresh / tab close
  useEffect(() => {
    const handler = e => { if (isDirtyRef.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const selectLocation = useCallback(async (loc) => {
    setLocation(loc);
    const [beersRes, prevRes] = await Promise.all([
      fetch(`${process.env.REACT_APP_API_URL || ''}/api/taproom-beers?location=${loc.id}`, { credentials: 'include' }),
      fetch(`${process.env.REACT_APP_API_URL || ''}/api/taproom-inventory/latest/${loc.id}`, { credentials: 'include' }),
    ]);
    const beerList = await beersRes.json();
    const prev = await prevRes.json();
    setBeers(beerList);
    setPrevious(prev);

    // Fetch deliveries since the last session to factor into discrepancy baseline
    const deliveredTotals = {};
    let numDeliveries = 0;
    if (prev?.session_date) {
      const delRes = await fetch(
        `${process.env.REACT_APP_API_URL || ''}/api/taproom-deliveries?location=${loc.id}&since=${prev.session_date}`,
        { credentials: 'include' }
      );
      const deliveries = await delRes.json();
      numDeliveries = deliveries.length;
      for (const delivery of deliveries) {
        for (const item of delivery.items || []) {
          if (!item.beer_id) continue;
          if (!deliveredTotals[item.beer_id]) deliveredTotals[item.beer_id] = { cases: 0, sixth_bbl: 0, half_bbl: 0 };
          deliveredTotals[item.beer_id].cases     += parseFloat(item.cases)     || 0;
          deliveredTotals[item.beer_id].sixth_bbl += parseFloat(item.sixth_bbl) || 0;
          deliveredTotals[item.beer_id].half_bbl  += parseFloat(item.half_bbl)  || 0;
        }
      }
    }
    setDelivered(deliveredTotals);
    setDeliveryCount(numDeliveries);

    const init = {};
    beerList.forEach(b => { init[b.id] = { four_pack: '', sixth_bbl: '', half_bbl: '' }; });
    setCounts(init);
    setStep('form');
  }, []);

  const setCount = (beerId, field, value) => {
    setCounts(prev => ({ ...prev, [beerId]: { ...prev[beerId], [field]: value } }));
  };

  const FIELD_THRESH = {
    four_pack: 'four_pack_threshold',
    sixth_bbl: 'sixth_bbl_threshold',
    half_bbl:  'half_bbl_threshold',
  };

  // Expected baseline = last count + deliveries since then (cases × 6 = four_packs)
  const expectedBaseline = (beerId, field) => {
    const p = parseFloat(previous?.counts?.[beerId]?.[field]) || 0;
    let d = 0;
    if (field === 'four_pack') d = (parseFloat(delivered[beerId]?.cases) || 0) * 6;
    else if (field === 'sixth_bbl') d = parseFloat(delivered[beerId]?.sixth_bbl) || 0;
    else if (field === 'half_bbl')  d = parseFloat(delivered[beerId]?.half_bbl)  || 0;
    return p + d;
  };

  // Returns 'yellow' | 'orange' | 'red' | 'default' for a cell
  const cellState = (beerId, field) => {
    const expected = expectedBaseline(beerId, field);
    if (expected === 0) return 'default';
    const raw = counts[beerId]?.[field];
    const c = parseFloat(raw) || 0;
    // Not yet entered or explicitly 0 — something expected but nothing counted
    if (raw === '' || raw === undefined || raw === null || c === 0) return 'yellow';
    // Above expected
    if (c > expected) return 'red';
    // Dropped more than threshold
    const drop = expected - c;
    const thresh = thresholds[FIELD_THRESH[field]] ?? DEFAULT_THRESHOLDS[FIELD_THRESH[field]];
    if (drop > thresh) return 'orange';
    return 'default';
  };

  const isFlagged  = (beerId, field) => cellState(beerId, field) === 'orange'; // eslint-disable-line no-unused-vars
  const isTracked  = (beerId, field) => cellState(beerId, field) !== 'default';

  const getDiscrepancies = () => {
    return beers.flatMap(b =>
      ['four_pack', 'sixth_bbl', 'half_bbl'].flatMap(key => {
        const state = cellState(b.id, key);
        if (state !== 'orange' && state !== 'red') return [];
        const labels = { four_pack: '4-Packs', sixth_bbl: '1/6 BBL', half_bbl: '1/2 BBL' };
        const c   = parseFloat(counts[b.id]?.[key]) || 0;
        const exp = expectedBaseline(b.id, key);
        return [{ beer: b.name, label: labels[key], expected: exp, curr: c, drop: exp - c, state }];
      })
    );
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const payload = beers.map(b => ({
      beer_id:   b.id,
      four_pack: parseFloat(counts[b.id]?.four_pack) || 0,
      sixth_bbl: parseFloat(counts[b.id]?.sixth_bbl) || 0,
      half_bbl:  parseFloat(counts[b.id]?.half_bbl)  || 0,
    }));
    try {
      await fetch(`${process.env.REACT_APP_API_URL || ''}/api/taproom-inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ location: location.id, session_date: sessionDate, counts: payload, notes }),
      });
      setStep('done');
    } catch {
      alert('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    if (isDirtyRef.current && !window.confirm('You have unsaved counts. Leave anyway?')) return;
    setStep('location');
    setLocation(null);
    setSessionDate(today());
    setBeers([]);
    setCounts({});
    setPrevious(null);
    setNotes('');
    setBeerSearch('');
  };

  if (step === 'location') {
    return (
      <div className="max-w-lg mx-auto mt-12">
        <h3 className="text-white text-xl font-semibold mb-6 text-center">Select Location</h3>
        <div className="grid grid-cols-2 gap-4">
          {LOCATIONS.map(loc => (
            <button
              key={loc.id}
              onClick={() => selectLocation(loc)}
              className="bg-gray-800 border border-gray-700 rounded-xl p-6 text-white font-semibold text-lg hover:border-orange-500 transition"
            >
              {loc.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (step === 'form') {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h3 className="text-white text-xl font-semibold">{location.label}</h3>
            <button onClick={reset} className="text-sm text-gray-400 hover:text-white">← Change</button>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="date"
              value={sessionDate}
              onChange={e => setSessionDate(e.target.value)}
              className="bg-gray-700 text-white text-sm rounded px-3 py-1.5 border border-gray-600"
            />
            {canUpload && previous && (
              <span className="text-gray-500 text-sm">Last count: {previous.session_date}</span>
            )}
          </div>
        </div>

        {canUpload && deliveryCount > 0 && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-2 mb-3 text-blue-300 text-sm">
            📦 {deliveryCount} deliver{deliveryCount === 1 ? 'y' : 'ies'} since last count factored into keg discrepancy thresholds
          </div>
        )}

        {(() => {
          const orangeCount = beers.reduce((n, b) => n + ['four_pack','sixth_bbl','half_bbl'].filter(f => cellState(b.id,f)==='orange').length, 0);
          const redCount    = beers.reduce((n, b) => n + ['four_pack','sixth_bbl','half_bbl'].filter(f => cellState(b.id,f)==='red').length, 0);
          return (orangeCount > 0 || redCount > 0) ? (
            <div className="flex gap-2 mb-3">
              {orangeCount > 0 && (
                <div className="flex-1 bg-orange-500/10 border border-orange-500/30 rounded-lg px-4 py-2 text-orange-400 text-sm">
                  ⚠ {orangeCount} {orangeCount === 1 ? 'count' : 'counts'} dropped significantly — recount before submitting
                </div>
              )}
              {redCount > 0 && (
                <div className="flex-1 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-red-400 text-sm">
                  ↑ {redCount} {redCount === 1 ? 'count is' : 'counts are'} above expected — verify before submitting
                </div>
              )}
            </div>
          ) : null;
        })()}

        {beers.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-8">No beers set up for this location. Use Manage Beers to add them.</p>
        )}

        {beers.length > 0 && (
          <div className="sticky top-0 z-10 pb-3 pt-1 -mx-6 px-6" style={{ backgroundColor: '#111827' }}>
            <div className="relative">
              <input
                ref={searchRef}
                type="text"
                value={beerSearch}
                onChange={e => setBeerSearch(e.target.value)}
                placeholder="Search beers…"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-9 pr-8 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-orange-500"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              {beerSearch && (
                <button
                  onClick={() => { setBeerSearch(''); searchRef.current?.focus(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-lg leading-none"
                >×</button>
              )}
            </div>
          </div>
        )}

        <div className="space-y-3 mb-4">
          {beers.filter(b =>
            (!previous || ['four_pack', 'sixth_bbl', 'half_bbl'].some(f => expectedBaseline(b.id, f) > 0)) &&
            (!beerSearch || b.name.toLowerCase().includes(beerSearch.toLowerCase()))
          ).map(b => {
            const rowFlagged = ['four_pack', 'sixth_bbl', 'half_bbl'].some(f => cellState(b.id, f) === 'orange');
            const rowRed     = ['four_pack', 'sixth_bbl', 'half_bbl'].some(f => cellState(b.id, f) === 'red');
            const rowTracked = ['four_pack', 'sixth_bbl', 'half_bbl'].some(f => isTracked(b.id, f));
            const cardBorder = rowFlagged ? 'border-orange-500/40' : rowRed ? 'border-red-500/40' : 'border-gray-700';

            return (
              <div key={b.id} className={`bg-gray-800 rounded-xl border ${cardBorder} px-4 pt-3 pb-4`}>
                <div className="mb-3">
                  <div className="text-white font-medium">{b.name}</div>
                  {canUpload && rowTracked && (
                    <div className="text-gray-500 text-xs mt-0.5">
                      Expected: {expectedBaseline(b.id, 'four_pack')} / {expectedBaseline(b.id, 'sixth_bbl')} / {expectedBaseline(b.id, 'half_bbl')}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { field: 'four_pack', label: '4-Packs' },
                    { field: 'sixth_bbl', label: '1/6 BBL' },
                    { field: 'half_bbl',  label: '1/2 BBL' },
                  ].map(({ field, label }) => {
                    const state = cellState(b.id, field);
                    const cellCls = {
                      yellow:  'bg-yellow-500/10 text-yellow-200 border-yellow-500/40 focus:border-yellow-400',
                      orange:  'bg-orange-500/10 text-orange-300 border-orange-500/60 focus:border-orange-400',
                      red:     'bg-red-500/10 text-red-300 border-red-500/60 focus:border-red-400',
                      default: 'bg-gray-700 text-white border-gray-600 focus:border-orange-500',
                    }[state];
                    return (
                      <div key={field} className="flex flex-col items-center gap-1">
                        <span className="text-gray-400 text-xs">{label}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          inputMode="decimal"
                          value={counts[b.id]?.[field] ?? ''}
                          onChange={e => setCount(b.id, field, e.target.value)}
                          placeholder="0"
                          className={`w-full text-center text-lg font-medium rounded-lg px-2 py-3 border focus:outline-none ${cellCls}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm placeholder-gray-500 focus:border-orange-500 focus:outline-none resize-none mb-4"
        />

        <div className="flex justify-end">
          <button
            onClick={() => setStep('review')}
            disabled={beers.length === 0}
            className="px-6 py-2 rounded-lg font-semibold text-white disabled:opacity-40"
            style={{ background: '#FF6B00' }}
          >
            Review & Submit
          </button>
        </div>
      </div>
    );
  }

  if (step === 'review') {
    const discrepancies = getDiscrepancies();
    const nonZero = beers.filter(b => {
      const c = counts[b.id] || {};
      return (parseFloat(c.four_pack) || 0) > 0 || (parseFloat(c.sixth_bbl) || 0) > 0 || (parseFloat(c.half_bbl) || 0) > 0;
    });

    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-white text-xl font-semibold">Review — {location.label}</h3>
          <button onClick={() => setStep('form')} className="text-sm text-gray-400 hover:text-white">← Edit</button>
        </div>

        {discrepancies.filter(d => d.state === 'orange').length > 0 && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 mb-4">
            <p className="text-orange-400 font-semibold text-sm mb-3">🔁 Recount needed — lower than expected:</p>
            {discrepancies.filter(d => d.state === 'orange').map((d, i) => (
              <div key={i} className="text-orange-300 text-sm mb-1">
                <span className="font-medium">{d.beer}</span> — {d.label}: expected {d.expected}, counted {d.curr} (−{d.drop})
              </div>
            ))}
            <p className="text-orange-400/70 text-xs mt-3">Go back to edit, or add a note explaining the discrepancy.</p>
          </div>
        )}
        {discrepancies.filter(d => d.state === 'red').length > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
            <p className="text-red-400 font-semibold text-sm mb-3">↑ Above expected — verify these counts:</p>
            {discrepancies.filter(d => d.state === 'red').map((d, i) => (
              <div key={i} className="text-red-300 text-sm mb-1">
                <span className="font-medium">{d.beer}</span> — {d.label}: expected {d.expected}, counted {d.curr} (+{d.curr - d.expected})
              </div>
            ))}
            <p className="text-red-400/70 text-xs mt-3">A delivery may not have been logged yet, or this may be a miscount.</p>
          </div>
        )}

        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden mb-4">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-gray-400 text-sm px-4 py-3">Beer</th>
                <th className="text-center text-gray-400 text-sm px-3 py-3">4-Packs</th>
                <th className="text-center text-gray-400 text-sm px-3 py-3">1/6 BBL</th>
                <th className="text-center text-gray-400 text-sm px-3 py-3">1/2 BBL</th>
              </tr>
            </thead>
            <tbody>
              {nonZero.map(b => {
                const c = counts[b.id] || {};
                return (
                  <tr key={b.id} className="border-b border-gray-700/50">
                    <td className="px-4 py-2 text-white text-sm">{b.name}</td>
                    <td className="px-3 py-2 text-center text-white text-sm">{parseFloat(c.four_pack) || 0}</td>
                    <td className="px-3 py-2 text-center text-white text-sm">{parseFloat(c.sixth_bbl) || 0}</td>
                    <td className="px-3 py-2 text-center text-white text-sm">{parseFloat(c.half_bbl) || 0}</td>
                  </tr>
                );
              })}
              {nonZero.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500 text-sm">All counts are 0</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {notes && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 mb-4">
            <p className="text-gray-400 text-xs mb-1">Notes</p>
            <p className="text-white text-sm">{notes}</p>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button onClick={() => setStep('form')} className="px-5 py-2 rounded-lg text-gray-300 border border-gray-600 hover:border-gray-400">
            Edit
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2 rounded-lg font-semibold text-white disabled:opacity-50"
            style={{ background: '#FF6B00' }}
          >
            {submitting ? 'Submitting...' : 'Submit Count'}
          </button>
        </div>
      </div>
    );
  }

  // done
  return (
    <div className="max-w-lg mx-auto mt-16 text-center">
      <div className="text-5xl mb-4">✅</div>
      <h3 className="text-white text-2xl font-semibold mb-2">Count Submitted</h3>
      <p className="text-gray-400 mb-8">{location.label} — {sessionDate}</p>
      <button onClick={reset} className="px-6 py-2 rounded-lg font-semibold text-white" style={{ background: '#FF6B00' }}>
        New Count
      </button>
    </div>
  );
}

// ── History Tab ────────────────────────────────────────────────────────────

function HistoryTab({ user }) {
  const [sessions, setSessions] = useState([]);
  const [filterLoc, setFilterLoc] = useState('');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const url = `${process.env.REACT_APP_API_URL || ''}/api/taproom-inventory?limit=50${filterLoc ? `&location=${filterLoc}` : ''}`;
    const res = await fetch(url, { credentials: 'include' });
    setSessions(await res.json());
    setLoading(false);
  }, [filterLoc]);

  useEffect(() => { load(); }, [load]);

  const openSession = async (s) => {
    const res = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/taproom-inventory/${s.id}`, { credentials: 'include' });
    setSelected(await res.json());
  };

  const deleteSession = async (id) => {
    if (!window.confirm('Delete this inventory session?')) return;
    await fetch(`${process.env.REACT_APP_API_URL || ''}/api/taproom-inventory/${id}`, { method: 'DELETE', credentials: 'include' });
    setSelected(null);
    load();
  };

  const locLabel = (id) => LOCATIONS.find(l => l.id === id)?.label || id;

  if (selected) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-white text-xl font-semibold">{locLabel(selected.location)}</h3>
            <p className="text-gray-400 text-sm mt-0.5">{selected.session_date} · {selected.submitted_by_name}</p>
          </div>
          <div className="flex items-center gap-4">
            {user.role === 'admin' && (
              <button onClick={() => deleteSession(selected.id)} className="text-sm text-red-400 hover:text-red-300">Delete</button>
            )}
            <button onClick={() => setSelected(null)} className="text-sm text-gray-400 hover:text-white">← Back</button>
          </div>
        </div>

        {selected.notes && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 mb-4">
            <p className="text-gray-400 text-xs mb-1">Notes</p>
            <p className="text-white text-sm">{selected.notes}</p>
          </div>
        )}

        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-gray-400 text-sm px-4 py-3">Beer</th>
                <th className="text-center text-gray-400 text-sm px-3 py-3">4-Packs</th>
                <th className="text-center text-gray-400 text-sm px-3 py-3">1/6 BBL</th>
                <th className="text-center text-gray-400 text-sm px-3 py-3">1/2 BBL</th>
              </tr>
            </thead>
            <tbody>
              {selected.counts?.map(c => (
                <tr key={c.beer_id} className="border-b border-gray-700/50">
                  <td className="px-4 py-2 text-white text-sm">{c.name}</td>
                  <td className="px-3 py-2 text-center text-white text-sm">{c.four_pack}</td>
                  <td className="px-3 py-2 text-center text-white text-sm">{c.sixth_bbl}</td>
                  <td className="px-3 py-2 text-center text-white text-sm">{c.half_bbl}</td>
                </tr>
              ))}
              {(!selected.counts?.length) && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500 text-sm">No counts recorded</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <select
          value={filterLoc}
          onChange={e => setFilterLoc(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-2 focus:border-orange-500 focus:outline-none"
        >
          <option value="">All Locations</option>
          {LOCATIONS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : sessions.length === 0 ? (
        <p className="text-gray-500 text-sm">No inventory sessions found.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => openSession(s)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-5 py-4 flex items-center justify-between hover:border-orange-500/50 transition text-left"
            >
              <div>
                <div className="text-white font-medium">{locLabel(s.location)}</div>
                <div className="text-gray-400 text-sm mt-0.5">{s.submitted_by_name}</div>
              </div>
              <div className="text-right">
                <div className="text-gray-300 text-sm">{s.session_date}</div>
                <div className="text-gray-500 text-xs mt-0.5">
                  {new Date(s.submitted_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Manage Tab (admin) ─────────────────────────────────────────────────────

function ManageTab() {
  const [beers, setBeers] = useState([]);
  const [search, setSearch] = useState('');
  const [filterLoc, setFilterLoc] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLocs, setNewLocs] = useState([]);

  // Settings state
  const [settings, setSettings] = useState(DEFAULT_THRESHOLDS);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const load = async () => {
    const [beersRes, settingsRes] = await Promise.all([
      fetch(`${process.env.REACT_APP_API_URL || ''}/api/taproom-beers`, { credentials: 'include' }),
      fetch(`${process.env.REACT_APP_API_URL || ''}/api/taproom-settings`, { credentials: 'include' }),
    ]);
    const beersData = await beersRes.json();
    setBeers(Array.isArray(beersData) ? beersData : []);
    if (settingsRes.ok) {
      const s = await settingsRes.json();
      setSettings({
        four_pack_threshold: parseFloat(s.four_pack_threshold) || 6,
        sixth_bbl_threshold: parseFloat(s.sixth_bbl_threshold) || 0.5,
        half_bbl_threshold:  parseFloat(s.half_bbl_threshold)  || 1,
      });
    }
  };

  useEffect(() => { load(); }, []);

  const saveSettings = async () => {
    await fetch(`${process.env.REACT_APP_API_URL || ''}/api/taproom-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(settings),
    });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  const toggleLocation = async (beer, loc) => {
    const isActive = beer.locations.includes(loc);
    await fetch(`${process.env.REACT_APP_API_URL || ''}/api/taproom-beer-locations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ beer_id: beer.id, location: loc, active: !isActive }),
    });
    load();
  };

  const deleteBeer = async (b) => {
    if (!window.confirm(`Delete "${b.name}"?`)) return;
    await fetch(`${process.env.REACT_APP_API_URL || ''}/api/taproom-beers/${b.id}`, { method: 'DELETE', credentials: 'include' });
    load();
  };

  const importSheet = async () => {
    setImporting(true);
    setImportMsg('');
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/taproom-beers/import-sheet`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (data.message) { setImportMsg(`Error: ${data.message}`); return; }
      setImportMsg(`Imported — ${data.beersAdded} new beers, ${data.locationsAdded} location links, ${data.sessionsCreated} baseline sessions created`);
      load();
    } catch {
      setImportMsg('Import failed');
    } finally {
      setImporting(false);
    }
  };

  const addBeer = async () => {
    if (!newName.trim()) return;
    await fetch(`${process.env.REACT_APP_API_URL || ''}/api/taproom-beers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: newName.trim(), locations: newLocs }),
    });
    setNewName('');
    setNewLocs([]);
    setAdding(false);
    load();
  };

  const visible = beers.filter(b => {
    const matchSearch = b.name.toLowerCase().includes(search.toLowerCase());
    const matchLoc = !filterLoc || b.locations.includes(filterLoc);
    return matchSearch && matchLoc;
  });

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search beers..."
            className="bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-2 w-52 focus:border-orange-500 focus:outline-none"
          />
          <select
            value={filterLoc}
            onChange={e => setFilterLoc(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-2 focus:border-orange-500 focus:outline-none"
          >
            <option value="">All Locations</option>
            {LOCATIONS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAdding(true)}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg"
            style={{ background: '#FF6B00' }}
          >
            + Add Beer
          </button>
          <button
            onClick={importSheet}
            disabled={importing}
            className="px-4 py-2 text-sm text-gray-300 border border-gray-600 rounded-lg hover:border-gray-400 disabled:opacity-50"
          >
            {importing ? 'Importing...' : 'Import from Sheet'}
          </button>
        </div>
      </div>

      {importMsg && (
        <div className={`border rounded-lg px-4 py-2 mb-4 text-sm ${importMsg.startsWith('Error') ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
          {importMsg}
        </div>
      )}

      {adding && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl px-5 py-4 mb-4">
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addBeer(); if (e.key === 'Escape') setAdding(false); }}
            placeholder="Beer name"
            className="w-full bg-gray-700 text-white text-sm rounded px-3 py-1.5 border border-gray-600 focus:border-orange-500 focus:outline-none mb-3"
          />
          <div className="flex items-center gap-4 mb-3">
            {LOCATIONS.map(l => (
              <label key={l.id} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newLocs.includes(l.id)}
                  onChange={e => setNewLocs(prev => e.target.checked ? [...prev, l.id] : prev.filter(x => x !== l.id))}
                  className="accent-orange-500"
                />
                {l.label}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={addBeer} className="text-sm text-white px-4 py-1.5 rounded" style={{ background: '#FF6B00' }}>Add</button>
            <button onClick={() => { setAdding(false); setNewName(''); setNewLocs([]); }} className="text-sm text-gray-400 hover:text-white px-3 py-1.5">Cancel</button>
          </div>
        </div>
      )}

      {/* ── Discrepancy Settings ── */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 px-6 py-5 mb-6">
        <h4 className="text-white font-semibold mb-1">Discrepancy Detection</h4>
        <p className="text-gray-500 text-xs mb-4">
          Flag a count during review if it dropped by more than this amount since the last session. Counts going up are expected only after a delivery.
        </p>
        <div className="grid grid-cols-3 gap-6">
          {[
            { key: 'four_pack_threshold', label: '4-Packs', hint: 'e.g. 8 = flag if down 8 or more' },
            { key: 'sixth_bbl_threshold', label: '1/6 BBL', hint: 'e.g. 2 = flag if down 2 or more' },
            { key: 'half_bbl_threshold',  label: '1/2 BBL', hint: 'e.g. 1 = flag if down 1 or more' },
          ].map(({ key, label, hint }) => (
            <div key={key}>
              <label className="block text-gray-400 text-xs mb-1">{label}</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={settings[key]}
                onChange={e => setSettings(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-gray-700 text-white text-sm rounded px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
              />
              <p className="text-gray-600 text-xs mt-1">{hint}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={saveSettings}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg"
            style={{ background: '#FF6B00' }}
          >
            Save Settings
          </button>
          {settingsSaved && <span className="text-green-400 text-sm">Saved</span>}
        </div>
      </div>

      <p className="text-gray-500 text-xs mb-3">
        Toggle a location to include/exclude a beer from that location's count form. {beers.length} beers total.
      </p>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left text-gray-400 text-sm px-4 py-3">Beer</th>
              {LOCATIONS.map(l => (
                <th key={l.id} className="text-center text-gray-400 text-xs px-3 py-3 w-24">{l.label}</th>
              ))}
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {visible.map(b => (
              <tr key={b.id} className="border-b border-gray-700/50">
                <td className="px-4 py-3 text-white text-sm">{b.name}</td>
                {LOCATIONS.map(l => (
                  <td key={l.id} className="px-3 py-3 text-center">
                    <button
                      onClick={() => toggleLocation(b, l.id)}
                      className={`w-8 h-5 rounded-full transition-colors duration-200 relative ${b.locations.includes(l.id) ? 'bg-orange-500' : 'bg-gray-600'}`}
                    >
                      <span className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-all duration-200 ${b.locations.includes(l.id) ? 'left-4' : 'left-0.5'}`} />
                    </button>
                  </td>
                ))}
                <td className="px-3 py-3 text-center">
                  <button onClick={() => deleteBeer(b)} className="text-xs text-gray-500 hover:text-red-400">Delete</button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">No beers found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Deliveries Tab ────────────────────────────────────────────────────────

function DeliveriesTab({ user }) {
  const [view, setView] = useState('list'); // list | upload | preview | done
  const [deliveries, setDeliveries] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filterLoc, setFilterLoc] = useState('');
  const [loading, setLoading] = useState(true);

  // Upload / preview state
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [preview, setPreview] = useState(null); // { location, locationLabel, invoiceNumber, deliveryDate, items }
  const [editedItems, setEditedItems] = useState([]);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Sheet sync state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null); // { imported, skipped, failed, noLocation }

  const locLabel = (id) => LOCATIONS.find(l => l.id === id)?.label || id;

  const loadDeliveries = useCallback(async () => {
    setLoading(true);
    try {
      const url = `${process.env.REACT_APP_API_URL || ''}/api/taproom-deliveries${filterLoc ? `?location=${filterLoc}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      const data = await res.json();
      setDeliveries(Array.isArray(data) ? data : []);
    } catch (e) {
      setDeliveries([]);
    }
    setLoading(false);
  }, [filterLoc]);

  useEffect(() => { loadDeliveries(); }, [loadDeliveries]);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setParsing(true);
    setParseError('');
    const form = new FormData();
    form.append('pdf', file);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/taproom-deliveries/parse-pdf`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) { setParseError(data.message || 'Parse failed'); return; }
      setPreview(data);
      setEditedItems(data.items.map(item => ({ ...item })));
      setDeliveryNotes('');
      setView('preview');
    } catch (err) {
      setParseError('Upload failed — please try again');
    } finally {
      setParsing(false);
      e.target.value = '';
    }
  };

  const updateItem = (i, field, value) => {
    setEditedItems(prev => prev.map((item, idx) =>
      idx === i ? { ...item, [field]: value } : item
    ));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${process.env.REACT_APP_API_URL || ''}/api/taproom-deliveries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          location: preview.location,
          delivery_date: preview.deliveryDate,
          invoice_number: preview.invoiceNumber,
          notes: deliveryNotes,
          items: editedItems,
        }),
      });
      setView('done');
      loadDeliveries();
    } catch {
      alert('Failed to save delivery');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this delivery record?')) return;
    await fetch(`${process.env.REACT_APP_API_URL || ''}/api/taproom-deliveries/${id}`, { method: 'DELETE', credentials: 'include' });
    loadDeliveries();
  };

  const handleSyncSheet = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/taproom-deliveries/sync-sheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setSyncResult(data);
      if (data.imported > 0) loadDeliveries();
    } catch {
      setSyncResult({ error: 'Sync failed — check your connection' });
    } finally {
      setSyncing(false);
    }
  };

  // ── Preview screen ──
  if (view === 'preview' && preview) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-white text-xl font-semibold">
              {preview.locationLabel || 'Unknown Location'} — Delivery Preview
            </h3>
            <p className="text-gray-400 text-sm mt-0.5">
              Invoice {preview.invoiceNumber} · {preview.deliveryDate}
            </p>
          </div>
          <button onClick={() => setView('upload')} className="text-sm text-gray-400 hover:text-white">← Back</button>
        </div>

        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden mb-4">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-gray-400 text-sm px-4 py-3">Beer</th>
                <th className="text-center text-gray-400 text-sm px-3 py-3 w-24">Format</th>
                <th className="text-center text-gray-400 text-sm px-3 py-3 w-24">Qty</th>
              </tr>
            </thead>
            <tbody>
              {editedItems.map((item, i) => (
                <tr key={i} className="border-b border-gray-700/50">
                  <td className="px-4 py-2">
                    {item.beer_id ? (
                      <span className="text-white text-sm">{item.beer_name}</span>
                    ) : (
                      <span className="text-yellow-400 text-sm">{item.beer_name} ⚠ not in system</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-gray-400 text-sm">{item.format}</td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={item.quantity}
                      onChange={e => {
                        const qty = parseFloat(e.target.value) || 0;
                        updateItem(i, 'quantity', qty);
                        updateItem(i, item.format === 'Case' ? 'cases' : item.format === '1/6bbl' ? 'sixth_bbl' : 'half_bbl', qty);
                      }}
                      className="w-16 text-center bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600 focus:border-orange-500 focus:outline-none"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <textarea
          value={deliveryNotes}
          onChange={e => setDeliveryNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm placeholder-gray-500 focus:border-orange-500 focus:outline-none resize-none mb-4"
        />

        <div className="flex justify-end gap-3">
          <button onClick={() => setView('upload')} className="px-5 py-2 rounded-lg text-gray-300 border border-gray-600 hover:border-gray-400">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !preview.location}
            className="px-6 py-2 rounded-lg font-semibold text-white disabled:opacity-50"
            style={{ background: '#FF6B00' }}
          >
            {saving ? 'Saving...' : 'Confirm Delivery'}
          </button>
        </div>

        {!preview.location && (
          <p className="text-red-400 text-sm mt-2 text-right">Location not detected — check the PDF</p>
        )}
      </div>
    );
  }

  // ── Done screen ──
  if (view === 'done') {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center">
        <div className="text-5xl mb-4">📦</div>
        <h3 className="text-white text-2xl font-semibold mb-2">Delivery Logged</h3>
        <p className="text-gray-400 mb-8">{preview?.locationLabel} · {preview?.deliveryDate}</p>
        <button onClick={() => setView('list')} className="px-6 py-2 rounded-lg font-semibold text-white" style={{ background: '#FF6B00' }}>
          Back to Deliveries
        </button>
      </div>
    );
  }

  // ── Detail screen ──
  if (selected) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-white text-xl font-semibold">{locLabel(selected.location)}</h3>
            <p className="text-gray-400 text-sm mt-0.5">
              Invoice {selected.invoice_number} · {selected.delivery_date} · {selected.submitted_by_name}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {user.role === 'admin' && (
              <button onClick={() => handleDelete(selected.id)} className="text-sm text-red-400 hover:text-red-300">Delete</button>
            )}
            <button onClick={() => setSelected(null)} className="text-sm text-gray-400 hover:text-white">← Back</button>
          </div>
        </div>

        {selected.notes && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 mb-4">
            <p className="text-gray-400 text-xs mb-1">Notes</p>
            <p className="text-white text-sm">{selected.notes}</p>
          </div>
        )}

        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-gray-400 text-sm px-4 py-3">Beer</th>
                <th className="text-center text-gray-400 text-sm px-3 py-3">Cases</th>
                <th className="text-center text-gray-400 text-sm px-3 py-3">1/6 BBL</th>
                <th className="text-center text-gray-400 text-sm px-3 py-3">1/2 BBL</th>
              </tr>
            </thead>
            <tbody>
              {selected.items?.map((item, i) => (
                <tr key={i} className="border-b border-gray-700/50">
                  <td className="px-4 py-2 text-white text-sm">{item.beer_name}</td>
                  <td className="px-3 py-2 text-center text-white text-sm">{item.cases || '—'}</td>
                  <td className="px-3 py-2 text-center text-white text-sm">{item.sixth_bbl || '—'}</td>
                  <td className="px-3 py-2 text-center text-white text-sm">{item.half_bbl || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── List + upload screen ──
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <select
          value={filterLoc}
          onChange={e => setFilterLoc(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-2 focus:border-orange-500 focus:outline-none"
        >
          <option value="">All Locations</option>
          {LOCATIONS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncSheet}
            disabled={syncing}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-600 text-gray-300 hover:border-gray-400 disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : '↻ Sync from Sheet'}
          </button>
          <label className={`px-4 py-2 rounded-lg text-sm font-medium text-white cursor-pointer ${parsing ? 'opacity-50 pointer-events-none' : ''}`} style={{ background: '#FF6B00' }}>
            {parsing ? 'Parsing PDF...' : '+ Upload PDF'}
            <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} disabled={parsing} />
          </label>
        </div>
      </div>

      {syncResult && !syncResult.error && (
        <div className={`text-sm rounded-lg px-4 py-3 mb-4 ${syncResult.imported > 0 ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-gray-800 border border-gray-700 text-gray-400'}`}>
          <div>
            {syncResult.imported > 0
              ? `✓ Imported ${syncResult.imported} new deliver${syncResult.imported === 1 ? 'y' : 'ies'}`
              : 'No new deliveries found this week'}
            {syncResult.skipped > 0 && ` · ${syncResult.skipped} already logged`}
            {syncResult.failed?.length > 0 && ` · ${syncResult.failed.length} failed`}
          </div>
          {syncResult.failed?.length > 0 && (
            <ul className="mt-2 space-y-1">
              {syncResult.failed.map((f, i) => (
                <li key={i} className="text-red-400 text-xs">Invoice {f.invoiceNumber || '?'}: {f.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {syncResult?.error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-2 mb-4">
          {syncResult.error}
        </div>
      )}

      {parseError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-2 mb-4">
          {parseError}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : deliveries.length === 0 ? (
        <p className="text-gray-500 text-sm">No deliveries logged yet. Upload a delivery PDF to get started.</p>
      ) : (
        <div className="space-y-2">
          {deliveries.map(d => (
            <button
              key={d.id}
              onClick={() => setSelected(d)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-5 py-4 flex items-center justify-between hover:border-orange-500/50 transition text-left"
            >
              <div>
                <div className="text-white font-medium">{locLabel(d.location)}</div>
                <div className="text-gray-400 text-sm mt-0.5">Invoice {d.invoice_number} · {d.submitted_by_name}</div>
              </div>
              <div className="text-right">
                <div className="text-gray-300 text-sm">{d.delivery_date}</div>
                <div className="text-gray-500 text-xs mt-0.5">{d.items?.length} items</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

function TaproomInventory({ user, canUpload, onBack }) {
  const [tab, setTab] = useState('count');
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const countDirtyRef = useRef(false);

  const guardedNavigate = (fn) => {
    if (countDirtyRef.current && !window.confirm('You have unsaved counts. Leave anyway?')) return;
    fn();
  };

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL || ''}/api/taproom-settings`, { credentials: 'include' })
      .then(r => r.json())
      .then(s => setThresholds({
        four_pack_threshold: parseFloat(s.four_pack_threshold),
        sixth_bbl_threshold: parseFloat(s.sixth_bbl_threshold),
        half_bbl_threshold:  parseFloat(s.half_bbl_threshold),
      }))
      .catch(() => {});
  }, []);

  const tabs = [
    { id: 'count',      label: 'Count' },
    ...(canUpload ? [
      { id: 'history',    label: 'History' },
      { id: 'deliveries', label: 'Deliveries' },
      { id: 'manage',     label: 'Manage Beers' },
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-900">
      <NavBar onBack={() => guardedNavigate(onBack)} />

      <div className="border-b border-gray-700 px-6">
        <div className="flex gap-6 max-w-4xl mx-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => guardedNavigate(() => setTab(t.id))}
              className={`py-4 text-sm font-medium border-b-2 transition ${
                tab === t.id ? 'border-orange-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="px-6 py-8">
        {tab === 'count'      && <CountTab user={user} thresholds={thresholds} canUpload={canUpload} onDirtyChange={dirty => { countDirtyRef.current = dirty; }} />}
        {tab === 'history'    && <HistoryTab user={user} />}
        {tab === 'deliveries' && <DeliveriesTab user={user} />}
        {tab === 'manage'     && canUpload && <ManageTab />}
      </main>
    </div>
  );
}

export default TaproomInventory;
