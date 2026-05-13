import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, RefreshCw, Users, LayoutList, Settings, Plus, Pencil, Trash2, X, Check } from 'lucide-react';

const API = process.env.REACT_APP_API_URL || '';

const DAY_LABELS = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri' };
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

// Parse "(R, C)" or "(J)" from end of a task string
function parseInitials(text) {
  const m = text.match(/\(([^)]+)\)\s*$/);
  if (!m) return { label: text, initials: [] };
  const label = text.slice(0, text.lastIndexOf('(')).trim();
  const initials = m[1].split(',').map(s => s.trim()).filter(Boolean);
  return { label, initials };
}

function resolveInitials(initials, initialsMap) {
  return initials.map(i => initialsMap[i] || i).join(', ');
}

function checkKey(weekStart, rowType, rowKey, day, taskText) {
  return `${weekStart}|${rowType}|${rowKey}|${day || ''}|${taskText}`;
}

function isChecked(checksSet, weekStart, rowType, rowKey, day, taskText) {
  return checksSet.has(checkKey(weekStart, rowType, rowKey, day, taskText));
}

function TaskRow({ text, rowType, rowKey, day, weekStart, checksSet, onToggle, initialsMap }) {
  const { label, initials } = parseInitials(text);
  const checked = isChecked(checksSet, weekStart, rowType, rowKey, day, text);
  const assignedNames = initials.length ? resolveInitials(initials, initialsMap) : null;

  return (
    <label className="flex items-start gap-2 py-1 cursor-pointer group">
      <span
        onClick={() => onToggle(rowType, rowKey, day, text, checked)}
        className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition
          ${checked ? 'bg-orange-500 border-orange-500' : 'border-gray-500 group-hover:border-orange-400'}`}
      >
        {checked && <Check size={10} className="text-white" strokeWidth={3} />}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`text-sm leading-snug ${checked ? 'line-through text-gray-500' : 'text-gray-200'}`}>
          {label}
        </span>
        {assignedNames && (
          <span className="ml-1.5 text-xs text-orange-400">{assignedNames}</span>
        )}
      </span>
    </label>
  );
}

// ── By Section tab ─────────────────────────────────────────────────────────────
function BySectionTab({ sections, weekStart, checksSet, onToggle, initialsMap }) {
  if (!sections.length) return <p className="text-gray-400 text-center py-8">No section data found.</p>;

  return (
    <div className="space-y-6">
      {sections.map(sec => {
        const totalTasks = DAYS.reduce((n, d) => n + (sec.dayTasks[d]?.length || 0), 0);
        const doneTasks = DAYS.reduce((n, d) =>
          n + (sec.dayTasks[d] || []).filter(t => isChecked(checksSet, weekStart, 'section', sec.key, d, t)).length, 0);

        return (
          <div key={sec.key} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-white font-semibold">{sec.label}</h3>
              {totalTasks > 0 && (
                <span className="text-xs text-gray-400">{doneTasks}/{totalTasks} done</span>
              )}
            </div>
            <div className="grid grid-cols-5 divide-x divide-gray-700">
              {DAYS.map(day => {
                const tasks = sec.dayTasks[day] || [];
                return (
                  <div key={day} className="p-3">
                    <div className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">
                      {DAY_LABELS[day]}
                    </div>
                    {tasks.length ? tasks.map((t, i) => (
                      <TaskRow
                        key={i}
                        text={t}
                        rowType="section"
                        rowKey={sec.key}
                        day={day}
                        weekStart={weekStart}
                        checksSet={checksSet}
                        onToggle={onToggle}
                        initialsMap={initialsMap}
                      />
                    )) : (
                      <span className="text-gray-600 text-xs">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── By Person tab ──────────────────────────────────────────────────────────────
function ByPersonTab({ people, weekStart, checksSet, onToggle, initialsMap }) {
  if (!people.length) return <p className="text-gray-400 text-center py-8">No person data found in sheet.</p>;

  return (
    <div className="space-y-6">
      {people.map(person => {
        const totalTasks = DAYS.reduce((n, d) => n + (person.dayTasks[d]?.length || 0), 0);
        const doneTasks = DAYS.reduce((n, d) =>
          n + (person.dayTasks[d] || []).filter(t => isChecked(checksSet, weekStart, 'person', person.name, d, t)).length, 0);

        return (
          <div key={person.name} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-white font-semibold">{person.name}</h3>
              {totalTasks > 0 && (
                <span className="text-xs text-gray-400">{doneTasks}/{totalTasks} done</span>
              )}
            </div>
            <div className="grid grid-cols-5 divide-x divide-gray-700">
              {DAYS.map(day => {
                const tasks = person.dayTasks[day] || [];
                return (
                  <div key={day} className="p-3">
                    <div className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">
                      {DAY_LABELS[day]}
                    </div>
                    {tasks.length ? tasks.map((t, i) => (
                      <TaskRow
                        key={i}
                        text={t}
                        rowType="person"
                        rowKey={person.name}
                        day={day}
                        weekStart={weekStart}
                        checksSet={checksSet}
                        onToggle={onToggle}
                        initialsMap={initialsMap}
                      />
                    )) : (
                      <span className="text-gray-600 text-xs">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Initials modal ─────────────────────────────────────────────────────────────
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
      if (!resp.ok) { const d = await resp.json(); setError(d.message || 'Error'); setSaving(false); return; }
      onSave();
    } catch { setError('Network error'); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">{entry ? 'Edit Mapping' : 'Add Mapping'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Initials (as they appear in sheet)</label>
            <input
              value={initials}
              onChange={e => setInitials(e.target.value.toUpperCase())}
              maxLength={8}
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
              placeholder="e.g. Ron"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm text-white rounded-lg transition" style={{ backgroundColor: '#F05A28' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manage tab ─────────────────────────────────────────────────────────────────
function ManageTab({ canUpload }) {
  const [initials, setInitials] = useState([]);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchInitials = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`${API}/api/prod-weekly/initials`, { credentials: 'include' });
    setInitials(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchInitials(); }, [fetchInitials]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this mapping?')) return;
    await fetch(`${API}/api/prod-weekly/initials/${id}`, { method: 'DELETE', credentials: 'include' });
    fetchInitials();
  };

  return (
    <div className="max-w-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold">Initials Mapping</h3>
        {canUpload && (
          <button onClick={() => setModal('add')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-lg" style={{ backgroundColor: '#F05A28' }}>
            <Plus size={14} /> Add
          </button>
        )}
      </div>
      <p className="text-gray-400 text-sm mb-4">
        Map initials from the sheet (e.g. "R") to display names shown next to tasks.
      </p>
      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : initials.length === 0 ? (
        <p className="text-gray-400 text-sm">No mappings yet. Add initials to show names on tasks.</p>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 divide-y divide-gray-700">
          {initials.map(entry => (
            <div key={entry.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-orange-400 font-mono font-bold text-sm w-10">{entry.initials}</span>
                <span className="text-white text-sm">{entry.display_name}</span>
              </div>
              {canUpload && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setModal(entry)} className="text-gray-400 hover:text-white transition"><Pencil size={14} /></button>
                  <button onClick={() => handleDelete(entry.id)} className="text-gray-400 hover:text-red-400 transition"><Trash2 size={14} /></button>
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

// ── Main component ─────────────────────────────────────────────────────────────
function ProductionWeekly({ user, canUpload, onBack }) {
  const [tab, setTab] = useState('section');
  const [sheetData, setSheetData] = useState(null);
  const [checksSet, setChecksSet] = useState(new Set());
  const [initialsMap, setInitialsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (spinner = true) => {
    if (spinner) setLoading(true); else setRefreshing(true);
    setError('');
    try {
      const r = await fetch(`${API}/api/prod-weekly/sheet`, { credentials: 'include' });
      if (!r.ok) throw new Error((await r.json()).message || 'Failed to load');
      const data = await r.json();
      setSheetData(data);
      setInitialsMap(data.initialsMap || {});
      const raw = data.checks || [];
      setChecksSet(new Set(raw.map(c => checkKey(data.weekStart, c.row_type, c.row_key, c.day, c.task_text))));
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
    const key = checkKey(weekStart, rowType, rowKey, day, taskText);

    // Optimistic update
    setChecksSet(prev => {
      const next = new Set(prev);
      currentlyChecked ? next.delete(key) : next.add(key);
      return next;
    });

    try {
      await fetch(`${API}/api/prod-weekly/checks`, {
        method: currentlyChecked ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ week_start: weekStart, row_type: rowType, row_key: rowKey, day: day || null, task_text: taskText }),
      });
    } catch {
      loadData(false);
    }
  };

  const weekLabel = sheetData?.weekStart
    ? `Week of ${new Date(sheetData.weekStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
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
          <span className="text-sm hidden sm:inline">Dashboard</span>
        </button>
        <div className="text-center">
          <h1 className="text-cream font-bold text-lg leading-tight">Production Weekly</h1>
          {weekLabel && <p className="text-gray-400 text-xs">{weekLabel}</p>}
        </div>
        <button onClick={() => loadData(false)} disabled={refreshing} className="text-gray-400 hover:text-white transition">
          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
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
            <button onClick={() => loadData()} className="mt-3 px-4 py-1.5 text-sm text-white rounded-lg" style={{ backgroundColor: '#F05A28' }}>
              Retry
            </button>
          </div>
        ) : tab === 'manage' ? (
          <ManageTab canUpload={canUpload} />
        ) : tab === 'section' ? (
          <BySectionTab
            sections={sheetData?.sections || []}
            weekStart={sheetData?.weekStart}
            checksSet={checksSet}
            onToggle={handleToggle}
            initialsMap={initialsMap}
          />
        ) : (
          <ByPersonTab
            people={sheetData?.people || []}
            weekStart={sheetData?.weekStart}
            checksSet={checksSet}
            onToggle={handleToggle}
            initialsMap={initialsMap}
          />
        )}
      </main>
    </div>
  );
}

export default ProductionWeekly;
