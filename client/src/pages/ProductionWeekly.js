import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Settings, Plus, Pencil, Trash2, X, Check, Beer, Package, CalendarOff, User, ChevronLeft, ChevronRight } from 'lucide-react';

const API = process.env.REACT_APP_API_URL || '';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DAY_LABELS = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday' };
const DAY_SHORT  = { monday: 'Mon',    tuesday: 'Tue',     wednesday: 'Wed',       thursday: 'Thu',      friday: 'Fri' };

const SECTION_META = {
  brews:     { label: 'Brews',     Icon: Beer,        accent: '#F59E0B', bgClass: 'bg-amber-500/10',   borderClass: 'border-amber-500/30' },
  packaging: { label: 'Packaging', Icon: Package,     accent: '#60A5FA', bgClass: 'bg-blue-500/10',    borderClass: 'border-blue-500/30'  },
  timeoff:   { label: 'Time Off',  Icon: CalendarOff, accent: '#34D399', bgClass: 'bg-emerald-500/10', borderClass: 'border-emerald-500/30' },
};

function getTodayDay() {
  const d = new Date().getDay();
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
  const names = initials.map(i => initialsMap[i] || i);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
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

// ── Section column (desktop portrait) ─────────────────────────────────────────
function SectionColumn({ section, weekStart, checksSet, onToggle, initialsMap, weekOffset }) {
  const meta = SECTION_META[section.key] || {};
  const { Icon = Beer, label, bgClass, borderClass, accent } = meta;
  const todayDay = weekOffset === 0 ? getTodayDay() : null;

  return (
    <div className={`rounded-xl border overflow-hidden ${borderClass}`}>
      <div className={`px-4 py-3 ${bgClass}`}>
        <div className="flex items-center gap-2">
          <Icon size={16} style={{ color: accent }} />
          <h3 className="font-semibold text-white">{label}</h3>
        </div>
      </div>
      <div className="divide-y divide-gray-700/40">
        {DAYS.map(day => {
          const tasks = section.dayTasks[day] || [];
          const isToday = day === todayDay;
          return (
            <div key={day} className="p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>
                  {DAY_SHORT[day]}
                </span>
                {isToday && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />}
              </div>
              {tasks.length ? (
                <div className="space-y-1.5">
                  {tasks.map((t, i) => (
                    <TaskItem key={i} text={t} day={day} accentColor={accent}
                      rowType="section" rowKey={section.key}
                      weekStart={weekStart} checksSet={checksSet}
                      onToggle={onToggle} initialsMap={initialsMap} />
                  ))}
                </div>
              ) : (
                <p className="text-gray-600 text-xs">—</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Section card (mobile, one-day view) ───────────────────────────────────────
function SectionCard({ section, weekStart, checksSet, onToggle, initialsMap, selectedDay }) {
  const meta = SECTION_META[section.key] || {};
  const { Icon = Beer, label, bgClass, borderClass, accent } = meta;
  const sharedProps = { rowType: 'section', rowKey: section.key, weekStart, checksSet, onToggle, initialsMap };

  return (
    <div className={`rounded-xl border overflow-hidden ${borderClass}`}>
      <div className={`px-4 py-3 ${bgClass}`}>
        <div className="flex items-center gap-2">
          <Icon size={16} style={{ color: accent }} />
          <h3 className="font-semibold text-white">{label}</h3>
        </div>
      </div>
      <div className="p-3">
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
function PersonCard({ person, weekStart, checksSet, onToggle, initialsMap, selectedDay, weekOffset }) {
  const sharedProps = { rowType: 'person', rowKey: person.name, weekStart, checksSet, onToggle, initialsMap };
  const todayDay = weekOffset === 0 ? getTodayDay() : null;

  return (
    <div className="rounded-xl border border-gray-700 overflow-hidden">
      <div className="px-4 py-3 bg-gray-700/40">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
               style={{ backgroundColor: '#F05A28' }}>
            {person.name.charAt(0).toUpperCase()}
          </div>
          <h3 className="font-semibold text-white">{person.name}</h3>
        </div>
      </div>

      {/* Desktop: vertical day list */}
      <div className="hidden md:block divide-y divide-gray-700/40">
        {DAYS.map(day => {
          const tasks = person.dayTasks[day] || [];
          const isToday = day === todayDay;
          return (
            <div key={day} className="p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#F05A28' }}>
                  {DAY_SHORT[day]}
                </span>
                {isToday && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#F05A28' }} />}
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
  const [weekOffset, setWeekOffset] = useState(0);
  const [mobileTab, setMobileTab] = useState('sections');
  const [showManage, setShowManage] = useState(false);
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
      const r = await fetch(`${API}/api/prod-weekly/sheet?weekOffset=${weekOffset}`, { credentials: 'include' });
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
  }, [weekOffset]);

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
    ? new Date(sheetData.weekStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '…';

  const sections  = sheetData?.sections || [];
  const people    = sheetData?.people   || [];
  const weekStart = sheetData?.weekStart;

  const sharedProps = { weekStart, checksSet, onToggle: handleToggle, initialsMap };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Nav */}
      <nav className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-4 flex items-center gap-3 sticky top-0 z-30">
        {/* Back / Logo */}
        <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition flex-shrink-0">
          <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-xl">HQ</span>
        </button>

        {/* Week navigation — centered */}
        <div className="flex-1 flex items-center justify-center gap-1 sm:gap-2">
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-gray-300 text-sm font-medium min-w-[110px] text-center">
            {weekOffset === 0 ? 'This Week' : weekOffset === 1 ? 'Next Week' : weekOffset === -1 ? 'Last Week' : `Week of ${weekLabel}`}
          </span>
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {canUpload && (
            <button onClick={() => setShowManage(true)} className="text-gray-400 hover:text-white transition">
              <Settings size={18} />
            </button>
          )}
          <button onClick={() => loadData(false)} disabled={refreshing} className="text-gray-400 hover:text-white transition">
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={onBack} className="hidden sm:block text-sm text-gray-400 hover:text-white transition">
            ← Back
          </button>
        </div>
      </nav>

      {/* Mobile: tab bar + day selector */}
      <div className="md:hidden sticky top-[65px] z-20 bg-gray-900 border-b border-gray-700/60 px-4 pt-2 pb-2">
        {/* Tab selector */}
        <div className="flex gap-1.5 mb-2">
          {[
            { key: 'sections', label: 'Sections' },
            { key: 'people',   label: 'People'   },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setMobileTab(tab.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                mobileTab === tab.key ? 'text-white' : 'text-gray-400 bg-gray-800 hover:text-white'
              }`}
              style={mobileTab === tab.key ? { backgroundColor: '#F05A28' } : {}}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* Day selector */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {DAYS.map(day => (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                selectedDay === day ? 'text-white' : 'text-gray-400 bg-gray-800 hover:text-white'
              }`}
              style={selectedDay === day ? { backgroundColor: '#F05A28' } : {}}
            >
              {DAY_SHORT[day]}
              {day === todayDay && weekOffset === 0 && (
                <span className="ml-1 inline-block w-1 h-1 rounded-full bg-white align-middle" />
              )}
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
            {/* ── Desktop layout ──────────────────────────────────────────── */}

            {/* 3-column portrait section board */}
            <div className="hidden md:grid grid-cols-3 gap-4 mb-6">
              {sections.map(sec => (
                <SectionColumn key={sec.key} section={sec} weekOffset={weekOffset} {...sharedProps} />
              ))}
            </div>

            {/* Desktop: people */}
            {people.length > 0 && (
              <div className="hidden md:block">
                <div className="flex items-center gap-3 mb-3">
                  <User size={14} className="text-gray-400" />
                  <span className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Individual Tasks</span>
                  <div className="flex-1 h-px bg-gray-700" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {people.map(p => (
                    <PersonCard key={p.name} person={p} selectedDay={selectedDay} weekOffset={weekOffset} {...sharedProps} />
                  ))}
                </div>
              </div>
            )}

            {/* ── Mobile layout ───────────────────────────────────────────── */}

            {/* Sections tab */}
            {mobileTab === 'sections' && (
              <div className="md:hidden space-y-4">
                {sections.map(sec => (
                  <SectionCard key={sec.key} section={sec} selectedDay={selectedDay} {...sharedProps} />
                ))}
              </div>
            )}

            {/* People tab */}
            {mobileTab === 'people' && (
              <div className="md:hidden space-y-4">
                {people.length === 0 ? (
                  <div className="text-center py-16">
                    <User size={32} className="text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">No individual tasks this week</p>
                  </div>
                ) : (
                  people.map(p => (
                    <PersonCard key={p.name} person={p} selectedDay={selectedDay} weekOffset={weekOffset} {...sharedProps} />
                  ))
                )}
              </div>
            )}
          </>
        )}
      </main>

      {showManage && <ManageView canUpload={canUpload} onClose={() => setShowManage(false)} />}
    </div>
  );
}

export default ProductionWeekly;
