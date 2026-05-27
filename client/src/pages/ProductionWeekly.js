import { useState, useEffect, useLayoutEffect, useCallback, useRef, Fragment } from 'react';
import { RefreshCw, Settings, Plus, Pencil, Trash2, X, Check, Beer, Package, CalendarOff, User, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Maximize2 } from 'lucide-react';
import { supabase } from '../supabaseClient';

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
function TaskItem({ text, rowType, rowKey, day, weekStart, checksSet, onToggle, initialsMap, accentColor = '#F05A28', bgColor }) {
  const { label, initials } = parseInitials(text);
  const checked = isChecked(checksSet, weekStart, rowType, rowKey, day, text);
  const assignedNames = initials.length ? resolveInitials(initials, initialsMap) : null;

  const bgStyle = bgColor
    ? { backgroundColor: checked ? `${bgColor}40` : `${bgColor}22` }
    : undefined;

  return (
    <div
      onClick={() => onToggle(rowType, rowKey, day, text, checked)}
      className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors group
        ${!bgColor && (checked ? 'bg-gray-700/40' : 'bg-gray-700/60 hover:bg-gray-700')}`}
      style={bgStyle}
    >
      <span
        className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all"
        style={{ borderColor: accentColor, ...(checked ? { backgroundColor: accentColor } : {}) }}
      >
        {checked && <Check size={12} className="text-white" strokeWidth={3} />}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`text-sm leading-snug ${checked ? 'line-through text-gray-500' : 'text-gray-100'}`}>
          {label}
          {assignedNames && (
            <span className="text-xs ml-1.5 font-medium not-italic" style={{ color: accentColor }}>{assignedNames}</span>
          )}
        </span>
      </span>
    </div>
  );
}

// ── Section item (read-only, no checkbox) ─────────────────────────────────────
function SectionItem({ text, initialsMap, accentColor, sectionKey }) {
  const { label, initials } = parseInitials(text);
  const names = initials.length ? resolveInitials(initials, initialsMap) : null;
  const typeLabel = sectionKey === 'brews' ? 'Brew' : sectionKey === 'packaging' ? 'Pack' : null;
  return (
    <div className="leading-snug">
      {typeLabel && (
        <span className="text-xs font-bold uppercase tracking-wider block mb-0.5" style={{ color: accentColor }}>
          {typeLabel}
        </span>
      )}
      <span className="text-sm text-gray-200">
        {label}
        {names && <span className="text-xs ml-1.5 font-medium" style={{ color: accentColor }}>{names}</span>}
      </span>
    </div>
  );
}

// ── Section column (desktop, read-only condensed) ─────────────────────────────
function SectionColumn({ section, initialsMap, weekOffset }) {
  const meta = SECTION_META[section.key] || {};
  const { Icon = Beer, label, bgClass, borderClass, accent } = meta;
  const todayDay = weekOffset === 0 ? getTodayDay() : null;
  const activeDays = DAYS.filter(day => (section.dayTasks[day] || []).length > 0);

  return (
    <div className={`rounded-xl border overflow-hidden ${borderClass}`}>
      <div className={`px-4 py-2.5 ${bgClass} flex items-center gap-2`}>
        <Icon size={14} style={{ color: accent }} />
        <h3 className="font-semibold text-white text-sm">{label}</h3>
      </div>
      {activeDays.length === 0 ? (
        <p className="text-gray-600 text-xs px-4 py-3">Nothing scheduled</p>
      ) : (
        <div className="px-4 py-3 space-y-2.5">
          {activeDays.map(day => (
            <div key={day}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: accent }}>
                  {DAY_SHORT[day]}
                </span>
                {day === todayDay && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: accent }} />}
              </div>
              <div className="space-y-0.5 pl-1">
                {(section.dayTasks[day] || []).map((t, i) => (
                  <SectionItem key={i} text={t} initialsMap={initialsMap} accentColor={accent} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Section card (mobile, one-day view, read-only condensed) ──────────────────
function SectionCard({ section, initialsMap, selectedDay }) {
  const meta = SECTION_META[section.key] || {};
  const { Icon = Beer, label, bgClass, borderClass, accent } = meta;
  const tasks = section.dayTasks[selectedDay] || [];

  if (tasks.length === 0) return null;

  return (
    <div className={`rounded-xl border overflow-hidden ${borderClass}`}>
      <div className={`px-4 py-2.5 ${bgClass} flex items-center gap-2`}>
        <Icon size={14} style={{ color: accent }} />
        <h3 className="font-semibold text-white text-sm">{label}</h3>
      </div>
      <div className="px-4 py-3 space-y-0.5">
        {tasks.map((t, i) => (
          <SectionItem key={i} text={t} initialsMap={initialsMap} accentColor={accent} />
        ))}
      </div>
    </div>
  );
}

// ── Person card ────────────────────────────────────────────────────────────────
function getBrewPackTasks(day, sections, personInitial) {
  const result = [];
  for (const s of (sections || [])) {
    if (s.key !== 'brews' && s.key !== 'packaging') continue;
    for (const task of (s.dayTasks[day] || [])) {
      const { initials } = parseInitials(task);
      if (initials.some(i => i === personInitial)) result.push({ task, sectionKey: s.key });
    }
  }
  return result;
}

function PersonCard({ person, weekStart, checksSet, onToggle, initialsMap, selectedDay, weekOffset, sections, reverseInitialsMap }) {
  const sharedProps = { rowType: 'person', rowKey: person.name, weekStart, checksSet, onToggle, initialsMap };
  const todayDay = weekOffset === 0 ? getTodayDay() : null;
  const personInitial = (reverseInitialsMap || {})[person.name] || person.name;

  const renderBrewPack = (day) => {
    const items = getBrewPackTasks(day, sections, personInitial);
    if (!items.length) return null;
    return (
      <div className="space-y-1.5 mb-1.5">
        {items.map(({ task, sectionKey }, i) => {
          const meta = SECTION_META[sectionKey] || {};
          return (
            <TaskItem
              key={i}
              text={task} day={day} accentColor={meta.accent} bgColor={meta.accent}
              rowType="section" rowKey={sectionKey}
              weekStart={weekStart} checksSet={checksSet} onToggle={onToggle} initialsMap={initialsMap}
            />
          );
        })}
      </div>
    );
  };

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
          const brewPack = renderBrewPack(day);
          const isToday = day === todayDay;
          const hasAnything = tasks.length > 0 || brewPack;
          return (
            <div key={day} className="p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#F05A28' }}>
                  {DAY_SHORT[day]}
                </span>
                {isToday && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#F05A28' }} />}
              </div>
              {hasAnything ? (
                <>
                  {brewPack}
                  {tasks.length > 0 && (
                    <div className={`space-y-1.5${brewPack ? ' pt-1.5 border-t border-gray-700/40' : ''}`}>
                      {tasks.map((t, i) => <TaskItem key={i} text={t} day={day} accentColor="#F05A28" {...sharedProps} />)}
                    </div>
                  )}
                </>
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
        {(() => {
          const tasks = person.dayTasks[selectedDay] || [];
          const brewPack = renderBrewPack(selectedDay);
          return (tasks.length > 0 || brewPack) ? (
            <>
              {brewPack}
              {tasks.length > 0 && (
                <div className={`space-y-1.5${brewPack ? ' pt-1.5 border-t border-gray-700/40' : ''}`}>
                  {tasks.map((t, i) => (
                    <TaskItem key={i} text={t} day={selectedDay} accentColor="#F05A28" {...sharedProps} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-500 text-sm">Nothing scheduled</p>
          );
        })()}
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

  const handleReorder = async (id, direction) => {
    const idx = initials.findIndex(e => e.id === id);
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === initials.length - 1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const newOrder = [...initials];
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    setInitials(newOrder);
    await fetch(`${API}/api/prod-weekly/initials/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ orderedIds: newOrder.map(e => e.id) }),
    });
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
              {initials.map((entry, idx) => (
                <div key={entry.id} className="flex items-center justify-between bg-gray-700/50 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    {canUpload && (
                      <div className="flex flex-col">
                        <button onClick={() => handleReorder(entry.id, 'up')} disabled={idx === 0}
                          className="text-gray-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed leading-none">
                          <ChevronUp size={14} />
                        </button>
                        <button onClick={() => handleReorder(entry.id, 'down')} disabled={idx === initials.length - 1}
                          className="text-gray-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed leading-none">
                          <ChevronDown size={14} />
                        </button>
                      </div>
                    )}
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

// ── Auto-scaling container for display view day cells ─────────────────────────
function AutoScaleContainer({ children, contentKey }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    inner.style.transform = 'none';
    inner.style.width = '100%';
    const availH = outer.clientHeight;
    const contentH = inner.scrollHeight;
    setScale(availH > 0 && contentH > availH ? availH / contentH : 1);
  }, [contentKey]);

  return (
    <div ref={outerRef} style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
      <div ref={innerRef} style={{
        transformOrigin: 'top left',
        transform: scale < 1 ? `scale(${scale})` : 'none',
        width: scale < 1 ? `${(100 / scale).toFixed(2)}%` : '100%',
      }}>
        {children}
      </div>
    </div>
  );
}

