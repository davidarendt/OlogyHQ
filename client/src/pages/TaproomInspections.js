import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';

const API = process.env.REACT_APP_API_URL || '';

// ── Checklist data ─────────────────────────────────────────────────────────────
const SECTIONS = [
  {
    id: 'bar', title: 'Bar Area', icon: '🍺',
    items: [
      'Bar top and counters clean, dry, and clutter-free',
      'Backbar clean and organized, free of clutter',
      'Proper glassware being used and cleaned properly',
      'Bartender/barista stations organized and restocked',
      'All menus (beer, cocktails, coffee) updated and accurate',
      'All menus clean and in good condition',
      'Wine dated and fresh',
      'Wine fridge clean',
      'All equipment clean and maintained',
      'POS stations clean and functional',
      'Floors swept, mopped, and free of spills or debris',
      'Bottles clean, labeled, and free of sticky residue',
      'Pour spouts clean and in good condition',
      'Mixers inventory levels checked, organized and within expiration date',
      'Backbar mats clean and not sticky',
      'Dishwasher clean and running properly',
      'All equipment in working order without leaks',
      'Floor drains clean',
      'Cleaning checklist present and being used',
      'Cocktail book organized and up to date',
      'Tap faucets clean and operating',
      'Tap drain & glass rinser clean and operating',
      'Tap tower & wall behind taps clean',
      'Garnish tray clean / stored',
      'Trash / recycle bins clean',
      'Cocktail station clean and organized correctly',
      'Back Bar displays clean and organized',
      'Speed rail clean and organized',
      'Ice freezer clean with fresh ice',
      'Test strips for chlorine and sanitizer',
      'Ice well and Ice Machine clean',
    ],
  },
  {
    id: 'cold', title: 'Cold Room / Kegerators / Refrigerators', icon: '❄️',
    items: [
      'Draft lines clean and properly maintained',
      'Kegs and cases properly rotated and organized',
      'Walk-in cooler temperature maintained at appropriate levels',
      'No expired or improperly stored products',
      'No ice buildup or leaks',
      'General Cleanliness',
      'Ice production levels and quality',
    ],
  },
  {
    id: 'storage', title: 'Liquor & Storage Area', icon: '📦',
    items: [
      'Inventory properly stocked and organized',
      'Appropriate amounts of supplies on hand',
      'Appropriate use of space and organized',
      'Expiration dates and stock levels checked',
      'All items stored off the ground',
      'Boxes broken down',
      'Back up merch organized',
      'Floor clean',
      'General organization and cleanliness',
    ],
  },
  {
    id: 'seating', title: 'Seating Area', icon: '🪑',
    items: [
      'Music and lighting appropriate for time of day and setting',
      "TV's turned on and playing appropriate content",
      'Customer seating areas clean and free of trash',
      'Chairs and tables stable and in good condition',
      'Trash cans emptied and clean',
      'Trash cans receptacles located in the proper locations',
      'Floors swept, mopped, and free of spills or debris',
      'Mats vacuumed and free of debris',
      'Light fixtures cleaned and free of cobwebs',
      'Baseboards clean and maintained',
      'Can cooler stocked and organized correctly',
      'Can cooler clean and wiped down',
      'Core product following FIFO',
      'Liquor bottles stock with correct pricing',
      'Liquor bottles free of dust',
      'Window sills clean and free of dust and debris',
      'All windows clean and free of streaks and smudges',
      'Merch area stocked, organized, and cleaned',
      'Case trays organized',
      'Chair bolts and screws tight',
      'Underside of bar tops and tables clean',
      'Light bulbs working',
      'Flyers posted for upcoming events',
      'Digital menu up to date',
      'Games organized',
      'Water cooler cleaned and stocked',
      'Gift cards displayed and stocked',
      'Walls clean and free of scratches',
      'Community board up to date',
    ],
  },
  {
    id: 'restrooms', title: 'Restrooms', icon: '🚻',
    items: [
      'Floors and sinks clean and dry',
      'Toilets and sinks clean and functional',
      'Soap, paper towels, and toilet paper stocked',
      'Trash bins emptied',
      'No bad odors or plumbing issues',
      'Mirror, soap dispenser, paper towel holder and trash receptacles clean',
      'Walls and doors clean and free of graffiti',
    ],
  },
  {
    id: 'outdoor', title: 'Outdoor / Entry Areas', icon: '🌿',
    items: [
      'Seating area ground clean and free of debris',
      'Tables and chairs clean and organized (if applicable)',
      'Sidewalks and entryways free of debris',
      'Outdoor trash bins emptied',
      'No visible damage to the building exterior',
      'Outdoor area maintained and free of unsightly storage',
      'Light bulbs working',
      'Parking lot and sidewalk free of trash',
    ],
  },
  {
    id: 'compliance', title: 'Compliance & Safety', icon: '⚠️',
    items: [
      'Fire extinguishers checked and up to date',
      'Emergency exits clear and accessible',
      'First aid kit stocked and accessible',
      'Up-to-date licenses',
      'Employment Posters',
      'Vomit Procedure Sheet',
      'Food Service Employee Training Sheet',
      'Handwashing signs in bathroom & behind bar',
    ],
  },
];

