import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

const API = process.env.REACT_APP_API_URL || '';

const TASK_TYPES = [
  { key: 'brew',               label: 'Brew',               short: 'Brew',  color: '#fff',    bg: '#c2440f'               },
  { key: 'package',            label: 'Package',            short: 'Pkg',   color: '#fff',    bg: '#1d4ed8'               },
  { key: 'vdk_crash',          label: 'VDK/Crash',          short: 'VDK',   color: '#fff',    bg: '#7c3aed'               },
  { key: 'transfer',           label: 'Transfer',           short: 'Tx',    color: '#fff',    bg: '#065f46'               },
  { key: 'dry_hop_2',          label: 'Dry Hop 2',          short: 'DH2',   color: '#111',    bg: '#6ee7b7'               },
  { key: 'dry_hop_1',          label: 'Dry Hop 1',          short: 'DH1',   color: '#111',    bg: '#34d399'               },
  { key: 'carb',               label: 'Carb',               short: 'Carb',  color: '#fff',    bg: '#2563eb'               },
  { key: 'pressurize_release', label: 'Pressurize/Release', short: 'P/R',   color: '#fff',    bg: '#6d28d9'               },
  { key: 'adjunct',            label: 'Adjunct',            short: 'Adj',   color: '#111',    bg: '#fbbf24'               },
  { key: 'ramp_soak',          label: 'Ramp/Soak',          short: 'R&S',   color: '#111',    bg: '#fde68a'               },
  { key: 'whirl',              label: 'Whirl',              short: 'Whirl', color: '#111',    bg: '#5eead4'               },
  { key: 'harvest',            label: 'Harvest',            short: 'Harv',  color: '#111',    bg: '#86efac'               },
  { key: 'other',              label: 'Other',              short: '…',     color: '#e5e7eb', bg: '#374151'               },
];
const TASK_MAP = Object.fromEntries(TASK_TYPES.map(t => [t.key, t]));
const TASK_PRIORITY = ['other','whirl','harvest','ramp_soak','adjunct','carb','pressurize_release','dry_hop_2','dry_hop_1','transfer','vdk_crash','package','brew'];