// ── Display view (kiosk/office board) ─────────────────────────────────────────
function DisplayTaskItem({ text, rowType, rowKey, day, weekStart, checksSet, onToggle, initialsMap, accentColor = '#F05A28', bgColor }) {
  const { label, initials } = parseInitials(text);
  const checked = isChecked(checksSet, weekStart, rowType, rowKey, day, text);
  const names = initials.length ? resolveInitials(initials, initialsMap) : null;
  const bg = bgColor
    ? { backgroundColor: checked ? `${bgColor}40` : `${bgColor}22` }
    : { backgroundColor: checked ? 'rgba(55,65,81,0.5)' : 'rgba(55,65,81,0.7)' };
  return (
    <div onClick={() => onToggle(rowType, rowKey, day, text, checked)}
      style={{ ...bg, display: 'flex', alignItems: 'flex-start', gap: '0.5vw', padding: '0.35vh 0.5vw', borderRadius: '0.4vw', cursor: 'pointer', marginBottom: '0.3vh' }}>
      <span style={{
        flexShrink: 0, width: '1.7vh', height: '1.7vh', borderRadius: '0.3vh',
        border: `0.2vh solid ${accentColor}`, backgroundColor: checked ? accentColor : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '0.15vh',
      }}>
        {checked && <Check size={10} style={{ color: 'white' }} strokeWidth={3} />}
      </span>
      <span style={{ fontSize: '1.55vh', lineHeight: 1.3, color: checked ? '#6B7280' : '#F3F4F6', textDecoration: checked ? 'line-through' : 'none' }}>
        {label}
        {names && <span style={{ fontSize: '1.25vh', marginLeft: '0.4vw', color: accentColor, fontWeight: 600 }}>{names}</span>}
      </span>
    </div>
  );
}

