import { useState, useEffect, useCallback } from 'react';

const API = process.env.REACT_APP_API_URL || '';

const TASK_TYPES = [
  { key: 'brew',               label: 'Brew',               short: 'Brew',  color: '#F05A28', bg: 'rgba(240,90,40,0.28)'   },
  { key: 'transfer',           label: 'Transfer',           short: 'Tx',    color: '#10B981', bg: 'rgba(16,185,129,0.22)'  },
  { key: 'dry_hop_1',          label: 'Dry Hop 1',          short: 'DH1',   color: '#34D399', bg: 'rgba(52,211,153,0.2)'   },
  { key: 'dry_hop_2',          label: 'Dry Hop 2',          short: 'DH2',   color: '#6EE7B7', bg: 'rgba(110,231,183,0.18)' },
  { key: 'pressurize_release', label: 'Pressurize/Release', short: 'P/R',   color: '#A78BFA', bg: 'rgba(167,139,250,0.2)'  },
  { key: 'vdk_crash',          label: 'VDK/Crash',          short: 'VDK',   color: '#8B5CF6', bg: 'rgba(139,92,246,0.28)'  },
  { key: 'carb',               label: 'Carb',               short: 'Carb',  color: '#60A5FA', bg: 'rgba(96,165,250,0.22)'  },
  { key: 'adjunct',            label: 'Adjunct',            short: 'Adj',   color: '#FBBF24', bg: 'rgba(251,191,36,0.2)'   },
  { key: 'package',            label: 'Package',            short: 'Pkg',   color: '#3B82F6', bg: 'rgba(59,130,246,0.3)'   },
  { key: 'ramp_soak',          label: 'Ramp/Soak',          short: 'R&S',   color: '#FCD34D', bg: 'rgba(252,211,77,0.2)'   },
  { key: 'harvest',            label: 'Harvest',            short: 'Harv',  color: '#4ADE80', bg: 'rgba(74,222,128,0.2)'   },
  { key: 'whirl',              label: 'Whirl',              short: 'Whirl', color: '#2DD4BF', bg: 'rgba(45,212,191,0.2)'   },
  { key: 'other',              label: 'Other',              short: '…',     color: '#9CA3AF', bg: 'rgba(156,163,175,0.15)' },
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
  const [saving, setSaving] = useState(false);

  const toggleAssignee = (id) => setTaskAssignees(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );

  const handleAssign = async () => {
    if (!assignBeerId) return;
    setSaving(true);
    await fetch(`${API}/api/production-schedule/assignments`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beer_id: parseInt(assignBeerId), tank_id: tank.id, start_date: assignStart }),
    });
    setSaving(false);
    onRefresh();
    setShowAssignForm(false);
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

