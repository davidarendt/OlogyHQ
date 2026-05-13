import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, RefreshCw, Settings, Plus, Pencil, Trash2, X, Check, Beer, Package, CalendarOff, User } from 'lucide-react';

const API = process.env.REACT_APP_API_URL || '';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DAY_LABELS = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday' };
const DAY_SHORT  = { monday: 'Mon',    tuesday: 'Tue',     wednesday: 'Wed',       thursday: 'Thu',      friday: 'Fri' };

const SECTION_META = {
  brews:     { label: 'Brews',     Icon: Beer,        accent: '#F59E0B', barClass: 'bg-amber-500',  bgClass: 'bg-amber-500/10',  borderClass: 'border-amber-500/30' },
  packaging: { label: 'Packaging', Icon: Package,     accent: '#60A5FA', barClass: 'bg-blue-500',   bgClass: 'bg-blue-500/10',   borderClass: 'border-blue-500/30'  },
  timeoff:   { label: 'Time Off',  Icon: CalendarOff, accent: '#34D399', barClass: 'bg-emerald-500', bgClass: 'bg-emerald-500/10', borderClass: 'border-emerald-500/30' },
};

function getTodayDay() {
  const d = new Date().getDay(); // 0=Sun
  return ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][d];
}

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

// ── Task item ──────────────────────────────────────────────────────────────────
function TaskItem({ text, rowType, rowKey, day, weekStart, checksSet, onToggle, initialsMap, accentColor = '#F05A28' }) {
  const { label, initials } = parseInitials(text);
  const checked = isChecked(checksSet, weekStart, rowType, rowKey, day, text);
  const assignedNames = initials.length ? resolveInitials(initials, initialsMap) : null;

  return (
    <div
      onClick={() => onToggle(rowType, rowKey, day, text, checked)}
      className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors group
        ${checked ? 'bg-gray-700/40' : 'bg-gray-700/60 hover:bg-gray-700'}`}
    >
      <span
        className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all border-gray-500"
        style={checked ? { borderColor: accentColor, backgroundColor: accentColor } : {}}
      >
        {checked && <Check size={12} className="text-white" strokeWidth={3} />}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`text-sm leading-snug block ${checked ? 'line-through text-gray-500' : 'text-gray-100'}`}>
          {label}
        </span>
        {assignedNames && (
          <span className="text-xs mt-0.5 block" style={{ color: accentColor }}>{assignedNames}</span>
        )}
      </span>
    </div>
  );
}

// ── Progress bar ───────────────────────────────────────────────────────────────
function ProgressBar({ done, total, barClass }) {
  if (!total) return null;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 tabular-nums w-12 text-right">{done}/{total}</span>
    </div>
  );
}

// ── Section card ───────────────────────────────────────────────────────────────
function SectionCard({ section, weekStart, checksSet, onToggle, initialsMap, selectedDay }) {
  const meta = SECTION_META[section.key] || {};
  const { Icon = Beer, label, barClass, bgClass, borderClass, accent } = meta;

  const totalTasks = DAYS.reduce((n, d) => n + (section.dayTasks[d]?.length || 0), 0);
  const doneTasks  = DAYS.reduce((n, d) =>
    n + (section.dayTasks[d] || []).filter(t => isChecked(checksSet, weekStart, 'section', section.key, d, t)).length, 0);

  const sharedProps = { rowType: 'section', rowKey: section.key, weekStart, checksSet, onToggle, initialsMap };

  return (
    <div className={`rounded-xl border overflow-hidden ${borderClass}`}>
      {/* Header */}
      <div className={`px-4 py-3 ${bgClass}`}>
        <div className="flex items-center gap-2 mb-2">
          <Icon size={16} style={{ color: accent }} />
          <h3 className="font-semibold text-white">{label}</h3>
        </div>
        <ProgressBar done={doneTasks} total={totalTasks} barClass={barClass} />
      </div>

      {/* Desktop: 5-column grid */}
      <div className="hidden md:grid grid-cols-5 divide-x divide-gray-700/60">
        {DAYS.map(day => {
          const tasks = section.dayTasks[day] || [];
          return (
            <div key={day} className="p-3" style={{ borderTop: `2px solid ${accent}20` }}>
              <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: accent }}>
                {DAY_SHORT[day]}
              </div>
              {tasks.length ? (
                <div className="space-y-1.5">
                  {tasks.map((t, i) => <TaskItem key={i} text={t} day={day} accentColor={accent} {...sharedProps} />)}
                </div>
              ) : (
                <p className="text-gray-600 text-xs">—</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: selected day only */}
      <div className="md:hidden p-3">
        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: accent }}>
          {DAY_LABELS[selectedDay]}
        </div>
        {(section.dayTasks[selectedDay] || []).length ? (
          <div className="space-y-1.5">
            {(section.dayTasks[selectedDay] || []).map((t, i) => (
              <TaskItem key={i} text={t} day={selectedDay} accentColor={accent} {...sharedProps} />
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Nothing scheduled</p>
        )}
      </div>
    </div>
  );
}

// ── Person card ────────────────────────────────────────────────────────────────
function PersonCard({ person, weekStart, checksSet, onToggle, initialsMap, selectedDay }) {
  const totalTasks = DAYS.reduce((n, d) => n + (person.dayTasks[d]?.length || 0), 0);
  const doneTasks  = DAYS.reduce((n, d) =>
    n + (person.dayTasks[d] || []).filter(t => isChecked(checksSet, weekStart, 'person', person.name, d, t)).length, 0);

  const sharedProps = { rowType: 'person', rowKey: person.name, weekStart, checksSet, onToggle, initialsMap };

  return (
    <div className="rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-700/40">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
               style={{ backgroundColor: '#F05A28' }}>
            {person.name.charAt(0).toUpperCase()}
          </div>
          <h3 className="font-semibold text-white">{person.name}</h3>
        </div>
        <ProgressBar done={doneTasks} total={totalTasks} barClass="bg-orange-500" />
      </div>

      {/* Desktop: 5-column grid */}
      <div className="hidden md:grid grid-cols-5 divide-x divide-gray-700/60">
        {DAYS.map(day => {
          const tasks = person.dayTasks[day] || [];
          return (
            <div key={day} className="p-3" style={{ borderTop: '2px solid rgba(240,90,40,0.15)' }}>
              <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#F05A28' }}>
                {DAY_SHORT[day]}
              </div>
              {tasks.length ? (
                <div className="space-y-1.5">
                  {tasks.map((t, i) => <TaskItem key={i} text={t} day={day} accentColor="#F05A28" {...sharedProps} />)}
                </div>
              ) : (
                <p className="text-gray-600 text-xs">—</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: selected day only */}
      <div className="md:hidden p-3">
        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#F05A28' }}>
          {DAY_LABELS[selectedDay]}
        </div>
        {(person.dayTasks[selectedDay] || []).length ? (
          <div className="space-y-1.5">
            {(person.dayTasks[selectedDay] || []).map((t, i) => (
              <TaskItem key={i} text={t} day={selectedDay} accentColor="#F05A28" {...sharedProps} />
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Nothing scheduled</p>
        )}
      </div>
    </div>
  );
}

// ── Week summary strip ─────────────────────────────────────────────────────────
function WeekSummary({ sections, people, weekStart, checksSet }) {
  let total = 0; let done = 0;
  sections.forEach(sec => {
    DAYS.forEach(d => {
      const tasks = sec.dayTasks[d] || [];
      total += tasks.length;
      done  += tasks.filter(t => isChecked(checksSet, weekStart, 'section', sec.key, d, t)).length;
    });
  });
  people.forEach(p => {
    DAYS.forEach(d => {
      const tasks = p.dayTasks[d] || [];
      total += tasks.length;
      done  += tasks.filter(t => isChecked(checksSet, weekStart, 'person', p.name, d, t)).length;
    });
  });
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-gray-400 text-sm">Week Progress</span>
        <span className="text-white font-semibold text-sm">{pct}%</span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
             style={{ width: `${pct}%`, backgroundColor: '#F05A28' }} />
      </div>
      <div className="flex justify-between mt-2">
        <span className="text-gray-500 text-xs">{done} of {total} tasks complete</span>
        {pct === 100 && <span className="text-orange-400 text-xs font-medium">Week complete!</span>}
      </div>
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
    setSaving(true); setError('');
    try {
      const method = entry ? 'PATCH' : 'POST';
      const url = entry ? `${API}/api/prod-weekly/initials/${entry.id}` : `${API}/api/prod-weekly/initials`;
      const resp = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
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
            <label className="text-gray-400 text-xs mb-1 block">Initials (as in sheet)</label>
            <input value={initials} onChange={e => setInitials(e.target.value.toUpperCase())} maxLength={8}
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm border border-gray-600 focus:border-orange-500 focus:outline-none"
              placeholder="e.g. R" />
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Display Name</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)}
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm border border-gray-600 focus:border-orange-500 focus:outline-none"
              placeholder="e.g. Ron" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm text-white rounded-lg" style={{ backgroundColor: '#F05A28' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manage view ────────────────────────────────────────────────────────────────
function ManageView({ canUpload, onClose }) {
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
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-40 p-0 sm:p-4">
      <div className="bg-gray-800 rounded-t-2xl sm:rounded-xl border border-gray-700 w-full sm:max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-white font-semibold">Initials Mapping</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-gray-400 text-sm mb-4">
            Map sheet initials (e.g. "R") to full names shown next to tasks.
          </p>
          {canUpload && (
            <button onClick={() => setModal('add')}
              className="flex items-center gap-2 w-full justify-center px-4 py-2.5 text-sm text-white rounded-lg mb-4 transition"
              style={{ backgroundColor: '#F05A28' }}>
              <Plus size={15} /> Add Mapping
            </button>
          )}
          {loading ? (
            <p className="text-gray-400 text-sm text-center py-4">Loading…</p>
          ) : initials.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">No mappings yet.</p>
          ) : (
            <div className="space-y-2">
              {initials.map(entry => (
                <div key={entry.id} className="flex items-center justify-between bg-gray-700/50 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                          style={{ backgroundColor: '#F05A28' }}>
                      {entry.initials}
                    </span>
                    <span className="text-white text-sm font-medium">{entry.display_name}</span>
                  </div>
                  {canUpload && (
                    <div className="flex gap-2">
                      <button onClick={() => setModal(entry)} className="text-gray-400 hover:text-white p-1"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(entry.id)} className="text-gray-400 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
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
  const todayDay = getTodayDay();
  const defaultDay = DAYS.includes(todayDay) ? todayDay : 'monday';
  const [selectedDay, setSelectedDay] = useState(defaultDay);
  const [showManage, setShowManage] = useState(false);
  const [sheetData, setSheetData] = useState(null);
  const [checksSet, setChecksSet] = useState(new Set());
  const [initialsMap, setInitialsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const dayBarRef = useRef(null);

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
    } catch { loadData(false); }
  };

  const weekLabel = sheetData?.weekStart
    ? `Week of ${new Date(sheetData.weekStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : '';

  const sections = sheetData?.sections || [];
  const people   = sheetData?.people   || [];
  const weekStart = sheetData?.weekStart;

  const sharedCardProps = { weekStart, checksSet, onToggle: handleToggle, initialsMap, selectedDay };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Nav */}
      <nav className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <button onClick={onBack} className="flex items-center gap-1.5 text-gray-400 hover:text-white transition">
          <ChevronLeft size={20} />
          <span className="text-sm hidden sm:inline">Dashboard</span>
        </button>
        <div className="text-center">
          <h1 className="text-cream font-bold text-base sm:text-lg leading-tight">Production Weekly</h1>
          {weekLabel && <p className="text-gray-400 text-xs">{weekLabel}</p>}
        </div>
        <div className="flex items-center gap-2">
          {canUpload && (
            <button onClick={() => setShowManage(true)} className="text-gray-400 hover:text-white transition p-1">
              <Settings size={18} />
            </button>
          )}
          <button onClick={() => loadData(false)} disabled={refreshing} className="text-gray-400 hover:text-white transition p-1">
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </nav>

      {/* Mobile day selector — sticky below nav */}
      <div className="md:hidden sticky top-[65px] z-20 bg-gray-900 border-b border-gray-700/60 px-4 py-2" ref={dayBarRef}>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {DAYS.map(day => (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition ${
                selectedDay === day
                  ? 'text-white'
                  : 'text-gray-400 bg-gray-800 hover:text-white'
              }`}
              style={selectedDay === day ? { backgroundColor: '#F05A28' } : {}}
            >
              {DAY_SHORT[day]}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <RefreshCw size={28} className="text-gray-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-8 text-center max-w-md mx-auto">
            <p className="text-red-400 font-semibold mb-2">Could not load sheet data</p>
            <p className="text-red-300 text-sm mb-4">{error}</p>
            <button onClick={() => loadData()} className="px-5 py-2 text-sm text-white rounded-lg" style={{ backgroundColor: '#F05A28' }}>
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Week progress summary */}
            <WeekSummary sections={sections} people={people} weekStart={weekStart} checksSet={checksSet} />

            {/* Desktop: day column headers */}
            <div className="hidden md:grid grid-cols-5 mb-2 px-px">
              {DAYS.map(day => (
                <div key={day} className="text-center">
                  <span className={`text-xs font-semibold uppercase tracking-widest ${
                    day === todayDay ? 'text-orange-400' : 'text-gray-500'
                  }`}>
                    {DAY_LABELS[day]}
                    {day === todayDay && <span className="ml-1 text-orange-500">•</span>}
                  </span>
                </div>
              ))}
            </div>

            {/* Sections */}
            <div className="space-y-4 mb-6">
              {sections.map(sec => (
                <SectionCard key={sec.key} section={sec} {...sharedCardProps} />
              ))}
            </div>

            {/* People */}
            {people.length > 0 && (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <User size={14} className="text-gray-400" />
                  <span className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Individual Tasks</span>
                  <div className="flex-1 h-px bg-gray-700" />
                </div>
                <div className="space-y-4">
                  {people.map(p => (
                    <PersonCard key={p.name} person={p} {...sharedCardProps} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>

      {showManage && <ManageView canUpload={canUpload} onClose={() => setShowManage(false)} />}
    </div>
  );
}

export default ProductionWeekly;