function DisplayView({ sheetData, checksSet, onToggle, initialsMap, reverseInitialsMap, weekOffset, weekLabel, onWeekChange, onExit }) {
  const sections  = sheetData?.sections || [];
  const people    = sheetData?.people   || [];
  const weekStart = sheetData?.weekStart || '';
  const todayDay  = weekOffset === 0 ? getTodayDay() : null;
  const sharedCheck = { weekStart, checksSet, onToggle, initialsMap };

  const wkLabel = weekOffset === 0 ? 'This Week' : weekOffset === 1 ? 'Next Week' : weekOffset === -1 ? 'Last Week' : `Week of ${weekLabel}`;

  // Section column: one block per section (Brews / Packaging / Time Off), each with 5 day rows
  const SECTION_ORDER = ['brews', 'packaging', 'timeoff'];

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0d1117', zIndex: 9999, display: 'flex', flexDirection: 'column', fontFamily: 'inherit' }}>

      {/* Top bar */}
      <div style={{ height: '4.5vh', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5vw', borderBottom: '1px solid #374151' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8vw' }}>
          <span style={{ fontSize: '2.4vh', fontWeight: 800, color: '#F05A28', letterSpacing: '-0.02em' }}>OLOGY</span>
          <span style={{ fontSize: '2.4vh', fontWeight: 600, color: '#F2EDE4' }}>Production Weekly</span>
        </div>
        {/* Week navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6vw' }}>
          <button onClick={() => onWeekChange(w => w - 1)}
            style={{ background: 'none', border: '1px solid #374151', borderRadius: '0.4vw', padding: '0.3vh 0.5vw', cursor: 'pointer', color: '#9CA3AF', display: 'flex', alignItems: 'center' }}>
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: '1.8vh', color: '#F2EDE4', fontWeight: 600, minWidth: '8vw', textAlign: 'center' }}>{wkLabel}</span>
          <button onClick={() => onWeekChange(w => w + 1)}
            style={{ background: 'none', border: '1px solid #374151', borderRadius: '0.4vw', padding: '0.3vh 0.5vw', cursor: 'pointer', color: '#9CA3AF', display: 'flex', alignItems: 'center' }}>
            <ChevronRight size={16} />
          </button>
        </div>
        <button onClick={onExit}
          style={{ fontSize: '1.5vh', color: '#9CA3AF', padding: '0.4vh 1vw', border: '1px solid #4B5563', borderRadius: '0.4vw', background: 'none', cursor: 'pointer' }}>
          Exit Display
        </button>
      </div>

      {/* Column grid: schedule | [divider] | person... */}
      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: `1fr 2vw ${people.map(() => '1fr').join(' ')}`,
        gap: '0 0', padding: '0.6vw', overflow: 'hidden', minHeight: 0,
      }}>

        {/* ── Schedule column: 3 sections stacked ── */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingRight: '0.8vw' }}>
          {SECTION_ORDER.map((sectionKey, si) => {
            const sec = sections.find(s => s.key === sectionKey);
            const meta = SECTION_META[sectionKey] || {};
            const { label: secLabel, accent } = meta;
            return (
              <div key={sectionKey} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.3vh', overflow: 'hidden', paddingTop: si > 0 ? '2vh' : 0 }}>
                {si > 0 && <div style={{ height: '1px', background: '#2D3748', marginBottom: '1vh', flexShrink: 0 }} />}
                {/* Section header */}
                <div style={{
                  flexShrink: 0, borderRadius: '0.5vw', padding: '0.5vh 0.8vw',
                  background: `${accent}22`, border: `1px solid ${accent}44`,
                  display: 'flex', alignItems: 'center', gap: '0.5vw',
                }}>
                  <span style={{ fontSize: '1.9vh', fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{secLabel}</span>
                </div>
                {/* 5 day rows */}
                {DAYS.map(day => {
                  const isToday = day === todayDay;
                  const tasks = sec ? (sec.dayTasks[day] || []) : [];
                  return (
                    <div key={day} style={{
                      flex: 1, minHeight: 0, background: '#161b27', borderRadius: '0.4vw', padding: '0.3vh 0.4vw',
                      border: `1px solid ${isToday ? accent : '#2D3748'}`, overflow: 'hidden',
                      display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.4vw',
                    }}>
                      <span style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)', flexShrink: 0, fontSize: '1vh', fontWeight: 700, color: isToday ? accent : '#4B5563', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                        {DAY_SHORT[day]}
                      </span>
                      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                        {tasks.length === 0
                          ? <span style={{ color: '#374151', fontSize: '1.3vh' }}>—</span>
                          : <div style={{ fontSize: '1.5vh', color: '#E5E7EB', lineHeight: 1.35, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0 0.2vw' }}>
                              {tasks.map((task, i) => {
                                const { label, initials } = parseInitials(task);
                                const names = initials.length ? resolveInitials(initials, initialsMap) : null;
                                return (
                                  <Fragment key={i}>
                                    {i > 0 && <span style={{ color: '#6B7280', fontSize: '1.3vh', margin: '0 0.2vw' }}>·</span>}
                                    <span>
                                      {label}
                                      {names && <span style={{ fontSize: '1.2vh', marginLeft: '0.3vw', color: accent, fontWeight: 600 }}>{names}</span>}
                                    </span>
                                  </Fragment>
                                );
                              })}
                            </div>
                        }
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* ── Day labels strip ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4vh' }}>
          {/* Spacer matching person name header height (2.8vh avatar + 1vh padding) + one gap */}
          <div style={{ height: '4.2vh', flexShrink: 0 }} />
          {DAYS.map(day => {
            const isToday = day === todayDay;
            return (
              <div key={day} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <span style={{
                  writingMode: 'vertical-lr',
                  transform: 'rotate(180deg)',
                  fontSize: '1.3vh', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  whiteSpace: 'nowrap', userSelect: 'none',
                  color: isToday ? '#F05A28' : '#6B7280',
                }}>
                  {DAY_LABELS[day]}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── Person columns ── */}
        {people.map((person, pi) => {
          const personInitial = (reverseInitialsMap || {})[person.name] || person.name;
          return (
            <div key={person.name} style={{ display: 'flex', flexDirection: 'column', gap: '0.4vh', overflow: 'hidden', paddingLeft: pi === 0 ? '0.8vw' : '0', paddingRight: pi < people.length - 1 ? '0.4vw' : '0' }}>
              <div style={{ flexShrink: 0, background: '#1F2937', borderRadius: '0.5vw', padding: '0.5vh 0', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6vw' }}>
                <div style={{ width: '2.8vh', height: '2.8vh', borderRadius: '50%', background: '#F05A28', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4vh', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                  {person.name.charAt(0)}
                </div>
                <span style={{ fontSize: '2.2vh', fontWeight: 700, color: '#F2EDE4' }}>{person.name}</span>
              </div>
              {DAYS.map(day => {
                const isToday = day === todayDay;
                const tasks = person.dayTasks[day] || [];
                const brewPack = getBrewPackTasks(day, sections, personInitial);
                const hasAnything = tasks.length > 0 || brewPack.length > 0;
                return (
                  <div key={day} style={{
                    flex: 1, minHeight: 0, background: '#161b27', borderRadius: '0.5vw', padding: '0.5vh 0.6vw',
                    border: `1px solid ${isToday ? '#F05A28' : '#2D3748'}`, overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                  }}>
                    {!hasAnything
                      ? <span style={{ color: '#4B5563', fontSize: '1.4vh' }}>—</span>
                      : <AutoScaleContainer contentKey={`${person.name}-${day}-${weekStart}-${brewPack.length}-${tasks.length}`}>
                          {brewPack.map(({ task, sectionKey }, i) => {
                            const meta = SECTION_META[sectionKey] || {};
                            return (
                              <DisplayTaskItem key={i} text={task} day={day} accentColor={meta.accent} bgColor={meta.accent}
                                rowType="section" rowKey={sectionKey} {...sharedCheck} />
                            );
                          })}
                          {brewPack.length > 0 && tasks.length > 0 && (
                            <div style={{ height: '1px', background: '#2D3748', margin: '0.3vh 0' }} />
                          )}
                          {tasks.map((task, i) => (
                            <DisplayTaskItem key={i} text={task} day={day} accentColor="#F05A28"
                              rowType="person" rowKey={person.name} {...sharedCheck} />
                          ))}
                        </AutoScaleContainer>
                    }
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
function ProductionWeekly({ user, canUpload, onBack }) {
  const todayDay = getTodayDay();
  const defaultDay = DAYS.includes(todayDay) ? todayDay : 'monday';
  const [selectedDay, setSelectedDay] = useState(defaultDay);
  const [weekOffset, setWeekOffset] = useState(0);
  const [mobileTab, setMobileTab] = useState('people');
  const [showManage, setShowManage] = useState(false);
  const [showDisplay, setShowDisplay] = useState(false);
  const [sheetData, setSheetData] = useState(null);
  const [checksSet, setChecksSet] = useState(new Set());
  const [initialsMap, setInitialsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async (spinner = true) => {
    if (spinner) setLoading(true);
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
    }
  }, [weekOffset]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const handleVisibility = () => { if (document.visibilityState === 'visible') loadData(false); };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [loadData]);

  // Supabase realtime: sync checkbox changes made by others
  useEffect(() => {
    const ws = sheetData?.weekStart;
    if (!ws) return;
    const channel = supabase
      .channel(`prod-weekly-checks-${ws}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prod_weekly_checks' }, (payload) => {
        const r = payload.eventType === 'DELETE' ? payload.old : payload.new;
        if (!r?.week_start || r.week_start !== ws) return;
        const key = checkKey(r.week_start, r.row_type, r.row_key, r.day, r.task_text);
        setChecksSet(prev => {
          const next = new Set(prev);
          payload.eventType === 'INSERT' ? next.add(key) : next.delete(key);
          return next;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sheetData?.weekStart]);

  // 5-minute polling while display mode is active
  useEffect(() => {
    if (!showDisplay) return;
    const interval = setInterval(() => loadData(false), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [showDisplay, loadData]);

  const handleToggle = async (rowType, rowKey, day, taskText, currentlyChecked) => {
    const weekStart = sheetData?.weekStart;
    if (!weekStart) return;

    // For person tasks, find all people sharing the exact same task text on this day
    // so checking/unchecking one updates all of them together
    const targets = rowType === 'person'
      ? people
          .filter(p => (p.dayTasks[day] || []).includes(taskText))
          .map(p => ({ rowType, rowKey: p.name, day, taskText }))
      : [{ rowType, rowKey, day, taskText }];

    // Fall back to the original rowKey if no matches found in people list
    const entries = targets.length > 0 ? targets : [{ rowType, rowKey, day, taskText }];

    setChecksSet(prev => {
      const next = new Set(prev);
      entries.forEach(e => {
        const k = checkKey(weekStart, e.rowType, e.rowKey, e.day, e.taskText);
        currentlyChecked ? next.delete(k) : next.add(k);
      });
      return next;
    });

    try {
      await Promise.all(entries.map(e =>
        fetch(`${API}/api/prod-weekly/checks`, {
          method: currentlyChecked ? 'DELETE' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ week_start: weekStart, row_type: e.rowType, row_key: e.rowKey, day: e.day || null, task_text: e.taskText }),
        })
      ));
    } catch { loadData(false); }
  };

  const weekLabel = sheetData?.weekStart
    ? new Date(sheetData.weekStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '…';

  const sections  = sheetData?.sections || [];
  const people    = sheetData?.people   || [];
  const weekStart = sheetData?.weekStart;

  const reverseInitialsMap = Object.fromEntries(Object.entries(initialsMap).map(([k, v]) => [v, k]));
  const sharedProps = { weekStart, checksSet, onToggle: handleToggle, initialsMap, sections, reverseInitialsMap };

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
            onClick={() => { setWeekOffset(w => w - 1); setSelectedDay('monday'); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-gray-300 text-sm font-medium min-w-[110px] text-center">
            {weekOffset === 0 ? 'This Week' : weekOffset === 1 ? 'Next Week' : weekOffset === -1 ? 'Last Week' : `Week of ${weekLabel}`}
          </span>
          <button
            onClick={() => { setWeekOffset(w => w + 1); setSelectedDay('monday'); }}
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
          <button onClick={() => setShowDisplay(true)} className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 transition">
            <Maximize2 size={14} />
            Display
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
            { key: 'sections', label: 'Brews/Packaging' },
            { key: 'people',   label: 'People'          },
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
      {showDisplay && (
        <DisplayView
          sheetData={sheetData} checksSet={checksSet} onToggle={handleToggle}
          initialsMap={initialsMap} reverseInitialsMap={reverseInitialsMap}
          weekOffset={weekOffset} weekLabel={weekLabel}
          onWeekChange={setWeekOffset}
          onExit={() => setShowDisplay(false)}
        />
      )}
    </div>
  );
}

export default ProductionWeekly;
