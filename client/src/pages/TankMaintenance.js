import { useState, useEffect, useCallback } from 'react';

const API = process.env.REACT_APP_API_URL || '';
const DUE_SOON_PCT = 0.8;

function computeStatus(daysSince, frequencyDays) {
  if (daysSince === null || daysSince === undefined) return 'never';
  const d = Number(daysSince);
  if (d >= frequencyDays) return 'overdue';
  if (d >= Math.floor(frequencyDays * DUE_SOON_PCT)) return 'due_soon';
  return 'ok';
}

const ST = {
  ok:       { dot: 'bg-green-500',  text: 'text-green-400',  cellBg: 'hover:bg-green-500/5',   badgeBg: 'bg-green-500/10',   label: 'OK'       },
  due_soon: { dot: 'bg-yellow-400', text: 'text-yellow-400', cellBg: 'bg-yellow-500/5 hover:bg-yellow-500/10', badgeBg: 'bg-yellow-500/10', label: 'Due Soon' },
  overdue:  { dot: 'bg-red-500',    text: 'text-red-400',    cellBg: 'bg-red-500/8 hover:bg-red-500/15',       badgeBg: 'bg-red-500/10',   label: 'Overdue'  },
  never:    { dot: 'bg-gray-500',   text: 'text-gray-500',   cellBg: 'hover:bg-gray-700/50',   badgeBg: 'bg-gray-700',       label: 'Never'    },
};

function cellLabel(daysSince, frequencyDays) {
  if (daysSince === null || daysSince === undefined) return 'Never';
  const d = Number(daysSince);
  const rem = frequencyDays - d;
  if (rem <= 0) return `${Math.abs(rem)}d over`;
  return `${rem}d left`;
}

