import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, RefreshCw, Users, LayoutList, Settings, Plus, Pencil, Trash2, X, Check } from 'lucide-react';

const API = process.env.REACT_APP_API_URL || '';

const DAY_LABELS = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
};
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

function isChecked(checks, row_type, row_key, day, task_text) {
  return checks.some(
    c => c.row_type === row_type && c.row_key === row_key &&
         (day ? c.day === day : true) && c.task_text === task_text
  );
}

function CheckRow({ label, rowType, rowKey, day, taskText, checks, onToggle, small }) {
  const checked = isChecked(checks, rowType, rowKey, day, taskText);
  return (
    <label className={`flex items-start gap-2 cursor-pointer group ${small ? 'py-0.5' : 'py-1'}`}>
      <span
        onClick={() => onToggle(rowType, rowKey, day, taskText, checked)}
        className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition
          ${checked ? 'bg-orange-500 border-orange-500' : 'border-gray-500 group-hover:border-orange-400'}`}
      >
        {checked && <Check size={10} className="text-white" strokeWidth={3} />}
      </span>
      <span className={`${checked ? 'line-through text-gray-500' : 'text-gray-200'} ${small ? 'text-xs' : 'text-sm'} leading-snug`}>
        {label}
      </span>
    </label>
  );
}

// ── By Section tab ────────────────────────────────────────────────────────────
function BySectionTab({ sections, personData, initialsMap, checks, onToggle }) {
  return (
    <div className="space-y-6">
      {sections.map(sec => {
        const colTasks = {};
        for (const day of DAYS) colTasks[day] = [];
        for (const gr of sec.gridRows) {
          if (colTasks[gr.day]) colTasks[gr.day].push(gr.text);
        }
        const hasGrid = sec.gridRows.length > 0;

        return (
          <div key={sec.key} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700">
              <h3 className="text-white font-semibold">{sec.label}</h3>
            </div>
            <div className="p-4">
              {/* B-column tasks (no day) */}
              {sec.tasks.length > 0 && (
                <div className="mb-3">
                  {sec.tasks.map((t, i) => (
                    <CheckRow
                      key={i}
                      label={t.text}
                      rowType="section"
                      rowKey={sec.key}
                      day={null}
                      taskText={t.text}
                      checks={checks}
                      onToggle={onToggle}
                    />
                  ))}
                </div>
              )}
              {/* Grid tasks by day */}
              {hasGrid && (
                <div className="grid grid-cols-5 gap-2 mt-2">
                  {DAYS.map(day => (
                    <div key={day}>
                      <div className="text-gray-400 text-xs font-medium mb-1">{DAY_LABELS[day]}</div>
                      {colTasks[day].map((text, i) => (
                        <CheckRow
                          key={i}
                          label={text}
                          rowType="section_grid"
                          rowKey={sec.key}
                          day={day}
                          taskText={text}
                          checks={checks}
                          onToggle={onToggle}
                          small
                        />
                      ))}
                      {colTasks[day].length === 0 && <span className="text-gray-600 text-xs">—</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Person tasks */}
      {(() => {
        // Group by initial
        const byPerson = {};
        for (const pd of personData) {
          if (!byPerson[pd.initial]) byPerson[pd.initial] = {};
          byPerson[pd.initial][pd.day] = pd.tasks;
        }
        return Object.entries(byPerson).map(([initial, dayTasks]) => {
          const name = initialsMap[initial] || initial;
          return (
            <div key={initial} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700">
                <h3 className="text-white font-semibold">{name}</h3>
              </div>
              <div className="p-4 grid grid-cols-5 gap-2">
                {DAYS.map(day => (
                  <div key={day}>
                    <div className="text-gray-400 text-xs font-medium mb-1">{DAY_LABELS[day]}</div>
                    {(dayTasks[day] || []).map((text, i) => (
                      <CheckRow
                        key={i}
                        label={text}
                        rowType="person"
                        rowKey={initial}
                        day={day}
                        taskText={text}
                        checks={checks}
                        onToggle={onToggle}
                        small
                      />
                    ))}
                    {(!dayTasks[day] || dayTasks[day].length === 0) && (
                      <span className="text-gray-600 text-xs">—</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        });
      })()}
    </div>
  );
}

// ── By Person tab ─────────────────────────────────────────────────────────────
function ByPersonTab({ personData, initialsMap, checks, onToggle }) {
  // Group by initial
  const byPerson = {};
  for (const pd of personData) {
    if (!byPerson[pd.initial]) byPerson[pd.initial] = {};
    byPerson[pd.initial][pd.day] = pd.tasks;
  }

  if (Object.keys(byPerson).length === 0) {
    return <p className="text-gray-400 text-center py-8">No person data found in sheet.</p>;
  }

  return (
    <div className="space-y-6">
      {Object.entries(byPerson).map(([initial, dayTasks]) => {
        const name = initialsMap[initial] || initial;
        const totalTasks = Object.values(dayTasks).flat().length;
        const completedTasks = Object.entries(dayTasks).reduce((acc, [day, tasks]) =>
          acc + tasks.filter(t => isChecked(checks, 'person', initial, day, t)).length, 0);

        return (
          <div key={initial} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-white font-semibold">{name}</h3>
              {totalTasks > 0 && (
                <span className="text-xs text-gray-400">{completedTasks}/{totalTasks}</span>
              )}
            </div>
            <div className="p-4 grid grid-cols-5 gap-3">
              {DAYS.map(day => (
                <div key={day}>
                  <div className="text-gray-400 text-xs font-medium mb-1">{DAY_LABELS[day]}</div>
                  {(dayTasks[day] || []).map((text, i) => (
                    <CheckRow
                      key={i}
                      label={text}
                      rowType="person"
                      rowKey={initial}
                      day={day}
                      taskText={text}
                      checks={checks}
                      onToggle={onToggle}
                      small
                    />
                  ))}
                  {(!dayTasks[day] || dayTasks[day].length === 0) && (
                    <span className="text-gray-600 text-xs">—</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Initials modal ────────────────────────────────────────────────────────────
function InitialsModal({ entry, onSave, onClose }) {
  const [initials, setInitials] = useState(entry?.initials || '');
  const [displayName, setDisplayName] = useState(entry?.display_name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!initials.trim() || !displayName.trim()) { setError('Both fields required'); return; }
    setSaving(true);
    setError('');
    try {
      const method = entry ? 'PATCH' : 'POST';
      const url = entry ? `${API}/api/prod-weekly/initials/${entry.id}` : `${API}/api/prod-weekly/initials`;
      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ initials: initials.trim().toUpperCase(), display_name: displayName.trim() }),
      });
      if (!resp.ok) {
        const d = await resp.json();
        setError(d.message || 'Error saving');
        setSaving(false);
        return;
      }
      onSave();
    } catch { setError('Network error'); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">{entry ? 'Edit Initials' : 'Add Initials'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Initials (from sheet)</label>
            <input
              value={initials}
              onChange={e => setInitials(e.target.value.toUpperCase())}
              maxLength={4}
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm border border-gray-600 focus:border-orange-500 focus:outline-none"
              placeholder="e.g. R"
            />
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Display Name</label>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm border border-gray-600 focus:border-orange-500 focus:outline-none"
              placeholder="e.g. Ryan"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm text-white rounded-lg transition"
            style={{ backgroundColor: '#F05A28' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manage tab ────────────────────────────────────────────────────────────────
function ManageTab({ canUpload }) {
  const [initials, setInitials] = useState([]);
  const [modal, setModal] = useState(null); // null | 'add' | entry object
  const [loading, setLoading] = useState(true);

  const fetchInitials = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`${API}/api/prod-weekly/initials`, { credentials: 'include' });
    setInitials(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchInitials(); }, [fetchInitials]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this initials mapping?')) return;
    await fetch(`${API}/api/prod-weekly/initials/${id}`, { method: 'DELETE', credentials: 'include' });
    fetchInitials();
  };

  return (
    <div className="max-w-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">Initials Mapping</h3>
        {canUpload && (
          <button
            onClick={() => setModal('add')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-lg transition"
            style={{ backgroundColor: '#F05A28' }}
          >
            <Plus size={14} /> Add
          </button>
        )}
      </div>
      <p className="text-gray-400 text-sm mb-4">
        Map sheet initials (e.g. "R") to display names shown in the weekly board.
      </p>
      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : initials.length === 0 ? (
        <p className="text-gray-400 text-sm">No mappings yet.</p>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 divide-y divide-gray-700">
          {initials.map(entry => (
            <div key={entry.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-orange-400 font-mono font-bold text-sm w-8">{entry.initials}</span>
                <span className="text-white text-sm">{entry.display_name}</span>
              </div>
              {canUpload && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setModal(entry)} className="text-gray-400 hover:text-white transition">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(entry.id)} className="text-gray-400 hover:text-red-400 transition">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <InitialsModal
          entry={modal === 'add' ? null : modal}
          onSave={() => { setModal(null); fetchInitials(); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function ProductionWeekly({ user, canUpload, onBack }) {
  const [tab, setTab] = useState('section');
  const [sheetData, setSheetData] = useState(null);
  const [checks, setChecks] = useState([]);
  const [initialsMap, setInitialsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (spinner = true) => {
    if (spinner) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const r = await fetch(`${API}/api/prod-weekly/sheet`, { credentials: 'include' });
      if (!r.ok) throw new Error((await r.json()).message || 'Failed to load sheet');
      const data = await r.json();
      setSheetData(data);
      setChecks(data.checks || []);
      setInitialsMap(data.initialsMap || {});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggle = async (rowType, rowKey, day, taskText, currentlyChecked) => {
    const weekStart = sheetData?.weekStart;
    if (!weekStart) return;

    // Optimistic update
    if (currentlyChecked) {
      setChecks(prev => prev.filter(c =>
        !(c.row_type === rowType && c.row_key === rowKey &&
          (day ? c.day === day : true) && c.task_text === taskText)
      ));
    } else {
      setChecks(prev => [...prev, {
        row_type: rowType, row_key: rowKey, day: day || null, task_text: taskText,
        checked_by_name: user.name, checked_at: new Date().toISOString(),
      }]);
    }

    try {
      const method = currentlyChecked ? 'DELETE' : 'POST';
      await fetch(`${API}/api/prod-weekly/checks`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ week_start: weekStart, row_type: rowType, row_key: rowKey, day: day || null, task_text: taskText }),
      });
    } catch {
      // revert on error
      loadData(false);
    }
  };

  const weekLabel = sheetData?.weekStart
    ? (() => {
        const d = new Date(sheetData.weekStart + 'T12:00:00');
        return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      })()
    : '';

  const tabs = [
    { key: 'section', label: 'By Section', Icon: LayoutList },
    { key: 'person',  label: 'By Person',  Icon: Users },
    ...(canUpload ? [{ key: 'manage', label: 'Manage', Icon: Settings }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white transition">
          <ChevronLeft size={20} />
          <span className="text-sm">Dashboard</span>
        </button>
        <div className="flex items-center gap-3">
          <h1 className="text-cream font-bold text-lg">Production Weekly</h1>
          {weekLabel && <span className="text-gray-400 text-sm hidden sm:inline">{weekLabel}</span>}
        </div>
        <button
          onClick={() => loadData(false)}
          disabled={refreshing}
          className="text-gray-400 hover:text-white transition"
        >
          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-800 p-1 rounded-lg w-fit">
          {tabs.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                tab === key ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={24} className="text-gray-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-6 text-center">
            <p className="text-red-400 font-medium mb-1">Failed to load sheet data</p>
            <p className="text-red-300 text-sm">{error}</p>
            <button
              onClick={() => loadData()}
              className="mt-3 px-4 py-1.5 text-sm text-white rounded-lg"
              style={{ backgroundColor: '#F05A28' }}
            >
              Retry
            </button>
          </div>
        ) : tab === 'manage' ? (
          <ManageTab canUpload={canUpload} />
        ) : tab === 'section' ? (
          <BySectionTab
            sections={sheetData?.sections || []}
            personData={sheetData?.personData || []}
            initialsMap={initialsMap}
            checks={checks}
            onToggle={handleToggle}
          />
        ) : (
          <ByPersonTab
            personData={sheetData?.personData || []}
            initialsMap={initialsMap}
            checks={checks}
            onToggle={handleToggle}
          />
        )}
      </main>
    </div>
  );
}

export default ProductionWeekly;
