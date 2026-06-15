import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

const API = process.env.REACT_APP_API_URL || '';

const ROLES = [
  'admin', 'bar_manager', 'bartender', 'barista',
  'coffee_manager', 'production', 'sales', 'hr',
  'kitchen_manager', 'cook',
];
const ROLE_LABELS = {
  admin: 'Admin', bar_manager: 'Bar Manager', bartender: 'Bartender',
  barista: 'Barista', coffee_manager: 'Coffee Manager',
  production: 'Production', sales: 'Sales', hr: 'HR',
  kitchen_manager: 'Kitchen Manager', cook: 'Cook',
};

const CATEGORIES = {
  opening:     { label: 'Opening',     color: '#22c55e' },
  midshift:    { label: 'Midshift',    color: '#06b6d4' },
  closing:     { label: 'Closing',     color: '#a855f7' },
  cleaning:    { label: 'Cleaning',    color: '#3b82f6' },
  maintenance: { label: 'Maintenance', color: '#eab308' },
  weekly:      { label: 'Weekly',      color: '#f97316' },
  monthly:     { label: 'Monthly',     color: '#ef4444' },
  other:       { label: 'Other',       color: '#6b7280' },
};

const LOCATIONS = [
  { key: 'midtown',    label: 'Midtown',    color: '#F05A28' },
  { key: 'northside',  label: 'Northside',  color: '#22c55e' },
  { key: 'power_mill', label: 'Power Mill', color: '#3b82f6' },
  { key: 'tampa',      label: 'Tampa',      color: '#a855f7' },
];

const FREQ_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getMonday(d) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}
function addDays(d, n) { const r = new Date(d); r.setDate(d.getDate() + n); return r; }
function fmtDate(d) { return d.toLocaleDateString('en-CA'); } // YYYY-MM-DD