const TOTAL_ITEMS = SECTIONS.reduce((a, s) => a + s.items.length, 0);

// ── Helpers ────────────────────────────────────────────────────────────────────
function getAllStats(ratings) {
  let totalRated = 0, totalScore = 0, totalNA = 0;
  SECTIONS.forEach(sec => {
    sec.items.forEach((_, i) => {
      const r = ratings[`${sec.id}-${i}`];
      if (r === 'NA') totalNA++;
      else if (r != null) { totalRated++; totalScore += Number(r); }
    });
  });
  const maxScore = totalRated * 5;
  const pct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  return { totalRated, totalScore, totalNA, totalItems: TOTAL_ITEMS, pct };
}

function getSectionStats(section, ratings) {
  let rated = 0, score = 0, na = 0;
  section.items.forEach((_, i) => {
    const r = ratings[`${section.id}-${i}`];
    if (r === 'NA') na++;
    else if (r != null) { rated++; score += Number(r); }
  });
  const applicable = section.items.length - na;
  const pct = applicable > 0 ? Math.round((rated / applicable) * 100) : 0;
  return { rated, score, na, applicable, pct, done: rated === applicable && applicable > 0 };
}

function scoreColor(pct) {
  if (pct >= 80) return '#22c55e';
  if (pct >= 60) return '#eab308';
  return '#ef4444';
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ── Home Screen ────────────────────────────────────────────────────────────────
function HomeScreen({ onOpen, onCreate, user }) {
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/inspections`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setInspections(Array.isArray(d) ? d : []); setLoading(false); });
  }, []);

  const handleNew = async () => {
    setCreating(true);
    const res = await fetch(`${API}/api/inspections`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: '', date: new Date().toISOString().slice(0, 10) }),
    });
    const data = await res.json();
    setCreating(false);
    if (data.id) onOpen(data.id);
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    await fetch(`${API}/api/inspections/${id}`, { method: 'DELETE', credentials: 'include' });
    setInspections(prev => prev.filter(i => i.id !== id));
    setConfirmDelete(null);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6" onClick={() => setConfirmDelete(null)}>
      <button
        onClick={handleNew}
        disabled={creating}
        className="w-full py-4 rounded-xl font-bold text-white text-sm tracking-widest uppercase mb-8 disabled:opacity-50 transition"
        style={{ backgroundColor: '#F05A28' }}
      >
        {creating ? 'Creating…' : '+ Start New Inspection'}
      </button>

      <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">History</p>

      {loading ? (
        <p className="text-gray-500 text-sm text-center py-12">Loading…</p>
      ) : inspections.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-12">No inspections yet. Start your first one above.</p>
      ) : (
        <div className="space-y-2">
          {inspections.map(insp => {
            const pct = insp.score_pct || 0;
            const isConfirming = confirmDelete === insp.id;
            return (
              <div
                key={insp.id}
                onClick={() => onOpen(insp.id)}
                className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 flex items-center gap-4 cursor-pointer hover:border-gray-600 transition"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm">{fmtDate(insp.date)}</p>
                  <p className="text-gray-500 text-xs mt-0.5 truncate">{insp.location || 'No location set'}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold" style={{ color: scoreColor(pct) }}>{pct}%</p>
                  <p className="text-gray-600 text-xs">{insp.rated_count || 0}/{TOTAL_ITEMS} rated</p>
                </div>
                <button
                  onClick={e => handleDelete(e, insp.id)}
                  className={`shrink-0 px-2 py-1 rounded text-xs border transition ${
                    isConfirming
                      ? 'border-red-500/60 text-red-400 bg-red-500/10'
                      : 'border-gray-700 text-gray-500 hover:border-red-500/60 hover:text-red-400'
                  }`}
                >
                  {isConfirming ? 'Delete?' : '🗑'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Inspection Screen ──────────────────────────────────────────────────────────
function InspectionScreen({ inspectionId, onBack }) {
  const [inspection, setInspection] = useState(null);
  const [ratings, setRatings] = useState({});
  const [notes, setNotes] = useState({});
  const [openNotes, setOpenNotes] = useState({});
  const [openSecs, setOpenSecs] = useState(() =>
    Object.fromEntries(SECTIONS.map(s => [s.id, true]))
  );
  const [improvements, setImprovements] = useState('');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const improvementsTimer = useRef(null);

  // Load inspection + ratings
  useEffect(() => {
    async function load() {
      setLoading(true);
      const [inspRes, ratingsRes] = await Promise.all([
        fetch(`${API}/api/inspections`, { credentials: 'include' }),
        fetch(`${API}/api/inspections/${inspectionId}/ratings`, { credentials: 'include' }),
      ]);
      const inspections = await inspRes.json();
      const insp = Array.isArray(inspections) ? inspections.find(i => i.id === inspectionId) : null;
      const ratingRows = await ratingsRes.json();

      if (insp) { setInspection(insp); setImprovements(insp.improvements || ''); }
      if (Array.isArray(ratingRows)) {
        const r = {}, n = {};
        ratingRows.forEach(row => {
          const key = `${row.section_id}-${row.item_index}`;
          if (row.rating) r[key] = row.rating;
          if (row.note) n[key] = row.note;
        });
        setRatings(r); setNotes(n);
      }
      setLoading(false);
    }
    load();
  }, [inspectionId]);

  // Real-time subscription via Supabase client
  useEffect(() => {
    const channel = supabase
      .channel(`insp-${inspectionId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'inspection_ratings',
        filter: `inspection_id=eq.${inspectionId}`,
      }, payload => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const { section_id, item_index, rating, note } = payload.new;
          const key = `${section_id}-${item_index}`;
          setRatings(prev => ({ ...prev, [key]: rating || null }));
          setNotes(prev => ({ ...prev, [key]: note || '' }));
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'inspections',
        filter: `id=eq.${inspectionId}`,
      }, payload => {
        if (payload.new) setImprovements(payload.new.improvements || '');
      })
      .subscribe(status => setConnected(status === 'SUBSCRIBED'));

    return () => { supabase.removeChannel(channel); };
  }, [inspectionId]);

  const saveScoreSummary = useCallback(async (newRatings) => {
    const stats = getAllStats(newRatings);
    await fetch(`${API}/api/inspections/${inspectionId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score_pct: stats.pct, rated_count: stats.totalRated }),
    });
  }, [inspectionId]);

  const rate = useCallback(async (secId, idx, val) => {
    const key = `${secId}-${idx}`;
    const newVal = ratings[key] === val ? null : val;
    const newRatings = { ...ratings, [key]: newVal };
    setRatings(newRatings);
    await fetch(`${API}/api/inspections/${inspectionId}/ratings`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section_id: secId, item_index: idx, rating: newVal, note: notes[key] || '' }),
    });
    saveScoreSummary(newRatings);
  }, [ratings, notes, inspectionId, saveScoreSummary]);

  const saveNote = useCallback(async (secId, idx, val) => {
    const key = `${secId}-${idx}`;
    setNotes(prev => ({ ...prev, [key]: val }));
    await fetch(`${API}/api/inspections/${inspectionId}/ratings`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section_id: secId, item_index: idx, rating: ratings[key] || null, note: val }),
    });
  }, [ratings, inspectionId]);

  const updateField = useCallback(async (field, value) => {
    setInspection(prev => ({ ...prev, [field]: value }));
    await fetch(`${API}/api/inspections/${inspectionId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
  }, [inspectionId]);

  const handleImprovements = useCallback((val) => {
    setImprovements(val);
    clearTimeout(improvementsTimer.current);
    improvementsTimer.current = setTimeout(() => {
      fetch(`${API}/api/inspections/${inspectionId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ improvements: val }),
      });
    }, 800);
  }, [inspectionId]);

  const stats = getAllStats(ratings);

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-gray-500 text-sm">Loading inspection…</div>
  );

  return (
    <div className="max-w-2xl mx-auto">
      {/* Sticky subheader */}
      <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="text-gray-400 hover:text-white text-sm transition">← Back</button>
            <div className={`flex items-center gap-1.5 text-xs font-mono ${connected ? 'text-green-400' : 'text-gray-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
              {connected ? 'LIVE' : 'SYNCING'}
            </div>
          </div>
          <span className="text-white font-bold text-lg" style={{ color: '#F05A28' }}>{stats.pct}%</span>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Location</label>
            <select
              value={inspection?.location || ''}
              onChange={e => updateField('location', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
            >
              <option value="">Select location</option>
              {['Midtown', 'Power Mill', 'Northside', 'Tampa'].map(l => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Date</label>
            <input
              type="date"
              value={inspection?.date || ''}
              onChange={e => updateField('date', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>
        {/* Progress bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${stats.pct}%`, background: 'linear-gradient(90deg, #b33f1a, #F05A28, #f8a07a)' }}
            />
          </div>
          <span className="text-gray-500 text-xs font-mono">{stats.totalRated}/{TOTAL_ITEMS}</span>
        </div>
      </div>

      {/* Sections */}
      <div className="px-4 py-3 space-y-2">
        {SECTIONS.map(sec => {
          const ss = getSectionStats(sec, ratings);
          const isOpen = openSecs[sec.id];
          return (
            <div key={sec.id} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-700/40 transition"
                onClick={() => setOpenSecs(prev => ({ ...prev, [sec.id]: !prev[sec.id] }))}
              >
                <span className="text-base">{sec.icon}</span>
                <span className="text-white font-semibold text-sm flex-1">{sec.title}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${
                  ss.done ? 'border-green-500/40 text-green-400 bg-green-500/10' : 'border-gray-600 text-gray-500'
                }`}>{ss.rated}/{ss.applicable}</span>
                <span className={`text-gray-500 text-xs transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
              </button>
              {/* Section progress bar */}
              <div className="h-0.5 bg-gray-700">
                <div className="h-full transition-all duration-300" style={{ width: `${ss.pct}%`, backgroundColor: '#F05A28' }} />
              </div>
              {isOpen && (
                <div className="divide-y divide-gray-700/50">
                  {sec.items.map((item, i) => {
                    const key = `${sec.id}-${i}`;
                    const r = ratings[key];
                    const isDone = r != null;
                    const ratingColors = {
                      '1': 'bg-red-500/15 border-red-500/50 text-red-400',
                      '2': 'bg-orange-500/15 border-orange-500/50 text-orange-400',
                      '3': 'bg-yellow-500/15 border-yellow-500/50 text-yellow-400',
                      '4': 'bg-green-500/15 border-green-500/50 text-green-400',
                      '5': 'bg-green-400/15 border-green-400/50 text-green-300',
                      'NA': 'bg-blue-500/15 border-blue-500/50 text-blue-400',
                    };
                    return (
                      <div key={i} className={`px-4 py-3 ${isDone ? 'bg-green-500/5' : ''}`}>
                        <p className={`text-sm mb-2 leading-snug ${
                          isDone && r !== 'NA' && Number(r) >= 3
                            ? 'text-gray-600 line-through decoration-gray-700'
                            : 'text-gray-300'
                        }`}>{item}</p>
                        <div className="flex gap-1.5">
                          {[1, 2, 3, 4, 5].map(n => (
                            <button
                              key={n}
                              onClick={() => rate(sec.id, i, String(n))}
                              className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${
                                r === String(n)
                                  ? ratingColors[String(n)]
                                  : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'
                              }`}
                            >{n}</button>
                          ))}
                          <button
                            onClick={() => rate(sec.id, i, 'NA')}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition ${
                              r === 'NA'
                                ? ratingColors['NA']
                                : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'
                            }`}
                          >N/A</button>
                        </div>
                        <button
                          onClick={() => setOpenNotes(prev => ({ ...prev, [key]: !prev[key] }))}
                          className="mt-2 text-xs text-gray-600 hover:text-gray-400 transition"
                        >
                          {openNotes[key] ? '▲ hide note' : '▼ add note'}
                          {notes[key] ? ' ●' : ''}
                        </button>
                        {openNotes[key] && (
                          <textarea
                            className="mt-2 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-300 text-sm resize-none min-h-[54px] focus:outline-none focus:border-gray-600 placeholder-gray-600"
                            placeholder="Add a note…"
                            value={notes[key] || ''}
                            onChange={e => saveNote(sec.id, i, e.target.value)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer stats + improvements */}
      <div className="px-4 pb-8">
        <div className="grid grid-cols-4 gap-2 mb-5">
          {[
            { val: stats.totalItems, label: 'Items' },
            { val: stats.totalRated, label: 'Rated' },
            { val: stats.totalScore, label: 'Score' },
            { val: `${stats.pct}%`, label: 'Quality' },
          ].map(({ val, label }) => (
            <div key={label} className="bg-gray-800 border border-gray-700 rounded-xl py-3 text-center">
              <p className="text-xl font-bold" style={{ color: '#F05A28' }}>{val}</p>
              <p className="text-gray-600 text-xs uppercase tracking-wider mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <p className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: '#F05A28' }}>
          Opportunities for Improvement
        </p>
        <textarea
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-gray-300 text-sm resize-none min-h-[100px] focus:outline-none focus:border-orange-500 placeholder-gray-600 mb-4"
          placeholder="Note any items requiring attention, corrective actions, or follow-up…"
          value={improvements}
          onChange={e => handleImprovements(e.target.value)}
        />

        <button
          onClick={() => setShowModal(true)}
          className="w-full py-3 rounded-xl font-bold text-white text-sm tracking-widest uppercase transition"
          style={{ backgroundColor: '#F05A28' }}
        >
          Save Inspection
        </button>
      </div>

      {/* Save modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center px-4"
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-sm">
            <p className="text-white font-bold text-lg mb-1">Inspection Saved</p>
            <p className="text-gray-500 text-sm mb-5">All ratings and notes are saved automatically.</p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowModal(false); window.print(); }}
                className="flex-1 py-2.5 rounded-lg font-semibold text-white text-sm transition"
                style={{ backgroundColor: '#F05A28' }}
              >Save as PDF</button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-lg font-semibold text-gray-400 text-sm border border-gray-600 hover:border-gray-500 hover:text-white transition"
              >Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
function TaproomInspections({ user, onBack }) {
  const [view, setView] = useState('home'); // 'home' | 'inspection'
  const [inspectionId, setInspectionId] = useState(null);

  const handleOpen = (id) => { setInspectionId(id); setView('inspection'); };
  const handleBack = () => { setView('home'); setInspectionId(null); };

  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition">
          <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-xl">HQ</span>
        </button>
        <button onClick={view === 'inspection' ? handleBack : onBack} className="text-sm text-gray-400 hover:text-white transition">
          ← {view === 'inspection' ? 'All Inspections' : 'Back'}
        </button>
      </nav>

      <div className="border-b border-gray-700 px-4 sm:px-6 py-4">
        <h2 className="text-cream text-2xl sm:text-3xl font-bold">Taproom Inspections</h2>
        <p className="text-gray-500 text-sm mt-1">Bar and taproom inspection checklists with live sync</p>
      </div>

      {view === 'home' && <HomeScreen onOpen={handleOpen} user={user} />}
      {view === 'inspection' && inspectionId && (
        <InspectionScreen inspectionId={inspectionId} onBack={handleBack} />
      )}
    </div>
  );
}

export default TaproomInspections;