function ScheduleGrid({ tanks, assignments, tasks, dates, canManage, onCellClick }) {
  const getAssignment = useCallback((tankId, date) => {
    return assignments.find(a =>
      a.tank_id === tankId &&
      a.start_date <= date &&
      (a.end_date === null || a.end_date >= date)
    ) || null;
  }, [assignments]);

  const getCellTasks = useCallback((tankId, date) => {
    return tasks.filter(t => t.tank_id === tankId && t.date === date);
  }, [tasks]);

  const cellBorder = '1px solid rgba(75,85,99,0.35)';

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={{
              position: 'sticky', top: 0, left: 0, zIndex: 30,
              backgroundColor: '#1f2937', width: 72, minWidth: 72,
              padding: '8px 6px', borderRight: cellBorder, borderBottom: cellBorder,
              textAlign: 'left', fontSize: 11, color: '#9ca3af', fontWeight: 600,
            }}>Date</th>
            {tanks.filter(t => t.active).map(tank => (
              <th key={tank.id} style={{
                position: 'sticky', top: 0, zIndex: 20,
                backgroundColor: '#1f2937', width: 120, minWidth: 120,
                padding: '8px 8px', borderRight: cellBorder, borderBottom: cellBorder,
                textAlign: 'left', fontSize: 11, color: '#e5e7eb', fontWeight: 700,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{tank.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map(date => {
            const wknd = isWeekend(date);
            const today = isToday(date);
            return (
              <tr key={date}>
                <td style={{
                  position: 'sticky', left: 0, zIndex: 10,
                  backgroundColor: today ? '#1e3a2f' : wknd ? '#161e29' : '#111827',
                  width: 72, minWidth: 72, padding: '4px 6px',
                  borderRight: cellBorder, borderBottom: cellBorder,
                  fontSize: 11, fontWeight: today ? 700 : 500,
                  color: today ? '#34d399' : wknd ? '#6b7280' : '#d1d5db',
                  whiteSpace: 'nowrap',
                }}>
                  {formatDateLabel(date)}
                </td>
                {tanks.filter(t => t.active).map(tank => {
                  const asgn = getAssignment(tank.id, date);
                  const cellTasks = getCellTasks(tank.id, date);
                  const primary = getPrimaryTask(cellTasks);
                  const hasCompleted = cellTasks.length > 0 && cellTasks.every(t => t.completed);

                  let bgColor = wknd ? 'rgba(0,0,0,0.25)' : 'transparent';
                  if (asgn && !primary) bgColor = 'rgba(242,237,228,0.04)';
                  if (primary) bgColor = hasCompleted ? 'rgba(74,222,128,0.08)' : (TASK_MAP[primary.task_type]?.bg || bgColor);

                  return (
                    <td key={tank.id}
                      onClick={() => onCellClick(date, tank, asgn, cellTasks)}
                      style={{
                        backgroundColor: bgColor,
                        width: 120, minWidth: 120, maxWidth: 120,
                        padding: '3px 5px', verticalAlign: 'top',
                        borderRight: cellBorder, borderBottom: cellBorder,
                        cursor: canManage || cellTasks.length ? 'pointer' : 'default',
                        height: 42,
                      }}>
                      {asgn && (
                        <div>
                          <div style={{ fontSize: 11, color: primary ? '#fff' : '#d1d5db', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                            {asgn.beer_name}
                          </div>
                          {cellTasks.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 2 }}>
                              {cellTasks.slice(0, 2).map(t => {
                                const tt = TASK_MAP[t.task_type] || TASK_MAP.other;
                                return (
                                  <span key={t.id} style={{
                                    fontSize: 9, fontWeight: 700,
                                    color: t.completed ? '#6b7280' : tt.color,
                                    backgroundColor: t.completed ? 'rgba(107,114,128,0.15)' : (tt.color + '22'),
                                    padding: '1px 3px', borderRadius: 3,
                                    textDecoration: t.completed ? 'line-through' : 'none',
                                  }}>{tt.short}</span>
                                );
                              })}
                              {cellTasks.length > 2 && <span style={{ fontSize: 9, color: '#9ca3af' }}>+{cellTasks.length - 2}</span>}
                            </div>
                          )}
                        </div>
                      )}
                      {!asgn && canManage && (
                        <div style={{ fontSize: 10, color: 'rgba(75,85,99,0.5)', paddingTop: 4 }}>+</div>
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
    if (t.date < weekStart || t.date > weekEnd) return false;
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
        const dayTasks = filtered.filter(t => t.date === date);
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

      {filtered.length === 0 && (
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

// ── Manage View ───────────────────────────────────────────────────────────────

function ManageView({ tanks, beers, onRefresh }) {
  const [manageTab, setManageTab] = useState('tanks');
  const [tankName, setTankName] = useState('');
  const [tankCap, setTankCap] = useState('');
  const [editTank, setEditTank] = useState(null);
  const [beerName, setBeerName] = useState('');
  const [beerStyle, setBeerStyle] = useState('');
  const [editBeer, setEditBeer] = useState(null);
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
        body: JSON.stringify({ name: beerName, style: beerStyle || null }),
      });
    } else {
      await fetch(`${API}/api/production-schedule/beers`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: beerName, style: beerStyle || null }),
      });
    }
    setSaving(false);
    setBeerName(''); setBeerStyle(''); setEditBeer(null);
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
        {[{ key: 'tanks', label: 'Tanks' }, { key: 'beers', label: 'Beers' }].map(t => (
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
            <div className="flex gap-2">
              <button onClick={saveBeer} disabled={!beerName.trim() || saving}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
                style={{ backgroundColor: '#F05A28' }}>
                {saving ? 'Saving…' : editBeer ? 'Update' : 'Add Beer'}
              </button>
              {editBeer && <button onClick={() => { setEditBeer(null); setBeerName(''); setBeerStyle(''); }} className="px-3 py-1.5 rounded-lg text-sm bg-gray-600 text-gray-300">Cancel</button>}
            </div>
          </div>
          <div className="space-y-2">
            {beers.map(beer => (
              <div key={beer.id} className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3">
                <div className="flex-1">
                  <span className="text-white text-sm font-medium">{beer.name}</span>
                  {beer.style && <span className="text-gray-500 text-xs ml-2">{beer.style}</span>}
                </div>
                <button onClick={() => { setEditBeer(beer); setBeerName(beer.name); setBeerStyle(beer.style || ''); }} className="text-sm text-gray-400 hover:text-orange-400 transition px-2 py-1 rounded border border-gray-600 hover:border-orange-500">Edit</button>
                <button onClick={() => archiveBeer(beer.id)} className="text-sm text-gray-500 hover:text-red-400 transition">Archive</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {TASK_TYPES.filter(t => t.key !== 'other').map(t => (
        <span key={t.key} className="text-xs px-2 py-0.5 rounded font-semibold"
          style={{ backgroundColor: t.color + '22', color: t.color }}>
          {t.short}
        </span>
      ))}
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
  const [tab, setTab] = useState('schedule');
  const [viewStart, setViewStart] = useState(getMonday(new Date()));
  const [viewWeeks, setViewWeeks] = useState(4);
  const [cellModal, setCellModal] = useState(null);
  const [loading, setLoading] = useState(true);

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
      const [tanksRes, beersRes, usersRes, allRes] = await Promise.all([
        fetch(`${API}/api/production-schedule/tanks`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API}/api/production-schedule/beers`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API}/api/production-schedule/users`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API}/api/production-schedule/grid?start=${allStart}&end=${allEnd}`, { credentials: 'include' }).then(r => r.json()),
      ]);
      setTanks(Array.isArray(tanksRes) ? tanksRes : []);
      setBeers(Array.isArray(beersRes) ? beersRes : []);
      setUsers(Array.isArray(usersRes) ? usersRes : []);
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
      <nav className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition">
          <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream text-2xl font-bold">HQ</span>
        </button>
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm transition">← Back to Dashboard</button>
      </nav>

      <main className="px-4 sm:px-6 py-6 sm:py-8">
        {/* Title */}
        <h1 className="text-cream text-3xl sm:text-4xl font-bold mb-6">Production Schedule</h1>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-gray-700 overflow-x-auto">
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
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-1">
                <button onClick={() => setViewStart(addDays(viewStart, -7))}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm">←</button>
                <button onClick={() => setViewStart(getMonday(new Date()))}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm">Today</button>
                <button onClick={() => setViewStart(addDays(viewStart, 7))}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm">→</button>
              </div>
              <span className="text-gray-400 text-sm">{formatDateLabel(viewStart)} – {formatDateLabel(viewEnd)}</span>
              <div className="flex items-center gap-1 ml-auto">
                {[2, 4, 8].map(w => (
                  <button key={w} onClick={() => setViewWeeks(w)}
                    className={`px-2 py-1 rounded text-xs ${viewWeeks === w ? 'bg-gray-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'}`}>
                    {w}w
                  </button>
                ))}
              </div>
            </div>
            <Legend />
            <ScheduleGrid
              tanks={tanks}
              assignments={assignments}
              tasks={tasks}
              dates={dates}
              canManage={canUpload}
              onCellClick={openCellModal}
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
          <ManageView tanks={tanks} beers={beers} onRefresh={loadAll} />
        )}
      </main>

      {cellModal && (
        <CellModal
          date={cellModal.date}
          tank={cellModal.tank}
          assignment={cellModal.assignment}
          tasks={cellModal.tasks}
          beers={beers}
          users={users}
          canManage={canUpload}
          onClose={() => setCellModal(null)}
          onRefresh={() => { setCellModal(null); handleRefresh(); }}
        />
      )}
    </div>
  );
}