function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${parseInt(m)}/${parseInt(d)}/${y}`;
}

function today() {
  return new Date().toLocaleDateString('en-CA');
}

// ─── LogModal ────────────────────────────────────────────────────────────────

function LogModal({ cell, onClose, canUpload, onUpdated }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ performed_date: today(), notes: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`${API}/api/tank-maintenance/logs/${cell.tank_id}/${cell.task_type_id}`, { credentials: 'include' });
    if (r.ok) setLogs(await r.json());
    setLoading(false);
  }, [cell.tank_id, cell.task_type_id]);

  useEffect(() => { load(); }, [load]);

  const lastDate = logs[0]?.performed_date ?? null;
  const daysSince = lastDate
    ? Math.floor((Date.now() - new Date(lastDate + 'T12:00:00').getTime()) / 86400000)
    : null;
  const status = computeStatus(daysSince, cell.frequency_days);
  const st = ST[status];

  const handleAdd = async () => {
    if (!form.performed_date) return;
    setSaving(true);
    const r = await fetch(`${API}/api/tank-maintenance/logs`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tank_id: cell.tank_id, task_type_id: cell.task_type_id, ...form }),
    });
    setSaving(false);
    if (r.ok) {
      setAdding(false);
      setForm({ performed_date: today(), notes: '' });
      await load();
      onUpdated();
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this log entry?')) return;
    await fetch(`${API}/api/tank-maintenance/logs/${id}`, { method: 'DELETE', credentials: 'include' });
    await load();
    onUpdated();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-700">
          <div>
            <h2 className="text-white font-semibold text-lg">{cell.tank_name}</h2>
            <p className="text-gray-400 text-sm">{cell.task_type_name}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${st.badgeBg} ${st.text}`}>
              {st.label}{daysSince !== null ? ` · ${daysSince}d ago` : ''}
            </span>
            <button onClick={onClose} className="text-gray-400 hover:text-white ml-1">✕</button>
          </div>
        </div>

        {/* Sub-header */}
        <div className="px-5 py-2.5 bg-gray-700/30 border-b border-gray-700 flex items-center justify-between">
          <span className="text-gray-400 text-sm">
            Every <span className="text-white font-medium">{cell.frequency_days} days</span>
          </span>
          {canUpload && !adding && (
            <button
              onClick={() => setAdding(true)}
              className="text-sm font-medium px-3 py-1.5 rounded-lg text-white"
              style={{ backgroundColor: '#F05A28' }}
            >
              + Log Completed
            </button>
          )}
        </div>

        {/* Add form */}
        {adding && (
          <div className="px-5 py-4 bg-gray-700/20 border-b border-gray-700 space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Date Performed</label>
              <input
                type="date"
                value={form.performed_date}
                onChange={e => setForm(f => ({ ...f, performed_date: e.target.value }))}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Notes (optional)</label>
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any notes about this task..."
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setAdding(false); setForm({ performed_date: today(), notes: '' }); }}
                className="text-sm text-gray-400 hover:text-white px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={saving}
                className="text-sm font-medium px-4 py-1.5 rounded-lg text-white disabled:opacity-50"
                style={{ backgroundColor: '#F05A28' }}
              >
                {saving ? 'Saving…' : 'Save Entry'}
              </button>
            </div>
          </div>
        )}

        {/* Log list */}
        <div className="overflow-y-auto flex-1 p-5">
          {loading ? (
            <p className="text-gray-500 text-sm text-center py-8">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No log entries yet.</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log, i) => (
                <div key={log.id} className="flex items-start justify-between bg-gray-700/40 rounded-lg px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-medium">{fmtDate(log.performed_date)}</span>
                      {i === 0 && (
                        <span className="text-xs text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">Most Recent</span>
                      )}
                    </div>
                    <p className="text-gray-400 text-xs mt-0.5">{log.performed_by_name}</p>
                    {log.notes && <p className="text-gray-300 text-xs mt-1 italic">{log.notes}</p>}
                  </div>
                  {canUpload && (
                    <button
                      onClick={() => handleDelete(log.id)}
                      className="text-gray-600 hover:text-red-400 text-sm ml-3 mt-0.5 flex-shrink-0 transition"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SettingsTab ─────────────────────────────────────────────────────────────

function SettingsTab() {
  const [tanks, setTanks] = useState([]);
  const [taskTypes, setTaskTypes] = useState([]);
  const [section, setSection] = useState('tanks');

  const [addingTank, setAddingTank] = useState(false);
  const [newTankName, setNewTankName] = useState('');
  const [editingTank, setEditingTank] = useState(null);

  const [addingTT, setAddingTT] = useState(false);
  const [newTT, setNewTT] = useState({ name: '', frequency_days: 90 });
  const [editingTT, setEditingTT] = useState(null);

  const loadTanks = useCallback(async () => {
    const r = await fetch(`${API}/api/tank-maintenance/tanks`, { credentials: 'include' });
    if (r.ok) setTanks(await r.json());
  }, []);

  const loadTT = useCallback(async () => {
    const r = await fetch(`${API}/api/tank-maintenance/task-types`, { credentials: 'include' });
    if (r.ok) setTaskTypes(await r.json());
  }, []);

  useEffect(() => { loadTanks(); loadTT(); }, [loadTanks, loadTT]);

  // Tank helpers
  const addTank = async () => {
    if (!newTankName.trim()) return;
    const r = await fetch(`${API}/api/tank-maintenance/tanks`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTankName.trim() }),
    });
    if (r.ok) { setNewTankName(''); setAddingTank(false); loadTanks(); }
  };

  const saveTank = async (id, updates) => {
    await fetch(`${API}/api/tank-maintenance/tanks/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    setEditingTank(null);
    loadTanks();
  };

  const deleteTank = async (id) => {
    if (!window.confirm('Delete this tank? All maintenance logs for this tank will also be deleted.')) return;
    await fetch(`${API}/api/tank-maintenance/tanks/${id}`, { method: 'DELETE', credentials: 'include' });
    loadTanks();
  };

  const moveTank = async (id, dir) => {
    const idx = tanks.findIndex(t => t.id === id);
    const arr = [...tanks];
    const to = dir === 'up' ? idx - 1 : idx + 1;
    if (to < 0 || to >= arr.length) return;
    [arr[idx], arr[to]] = [arr[to], arr[idx]];
    setTanks(arr);
    await fetch(`${API}/api/tank-maintenance/tanks/reorder`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: arr.map(t => t.id) }),
    });
  };

  // Task type helpers
  const addTT = async () => {
    if (!newTT.name.trim()) return;
    const r = await fetch(`${API}/api/tank-maintenance/task-types`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTT),
    });
    if (r.ok) { setNewTT({ name: '', frequency_days: 90 }); setAddingTT(false); loadTT(); }
  };

  const saveTT = async (id, updates) => {
    await fetch(`${API}/api/tank-maintenance/task-types/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    setEditingTT(null);
    loadTT();
  };

  const deleteTT = async (id) => {
    if (!window.confirm('Delete this task type? All associated logs will also be deleted.')) return;
    await fetch(`${API}/api/tank-maintenance/task-types/${id}`, { method: 'DELETE', credentials: 'include' });
    loadTT();
  };

  const moveTT = async (id, dir) => {
    const idx = taskTypes.findIndex(t => t.id === id);
    const arr = [...taskTypes];
    const to = dir === 'up' ? idx - 1 : idx + 1;
    if (to < 0 || to >= arr.length) return;
    [arr[idx], arr[to]] = [arr[to], arr[idx]];
    setTaskTypes(arr);
    await fetch(`${API}/api/tank-maintenance/task-types/reorder`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: arr.map(t => t.id) }),
    });
  };

  const sBtn = (s) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition ${section === s ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`;

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <button className={sBtn('tanks')} onClick={() => setSection('tanks')}>Tanks</button>
        <button className={sBtn('task-types')} onClick={() => setSection('task-types')}>Task Types</button>
      </div>

      {section === 'tanks' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
            <h3 className="text-white font-medium">Tanks ({tanks.length})</h3>
            {!addingTank && (
              <button
                onClick={() => setAddingTank(true)}
                className="text-sm font-medium px-3 py-1.5 rounded-lg text-white"
                style={{ backgroundColor: '#F05A28' }}
              >
                + Add Tank
              </button>
            )}
          </div>

          {addingTank && (
            <div className="px-5 py-3 border-b border-gray-700 bg-gray-700/30 flex gap-3 items-center">
              <input
                autoFocus
                type="text"
                value={newTankName}
                onChange={e => setNewTankName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTank()}
                placeholder="Tank name (e.g. FV-1)"
                className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              />
              <button onClick={addTank} className="text-sm px-3 py-2 rounded-lg text-white font-medium" style={{ backgroundColor: '#F05A28' }}>Add</button>
              <button onClick={() => { setAddingTank(false); setNewTankName(''); }} className="text-sm text-gray-400 hover:text-white">Cancel</button>
            </div>
          )}

          {tanks.length === 0 ? (
            <p className="text-gray-500 text-sm px-5 py-6">No tanks yet. Add one to get started.</p>
          ) : (
            <ul>
              {tanks.map((tank, i) => (
                <li key={tank.id} className="flex items-center gap-3 px-5 py-3 border-b border-gray-700 last:border-0">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveTank(tank.id, 'up')} disabled={i === 0}
                      className="text-gray-500 hover:text-gray-300 disabled:opacity-20 text-xs leading-none">▲</button>
                    <button onClick={() => moveTank(tank.id, 'down')} disabled={i === tanks.length - 1}
                      className="text-gray-500 hover:text-gray-300 disabled:opacity-20 text-xs leading-none">▼</button>
                  </div>

                  {editingTank?.id === tank.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={editingTank.name}
                      onChange={e => setEditingTank(t => ({ ...t, name: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && saveTank(tank.id, { name: editingTank.name })}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm"
                    />
                  ) : (
                    <span className={`flex-1 text-sm ${tank.active ? 'text-white' : 'text-gray-500 line-through'}`}>
                      {tank.name}
                    </span>
                  )}

                  <button
                    onClick={() => saveTank(tank.id, { active: !tank.active })}
                    className={`text-xs px-2 py-1 rounded flex-shrink-0 ${tank.active ? 'text-green-400 bg-green-500/10' : 'text-gray-500 bg-gray-700'}`}
                  >
                    {tank.active ? 'Active' : 'Inactive'}
                  </button>

                  {editingTank?.id === tank.id ? (
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => saveTank(tank.id, { name: editingTank.name })}
                        className="text-xs text-white px-2 py-1 rounded"
                        style={{ backgroundColor: '#F05A28' }}
                      >Save</button>
                      <button onClick={() => setEditingTank(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex gap-3 flex-shrink-0">
                      <button onClick={() => setEditingTank({ id: tank.id, name: tank.name })}
                        className="text-xs text-gray-400 hover:text-white">Rename</button>
                      <button onClick={() => deleteTank(tank.id)} className="text-xs text-red-500 hover:text-red-400">Delete</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {section === 'task-types' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
            <h3 className="text-white font-medium">Task Types ({taskTypes.length})</h3>
            {!addingTT && (
              <button
                onClick={() => setAddingTT(true)}
                className="text-sm font-medium px-3 py-1.5 rounded-lg text-white"
                style={{ backgroundColor: '#F05A28' }}
              >
                + Add Task Type
              </button>
            )}
          </div>

          {addingTT && (
            <div className="px-5 py-4 border-b border-gray-700 bg-gray-700/30 flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[160px]">
                <label className="text-xs text-gray-400 block mb-1">Task Name</label>
                <input
                  autoFocus
                  type="text"
                  value={newTT.name}
                  onChange={e => setNewTT(t => ({ ...t, name: e.target.value }))}
                  placeholder="e.g. Tank Passivation"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
              <div className="w-32">
                <label className="text-xs text-gray-400 block mb-1">Frequency (days)</label>
                <input
                  type="number"
                  min="1"
                  value={newTT.frequency_days}
                  onChange={e => setNewTT(t => ({ ...t, frequency_days: parseInt(e.target.value) || 90 }))}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
              <button onClick={addTT} className="text-sm px-3 py-2 rounded-lg text-white font-medium" style={{ backgroundColor: '#F05A28' }}>Add</button>
              <button onClick={() => { setAddingTT(false); setNewTT({ name: '', frequency_days: 90 }); }}
                className="text-sm text-gray-400 hover:text-white">Cancel</button>
            </div>
          )}

          {taskTypes.length === 0 ? (
            <p className="text-gray-500 text-sm px-5 py-6">No task types yet.</p>
          ) : (
            <ul>
              {taskTypes.map((tt, i) => (
                <li key={tt.id} className="flex items-center gap-3 px-5 py-3 border-b border-gray-700 last:border-0">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveTT(tt.id, 'up')} disabled={i === 0}
                      className="text-gray-500 hover:text-gray-300 disabled:opacity-20 text-xs leading-none">▲</button>
                    <button onClick={() => moveTT(tt.id, 'down')} disabled={i === taskTypes.length - 1}
                      className="text-gray-500 hover:text-gray-300 disabled:opacity-20 text-xs leading-none">▼</button>
                  </div>

                  {editingTT?.id === tt.id ? (
                    <>
                      <input
                        autoFocus
                        type="text"
                        value={editingTT.name}
                        onChange={e => setEditingTT(t => ({ ...t, name: e.target.value }))}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm"
                      />
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <input
                          type="number"
                          min="1"
                          value={editingTT.frequency_days}
                          onChange={e => setEditingTT(t => ({ ...t, frequency_days: parseInt(e.target.value) || 90 }))}
                          className="w-20 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm"
                        />
                        <span className="text-gray-500 text-xs">days</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-white">{tt.name}</span>
                      <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded flex-shrink-0">
                        Every {tt.frequency_days}d
                      </span>
                    </>
                  )}

                  {editingTT?.id === tt.id ? (
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => saveTT(tt.id, { name: editingTT.name, frequency_days: editingTT.frequency_days })}
                        className="text-xs text-white px-2 py-1 rounded"
                        style={{ backgroundColor: '#F05A28' }}
                      >Save</button>
                      <button onClick={() => setEditingTT(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex gap-3 flex-shrink-0">
                      <button
                        onClick={() => setEditingTT({ id: tt.id, name: tt.name, frequency_days: tt.frequency_days })}
                        className="text-xs text-gray-400 hover:text-white"
                      >Edit</button>
                      <button onClick={() => deleteTT(tt.id)} className="text-xs text-red-500 hover:text-red-400">Delete</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function TankMaintenance({ user, canUpload, onBack }) {
  const [tab, setTab] = useState('overview');
  const [statusData, setStatusData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logModal, setLogModal] = useState(null);

  const loadStatus = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    const r = await fetch(`${API}/api/tank-maintenance/status`, { credentials: 'include' });
    if (r.ok) setStatusData(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { loadStatus(true); }, [loadStatus]);

  // Derive ordered tanks and task types from status data
  const tanks = [...new Map(statusData.map(r => [r.tank_id, { tank_id: r.tank_id, tank_name: r.tank_name }])).values()];
  const taskTypes = [...new Map(statusData.map(r => [r.task_type_id, {
    task_type_id: r.task_type_id, task_type_name: r.task_type_name, frequency_days: r.frequency_days,
  }])).values()];

  const getCell = (tankId, ttId) => statusData.find(r => r.tank_id === tankId && r.task_type_id === ttId);

  const overdueCount = statusData.filter(r => computeStatus(r.days_since, r.frequency_days) === 'overdue').length;
  const dueSoonCount = statusData.filter(r => computeStatus(r.days_since, r.frequency_days) === 'due_soon').length;
  const neverCount   = statusData.filter(r => computeStatus(r.days_since, r.frequency_days) === 'never').length;

  const tabs = ['overview', ...(canUpload ? ['settings'] : [])];
  const tabLabel = { overview: 'Overview', settings: 'Settings' };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Nav */}
      <nav className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-4 flex items-center gap-4 sticky top-0 z-30">
        <button onClick={onBack} className="text-gray-400 hover:text-white transition text-sm">← Back</button>
        <h1 className="text-cream font-bold text-xl">Tank Maintenance</h1>
      </nav>

      {/* Tabs */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6">
        <div className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${tab === t ? 'border-orange-500' : 'border-transparent text-gray-400 hover:text-white'}`}
              style={tab === t ? { borderColor: '#F05A28', color: '#F05A28' } : {}}
            >
              {tabLabel[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 sm:px-6 py-6 max-w-screen-xl mx-auto">
        {tab === 'overview' && (
          <>
            {/* Summary badges */}
            {(overdueCount > 0 || dueSoonCount > 0 || neverCount > 0) && (
              <div className="flex flex-wrap gap-3 mb-5">
                {overdueCount > 0 && (
                  <span className="flex items-center gap-1.5 text-sm text-red-400 bg-red-500/10 px-3 py-1.5 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                    {overdueCount} overdue
                  </span>
                )}
                {dueSoonCount > 0 && (
                  <span className="flex items-center gap-1.5 text-sm text-yellow-400 bg-yellow-500/10 px-3 py-1.5 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
                    {dueSoonCount} due soon
                  </span>
                )}
                {neverCount > 0 && (
                  <span className="flex items-center gap-1.5 text-sm text-gray-400 bg-gray-700 px-3 py-1.5 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-gray-500 inline-block" />
                    {neverCount} never logged
                  </span>
                )}
              </div>
            )}

            {loading ? (
              <div className="text-gray-500 text-sm text-center py-16">Loading…</div>
            ) : tanks.length === 0 || taskTypes.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <p className="text-lg mb-2">No data to display.</p>
                <p className="text-sm">
                  {canUpload ? 'Go to Settings to add tanks and task types.' : 'No tanks or task types have been configured.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-700">
                <table className="border-collapse" style={{ minWidth: `${160 + taskTypes.length * 140}px`, width: '100%' }}>
                  <thead>
                    <tr className="bg-gray-800 border-b border-gray-700">
                      <th className="sticky left-0 bg-gray-800 z-10 px-4 py-3 text-left text-xs text-gray-400 uppercase tracking-wider font-medium border-r border-gray-700 w-40">
                        Tank
                      </th>
                      {taskTypes.map(tt => (
                        <th key={tt.task_type_id} className="px-3 py-3 text-center text-xs text-gray-400 uppercase tracking-wider font-medium border-r border-gray-700 last:border-0">
                          <div className="whitespace-nowrap">{tt.task_type_name}</div>
                          <div className="text-gray-600 normal-case font-normal mt-0.5">every {tt.frequency_days}d</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tanks.map((tank, ti) => {
                      const rowBg = ti % 2 === 0 ? 'rgba(31,41,55,0.5)' : 'rgba(31,41,55,0.25)';
                      return (
                        <tr key={tank.tank_id} className="border-b border-gray-700 last:border-0">
                          <td
                            className="sticky left-0 z-10 px-4 py-3 text-sm font-medium text-white border-r border-gray-700"
                            style={{ backgroundColor: rowBg }}
                          >
                            {tank.tank_name}
                          </td>
                          {taskTypes.map(tt => {
                            const cell = getCell(tank.tank_id, tt.task_type_id);
                            if (!cell) return <td key={tt.task_type_id} className="px-3 py-3 border-r border-gray-700 last:border-0" />;
                            const status = computeStatus(cell.days_since, cell.frequency_days);
                            const st = ST[status];
                            return (
                              <td
                                key={tt.task_type_id}
                                onClick={() => setLogModal({ ...cell })}
                                className={`px-3 py-3 text-center border-r border-gray-700 last:border-0 cursor-pointer transition ${st.cellBg}`}
                              >
                                <div className="flex flex-col items-center gap-1">
                                  <span className={`w-2.5 h-2.5 rounded-full ${st.dot}`} />
                                  <span className={`text-xs font-medium ${st.text}`}>
                                    {cellLabel(cell.days_since, cell.frequency_days)}
                                  </span>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Legend */}
            {!loading && tanks.length > 0 && (
              <div className="flex flex-wrap gap-4 mt-4 text-xs text-gray-500">
                {[['bg-green-500', 'OK'], ['bg-yellow-400', 'Due Soon (80%+)'], ['bg-red-500', 'Overdue'], ['bg-gray-500', 'Never Logged']].map(([dot, label]) => (
                  <span key={label} className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${dot}`} />
                    {label}
                  </span>
                ))}
                <span className="text-gray-600">· Click any cell to view log history</span>
              </div>
            )}
          </>
        )}

        {tab === 'settings' && canUpload && <SettingsTab />}
      </div>

      {logModal && (
        <LogModal
          cell={logModal}
          onClose={() => setLogModal(null)}
          canUpload={canUpload}
          user={user}
          onUpdated={() => loadStatus(false)}
        />
      )}
    </div>
  );
}
