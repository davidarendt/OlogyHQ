import { useState, useEffect } from 'react';

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
  closing:     { label: 'Closing',     color: '#a855f7' },
  cleaning:    { label: 'Cleaning',    color: '#3b82f6' },
  maintenance: { label: 'Maintenance', color: '#eab308' },
  weekly:      { label: 'Weekly',      color: '#f97316' },
  monthly:     { label: 'Monthly',     color: '#ef4444' },
  other:       { label: 'Other',       color: '#6b7280' },
};

const CAT_FILTERS = [
  { key: 'all', label: 'All', color: '#6b7280' },
  ...Object.entries(CATEGORIES).map(([k, v]) => ({ key: k, label: v.label, color: v.color })),
];

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Run Modal ─────────────────────────────────────────────────────────────────
function RunModal({ checklist, onClose, onSaved }) {
  const [checked, setChecked]   = useState({});
  const [notes, setNotes]       = useState('');
  const [submitting, setSub]    = useState(false);
  const [done, setDone]         = useState(false);

  const items = checklist.items || [];
  const completedCount = items.filter(i => checked[i.id]).length;
  const progress = items.length > 0 ? (completedCount / items.length) * 100 : 0;
  const cat = CATEGORIES[checklist.category] || CATEGORIES.other;

  const toggle = id => setChecked(p => ({ ...p, [id]: !p[id] }));

  const handleSubmit = async () => {
    setSub(true);
    const checkedItemIds = items.filter(i => checked[i.id]).map(i => i.id);
    const res = await fetch(`${API}/api/checklists/${checklist.id}/runs`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes, checkedItemIds, itemsTotal: items.length }),
    });
    if (res.ok) { setDone(true); onSaved(); }
    setSub(false);
  };

  if (done) {
    return (
      <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center px-4">
        <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-md p-8 text-center space-y-4">
          <div className="text-5xl">✅</div>
          <h3 className="text-white font-semibold text-xl">Run Saved!</h3>
          <p className="text-gray-400 text-sm">{completedCount} of {items.length} items completed</p>
          <button onClick={onClose} className="w-full py-2.5 rounded-xl text-white text-sm font-semibold"
            style={{ backgroundColor: '#F05A28' }}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center px-4">
      <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex-shrink-0">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs font-bold px-2 py-0.5 rounded text-white flex-shrink-0"
                style={{ backgroundColor: cat.color }}>{cat.label}</span>
              <h3 className="text-white font-semibold text-lg truncate">{checklist.name}</h3>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none ml-4 flex-shrink-0">×</button>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>{completedCount} of {items.length} complete</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-200"
                style={{ width: `${progress}%`, backgroundColor: '#F05A28' }} />
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 space-y-2 py-2">
          {items.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No items in this checklist.</p>
          ) : items.map(item => (
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
        </div>

        {/* Notes + Submit */}
        <div className="px-6 pb-6 pt-4 flex-shrink-0 space-y-3 border-t border-gray-700">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Notes (optional)..."
            className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none placeholder-gray-600" />
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-600 text-gray-300 text-sm hover:bg-gray-700 transition">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={submitting}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition disabled:opacity-50"
              style={{ backgroundColor: '#F05A28' }}>
              {submitting ? 'Saving…' : `Submit Run — ${completedCount}/${items.length}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Checklist Card ────────────────────────────────────────────────────────────
function ChecklistCard({ checklist, onRun }) {
  const cat = CATEGORIES[checklist.category] || CATEGORIES.other;
  const itemCount = (checklist.items || []).length;
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
          {checklist.name}
        </p>
        {checklist.description && (
          <p className="text-gray-500 text-xs leading-relaxed line-clamp-2">{checklist.description}</p>
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
function ChecklistModal({ checklist, onClose, onSaved }) {
  const isEdit = !!checklist;
  const [name, setName]         = useState(checklist?.name || '');
  const [category, setCategory] = useState(checklist?.category || 'other');
  const [description, setDesc]  = useState(checklist?.description || '');
  const [roles, setRoles]       = useState(checklist?.roles || []);
  const [items, setItems]       = useState((checklist?.items || []).map(i => ({ text: i.text })));
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const toggleRole = r => setRoles(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r]);
  const allSelected = ROLES.every(r => roles.includes(r));

  const addItem    = () => setItems(p => [...p, { text: '' }]);
  const removeItem = i => setItems(p => p.filter((_, idx) => idx !== i));
  const updateItem = (i, val) => setItems(p => p.map((item, idx) => idx === i ? { text: val } : item));
  const moveItem   = (i, dir) => {
    const next = [...items];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!roles.length) { setError('Select at least one role.'); return; }
    setSaving(true); setError('');
    const validItems = items.filter(i => i.text.trim());
    const body = { name: name.trim(), category, description: description.trim(), roles, items: validItems };
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

          <div>
            <label className="block text-gray-400 text-sm mb-1.5">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Morning Bar Opening"
              className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>

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
            <label className="block text-gray-400 text-sm mb-1.5">
              Description <span className="text-gray-600">(optional)</span>
            </label>
            <input value={description} onChange={e => setDesc(e.target.value)} placeholder="Brief description..."
              className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
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
                <div key={i} className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveItem(i, -1)} disabled={i === 0}
                      className="text-gray-500 hover:text-white disabled:opacity-20 text-xs leading-none transition">▲</button>
                    <button onClick={() => moveItem(i, 1)} disabled={i === items.length - 1}
                      className="text-gray-500 hover:text-white disabled:opacity-20 text-xs leading-none transition">▼</button>
                  </div>
                  <input value={item.text} onChange={e => updateItem(i, e.target.value)}
                    placeholder={`Item ${i + 1}`}
                    className="flex-1 bg-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-500" />
                  <button onClick={() => removeItem(i)}
                    className="text-gray-600 hover:text-red-400 transition text-xl leading-none">×</button>
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

// ── Main Component ────────────────────────────────────────────────────────────
export default function Checklists({ user, canUpload, onBack }) {
  const [checklists, setChecklists] = useState([]);
  const [runs, setRuns]             = useState([]);
  const [tab, setTab]               = useState('checklists');
  const [catFilter, setCatFilter]   = useState('all');
  const [running, setRunning]       = useState(null);
  const [editing, setEditing]       = useState(null);
  const [loading, setLoading]       = useState(true);

  const fetchAll = async () => {
    const [clRes, runRes] = await Promise.all([
      fetch(`${API}/api/checklists`, { credentials: 'include' }),
      fetch(`${API}/api/checklists/runs`, { credentials: 'include' }),
    ]);
    const [clData, runData] = await Promise.all([clRes.json(), runRes.json()]);
    setChecklists(Array.isArray(clData) ? clData : []);
    setRuns(Array.isArray(runData) ? runData : []);
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

  const moveChecklist = async (index, direction) => {
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

  const tabs = ['checklists', 'history', ...(canUpload ? ['manage'] : [])];
  const filtered = catFilter === 'all' ? checklists : checklists.filter(c => c.category === catFilter);

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

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h2 className="text-cream text-4xl font-bold">Checklists</h2>
            <p className="text-gray-400 mt-2">Operational checklists for your team</p>
          </div>
          <div className="flex gap-2 bg-gray-800 p-1 rounded-lg border border-gray-700">
            {tabs.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition capitalize ${
                  tab === t ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                }`}>
                {t === 'checklists' ? 'Checklists' : t === 'history' ? 'History' : 'Manage'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-gray-500 text-sm">Loading…</div>
        ) : tab === 'checklists' ? (
          <div>
            {/* Category filter pills */}
            <div className="flex flex-wrap gap-2 mb-6">
              {CAT_FILTERS.map(c => (
                <button key={c.key} onClick={() => setCatFilter(c.key)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                    catFilter === c.key
                      ? 'text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
                  }`}
                  style={catFilter === c.key ? { backgroundColor: c.color } : {}}>
                  {c.label}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-20 text-gray-600 text-sm">
                {catFilter === 'all'
                  ? 'No checklists available.'
                  : `No ${CATEGORIES[catFilter]?.label || ''} checklists.`}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map(cl => (
                  <ChecklistCard key={cl.id} checklist={cl} onRun={() => setRunning(cl)} />
                ))}
              </div>
            )}
          </div>
        ) : tab === 'history' ? (
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            {runs.length === 0 ? (
              <div className="py-16 text-center text-gray-500 text-sm">No runs recorded yet.</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Checklist</th>
                    <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4 hidden sm:table-cell">Run By</th>
                    <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4 hidden md:table-cell">Date</th>
                    <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4">Items</th>
                    <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4 hidden lg:table-cell">Notes</th>
                    {canUpload && <th className="px-4 py-4" />}
                  </tr>
                </thead>
                <tbody>
                  {runs.map(run => {
                    const full = run.items_total > 0 && run.items_completed === run.items_total;
                    return (
                      <tr key={run.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/20 transition">
                        <td className="px-6 py-3.5 text-white text-sm font-medium">{run.checklist_name}</td>
                        <td className="px-4 py-3.5 text-gray-300 text-sm hidden sm:table-cell">{run.run_by_name}</td>
                        <td className="px-4 py-3.5 text-gray-400 text-sm hidden md:table-cell">{fmtDate(run.created_at)}</td>
                        <td className="px-4 py-3.5">
                          <span className={`text-sm font-semibold ${full ? 'text-green-400' : 'text-orange-400'}`}>
                            {run.items_completed}/{run.items_total}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 text-sm hidden lg:table-cell max-w-xs truncate">
                          {run.notes || '—'}
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
        ) : (
          /* Manage tab */
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={() => setEditing('new')}
                className="px-4 py-2 rounded-xl text-white text-sm font-semibold transition hover:opacity-90"
                style={{ backgroundColor: '#F05A28' }}>
                + New Checklist
              </button>
            </div>
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              {checklists.length === 0 ? (
                <div className="py-16 text-center text-gray-500 text-sm">No checklists yet.</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Order</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Name</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4 hidden sm:table-cell">Category</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4 hidden md:table-cell">Items</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4 hidden lg:table-cell">Visible To</th>
                      <th className="px-4 py-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {checklists.map((cl, i) => {
                      const cat = CATEGORIES[cl.category] || CATEGORIES.other;
                      return (
                        <tr key={cl.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/20 transition">
                          <td className="px-6 py-3.5">
                            <div className="flex flex-col gap-1">
                              <button onClick={() => moveChecklist(i, -1)} disabled={i === 0}
                                className="text-gray-500 hover:text-white disabled:opacity-20 transition text-xs leading-none">▲</button>
                              <button onClick={() => moveChecklist(i, 1)} disabled={i === checklists.length - 1}
                                className="text-gray-500 hover:text-white disabled:opacity-20 transition text-xs leading-none">▼</button>
                            </div>
                          </td>
                          <td className="px-6 py-3.5 text-white text-sm font-medium">{cl.name}</td>
                          <td className="px-4 py-3.5 hidden sm:table-cell">
                            <span className="text-xs font-bold px-2 py-0.5 rounded text-white"
                              style={{ backgroundColor: cat.color }}>{cat.label}</span>
                          </td>
                          <td className="px-4 py-3.5 text-gray-400 text-sm hidden md:table-cell">
                            {(cl.items || []).length}
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
          </div>
        )}
      </main>

      {running && (
        <RunModal checklist={running} onClose={() => setRunning(null)} onSaved={fetchAll} />
      )}
      {editing && (
        <ChecklistModal
          checklist={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={fetchAll}
        />
      )}
    </div>
  );
}