function fmtRunDate(runDate, frequency) {
  if (!runDate) return '';
  const d = new Date(runDate + 'T12:00:00');
  if (frequency === 'weekly') {
    return 'Week of ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  if (frequency === 'monthly') {
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Run Modal ─────────────────────────────────────────────────────────────────
function RunModal({ checklist, onClose }) {
  const [checked, setChecked]               = useState({});
  const [overrides, setOverrides]           = useState([]);
  const [overrideChecked, setOvChecked]     = useState({});
  const [loading, setLoading]               = useState(true);
  const pendingRef = useRef(new Set());

  const todayStr = fmtDate(new Date());
  const items = checklist.items || [];
  const overrideItems = overrides.filter(o => o.type === 'item');
  const notes         = overrides.filter(o => o.type === 'note');
  const completedCount = items.filter(i => checked[i.id]).length + overrideItems.filter(o => overrideChecked[o.id]).length;
  const totalCount    = items.length + overrideItems.length;
  const progress      = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const cat           = CATEGORIES[checklist.category] || CATEGORIES.other;
  const displayName   = checklist.display_name || checklist.name;

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/checklists/${checklist.id}/today`, { credentials: 'include' }).then(r => r.json()),
      fetch(`${API}/api/checklists/${checklist.id}/overrides/${todayStr}`, { credentials: 'include' }).then(r => r.json()),
    ]).then(([checkedData, ovData]) => {
      setChecked(checkedData || {});
      const ov = Array.isArray(ovData) ? ovData : [];
      setOverrides(ov);
      const oc = {};
      ov.forEach(o => { if (o.checked) oc[o.id] = true; });
      setOvChecked(oc);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [checklist.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const channel = supabase
      .channel(`checklist-daily-${checklist.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'checklist_daily_state',
        filter: `checklist_id=eq.${checklist.id}`,
      }, payload => {
        const itemId = payload.eventType === 'DELETE' ? payload.old?.item_id : payload.new?.item_id;
        if (!itemId || pendingRef.current.has(itemId)) return;
        if (payload.eventType === 'INSERT') setChecked(p => ({ ...p, [itemId]: true }));
        else if (payload.eventType === 'DELETE') setChecked(p => { const n = { ...p }; delete n[itemId]; return n; });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [checklist.id]);

  const toggle = (id) => {
    const wasChecked = !!checked[id];
    setChecked(p => wasChecked ? (({ [id]: _, ...rest }) => rest)(p) : { ...p, [id]: true });
    pendingRef.current.add(id);
    const method = wasChecked ? 'DELETE' : 'POST';
    fetch(`${API}/api/checklists/${checklist.id}/items/${id}/check`, { method, credentials: 'include' })
      .finally(() => pendingRef.current.delete(id));
  };

  const toggleOverride = (id) => {
    const wasChecked = !!overrideChecked[id];
    setOvChecked(p => wasChecked ? (({ [id]: _, ...rest }) => rest)(p) : { ...p, [id]: true });
    const method = wasChecked ? 'DELETE' : 'POST';
    fetch(`${API}/api/checklists/day-overrides/${id}/check`, { method, credentials: 'include' });
  };

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center px-4">
      <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex-shrink-0">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs font-bold px-2 py-0.5 rounded text-white flex-shrink-0"
                style={{ backgroundColor: cat.color }}>{cat.label}</span>
              <h3 className="text-white font-semibold text-lg truncate">{displayName}</h3>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none ml-4 flex-shrink-0">×</button>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>{loading ? '…' : `${completedCount} of ${totalCount} complete`}</span>
              <span>{loading ? '' : `${Math.round(progress)}%`}</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-200"
                style={{ width: `${progress}%`, backgroundColor: progress >= 100 ? '#22c55e' : '#F05A28' }} />
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-2">
          {loading ? (
            <div className="text-gray-500 text-sm text-center py-8">Loading…</div>
          ) : (
            <div className="space-y-2">
              {/* Manager notes for today */}
              {notes.length > 0 && (
                <div className="mb-1">
                  <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1.5 px-1">Today's Notes</div>
                  {notes.map(note => (
                    <div key={note.id} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 mb-2">
                      <span className="text-blue-400 text-xs mt-0.5 flex-shrink-0">📋</span>
                      <span className="text-blue-100 text-sm leading-relaxed">{note.text}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Regular items */}
              {items.length === 0 && overrideItems.length === 0 && notes.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">No items in this checklist.</p>
              ) : (
                <>
                  {items.map(item => (
                    <label key={item.id}
                      className={`flex items-start gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors ${
                        checked[item.id]
                          ? 'bg-orange-500/10 border border-orange-500/20'
                          : 'bg-gray-700/50 border border-transparent hover:bg-gray-700'
                      }`}>
                      <input type="checkbox" checked={!!checked[item.id]} onChange={() => toggle(item.id)}
                        className="mt-0.5 accent-orange-500 w-4 h-4 flex-shrink-0" />
                      <span className={`text-sm transition-colors ${checked[item.id] ? 'text-gray-400 line-through' : 'text-white'}`}>
                        {item.text}
                      </span>
                    </label>
                  ))}

                  {/* Extra checkable items added for today */}
                  {overrideItems.length > 0 && (
                    <>
                      {items.length > 0 && <div className="border-t border-gray-700/60 my-1" />}
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 px-1">Additional Items</div>
                      {overrideItems.map(item => (
                        <label key={item.id}
                          className={`flex items-start gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors ${
                            overrideChecked[item.id]
                              ? 'bg-orange-500/10 border border-orange-500/20'
                              : 'bg-gray-700/50 border border-transparent hover:bg-gray-700'
                          }`}>
                          <input type="checkbox" checked={!!overrideChecked[item.id]} onChange={() => toggleOverride(item.id)}
                            className="mt-0.5 accent-orange-500 w-4 h-4 flex-shrink-0" />
                          <span className={`text-sm transition-colors ${overrideChecked[item.id] ? 'text-gray-400 line-through' : 'text-white'}`}>
                            {item.text}
                          </span>
                        </label>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-4 flex-shrink-0 border-t border-gray-700">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl text-white text-sm font-semibold transition"
            style={{ backgroundColor: '#F05A28' }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Checklist Card ────────────────────────────────────────────────────────────
function ChecklistCard({ checklist, onRun }) {
  const cat = CATEGORIES[checklist.category] || CATEGORIES.other;
  const itemCount = (checklist.items || []).length;
  const todayChecked = checklist.today_checked_count || 0;
  const todayProgress = itemCount > 0 ? (todayChecked / itemCount) * 100 : 0;
  const complete = itemCount > 0 && todayChecked >= itemCount;

  return (
    <button onClick={onRun}
      className="group bg-gray-800 rounded-2xl border border-gray-700 hover:border-orange-500 transition-all duration-200 text-left overflow-hidden flex flex-col hover:shadow-lg hover:shadow-orange-500/10 hover:-translate-y-0.5">
      <div className="h-1 w-full" style={{ backgroundColor: cat.color }} />
      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between">
          <span className="text-xs font-bold px-2 py-0.5 rounded tracking-wide text-white"
            style={{ backgroundColor: cat.color }}>{cat.label}</span>
          <span className="text-gray-600 text-xs">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
        </div>
        <p className="text-white font-semibold text-sm leading-snug group-hover:text-orange-400 transition-colors">
          {checklist.display_name || checklist.name}
        </p>
        {checklist.description && (
          <p className="text-gray-500 text-xs leading-relaxed line-clamp-2">{checklist.description}</p>
        )}

        {itemCount > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className={complete ? 'text-green-400 font-semibold' : 'text-gray-500'}>
                {complete ? '✓ Complete' : `${todayChecked}/${itemCount} today`}
              </span>
              <span className="text-gray-600">{Math.round(todayProgress)}%</span>
            </div>
            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300"
                style={{ width: `${todayProgress}%`, backgroundColor: complete ? '#22c55e' : '#F05A28' }} />
            </div>
          </div>
        )}

        <div className="mt-auto pt-2 border-t border-gray-700/50 flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {(checklist.roles || []).slice(0, 3).map(r => (
              <span key={r} className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                {ROLE_LABELS[r] || r}
              </span>
            ))}
            {(checklist.roles || []).length > 3 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                +{checklist.roles.length - 3}
              </span>
            )}
          </div>
          <span className="text-orange-500 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
            Run →
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Checklist Modal (create / edit) ───────────────────────────────────────────
function ChecklistModal({ checklist, checklists, onClose, onSaved }) {
  const isEdit = !!checklist;
  const [name, setName]           = useState(checklist?.name || '');
  const [displayName, setDispName]= useState(checklist?.display_name || '');
  const [category, setCategory]   = useState(checklist?.category || 'other');
  const [description, setDesc]    = useState(checklist?.description || '');
  const [frequency, setFreq]      = useState(checklist?.frequency || 'daily');
  const [loc, setLoc]             = useState(checklist?.location || 'all');
  const [roles, setRoles]       = useState(checklist?.roles || []);
  const [items, setItems]       = useState((checklist?.items || []).map(i => ({ text: i.text })));
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [pickerIdx, setPickerIdx]     = useState(null);
  const [pickerTarget, setPickerTarget] = useState('');
  const [pickerSaving, setPickerSaving] = useState(false);

  const otherChecklists = (checklists || []).filter(c => c.id !== checklist?.id);

  const toggleRole = r => setRoles(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r]);
  const allSelected = ROLES.every(r => roles.includes(r));

  const addItem    = () => setItems(p => [...p, { text: '' }]);
  const removeItem = i => { setItems(p => p.filter((_, idx) => idx !== i)); setPickerIdx(null); };
  const updateItem = (i, val) => setItems(p => p.map((item, idx) => idx === i ? { text: val } : item));
  const moveItem   = (i, dir) => {
    const next = [...items];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };

  const openPicker = (i) => {
    if (pickerIdx === i) { setPickerIdx(null); return; }
    setPickerIdx(i);
    setPickerTarget('');
  };

  const handleTransfer = async (type) => {
    if (!pickerTarget || pickerSaving) return;
    setPickerSaving(true);
    await fetch(`${API}/api/checklists/${pickerTarget}/add-item`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: items[pickerIdx].text }),
    });
    if (type === 'move') setItems(p => p.filter((_, idx) => idx !== pickerIdx));
    setPickerIdx(null);
    setPickerSaving(false);
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!roles.length) { setError('Select at least one role.'); return; }
    setSaving(true); setError('');
    const validItems = items.filter(i => i.text.trim());
    const body = { name: name.trim(), display_name: displayName.trim() || null, category, description: description.trim(), frequency, location: loc, roles, items: validItems };
    const url = isEdit ? `${API}/api/checklists/${checklist.id}` : `${API}/api/checklists`;
    const res = await fetch(url, {
      method: isEdit ? 'PATCH' : 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.message || 'Save failed.'); setSaving(false); return;
    }
    onSaved(); onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center px-4">
      <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="px-6 pt-6 pb-2 flex-shrink-0">
          <h3 className="text-white font-semibold text-lg">{isEdit ? 'Edit Checklist' : 'New Checklist'}</h3>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-sm">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 text-sm mb-1.5">Internal Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Opening – Bar Staff"
                className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1.5">Display Name <span className="text-gray-600">(staff sees)</span></label>
              <input value={displayName} onChange={e => setDispName(e.target.value)} placeholder="e.g. Opening"
                className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 text-sm mb-1.5">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                {Object.entries(CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1.5">Location</label>
              <select value={loc} onChange={e => setLoc(e.target.value)}
                className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="all">All Locations</option>
                {LOCATIONS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 text-sm mb-1.5">Save History</label>
              <select value={frequency} onChange={e => setFreq(e.target.value)}
                className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1.5">Description <span className="text-gray-600">(optional)</span></label>
              <input value={description} onChange={e => setDesc(e.target.value)} placeholder="Brief description..."
                className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-gray-400 text-sm">Visible to</label>
              <button onClick={() => setRoles(allSelected ? [] : [...ROLES])}
                className="text-xs text-orange-400 hover:text-orange-300 transition">
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map(role => (
                <label key={role} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)}
                    className="accent-orange-500" />
                  <span className="text-gray-300 text-sm">{ROLE_LABELS[role]}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-2">Items</label>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => moveItem(i, -1)} disabled={i === 0}
                        className="text-gray-500 hover:text-white disabled:opacity-20 text-xs leading-none transition">▲</button>
                      <button onClick={() => moveItem(i, 1)} disabled={i === items.length - 1}
                        className="text-gray-500 hover:text-white disabled:opacity-20 text-xs leading-none transition">▼</button>
                    </div>
                    <input value={item.text} onChange={e => updateItem(i, e.target.value)}
                      placeholder={`Item ${i + 1}`}
                      className="flex-1 bg-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-500" />
                    {otherChecklists.length > 0 && item.text.trim() && (
                      <button onClick={() => openPicker(i)} title="Move or copy to another checklist"
                        className={`text-sm px-1 leading-none transition ${pickerIdx === i ? 'text-orange-400' : 'text-gray-500 hover:text-orange-400'}`}>
                        →
                      </button>
                    )}
                    <button onClick={() => removeItem(i)}
                      className="text-gray-600 hover:text-red-400 transition text-xl leading-none">×</button>
                  </div>
                  {pickerIdx === i && (
                    <div className="ml-8 mt-1.5 flex items-center gap-2 bg-gray-900/60 border border-gray-600 rounded-lg px-3 py-2">
                      <select value={pickerTarget} onChange={e => setPickerTarget(e.target.value)}
                        className="flex-1 bg-gray-700 text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500">
                        <option value="">Select checklist…</option>
                        {otherChecklists.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <button onClick={() => handleTransfer('copy')} disabled={!pickerTarget || pickerSaving}
                        className="text-xs px-2.5 py-1.5 rounded bg-gray-600 hover:bg-gray-500 text-gray-200 disabled:opacity-40 transition whitespace-nowrap">
                        {pickerSaving ? '…' : 'Copy'}
                      </button>
                      <button onClick={() => handleTransfer('move')} disabled={!pickerTarget || pickerSaving}
                        className="text-xs px-2.5 py-1.5 rounded text-white disabled:opacity-40 transition whitespace-nowrap"
                        style={{ backgroundColor: '#F05A28' }}>
                        {pickerSaving ? '…' : 'Move'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <button onClick={addItem}
                className="w-full py-2 rounded-lg border border-dashed border-gray-600 text-gray-400 text-sm hover:border-gray-500 hover:text-gray-300 transition">
                + Add Item
              </button>
            </div>
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
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Checklist'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Location Landing Page ─────────────────────────────────────────────────────
function LocationLanding({ checklists, locationRoles, user, canUpload, onSelect }) {
  const isPrivileged = canUpload || (user?.role === 'admin');
  const userRoles = user?.roles || (user?.role ? [user.role] : []);

  const visibleLocations = LOCATIONS.filter(loc => {
    if (isPrivileged) return true;
    const allowed = locationRoles[loc.key];
    if (!allowed || allowed.length === 0) return true;
    return userRoles.some(r => allowed.includes(r));
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
      {visibleLocations.map(loc => {
        const count = checklists.filter(c => c.location === loc.key || c.location === 'all').length;
        return (
          <button key={loc.key} onClick={() => onSelect(loc.key)}
            className="group bg-gray-800 rounded-2xl border border-gray-700 hover:border-orange-500 transition-all duration-200 overflow-hidden hover:shadow-lg hover:shadow-orange-500/10 hover:-translate-y-0.5 text-left">
            <div className="h-2 w-full" style={{ backgroundColor: loc.color }} />
            <div className="p-8 flex flex-col gap-3">
              <h3 className="text-white text-2xl font-bold group-hover:text-orange-400 transition-colors">
                {loc.label}
              </h3>
              <p className="text-gray-500 text-sm">{count} {count === 1 ? 'checklist' : 'checklists'}</p>
              <span className="text-orange-500 text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity mt-2">
                View Checklists →
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Location Access (Manage) ──────────────────────────────────────────────────
function LocationAccessSection({ locationRoles, onSaved }) {
  const [localRoles, setLocalRoles] = useState(() => {
    const init = {};
    LOCATIONS.forEach(l => { init[l.key] = locationRoles[l.key] || []; });
    return init;
  });
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    const init = {};
    LOCATIONS.forEach(l => { init[l.key] = locationRoles[l.key] || []; });
    setLocalRoles(init);
  }, [locationRoles]);

  const toggle = (locKey, role) => {
    setLocalRoles(p => ({
      ...p,
      [locKey]: p[locKey].includes(role) ? p[locKey].filter(r => r !== role) : [...p[locKey], role],
    }));
  };

  const save = async (locKey) => {
    setSaving(locKey);
    await fetch(`${API}/api/checklists/location-roles/${locKey}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles: localRoles[locKey] }),
    });
    setSaving(null);
    setSaved(locKey);
    setTimeout(() => setSaved(null), 2000);
    onSaved();
  };

  return (
    <div className="mt-8">
      <h3 className="text-white font-semibold text-lg mb-1">Location Access</h3>
      <p className="text-gray-500 text-sm mb-4">
        Restrict which roles can see each location on the landing page. If no roles are selected, the location is visible to everyone.
      </p>
      <div className="space-y-4">
        {LOCATIONS.map(loc => (
          <div key={loc.key} className="bg-gray-800 rounded-xl border border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: loc.color }} />
                <h4 className="text-white font-semibold">{loc.label}</h4>
                {localRoles[loc.key].length === 0 && (
                  <span className="text-xs text-gray-500 italic">visible to all</span>
                )}
              </div>
              <button onClick={() => save(loc.key)} disabled={saving === loc.key}
                className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold transition disabled:opacity-50"
                style={{ backgroundColor: saved === loc.key ? '#22c55e' : '#F05A28' }}>
                {saving === loc.key ? 'Saving…' : saved === loc.key ? 'Saved ✓' : 'Save'}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ROLES.map(role => (
                <label key={role} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={localRoles[loc.key].includes(role)}
                    onChange={() => toggle(loc.key, role)} className="accent-orange-500" />
                  <span className="text-gray-300 text-sm">{ROLE_LABELS[role]}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Day Detail Panel ─────────────────────────────────────────────────────────
function DayDetail({ date, checklists, dayOverrides, canUpload, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ checklist_id: '', type: 'item', text: '' });
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(null);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dateObj = new Date(date + 'T12:00:00');
  const isPast = dateObj < today;

  const displayDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Reset form when date changes
  useEffect(() => { setShowForm(false); setForm({ checklist_id: '', type: 'item', text: '' }); }, [date]);

  const byChecklist = {};
  for (const o of dayOverrides) {
    if (!byChecklist[o.checklist_id]) byChecklist[o.checklist_id] = { name: o.checklist_name, items: [] };
    byChecklist[o.checklist_id].items.push(o);
  }

  const submit = async () => {
    if (!form.checklist_id || !form.text.trim()) return;
    setSaving(true);
    await fetch(`${API}/api/checklists/day-overrides`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklist_id: parseInt(form.checklist_id), override_date: date, type: form.type, text: form.text.trim() }),
    });
    setForm({ checklist_id: '', type: 'item', text: '' });
    setShowForm(false);
    setSaving(false);
    onRefresh();
  };

  const remove = async (id) => {
    setDeleting(id);
    await fetch(`${API}/api/checklists/day-overrides/${id}`, { method: 'DELETE', credentials: 'include' });
    setDeleting(null);
    onRefresh();
  };

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-white font-semibold">{displayDate}</h3>
          {isPast && <span className="text-xs text-gray-600 mt-0.5 block">Past date — view only</span>}
        </div>
        {canUpload && !isPast && (
          <button onClick={() => setShowForm(p => !p)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition flex-shrink-0 ${
              showForm ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'text-white hover:opacity-90'
            }`}
            style={showForm ? {} : { backgroundColor: '#F05A28' }}>
            {showForm ? 'Cancel' : '+ Add'}
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-4 bg-gray-700/50 rounded-xl p-4 space-y-3 border border-gray-600">
          <div>
            <label className="block text-gray-400 text-xs mb-1.5">Checklist</label>
            <select value={form.checklist_id} onChange={e => setForm(p => ({ ...p, checklist_id: e.target.value }))}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-500">
              <option value="">Select a checklist…</option>
              {checklists.map(cl => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1.5">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ v: 'item', label: '☑ Checkable Item' }, { v: 'note', label: '📋 Note' }].map(({ v, label }) => (
                <button key={v} onClick={() => setForm(p => ({ ...p, type: v }))}
                  className={`py-2 rounded-lg text-sm font-semibold transition ${
                    form.type === v ? 'text-white' : 'bg-gray-700 text-gray-400 hover:text-white'
                  }`}
                  style={form.type === v ? { backgroundColor: '#F05A28' } : {}}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1.5">
              {form.type === 'note' ? 'Note text' : 'Task text'}
            </label>
            <textarea value={form.text} onChange={e => setForm(p => ({ ...p, text: e.target.value }))}
              rows={2}
              placeholder={form.type === 'note' ? 'Write a note for staff…' : 'Enter task to complete…'}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none" />
          </div>
          <button onClick={submit} disabled={saving || !form.checklist_id || !form.text.trim()}
            className="w-full py-2 rounded-lg text-white text-sm font-semibold transition disabled:opacity-40"
            style={{ backgroundColor: '#F05A28' }}>
            {saving ? 'Adding…' : 'Add to Checklist'}
          </button>
        </div>
      )}

      {Object.keys(byChecklist).length === 0 ? (
        <div className="text-center py-10 text-gray-600 text-sm">
          {isPast ? 'No items were scheduled for this day.' : 'No items scheduled yet.'}
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(byChecklist).map(([clId, { name, items }]) => (
            <div key={clId}>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider pb-1.5 mb-2 border-b border-gray-700">
                {name}
              </div>
              <div className="space-y-1.5">
                {items.map(item => (
                  <div key={item.id}
                    className={`flex items-start gap-3 px-3 py-2.5 rounded-lg ${
                      item.type === 'note'
                        ? 'bg-blue-500/10 border border-blue-500/20'
                        : 'bg-gray-700/40 border border-gray-600/40'
                    }`}>
                    <span className="text-xs mt-0.5 flex-shrink-0">
                      {item.type === 'note' ? '📋' : '☑'}
                    </span>
                    <span className={`text-sm flex-1 leading-relaxed ${item.type === 'note' ? 'text-blue-100' : 'text-gray-200'}`}>
                      {item.text}
                    </span>
                    {canUpload && (
                      <button onClick={() => remove(item.id)} disabled={deleting === item.id}
                        className="text-gray-600 hover:text-red-400 transition text-lg leading-none flex-shrink-0">
                        {deleting === item.id ? '…' : '×'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Schedule Tab ──────────────────────────────────────────────────────────────
function ScheduleTab({ checklists, canUpload }) {
  const [overrides, setOverrides]       = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [loading, setLoading]           = useState(true);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weekStart = getMonday(today);
  const rangeStart = fmtDate(weekStart);
  const rangeEnd   = fmtDate(addDays(weekStart, 20));
  const todayStr   = fmtDate(today);

  const loadOverrides = async () => {
    try {
      const res = await fetch(`${API}/api/checklists/day-overrides?start=${rangeStart}&end=${rangeEnd}`, { credentials: 'include' });
      const data = await res.json();
      setOverrides(Array.isArray(data) ? data : []);
    } catch (e) {}
    setLoading(false);
  };

  useEffect(() => { loadOverrides(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const overridesByDate = {};
  for (const o of overrides) {
    const key = String(o.override_date).slice(0, 10);
    if (!overridesByDate[key]) overridesByDate[key] = [];
    overridesByDate[key].push(o);
  }

  const days = Array.from({ length: 21 }, (_, i) => {
    const d = addDays(weekStart, i);
    return { date: fmtDate(d), dayOfMonth: d.getDate(), isToday: fmtDate(d) === todayStr, isPast: d < today };
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* 3-week calendar */}
      <div className="lg:col-span-3">
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
          <h3 className="text-white font-semibold mb-4">3-Week View</h3>
          {loading ? (
            <div className="text-gray-500 text-sm">Loading…</div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {DAY_NAMES.map(d => (
                  <div key={d} className="text-center text-xs text-gray-500 font-semibold py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map(({ date, dayOfMonth, isToday, isPast }) => {
                  const dayOvs = overridesByDate[date] || [];
                  const isSelected = date === selectedDate;
                  const hasNotes = dayOvs.some(o => o.type === 'note');
                  const hasItems = dayOvs.some(o => o.type === 'item');
                  return (
                    <button key={date} onClick={() => setSelectedDate(date)}
                      className={`relative flex flex-col items-center justify-center rounded-xl py-2.5 text-sm font-semibold transition
                        ${isSelected ? 'ring-2 ring-orange-500 bg-orange-500/10 text-orange-400' : ''}
                        ${isToday && !isSelected ? 'bg-orange-500/20 text-orange-400' : ''}
                        ${isPast && !isToday && !isSelected ? 'text-gray-600 hover:bg-gray-700/30' : ''}
                        ${!isPast && !isToday && !isSelected ? 'text-gray-300 hover:bg-gray-700/50' : ''}
                      `}>
                      <span>{dayOfMonth}</span>
                      {(hasNotes || hasItems) && (
                        <div className="flex gap-0.5 mt-1">
                          {hasNotes && <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                          {hasItems && <div className="w-1.5 h-1.5 rounded-full bg-green-400" />}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-5 mt-4 pt-3 border-t border-gray-700">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <div className="w-2 h-2 rounded-full bg-blue-400" /> Note
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <div className="w-2 h-2 rounded-full bg-green-400" /> Checkable item
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Day detail */}
      <div className="lg:col-span-2">
        {selectedDate ? (
          <DayDetail
            date={selectedDate}
            checklists={checklists}
            dayOverrides={overridesByDate[selectedDate] || []}
            canUpload={canUpload}
            onRefresh={loadOverrides}
          />
        ) : (
          <div className="bg-gray-800 rounded-xl border border-gray-700 flex items-center justify-center min-h-48">
            <p className="text-gray-600 text-sm text-center px-6">Select a day to view or schedule items</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Notification Settings (Manage) ───────────────────────────────────────────
function NotificationSettingsSection({ checklists }) {
  const [config, setConfig]         = useState({ send_hour: 22 });
  const [subscriptions, setSubs]    = useState([]);
  const [loading, setLoading]       = useState(true);
  const [savingCfg, setSavingCfg]   = useState(false);
  const [savedCfg, setSavedCfg]     = useState(false);
  const [savingSubs, setSavingSubs] = useState(false);
  const [savedSubs, setSavedSubs]   = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/checklists/notification-config`, { credentials: 'include' }).then(r => r.json()),
      fetch(`${API}/api/checklists/notification-subscriptions`, { credentials: 'include' }).then(r => r.json()),
    ]).then(([cfg, subs]) => {
      setConfig(cfg || { send_hour: 22 });
      setSubs(Array.isArray(subs) ? subs : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const isSubscribed = id => subscriptions.some(s => s.checklist_id === id);
  const getThreshold = id => subscriptions.find(s => s.checklist_id === id)?.threshold ?? 1;

  const toggleSub = id => {
    if (isSubscribed(id)) {
      setSubs(p => p.filter(s => s.checklist_id !== id));
    } else {
      setSubs(p => [...p, { checklist_id: id, threshold: 1 }]);
    }
  };

  const setThreshold = (id, val) =>
    setSubs(p => p.map(s => s.checklist_id === id ? { ...s, threshold: val } : s));

  const saveConfig = async () => {
    setSavingCfg(true);
    await fetch(`${API}/api/checklists/notification-config`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ send_hour: config.send_hour }),
    });
    setSavingCfg(false); setSavedCfg(true);
    setTimeout(() => setSavedCfg(false), 2000);
  };

  const saveSubs = async () => {
    setSavingSubs(true);
    await fetch(`${API}/api/checklists/notification-subscriptions`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptions }),
    });
    setSavingSubs(false); setSavedSubs(true);
    setTimeout(() => setSavedSubs(false), 2000);
  };

  const fmtHour = h => {
    if (h === 0) return '12:00 AM';
    if (h < 12) return `${h}:00 AM`;
    if (h === 12) return '12:00 PM';
    return `${h - 12}:00 PM`;
  };

  return (
    <div className="mt-8">
      <h3 className="text-white font-semibold text-lg mb-1">Notification Settings</h3>
      <p className="text-gray-500 text-sm mb-5">
        Receive an email when checklists have incomplete items. Each manager configures their own subscriptions independently.
      </p>

      {/* Send time */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h4 className="text-white font-semibold mb-0.5">Daily Send Time</h4>
            <p className="text-gray-500 text-sm">Emails go out once per day at this time (Eastern Time).</p>
          </div>
          <div className="flex items-center gap-3">
            <select value={config.send_hour}
              onChange={e => setConfig(p => ({ ...p, send_hour: parseInt(e.target.value) }))}
              className="bg-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{fmtHour(i)}</option>
              ))}
            </select>
            <button onClick={saveConfig} disabled={savingCfg}
              className="px-3 py-2 rounded-lg text-white text-sm font-semibold transition disabled:opacity-50"
              style={{ backgroundColor: savedCfg ? '#22c55e' : '#F05A28' }}>
              {savingCfg ? 'Saving…' : savedCfg ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Subscriptions */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h4 className="text-white font-semibold mb-0.5">My Subscriptions</h4>
            <p className="text-gray-500 text-sm">
              Select checklists to watch. Set threshold to 0 to always notify, or higher to only notify when that many items are still incomplete.
            </p>
          </div>
          <button onClick={saveSubs} disabled={savingSubs}
            className="px-3 py-2 rounded-lg text-white text-sm font-semibold transition disabled:opacity-50 flex-shrink-0"
            style={{ backgroundColor: savedSubs ? '#22c55e' : '#F05A28' }}>
            {savingSubs ? 'Saving…' : savedSubs ? 'Saved ✓' : 'Save Subscriptions'}
          </button>
        </div>
        {loading ? (
          <div className="text-gray-500 text-sm">Loading…</div>
        ) : checklists.length === 0 ? (
          <div className="text-gray-500 text-sm">No checklists available.</div>
        ) : (
          <div className="space-y-2">
            {checklists.map(cl => {
              const subscribed = isSubscribed(cl.id);
              const threshold = getThreshold(cl.id);
              const cat = CATEGORIES[cl.category] || CATEGORIES.other;
              return (
                <div key={cl.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition ${
                    subscribed ? 'bg-orange-500/5 border-orange-500/20' : 'bg-gray-700/30 border-transparent'
                  }`}>
                  <input type="checkbox" checked={subscribed} onChange={() => toggleSub(cl.id)}
                    className="accent-orange-500 w-4 h-4 flex-shrink-0" />
                  <span className="text-xs font-bold px-2 py-0.5 rounded text-white flex-shrink-0"
                    style={{ backgroundColor: cat.color }}>{cat.label}</span>
                  <span className={`text-sm flex-1 min-w-0 truncate ${subscribed ? 'text-white' : 'text-gray-400'}`}>
                    {cl.name}
                  </span>
                  {subscribed && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-gray-500 text-xs hidden sm:inline">notify if ≥</span>
                      <input type="number" min="0" value={threshold}
                        onChange={e => setThreshold(cl.id, Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-14 bg-gray-700 text-white text-center px-2 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-500" />
                      <span className="text-gray-500 text-xs hidden sm:inline">incomplete</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Checklists({ user, canUpload, onBack }) {
  const [checklists, setChecklists]     = useState([]);
  const [runs, setRuns]                 = useState([]);
  const [locationRoles, setLocationRoles] = useState({});
  const [tab, setTab]                   = useState('checklists');
  const [location, setLocation]         = useState(null); // null = landing
  const [running, setRunning]           = useState(null);
  const [editing, setEditing]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [manageFilterLoc, setManageFilterLoc]   = useState('');
  const [manageFilterRole, setManageFilterRole] = useState('');

  const fetchAll = async () => {
    const [clRes, runRes, lrRes] = await Promise.all([
      fetch(`${API}/api/checklists`, { credentials: 'include' }),
      fetch(`${API}/api/checklists/runs`, { credentials: 'include' }),
      fetch(`${API}/api/checklists/location-roles`, { credentials: 'include' }),
    ]);
    const [clData, runData, lrData] = await Promise.all([clRes.json(), runRes.json(), lrRes.json()]);
    setChecklists(Array.isArray(clData) ? clData : []);
    setRuns(Array.isArray(runData) ? runData : []);
    setLocationRoles(lrData && typeof lrData === 'object' ? lrData : {});
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleDeleteChecklist = async id => {
    if (!window.confirm('Delete this checklist and all its run history?')) return;
    await fetch(`${API}/api/checklists/${id}`, { method: 'DELETE', credentials: 'include' });
    setChecklists(p => p.filter(c => c.id !== id));
    setRuns(p => p.filter(r => r.checklist_id !== id));
  };

  const handleDeleteRun = async id => {
    await fetch(`${API}/api/checklists/runs/${id}`, { method: 'DELETE', credentials: 'include' });
    setRuns(p => p.filter(r => r.id !== id));
  };

  const moveChecklist = async (id, direction) => {
    const index = checklists.findIndex(c => c.id === id);
    if (index === -1) return;
    const next = [...checklists];
    const j = index + direction;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setChecklists(next);
    await fetch(`${API}/api/checklists/reorder`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: next.map(c => c.id) }),
    });
  };

  const manageFiltered = checklists
    .filter(cl => !manageFilterLoc || cl.location === manageFilterLoc)
    .filter(cl => !manageFilterRole || (cl.roles || []).includes(manageFilterRole));
  const manageHasFilter = !!(manageFilterLoc || manageFilterRole);

  const tabs = ['checklists', 'history', ...(canUpload ? ['schedule', 'manage'] : [])];
  const locLabel = location ? LOCATIONS.find(l => l.key === location)?.label : '';
  const filtered = location
    ? checklists.filter(c => c.location === location || c.location === 'all')
    : checklists;

  const pageTitle = location ? `${locLabel} Checklists` : 'Checklists';

  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition">
          <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-xl">HQ</span>
        </button>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition">
          ← Back to Dashboard
        </button>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between mb-8">
          <div>
            {location && (
              <button onClick={() => setLocation(null)}
                className="text-sm text-gray-500 hover:text-orange-400 transition mb-2 flex items-center gap-1">
                ← All Locations
              </button>
            )}
            <h2 className="text-cream text-4xl font-bold">{pageTitle}</h2>
            <p className="text-gray-400 mt-2">Operational checklists for your team</p>
          </div>
          {location && (
            <div className="flex gap-2 bg-gray-800 p-1 rounded-lg border border-gray-700">
              {tabs.map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-1.5 rounded-md text-sm font-semibold transition capitalize ${
                    tab === t ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                  }`}>
                  {t === 'checklists' ? 'Checklists' : t === 'history' ? 'History' : t === 'schedule' ? 'Schedule' : 'Manage'}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-gray-500 text-sm">Loading…</div>
        ) : !location ? (
          <LocationLanding checklists={checklists} locationRoles={locationRoles} user={user} canUpload={canUpload} onSelect={key => { setLocation(key); setTab('checklists'); }} />
        ) : tab === 'checklists' ? (
          filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-600 text-sm">
              No checklists available for {locLabel}.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(cl => (
                <ChecklistCard key={cl.id} checklist={cl} onRun={() => setRunning(cl)} />
              ))}
            </div>
          )
        ) : tab === 'history' ? (
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            {runs.length === 0 ? (
              <div className="py-16 text-center text-gray-500 text-sm">No history recorded yet.</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Checklist</th>
                    <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4 hidden sm:table-cell">Saved By</th>
                    <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4 hidden md:table-cell">Period</th>
                    <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4">Items</th>
                    {canUpload && <th className="px-4 py-4" />}
                  </tr>
                </thead>
                <tbody>
                  {runs.map(run => {
                    const full = run.items_total > 0 && run.items_completed === run.items_total;
                    return (
                      <tr key={run.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/20 transition">
                        <td className="px-6 py-3.5">
                          <div className="text-white text-sm font-medium">{run.checklist_name}</div>
                          {run.auto_saved && (
                            <span className="text-xs text-gray-500">auto-saved · {FREQ_LABELS[run.frequency] || 'Daily'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-gray-300 text-sm hidden sm:table-cell">
                          {run.auto_saved ? <span className="text-gray-500 italic">—</span> : run.run_by_name}
                        </td>
                        <td className="px-4 py-3.5 text-gray-400 text-sm hidden md:table-cell">
                          {fmtRunDate(run.run_date, run.frequency)}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`text-sm font-semibold ${full ? 'text-green-400' : 'text-orange-400'}`}>
                            {run.items_completed}/{run.items_total}
                          </span>
                        </td>
                        {canUpload && (
                          <td className="px-4 py-3.5 text-right">
                            <button onClick={() => handleDeleteRun(run.id)}
                              className="text-sm text-red-500 hover:text-red-400 transition">Delete</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : tab === 'schedule' ? (
          <ScheduleTab checklists={checklists} canUpload={canUpload} />
        ) : (
          /* Manage tab */
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex flex-wrap gap-2 flex-1">
                <select value={manageFilterLoc} onChange={e => setManageFilterLoc(e.target.value)}
                  className="bg-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                  <option value="">All Locations</option>
                  <option value="all">Visible Everywhere</option>
                  {LOCATIONS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                </select>
                <select value={manageFilterRole} onChange={e => setManageFilterRole(e.target.value)}
                  className="bg-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                  <option value="">Any Role</option>
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                {manageHasFilter && (
                  <button onClick={() => { setManageFilterLoc(''); setManageFilterRole(''); }}
                    className="px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white border border-gray-600 hover:border-gray-500 transition">
                    Clear
                  </button>
                )}
                {manageHasFilter && (
                  <span className="self-center text-sm text-gray-500">
                    {manageFiltered.length} of {checklists.length}
                  </span>
                )}
              </div>
              <button onClick={() => setEditing('new')}
                className="px-4 py-2 rounded-xl text-white text-sm font-semibold transition hover:opacity-90"
                style={{ backgroundColor: '#F05A28' }}>
                + New Checklist
              </button>
            </div>
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              {checklists.length === 0 ? (
                <div className="py-16 text-center text-gray-500 text-sm">No checklists yet.</div>
              ) : manageFiltered.length === 0 ? (
                <div className="py-16 text-center text-gray-500 text-sm">No checklists match the selected filters.</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Order</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Name</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4 hidden sm:table-cell">Category</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4 hidden md:table-cell">Location</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4 hidden lg:table-cell">History</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4 hidden lg:table-cell">Visible To</th>
                      <th className="px-4 py-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {manageFiltered.map(cl => {
                      const globalIndex = checklists.findIndex(c => c.id === cl.id);
                      const cat = CATEGORIES[cl.category] || CATEGORIES.other;
                      const locInfo = LOCATIONS.find(l => l.key === cl.location);
                      return (
                        <tr key={cl.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/20 transition">
                          <td className="px-6 py-3.5">
                            <div className="flex flex-col gap-1">
                              <button onClick={() => moveChecklist(cl.id, -1)} disabled={globalIndex === 0}
                                className="text-gray-500 hover:text-white disabled:opacity-20 transition text-xs leading-none">▲</button>
                              <button onClick={() => moveChecklist(cl.id, 1)} disabled={globalIndex === checklists.length - 1}
                                className="text-gray-500 hover:text-white disabled:opacity-20 transition text-xs leading-none">▼</button>
                            </div>
                          </td>
                          <td className="px-6 py-3.5">
                            <div className="text-white text-sm font-medium">{cl.name}</div>
                            {cl.display_name && (
                              <div className="text-gray-500 text-xs mt-0.5">Shows as: {cl.display_name}</div>
                            )}
                          </td>
                          <td className="px-4 py-3.5 hidden sm:table-cell">
                            <span className="text-xs font-bold px-2 py-0.5 rounded text-white"
                              style={{ backgroundColor: cat.color }}>{cat.label}</span>
                          </td>
                          <td className="px-4 py-3.5 hidden md:table-cell">
                            {cl.location === 'all' ? (
                              <span className="text-xs text-gray-500">All Locations</span>
                            ) : (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded text-white"
                                style={{ backgroundColor: locInfo?.color || '#6b7280' }}>
                                {locInfo?.label || cl.location}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-gray-400 text-xs hidden lg:table-cell">
                            {FREQ_LABELS[cl.frequency] || 'Daily'}
                          </td>
                          <td className="px-4 py-3.5 hidden lg:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {(cl.roles || []).map(r => (
                                <span key={r} className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">
                                  {ROLE_LABELS[r]}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3 justify-end">
                              <button onClick={() => setEditing(cl)}
                                className="text-sm text-gray-400 hover:text-white transition">Edit</button>
                              <button onClick={() => handleDeleteChecklist(cl.id)}
                                className="text-sm text-red-500 hover:text-red-400 transition">Delete</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <LocationAccessSection locationRoles={locationRoles} onSaved={fetchAll} />
            <NotificationSettingsSection checklists={checklists} />
          </div>
        )}
      </main>

      {running && (
        <RunModal checklist={running} onClose={() => { setRunning(null); fetchAll(); }} />
      )}
      {editing && (
        <ChecklistModal
          checklist={editing === 'new' ? null : editing}
          checklists={checklists}
          onClose={() => setEditing(null)}
          onSaved={fetchAll}
        />
      )}
    </div>
  );
}