function getPrimaryTask(tasks) {
  if (!tasks.length) return null;
  return tasks.reduce((best, t) => {
    return TASK_PRIORITY.indexOf(t.task_type) > TASK_PRIORITY.indexOf(best.task_type) ? t : best;
  }, tasks[0]);
}

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  date.setHours(0, 0, 0, 0);
  return date.toISOString().split('T')[0];
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const days = ['Su', 'Mo', 'Tu', 'W', 'Th', 'Fr', 'Sa'];
  return `${days[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

function isWeekend(dateStr) {
  const day = new Date(dateStr + 'T12:00:00').getDay();
  return day === 0 || day === 6;
}

function isToday(dateStr) {
  return dateStr === new Date().toISOString().split('T')[0];
}

function userName(users, id) {
  const u = users.find(x => x.id === id);
  return u ? u.name.split(' ')[0] : '?';
}

function dateDiff(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}

function hexToRgba(hex, alpha) {
  if (!hex || hex.length < 7) return `rgba(99,102,241,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Cell Modal ────────────────────────────────────────────────────────────────

function CellModal({ date, tank, assignment, tasks, beers, users, canManage, onClose, onRefresh }) {
  const [showAssignForm, setShowAssignForm] = useState(!assignment && canManage);
  const [assignBeerId, setAssignBeerId] = useState('');
  const [assignStart, setAssignStart] = useState(date);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskType, setTaskType] = useState('brew');
  const [taskNote, setTaskNote] = useState('');
  const [taskAssignees, setTaskAssignees] = useState([]);
  const [editTaskId, setEditTaskId] = useState(null);
  const [applyPresets, setApplyPresets] = useState(true);
  const [saving, setSaving] = useState(false);

  const toggleAssignee = (id) => setTaskAssignees(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );

  const handleAssign = async () => {
    if (!assignBeerId) return;
    setSaving(true);
    const r = await fetch(`${API}/api/production-schedule/assignments`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beer_id: parseInt(assignBeerId), tank_id: tank.id, start_date: assignStart }),
    });
    const newAsgn = await r.json();
    if (applyPresets && newAsgn.id) {
      await fetch(`${API}/api/production-schedule/assignments/${newAsgn.id}/apply-presets`, {
        method: 'POST', credentials: 'include',
      });
    }
    setSaving(false);
    setShowAssignForm(false);
    onRefresh();
  };

  const handleEndAssignment = async () => {
    if (!assignment) return;
    if (!window.confirm('End this beer assignment?')) return;
    await fetch(`${API}/api/production-schedule/assignments/${assignment.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ end_date: date }),
    });
    onRefresh();
  };

  const handleDeleteAssignment = async () => {
    if (!assignment) return;
    if (!window.confirm('Remove this assignment entirely?')) return;
    await fetch(`${API}/api/production-schedule/assignments/${assignment.id}`, {
      method: 'DELETE', credentials: 'include',
    });
    onRefresh();
  };

  const resetTaskForm = () => { setTaskType('brew'); setTaskNote(''); setTaskAssignees([]); setEditTaskId(null); setShowTaskForm(false); };

  const handleSaveTask = async () => {
    if (!taskType) return;
    setSaving(true);
    const body = {
      beer_id: assignment ? assignment.beer_id : null,
      tank_id: tank.id,
      date,
      task_type: taskType,
      custom_note: taskNote || null,
      assigned_user_ids: taskAssignees,
    };
    if (editTaskId) {
      await fetch(`${API}/api/production-schedule/tasks/${editTaskId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_type: taskType, custom_note: taskNote || null, assigned_user_ids: taskAssignees }),
      });
    } else {
      await fetch(`${API}/api/production-schedule/tasks`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    setSaving(false);
    resetTaskForm();
    onRefresh();
  };

  const handleDeleteTask = async (id) => {
    if (!window.confirm('Delete this task?')) return;
    await fetch(`${API}/api/production-schedule/tasks/${id}`, { method: 'DELETE', credentials: 'include' });
    onRefresh();
  };

  const handleComplete = async (task) => {
    await fetch(`${API}/api/production-schedule/tasks/${task.id}/complete`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !task.completed }),
    });
    onRefresh();
  };

  const startEdit = (task) => {
    setTaskType(task.task_type);
    setTaskNote(task.custom_note || '');
    setTaskAssignees(task.assigned_user_ids || []);
    setEditTaskId(task.id);
    setShowTaskForm(true);
  };

  const inputCls = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500';
  const selectCls = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500';

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-cream text-lg font-bold">{tank.name}</h3>
              <p className="text-gray-400 text-sm">{formatDateLabel(date)}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm">✕</button>
          </div>

          {/* Beer Assignment */}
          <div className="mb-4">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">Beer in Tank</p>
            {assignment ? (
              <div className="bg-gray-700/60 border border-gray-600 rounded-lg px-3 py-2.5 flex items-center justify-between">
                <span className="text-white font-semibold">{assignment.beer_name}</span>
                {canManage && (
                  <div className="flex gap-2">
                    <button onClick={handleEndAssignment} className="text-xs text-yellow-400 hover:text-yellow-300">End on this date</button>
                    <button onClick={handleDeleteAssignment} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                  </div>
                )}
              </div>
            ) : showAssignForm ? (
              <div className="bg-gray-700/40 border border-gray-600 rounded-lg p-3 space-y-2">
                <select className={selectCls} value={assignBeerId} onChange={e => setAssignBeerId(e.target.value)}>
                  <option value="">Select beer…</option>
                  {beers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Start date</label>
                  <input type="date" className={inputCls} value={assignStart} onChange={e => setAssignStart(e.target.value)} />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={applyPresets} onChange={e => setApplyPresets(e.target.checked)}
                    className="accent-orange-500" />
                  <span className="text-gray-400 text-xs">Apply style task presets</span>
                </label>
                <div className="flex gap-2">
                  <button onClick={handleAssign} disabled={!assignBeerId || saving}
                    className="flex-1 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
                    style={{ backgroundColor: '#F05A28' }}>
                    {saving ? 'Assigning…' : 'Assign'}
                  </button>
                  <button onClick={() => setShowAssignForm(false)} className="px-3 py-1.5 rounded-lg text-sm bg-gray-600 text-gray-300 hover:bg-gray-500">Cancel</button>
                </div>
              </div>
            ) : (
              canManage && (
                <button onClick={() => setShowAssignForm(true)}
                  className="w-full py-2 border border-dashed border-gray-600 rounded-lg text-gray-500 hover:text-gray-300 hover:border-gray-400 text-sm transition">
                  + Assign Beer
                </button>
              )
            )}
          </div>

          {/* Tasks */}
          <div className="mb-3">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">Tasks</p>
            {tasks.length === 0 && !showTaskForm && (
              <p className="text-gray-500 text-sm mb-2">No tasks scheduled for this day.</p>
            )}
            <div className="space-y-2">
              {tasks.map(t => {
                const tt = TASK_MAP[t.task_type] || TASK_MAP.other;
                return (
                  <div key={t.id} className={`rounded-lg px-3 py-2 border ${t.completed ? 'border-gray-700 opacity-60' : 'border-gray-600'}`}
                    style={{ backgroundColor: tt.bg }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <button onClick={() => handleComplete(t)}
                          className={`w-4 h-4 rounded shrink-0 border flex items-center justify-center transition ${t.completed ? 'border-green-500 bg-green-500/30' : 'border-gray-500 hover:border-green-400'}`}>
                          {t.completed && <span className="text-green-400 text-xs">✓</span>}
                        </button>
                        <span className="text-xs font-bold shrink-0" style={{ color: tt.color }}>{tt.label}</span>
                        {t.custom_note && <span className="text-gray-300 text-xs truncate">{t.custom_note}</span>}
                      </div>
                      {canManage && (
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => startEdit(t)} className="text-xs text-gray-400 hover:text-orange-400 px-1">Edit</button>
                          <button onClick={() => handleDeleteTask(t.id)} className="text-xs text-gray-500 hover:text-red-400 px-1">✕</button>
                        </div>
                      )}
                    </div>
                    {(t.assigned_user_ids || []).length > 0 && (
                      <p className="text-gray-400 text-xs mt-1 ml-6">{t.assigned_user_ids.map(id => userName(users, id)).join(', ')}</p>
                    )}
                    {t.completed && t.completed_by_id && (
                      <p className="text-green-500 text-xs mt-0.5 ml-6">Completed by {userName(users, t.completed_by_id)}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Task form */}
            {showTaskForm && (
              <div className="mt-3 bg-gray-700/40 border border-gray-600 rounded-lg p-3 space-y-2">
                <select className={selectCls} value={taskType} onChange={e => setTaskType(e.target.value)}>
                  {TASK_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <input className={inputCls} placeholder="Note (optional)…" value={taskNote} onChange={e => setTaskNote(e.target.value)} />
                <div>
                  <p className="text-gray-400 text-xs mb-1.5">Assign to:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {users.map(u => (
                      <button key={u.id} type="button" onClick={() => toggleAssignee(u.id)}
                        className={`text-xs px-2 py-1 rounded-full border transition ${taskAssignees.includes(u.id) ? 'text-white border-orange-500' : 'text-gray-400 border-gray-600 hover:border-gray-400'}`}
                        style={taskAssignees.includes(u.id) ? { backgroundColor: '#F05A2820' } : {}}>
                        {u.name.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSaveTask} disabled={saving}
                    className="flex-1 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
                    style={{ backgroundColor: '#F05A28' }}>
                    {saving ? 'Saving…' : editTaskId ? 'Update Task' : 'Add Task'}
                  </button>
                  <button onClick={resetTaskForm} className="px-3 py-1.5 rounded-lg text-sm bg-gray-600 text-gray-300 hover:bg-gray-500">Cancel</button>
                </div>
              </div>
            )}

            {canManage && !showTaskForm && (
              <button onClick={() => { resetTaskForm(); setShowTaskForm(true); }}
                className="mt-2 w-full py-1.5 border border-dashed border-gray-600 rounded-lg text-gray-500 hover:text-gray-300 hover:border-gray-400 text-sm transition">
                + Add Task
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Schedule Grid ─────────────────────────────────────────────────────────────

const ROW_H = 28;
const DATE_W = 62;

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function ScheduleGrid({ tanks, assignments, tasks, dates, canManage, drag, onCellClick, onDragStart }) {
  const scrollRef = useRef(null);
  const [colW, setColW] = useState(58);

  const activeTanksCount = tanks.filter(t => t.active).length;

  // Dynamic column width — fill available horizontal space
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const update = () => {
      const available = el.clientWidth - DATE_W - 2;
      const n = activeTanksCount || 1;
      setColW(Math.max(36, Math.floor(available / n)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeTanksCount]);

  // Auto-scroll to today on first render
  useEffect(() => {
    if (!scrollRef.current) return;
    const todayEl = scrollRef.current.querySelector('[data-today="1"]');
    if (todayEl) todayEl.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, []);

  const getAssignment = useCallback((tankId, date) => {
    return assignments.find(a =>
      a.tank_id === tankId &&
      a.start_date <= date &&
      (a.end_date === null || a.end_date >= date)
    ) || null;
  }, [assignments]);

  const getCellTasks = useCallback((tankId, date) => {
    return tasks.filter(t => t.tank_id === tankId && (t.date || '').slice(0, 10) === date);
  }, [tasks]);

  const activeTanks = tanks.filter(t => t.active);
  const border = '1px solid rgba(75,85,99,0.3)';


  // Compute drag preview ranges
  const preview = useMemo(() => {
    if (!drag) return null;
    const diff = dateDiff(drag.startDate, drag.currentDate);
    if (drag.mode === 'move_asgn') {
      const ns = addDays(drag.originalStart, diff);
      const ne = drag.originalEnd ? addDays(drag.originalEnd, diff) : null;
      return { mode: 'move_asgn', tankId: drag.currentTankId, start: ns, end: ne || ns, id: drag.id };
    }
    if (drag.mode === 'resize_asgn') {
      const base = drag.originalEnd || drag.startDate;
      const ne = addDays(base, diff);
      const clamped = ne >= drag.originalStart ? ne : drag.originalStart;
      return { mode: 'resize_asgn', tankId: drag.tankId, start: drag.originalStart, end: clamped, id: drag.id };
    }
    if (drag.mode === 'move_task') {
      return { mode: 'move_task', tankId: drag.currentTankId, date: drag.currentDate, id: drag.id };
    }
    return null;
  }, [drag]);

  const inPreview = (tankId, date) => {
    if (!preview) return false;
    if (preview.mode === 'move_task') return preview.tankId === tankId && preview.date === date;
    if (preview.tankId !== tankId) return false;
    return date >= preview.start && date <= preview.end;
  };

  const isDragSource = (asgn, task, date) => {
    if (!drag) return false;
    if (drag.mode === 'move_asgn' && asgn?.id === drag.id) return true;
    if (drag.mode === 'resize_asgn' && asgn?.id === drag.id) return true;
    if (drag.mode === 'move_task' && task?.id === drag.id) return true;
    return false;
  };

  return (
    <div ref={scrollRef} style={{ overflowX: 'hidden', overflowY: 'auto', maxHeight: 'calc(100vh - 110px)', userSelect: drag ? 'none' : 'auto', cursor: drag ? (drag.mode === 'resize_asgn' ? 's-resize' : 'grabbing') : 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={{
              position: 'sticky', top: 0, left: 0, zIndex: 30,
              backgroundColor: '#111827', width: DATE_W, minWidth: DATE_W,
              padding: '4px 5px', borderRight: border, borderBottom: '2px solid rgba(75,85,99,0.5)',
              textAlign: 'left', fontSize: 10, color: '#6b7280', fontWeight: 600,
            }}>Date</th>
            {activeTanks.map(tank => (
              <th key={tank.id} style={{
                position: 'sticky', top: 0, zIndex: 20,
                backgroundColor: '#111827', width: colW, minWidth: colW, maxWidth: colW,
                padding: '4px 3px', borderRight: border, borderBottom: '2px solid rgba(75,85,99,0.5)',
                textAlign: 'center', fontSize: 9, color: '#d1d5db', fontWeight: 700,
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
              }}>{tank.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((date, dateIdx) => {
            const wknd = isWeekend(date);
            const today = isToday(date);
            const rowBg = today ? '#14291f' : wknd ? '#0d1117' : '#111827';
            // Month separator
            const prevDate = dateIdx > 0 ? dates[dateIdx - 1] : null;
            const newMonth = prevDate && date.slice(0, 7) !== prevDate.slice(0, 7);

            return (
              <tr key={date} data-today={today ? '1' : undefined}>
                <td style={{
                  position: 'sticky', left: 0, zIndex: 10,
                  backgroundColor: newMonth ? '#1a2030' : rowBg,
                  width: DATE_W, minWidth: DATE_W, height: ROW_H,
                  padding: '0 5px', borderRight: border,
                  borderBottom: newMonth ? '1px solid rgba(99,102,241,0.4)' : border,
                  borderTop: newMonth ? '1px solid rgba(99,102,241,0.4)' : undefined,
                  fontSize: newMonth ? 9 : 10, fontWeight: today ? 700 : (newMonth ? 600 : 400),
                  color: today ? '#34d399' : wknd ? '#4b5563' : (newMonth ? '#818cf8' : '#9ca3af'),
                  whiteSpace: 'nowrap', lineHeight: `${ROW_H}px`,
                }}>
                  {newMonth ? `${MONTH_NAMES[parseInt(date.slice(5,7))-1]} ${date.slice(8,10)}` : formatDateLabel(date)}
                </td>
                {activeTanks.map(tank => {
                  const asgn = getAssignment(tank.id, date);
                  const cellTasks = getCellTasks(tank.id, date);
                  const primary = getPrimaryTask(cellTasks);
                  const allDone = cellTasks.length > 0 && cellTasks.every(t => t.completed);
                  const tt = primary ? (TASK_MAP[primary.task_type] || TASK_MAP.other) : null;
                  const isStartCell = asgn && (asgn.start_date === date || date === dates[0]);
                  const isLastCell = asgn && (asgn.end_date === date || (asgn.end_date === null && dateIdx === dates.length - 1));

                  const sourceDim = isDragSource(asgn, primary, date);
                  const prevCell = inPreview(tank.id, date);

                  const beerColor = asgn?.beer_color || '#6366f1';
                  let bgColor = wknd ? '#0d1117' : '#111827';
                  if (asgn && !tt) bgColor = hexToRgba(beerColor, wknd ? 0.18 : 0.28);
                  if (tt) bgColor = allDone ? '#1a3a2a' : tt.bg;
                  if (prevCell && !sourceDim) bgColor = preview.mode === 'move_task' ? 'rgba(251,191,36,0.25)' : 'rgba(99,102,241,0.25)';

                  const taskLabel = tt
                    ? (allDone ? '✓' : tt.short) + (cellTasks.length > 1 ? ` +${cellTasks.length - 1}` : '')
                    : null;

                  const handleMouseDown = (e) => {
                    if (!canManage) return;
                    e.preventDefault();
                    if (e.target.dataset.resize) {
                      // Resize handle
                      onDragStart('resize_asgn', asgn.id, tank.id, date, {
                        originalStart: asgn.start_date,
                        originalEnd: asgn.end_date || date,
                      });
                    } else if (primary && cellTasks.length > 0) {
                      // Drag the primary task
                      onDragStart('move_task', primary.id, tank.id, date, {});
                    } else if (asgn) {
                      // Drag the whole assignment
                      onDragStart('move_asgn', asgn.id, tank.id, date, {
                        originalStart: asgn.start_date,
                        originalEnd: asgn.end_date,
                      });
                    }
                  };

                  return (
                    <td
                      key={tank.id}
                      data-date={date}
                      data-tank-id={tank.id}
                      onClick={(e) => {
                        if (drag) return; // don't open modal after drag
                        onCellClick(date, tank, asgn, cellTasks);
                      }}
                      onMouseDown={handleMouseDown}
                      title={[asgn?.beer_name, cellTasks.map(t => TASK_MAP[t.task_type]?.label).join(', ')].filter(Boolean).join(' — ')}
                      style={{
                        backgroundColor: bgColor,
                        opacity: sourceDim ? 0.35 : 1,
                        width: colW, minWidth: colW, maxWidth: colW,
                        height: ROW_H,
                        padding: '1px 3px',
                        borderRight: border,
                        borderBottom: newMonth ? '1px solid rgba(99,102,241,0.4)' : border,
                        borderLeft: asgn ? `3px solid ${hexToRgba(beerColor, 0.7)}` : border,
                        outline: prevCell ? '1px dashed rgba(99,102,241,0.7)' : undefined,
                        cursor: canManage ? (asgn || cellTasks.length ? 'grab' : 'cell') : (cellTasks.length ? 'pointer' : 'default'),
                        overflow: 'hidden',
                        position: 'relative',
                        verticalAlign: 'middle',
                      }}
                    >
                      {(isStartCell || taskLabel) ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%', justifyContent: 'center', pointerEvents: 'none' }}>
                          {isStartCell && (
                            <div style={{
                              fontSize: 7, fontWeight: 700, lineHeight: 1.1,
                              color: tt ? hexToRgba(beerColor, 0.9) : hexToRgba(beerColor, 0.7),
                              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                            }}>
                              {asgn.beer_name}
                            </div>
                          )}
                          {taskLabel && (
                            <div style={{
                              fontSize: 9, fontWeight: 700, lineHeight: 1,
                              color: allDone ? '#4ade80' : (tt?.color || '#9ca3af'),
                              textAlign: isStartCell ? 'left' : 'center',
                              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                            }}>
                              {taskLabel}
                            </div>
                          )}
                        </div>
                      ) : null}
                      {/* Resize handle on last cell of assignment */}
                      {isLastCell && canManage && (
                        <div
                          data-resize="1"
                          style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0, height: 5,
                            cursor: 's-resize',
                            backgroundColor: 'rgba(255,255,255,0.12)',
                            borderTop: '1px solid rgba(255,255,255,0.15)',
                          }}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Task List View ────────────────────────────────────────────────────────────

function TaskListView({ tasks, users, currentUser, canManage, onRefresh }) {
  const [myOnly, setMyOnly] = useState(false);
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));

  const weekEnd = addDays(weekStart, 6);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const filtered = tasks.filter(t => {
    const d = (t.date || '').slice(0, 10);
    if (d < weekStart || d > weekEnd) return false;
    if (myOnly && !(t.assigned_user_ids || []).includes(currentUser.id)) return false;
    return true;
  });

  const handleComplete = async (task) => {
    await fetch(`${API}/api/production-schedule/tasks/${task.id}/complete`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !task.completed }),
    });
    onRefresh();
  };

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm">←</button>
          <button onClick={() => setWeekStart(getMonday(new Date()))}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm">This Week</button>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm">→</button>
        </div>
        <span className="text-gray-400 text-sm">
          {formatDateLabel(weekStart)} – {formatDateLabel(weekEnd)}
        </span>
        <button onClick={() => setMyOnly(!myOnly)}
          className={`ml-auto px-3 py-1 rounded-full text-sm border transition ${myOnly ? 'text-white border-orange-500' : 'text-gray-400 border-gray-600 hover:border-gray-400'}`}
          style={myOnly ? { backgroundColor: '#F05A2818' } : {}}>
          My Tasks Only
        </button>
      </div>

      {/* Days */}
      {weekDates.map(date => {
        const dayTasks = filtered.filter(t => (t.date || '').slice(0, 10) === date);
        if (!dayTasks.length) return null;
        return (
          <div key={date} className="mb-5">
            <div className={`text-sm font-semibold mb-2 ${isToday(date) ? 'text-green-400' : 'text-gray-300'}`}>
              {formatDateLabel(date)}{isToday(date) ? ' — Today' : ''}
            </div>
            <div className="space-y-2">
              {dayTasks.map(t => {
                const tt = TASK_MAP[t.task_type] || TASK_MAP.other;
                const assigneeNames = (t.assigned_user_ids || []).map(id => userName(users, id)).join(', ');
                return (
                  <div key={t.id} className={`flex items-start gap-3 bg-gray-800 border rounded-xl px-4 py-3 ${t.completed ? 'border-gray-700 opacity-60' : 'border-gray-700'}`}
                    style={{ borderLeftWidth: 3, borderLeftColor: tt.color }}>
                    <button onClick={() => handleComplete(t)}
                      className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition ${t.completed ? 'border-green-500 bg-green-500/20' : 'border-gray-500 hover:border-green-400'}`}>
                      {t.completed && <span className="text-green-400 text-xs">✓</span>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: tt.color + '22', color: tt.color }}>{tt.label}</span>
                        {t.beer_name && <span className="text-white text-sm font-medium">{t.beer_name}</span>}
                        {t.tank_name && <span className="text-gray-500 text-xs">[{t.tank_name}]</span>}
                      </div>
                      {t.custom_note && <p className="text-gray-400 text-xs mt-0.5">{t.custom_note}</p>}
                      {assigneeNames && <p className="text-gray-500 text-xs mt-0.5">{assigneeNames}</p>}
                      {t.completed && t.completed_by_id && (
                        <p className="text-green-500 text-xs mt-0.5">✓ {userName(users, t.completed_by_id)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {!weekDates.some(d => filtered.some(t => (t.date || '').slice(0, 10) === d)) && (
        <p className="text-gray-500 text-center py-16">No tasks for this week.</p>
      )}
    </div>
  );
}

// ── Beer Tracker ──────────────────────────────────────────────────────────────

function BeerTrackerView({ beers, assignments, tasks }) {
  const today = new Date().toISOString().split('T')[0];

  const beerData = beers.map(beer => {
    const activeAssignment = assignments.find(a =>
      a.beer_id === beer.id &&
      a.start_date <= today &&
      (a.end_date === null || a.end_date >= today)
    );
    const pastTasks = tasks
      .filter(t => t.beer_id === beer.id && t.date <= today)
      .sort((a, b) => b.date.localeCompare(a.date));
    const upcomingTasks = tasks
      .filter(t => t.beer_id === beer.id && t.date > today)
      .sort((a, b) => a.date.localeCompare(b.date));
    const currentTask = pastTasks[0];
    const nextTask = upcomingTasks[0];
    return { ...beer, activeAssignment, currentTask, nextTask };
  });

  const active = beerData.filter(b => b.activeAssignment);
  const scheduled = beerData.filter(b => !b.activeAssignment);

  const BeerCard = ({ b }) => {
    const tt = b.currentTask ? (TASK_MAP[b.currentTask.task_type] || TASK_MAP.other) : null;
    const nt = b.nextTask ? (TASK_MAP[b.nextTask.task_type] || TASK_MAP.other) : null;
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-white font-semibold leading-tight">{b.name}</h3>
          {b.activeAssignment && (
            <span className="text-xs px-2 py-0.5 bg-gray-700 text-gray-300 rounded-full shrink-0">{b.activeAssignment.tank_name || 'Tank?'}</span>
          )}
        </div>
        {tt && (
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: tt.color + '22', color: tt.color }}>{tt.label}</span>
            <span className="text-gray-500 text-xs">{formatDateLabel(b.currentTask.date)}</span>
            {b.currentTask.completed && <span className="text-green-400 text-xs">✓</span>}
          </div>
        )}
        {nt && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 text-xs">Next:</span>
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: nt.color + '22', color: nt.color }}>{nt.label}</span>
            <span className="text-gray-500 text-xs">{formatDateLabel(b.nextTask.date)}</span>
          </div>
        )}
        {!tt && !nt && <p className="text-gray-600 text-xs">No tasks scheduled</p>}
      </div>
    );
  };

  return (
    <div>
      {active.length > 0 && (
        <div className="mb-6">
          <h3 className="text-gray-400 text-xs uppercase tracking-widest mb-3">In Tank Now ({active.length})</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {active.map(b => <BeerCard key={b.id} b={b} />)}
          </div>
        </div>
      )}
      {scheduled.length > 0 && (
        <div>
          <h3 className="text-gray-400 text-xs uppercase tracking-widest mb-3">Scheduled / Not Yet Assigned</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {scheduled.map(b => <BeerCard key={b.id} b={b} />)}
          </div>
        </div>
      )}
      {active.length === 0 && scheduled.length === 0 && (
        <p className="text-gray-500 text-center py-16">No active beers. Add beers in the Manage tab.</p>
      )}
    </div>
  );
}

// ── Styles Tab ────────────────────────────────────────────────────────────────

function StylesTab({ styles, onRefresh }) {
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', color: '#6366f1' });
  const [adding, setAdding] = useState(false);
  const [presetForm, setPresetForm] = useState({ task_type: 'brew', day_offset: 0 });
  const [saving, setSaving] = useState(false);

  const inputCls = 'bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500';

  const saveStyle = async () => {
    setSaving(true);
    if (editId) {
      await fetch(`${API}/api/production-schedule/styles/${editId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
    } else {
      await fetch(`${API}/api/production-schedule/styles`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
    }
    setSaving(false);
    setAdding(false);
    setEditId(null);
    onRefresh();
  };

  const deleteStyle = async (id) => {
    if (!window.confirm('Delete this style?')) return;
    await fetch(`${API}/api/production-schedule/styles/${id}`, { method: 'DELETE', credentials: 'include' });
    onRefresh();
  };

  const addPreset = async (styleId) => {
    await fetch(`${API}/api/production-schedule/styles/${styleId}/presets`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(presetForm),
    });
    setPresetForm({ task_type: 'brew', day_offset: 0 });
    onRefresh();
  };

  const deletePreset = async (styleId, presetId) => {
    await fetch(`${API}/api/production-schedule/styles/${styleId}/presets/${presetId}`, { method: 'DELETE', credentials: 'include' });
    onRefresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">Beer Styles</h3>
        <button onClick={() => { setAdding(true); setEditId(null); setForm({ name: '', color: '#6366f1' }); }}
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: '#F05A28' }}>
          + New Style
        </button>
      </div>

      {(adding || editId) && (
        <div className="bg-gray-700 rounded-xl p-4 mb-4 border border-gray-600">
          <div className="flex gap-3 mb-3 flex-wrap">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Style name (e.g. IPA, Lager…)" className={inputCls + ' flex-1'} />
            <div className="flex items-center gap-2">
              <label className="text-gray-400 text-sm">Color</label>
              <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                className="w-10 h-9 rounded cursor-pointer border border-gray-600 bg-transparent" />
              <span className="text-gray-400 text-xs font-mono">{form.color}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveStyle} disabled={!form.name || saving}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#F05A28' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => { setAdding(false); setEditId(null); }}
              className="px-4 py-1.5 rounded-lg text-sm font-medium bg-gray-600 text-gray-300 hover:bg-gray-500">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {styles.map(s => (
          <div key={s.id} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            {/* Style header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700">
              <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-white font-semibold flex-1">{s.name}</span>
              <button onClick={() => { setEditId(s.id); setAdding(false); setForm({ name: s.name, color: s.color }); }}
                className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-gray-700">Edit</button>
              <button onClick={() => deleteStyle(s.id)}
                className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-gray-700">Delete</button>
            </div>

            {/* Preset tasks */}
            <div className="px-4 py-3">
              <p className="text-gray-500 text-xs mb-2 uppercase tracking-wide">Task Presets</p>
              {s.presets.length === 0 && <p className="text-gray-600 text-xs mb-2">No presets yet</p>}
              <div className="space-y-1 mb-3">
                {s.presets.map(p => {
                  const tt = TASK_MAP[p.task_type] || TASK_MAP.other;
                  return (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded w-12 text-center shrink-0"
                        style={{ backgroundColor: tt.bg, color: tt.color }}>{tt.short}</span>
                      <span className="text-gray-400 text-xs">Day {p.day_offset}</span>
                      <button onClick={() => deletePreset(s.id, p.id)}
                        className="ml-auto text-gray-600 hover:text-red-400 text-xs">✕</button>
                    </div>
                  );
                })}
              </div>
              {/* Add preset */}
              <div className="flex gap-2 flex-wrap">
                <select value={presetForm.task_type} onChange={e => setPresetForm(f => ({ ...f, task_type: e.target.value }))}
                  className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none">
                  {TASK_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <div className="flex items-center gap-1">
                  <span className="text-gray-500 text-xs">Day</span>
                  <input type="number" min="0" value={presetForm.day_offset}
                    onChange={e => setPresetForm(f => ({ ...f, day_offset: parseInt(e.target.value) || 0 }))}
                    className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs w-14 focus:outline-none" />
                </div>
                <button onClick={() => addPreset(s.id)}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs">+ Add</button>
              </div>
            </div>
          </div>
        ))}
        {styles.length === 0 && !adding && (
          <p className="text-gray-500 text-center py-8">No styles yet. Create one above.</p>
        )}
      </div>
    </div>
  );
}

// ── Manage View ───────────────────────────────────────────────────────────────

function ManageView({ tanks, beers, styles, onRefresh }) {
  const [manageTab, setManageTab] = useState('tanks');
  const [tankName, setTankName] = useState('');
  const [tankCap, setTankCap] = useState('');
  const [editTank, setEditTank] = useState(null);
  const [beerName, setBeerName] = useState('');
  const [beerStyle, setBeerStyle] = useState('');
  const [editBeer, setEditBeer] = useState(null);
  const [beerForm, setBeerForm] = useState({ name: '', style: '', status: 'active', notes: '', style_id: null });
  const [saving, setSaving] = useState(false);

  const inputCls = 'bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500';

  const saveTank = async () => {
    if (!tankName.trim()) return;
    setSaving(true);
    if (editTank) {
      await fetch(`${API}/api/production-schedule/tanks/${editTank.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tankName, capacity_bbl: tankCap || null }),
      });
    } else {
      await fetch(`${API}/api/production-schedule/tanks`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tankName, capacity_bbl: tankCap || null }),
      });
    }
    setSaving(false);
    setTankName(''); setTankCap(''); setEditTank(null);
    onRefresh();
  };

  const deleteTank = async (id) => {
    if (!window.confirm('Delete this tank?')) return;
    await fetch(`${API}/api/production-schedule/tanks/${id}`, { method: 'DELETE', credentials: 'include' });
    onRefresh();
  };

  const toggleTankActive = async (tank) => {
    await fetch(`${API}/api/production-schedule/tanks/${tank.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !tank.active }),
    });
    onRefresh();
  };

  const saveBeer = async () => {
    if (!beerName.trim()) return;
    setSaving(true);
    if (editBeer) {
      await fetch(`${API}/api/production-schedule/beers/${editBeer.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: beerName, style: beerStyle || null, style_id: beerForm.style_id }),
      });
    } else {
      await fetch(`${API}/api/production-schedule/beers`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: beerName, style: beerStyle || null, style_id: beerForm.style_id }),
      });
    }
    setSaving(false);
    setBeerName(''); setBeerStyle(''); setEditBeer(null); setBeerForm({ name: '', style: '', status: 'active', notes: '', style_id: null });
    onRefresh();
  };

  const archiveBeer = async (id) => {
    if (!window.confirm('Archive this beer?')) return;
    await fetch(`${API}/api/production-schedule/beers/${id}`, { method: 'DELETE', credentials: 'include' });
    onRefresh();
  };

  return (
    <div>
      <div className="flex gap-2 mb-6">
        {[{ key: 'tanks', label: 'Tanks' }, { key: 'beers', label: 'Beers' }, { key: 'styles', label: 'Styles' }].map(t => (
          <button key={t.key} onClick={() => setManageTab(t.key)}
            className={`px-3 py-1.5 text-sm rounded-lg transition ${manageTab === t.key ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {manageTab === 'tanks' && (
        <div className="max-w-lg space-y-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
            <h4 className="text-gray-300 text-sm font-semibold">{editTank ? 'Edit Tank' : 'Add Tank'}</h4>
            <div className="flex gap-2">
              <input className={`flex-1 ${inputCls}`} placeholder="Tank name…" value={tankName} onChange={e => setTankName(e.target.value)} />
              <input className={`w-24 ${inputCls}`} placeholder="BBL" type="number" step="0.1" value={tankCap} onChange={e => setTankCap(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button onClick={saveTank} disabled={!tankName.trim() || saving}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
                style={{ backgroundColor: '#F05A28' }}>
                {saving ? 'Saving…' : editTank ? 'Update' : 'Add Tank'}
              </button>
              {editTank && <button onClick={() => { setEditTank(null); setTankName(''); setTankCap(''); }} className="px-3 py-1.5 rounded-lg text-sm bg-gray-600 text-gray-300">Cancel</button>}
            </div>
          </div>
          <div className="space-y-2">
            {tanks.map(tank => (
              <div key={tank.id} className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3">
                <div className="flex-1">
                  <span className={`text-sm font-medium ${tank.active ? 'text-white' : 'text-gray-500 line-through'}`}>{tank.name}</span>
                  {tank.capacity_bbl && <span className="text-gray-500 text-xs ml-2">{tank.capacity_bbl} bbl</span>}
                </div>
                <button onClick={() => toggleTankActive(tank)} className={`text-xs px-2 py-0.5 rounded ${tank.active ? 'text-green-400 bg-green-900/30' : 'text-gray-500 bg-gray-700'}`}>
                  {tank.active ? 'Active' : 'Hidden'}
                </button>
                <button onClick={() => { setEditTank(tank); setTankName(tank.name); setTankCap(tank.capacity_bbl || ''); }} className="text-sm text-gray-400 hover:text-orange-400 transition px-2 py-1 rounded border border-gray-600 hover:border-orange-500">Edit</button>
                <button onClick={() => deleteTank(tank.id)} className="text-sm text-gray-500 hover:text-red-400 transition">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {manageTab === 'beers' && (
        <div className="max-w-lg space-y-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
            <h4 className="text-gray-300 text-sm font-semibold">{editBeer ? 'Edit Beer' : 'Add Beer'}</h4>
            <input className={`w-full ${inputCls}`} placeholder="Beer name…" value={beerName} onChange={e => setBeerName(e.target.value)} />
            <input className={`w-full ${inputCls}`} placeholder="Style (optional)…" value={beerStyle} onChange={e => setBeerStyle(e.target.value)} />
            <select value={beerForm.style_id || ''} onChange={e => setBeerForm(f => ({ ...f, style_id: e.target.value ? parseInt(e.target.value) : null }))}
              className={`w-full ${inputCls}`}>
              <option value="">— No style —</option>
              {styles.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={saveBeer} disabled={!beerName.trim() || saving}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
                style={{ backgroundColor: '#F05A28' }}>
                {saving ? 'Saving…' : editBeer ? 'Update' : 'Add Beer'}
              </button>
              {editBeer && <button onClick={() => { setEditBeer(null); setBeerName(''); setBeerStyle(''); setBeerForm({ name: '', style: '', status: 'active', notes: '', style_id: null }); }} className="px-3 py-1.5 rounded-lg text-sm bg-gray-600 text-gray-300">Cancel</button>}
            </div>
          </div>
          <div className="space-y-2">
            {beers.map(beer => (
              <div key={beer.id} className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3">
                <div className="flex-1">
                  <span className="text-white text-sm font-medium">{beer.name}</span>
                  {beer.style && <span className="text-gray-500 text-xs ml-2">{beer.style}</span>}
                  {beer.style_name && <span className="text-gray-600 text-xs ml-1">({beer.style_name})</span>}
                </div>
                <button onClick={() => { setEditBeer(beer); setBeerName(beer.name); setBeerStyle(beer.style || ''); setBeerForm({ name: beer.name, style: beer.style || '', status: beer.status || 'active', notes: beer.notes || '', style_id: beer.style_id || null }); }} className="text-sm text-gray-400 hover:text-orange-400 transition px-2 py-1 rounded border border-gray-600 hover:border-orange-500">Edit</button>
                <button onClick={() => archiveBeer(beer.id)} className="text-sm text-gray-500 hover:text-red-400 transition">Archive</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {manageTab === 'styles' && (
        <StylesTab styles={styles} onRefresh={onRefresh} />
      )}
    </div>
  );
}


// ── Main Component ────────────────────────────────────────────────────────────

export default function ProductionSchedule({ user, canUpload, onBack }) {
  const [tanks, setTanks] = useState([]);
  const [beers, setBeers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]); // wider range for tracker/task list
  const [users, setUsers] = useState([]);
  const [styles, setStyles] = useState([]);
  const [tab, setTab] = useState('schedule');
  const defaultViewStart = addDays(getMonday(new Date()), -14); // Monday 2 weeks ago
  const [viewStart, setViewStart] = useState(defaultViewStart);
  const [viewWeeks, setViewWeeks] = useState(5);
  const [cellModal, setCellModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState(null);
  const dragCommitted = useRef(false);

  const startDrag = useCallback((mode, id, tankId, startDate, extras) => {
    dragCommitted.current = false;
    setDrag({ mode, id, tankId, startDate, currentDate: startDate, currentTankId: tankId, ...extras });
  }, []);

  // Global mouse move + up listeners while dragging
  useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const td = el?.closest('[data-date]');
      if (!td) return;
      setDrag(d => d ? { ...d, currentDate: td.dataset.date, currentTankId: parseInt(td.dataset.tankId) } : null);
    };
    const onUp = async () => {
      if (dragCommitted.current) return;
      dragCommitted.current = true;
      const d = drag;
      setDrag(null);
      const diff = dateDiff(d.startDate, d.currentDate);
      const tankChanged = d.currentTankId !== d.tankId;
      if (diff === 0 && !tankChanged) return;
      if (d.mode === 'resize_asgn') {
        const base = d.originalEnd || d.startDate;
        const newEnd = addDays(base, diff);
        if (newEnd < d.originalStart) return;
        await fetch(`${API}/api/production-schedule/assignments/${d.id}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ end_date: newEnd }),
        });
      } else if (d.mode === 'move_asgn') {
        await fetch(`${API}/api/production-schedule/assignments/${d.id}/shift`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days: diff, new_tank_id: d.currentTankId, move_tasks: true }),
        });
      } else if (d.mode === 'move_task') {
        const newDate = addDays(d.startDate, diff);
        await fetch(`${API}/api/production-schedule/tasks/${d.id}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: newDate, tank_id: d.currentTankId }),
        });
      }
      handleRefresh();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [drag]); // eslint-disable-line react-hooks/exhaustive-deps

  const viewEnd = addDays(viewStart, viewWeeks * 7 - 1);

  // Wider range for task list and tracker (12 weeks back + 12 weeks forward)
  const allStart = addDays(getMonday(new Date()), -84);
  const allEnd = addDays(getMonday(new Date()), 84);

  const loadGrid = useCallback(async () => {
    const r = await fetch(`${API}/api/production-schedule/grid?start=${viewStart}&end=${viewEnd}`, { credentials: 'include' }).then(r => r.json());
    if (r.assignments) setAssignments(r.assignments);
    if (r.tasks) setTasks(r.tasks);
  }, [viewStart, viewEnd]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tanksRes, beersRes, usersRes, allRes, stylesRes] = await Promise.all([
        fetch(`${API}/api/production-schedule/tanks`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API}/api/production-schedule/beers`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API}/api/production-schedule/users`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API}/api/production-schedule/grid?start=${allStart}&end=${allEnd}`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API}/api/production-schedule/styles`, { credentials: 'include' }).then(r => r.json()),
      ]);
      setTanks(Array.isArray(tanksRes) ? tanksRes : []);
      setBeers(Array.isArray(beersRes) ? beersRes : []);
      setUsers(Array.isArray(usersRes) ? usersRes : []);
      setStyles(Array.isArray(stylesRes) ? stylesRes : []);
      if (allRes.assignments) setAssignments(allRes.assignments);
      if (allRes.tasks) { setTasks(allRes.tasks); setAllTasks(allRes.tasks); }
    } catch {}
    setLoading(false);
  }, [allStart, allEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loading) loadGrid();
  }, [viewStart, viewWeeks]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => { loadGrid(); loadAll(); };

  const dates = Array.from({ length: viewWeeks * 7 }, (_, i) => addDays(viewStart, i));

  const openCellModal = (date, tank, assignment, cellTasks) => {
    if (!canUpload && !cellTasks.length) return; // view users can only click cells with tasks
    setCellModal({ date, tank, assignment, tasks: cellTasks });
  };

  const TABS = [
    { key: 'schedule', label: 'Schedule' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'beers', label: 'Beers' },
    ...(canUpload ? [{ key: 'manage', label: 'Manage' }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Nav */}
      <nav className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-2 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 hover:opacity-80 transition">
          <span className="text-lg font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream text-lg font-bold">HQ</span>
        </button>
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>

      <main className="px-4 sm:px-6 py-2">
        {/* Tabs */}
        <div className="flex gap-1 mb-2 border-b border-gray-700 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition -mb-px ${tab === t.key ? 'border-orange-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && <p className="text-gray-500 text-center py-16">Loading…</p>}

        {!loading && tab === 'schedule' && (
          <div>
            {/* Grid controls */}
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <div className="flex items-center gap-1">
                <button onClick={() => setViewStart(addDays(viewStart, -7))}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm">←</button>
                <button onClick={() => setViewStart(addDays(getMonday(new Date()), -14))}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm">Today</button>
                <button onClick={() => setViewStart(addDays(viewStart, 7))}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm">→</button>
              </div>
              <span className="text-gray-400 text-sm">{formatDateLabel(viewStart)} – {formatDateLabel(viewEnd)}</span>
              <div className="flex items-center gap-1 ml-auto">
                {[2, 4, 5, 8, 12].map(w => (
                  <button key={w} onClick={() => setViewWeeks(w)}
                    className={`px-2 py-1 rounded text-xs ${viewWeeks === w ? 'bg-gray-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'}`}>
                    {w}w
                  </button>
                ))}
              </div>
            </div>

            <ScheduleGrid
              tanks={tanks}
              assignments={assignments}
              tasks={tasks}
              dates={dates}
              canManage={canUpload}
              drag={drag}
              onCellClick={openCellModal}
              onDragStart={startDrag}
            />
            {tanks.filter(t => t.active).length === 0 && (
              <p className="text-gray-500 text-center py-12 mt-4">No tanks configured. Add tanks in the Manage tab.</p>
            )}
          </div>
        )}

        {!loading && tab === 'tasks' && (
          <TaskListView
            tasks={allTasks}
            users={users}
            currentUser={user}
            canManage={canUpload}
            onRefresh={handleRefresh}
          />
        )}

        {!loading && tab === 'beers' && (
          <BeerTrackerView
            beers={beers}
            assignments={assignments}
            tasks={allTasks}
          />
        )}

        {!loading && tab === 'manage' && canUpload && (
          <ManageView tanks={tanks} beers={beers} styles={styles} onRefresh={loadAll} />
        )}
      </main>

      {cellModal && (() => {
        const liveAssignment = assignments.find(a =>
          a.tank_id === cellModal.tank.id &&
          a.start_date <= cellModal.date &&
          (a.end_date === null || a.end_date >= cellModal.date)
        ) || null;
        const liveTasks = tasks.filter(t => t.tank_id === cellModal.tank.id && t.date === cellModal.date);
        return (
          <CellModal
            date={cellModal.date}
            tank={cellModal.tank}
            assignment={liveAssignment}
            tasks={liveTasks}
            beers={beers}
            users={users}
            canManage={canUpload}
            onClose={() => setCellModal(null)}
            onRefresh={handleRefresh}
          />
        );
      })()}
    </div>
  );
}
