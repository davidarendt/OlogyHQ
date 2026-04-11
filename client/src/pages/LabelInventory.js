import { useState, useEffect, useRef } from 'react';

const API = 'http://localhost:5000';

function calcInv(label) {
  return parseFloat(label.num_rolls || 0) * parseInt(label.labels_per_roll || 2500);
}

function calcOrder(label) {
  const inv = calcInv(label);
  return inv < parseInt(label.low_par) ? Math.max(0, parseInt(label.high_par) - inv) : 0;
}

function status(label) {
  const inv = calcInv(label);
  const low = parseInt(label.low_par);
  if (inv < low)        return 'reorder';
  if (inv < low * 1.25) return 'low';
  return 'ok';
}

function fmtNum(n) { return Number(n).toLocaleString(); }

function fmtDate(iso) {
  if (!iso || new Date(iso).getFullYear() < 2000) return 'Never';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const STATUS_CONFIG = {
  reorder: { label: 'REORDER', bg: 'bg-red-500/20',   border: 'border-red-500/40',   text: 'text-red-400',   dot: 'bg-red-500'   },
  low:     { label: 'LOW',     bg: 'bg-amber-500/20', border: 'border-amber-500/40', text: 'text-amber-400', dot: 'bg-amber-500' },
  ok:      { label: 'OK',      bg: 'bg-green-500/20', border: 'border-green-500/40', text: 'text-green-400', dot: 'bg-green-500' },
};

// ── Order Email Modal (editable quantities) ───────────────────────────────────
function OrderEmailModal({ labels, onClose, onSent }) {
  const needReorder = labels.filter(l => calcOrder(l) > 0);
  const [qtys, setQtys] = useState(() => {
    const init = {};
    needReorder.forEach(l => { init[l.id] = calcOrder(l); });
    return init;
  });
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState('');

  const handleSend = async () => {
    setSending(true);
    const res  = await fetch(`${API}/api/label-inventory/send-order-email`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides: qtys }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.message); setSending(false); return; }
    onSent(data.message);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center px-4">
      <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-md p-6 space-y-5">
        <div>
          <h3 className="text-white font-semibold text-lg">Review Order Email</h3>
          <p className="text-gray-400 text-sm mt-1">Adjust quantities before sending if needed.</p>
        </div>

        {needReorder.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">No items currently need reordering.</p>
        ) : (
          <div className="space-y-3">
            {needReorder.map(l => (
              <div key={l.id} className="flex items-center justify-between gap-4">
                <span className="text-white text-sm flex-1">{l.name}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min="0"
                    value={qtys[l.id] ?? 0}
                    onChange={e => setQtys(p => ({ ...p, [l.id]: e.target.value }))}
                    className="w-28 bg-gray-700 text-white text-right px-3 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <span className="text-gray-500 text-sm">labels</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <div className="px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-sm">{error}</div>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-600 text-gray-300 text-sm hover:bg-gray-700 transition">Cancel</button>
          <button onClick={handleSend} disabled={sending}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition"
            style={{ backgroundColor: '#FF6B00' }}>
            {sending ? 'Sending…' : 'Send Email'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inline roll editor ────────────────────────────────────────────────────────
function RollCell({ label, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(parseFloat(label.num_rolls));
  const inputRef              = useRef();

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const save = async () => {
    setEditing(false);
    if (parseFloat(val) === parseFloat(label.num_rolls)) return;
    const res  = await fetch(`${API}/api/label-inventory/${label.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...label, num_rolls: val }),
    });
    const data = await res.json();
    if (res.ok) onSaved(data);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number" step="0.5" min="0"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        className="w-20 bg-gray-700 text-white text-right px-2 py-1 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-gray-300 text-sm hover:text-white hover:underline transition group flex items-center gap-1 ml-auto"
      title="Click to edit"
    >
      {parseFloat(label.num_rolls)}
      <span className="text-gray-600 text-xs opacity-0 group-hover:opacity-100 transition">✎</span>
    </button>
  );
}

// ── Edit Modal (Manage tab) ───────────────────────────────────────────────────
function EditModal({ label, isNew, onClose, onSaved }) {
  const [form, setForm] = useState({
    name:            label?.name            || '',
    num_rolls:       label?.num_rolls       ?? '',
    labels_per_roll: label?.labels_per_roll ?? 2500,
    labels_on_order: label?.labels_on_order ?? 0,
    low_par:         label?.low_par         ?? '',
    high_par:        label?.high_par        ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }));
  const currentInv = parseFloat(form.num_rolls || 0) * parseInt(form.labels_per_roll || 2500);

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    const url    = isNew ? `${API}/api/label-inventory` : `${API}/api/label-inventory/${label.id}`;
    const method = isNew ? 'POST' : 'PATCH';
    const res    = await fetch(url, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.message); setSaving(false); return; }
    onSaved(data);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center px-4">
      <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-md p-6 space-y-4">
        <h3 className="text-white font-semibold text-lg">{isNew ? 'Add Label' : `Edit — ${label.name}`}</h3>
        {error && <div className="px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-sm">{error}</div>}

        {isNew && (
          <div>
            <label className="block text-gray-400 text-sm mb-1">Label Name</label>
            <input value={form.name} onChange={set('name')} placeholder="e.g. Sensory Overload"
              className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {[
            ['num_rolls', 'Current Rolls', 'number', '0.5'],
            ['labels_per_roll', 'Labels / Roll', 'number', '1'],
            ['low_par', 'Low Par', 'number', '1'],
            ['high_par', 'High Par', 'number', '1'],
          ].map(([field, lbl, type, step]) => (
            <div key={field}>
              <label className="block text-gray-400 text-sm mb-1">{lbl}</label>
              <input type={type} step={step} min="0" value={form[field]} onChange={set(field)}
                className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          ))}
          <div className="col-span-2">
            <label className="block text-gray-400 text-sm mb-1">Labels on Order</label>
            <input type="number" min="0" value={form.labels_on_order} onChange={set('labels_on_order')}
              className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
        </div>

        <div className="px-4 py-3 rounded-lg bg-gray-700/50 border border-gray-600 text-sm flex items-center justify-between">
          <span className="text-gray-400">Current Inventory</span>
          <span className="text-white font-semibold">{fmtNum(currentInv)} labels</span>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-600 text-gray-300 text-sm hover:bg-gray-700 transition">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition"
            style={{ backgroundColor: '#FF6B00' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Email List Modal ──────────────────────────────────────────────────────────
function EmailModal({ onClose }) {
  const [emails, setEmails]     = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding]     = useState(false);

  useEffect(() => {
    fetch(`${API}/api/label-email-list`, { credentials: 'include' })
      .then(r => r.json()).then(d => setEmails(Array.isArray(d) ? d : []));
  }, []);

  const add = async () => {
    if (!newEmail.trim()) return;
    setAdding(true);
    const res  = await fetch(`${API}/api/label-email-list`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail.trim() }),
    });
    const data = await res.json();
    if (res.ok && data) setEmails(prev => [...prev, data]);
    setNewEmail('');
    setAdding(false);
  };

  const remove = async (id) => {
    await fetch(`${API}/api/label-email-list/${id}`, { method: 'DELETE', credentials: 'include' });
    setEmails(prev => prev.filter(e => e.id !== id));
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center px-4">
      <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-sm p-6 space-y-4">
        <h3 className="text-white font-semibold text-lg">Order Email List</h3>
        <div className="space-y-2">
          {emails.map(e => (
            <div key={e.id} className="flex items-center justify-between px-3 py-2 bg-gray-700 rounded-lg">
              <span className="text-gray-300 text-sm">{e.email}</span>
              <button onClick={() => remove(e.id)} className="text-red-500 hover:text-red-400 text-sm transition">Remove</button>
            </div>
          ))}
          {emails.length === 0 && <p className="text-gray-600 text-sm text-center py-2">No recipients yet.</p>}
        </div>
        <div className="flex gap-2">
          <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="email@ologybrewing.com"
            className="flex-1 bg-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          <button onClick={add} disabled={adding}
            className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 transition"
            style={{ backgroundColor: '#FF6B00' }}>Add</button>
        </div>
        <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-gray-600 text-gray-300 text-sm hover:bg-gray-700 transition">Done</button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LabelInventory({ user, onBack }) {
  const [labels, setLabels]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState('inventory'); // 'inventory' | 'manage'
  const [editing, setEditing]     = useState(null);
  const [showEmail, setShowEmail] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [sendMsg, setSendMsg]               = useState('');

  const isAdmin = user.role === 'admin';

  const fetchLabels = () => {
    fetch(`${API}/api/label-inventory`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setLabels(Array.isArray(d) ? d : []); setLoading(false); });
  };

  useEffect(() => { fetchLabels(); }, []);

  const handleSaved = (updated) => {
    setLabels(prev => {
      const idx = prev.findIndex(l => l.id === updated.id);
      if (idx === -1) return [...prev, updated];
      return prev.map(l => l.id === updated.id ? updated : l);
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this label from inventory?')) return;
    await fetch(`${API}/api/label-inventory/${id}`, { method: 'DELETE', credentials: 'include' });
    setLabels(prev => prev.filter(l => l.id !== id));
  };

  const moveLabel = async (index, direction) => {
    const next = [...labels];
    const swap = index + direction;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setLabels(next);
    await fetch(`${API}/api/label-inventory/reorder`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: next.map(l => l.id) }),
    });
  };

  const handleSent = (msg) => {
    setSendMsg(msg);
    setTimeout(() => setSendMsg(''), 5000);
  };

  const needReorder  = labels.filter(l => status(l) === 'reorder');
  const lastUpdated  = labels.reduce((latest, l) => {
    const d = new Date(l.updated_at);
    return d > latest ? d : latest;
  }, new Date(0));

  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition">
          <span className="text-2xl font-bold" style={{ color: '#FF6B00' }}>OLOGY</span>
          <span className="text-white font-semibold text-xl">HQ</span>
        </button>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition">← Back to Dashboard</button>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h2 className="text-white text-4xl font-bold">Label Inventory</h2>
            <p className="text-gray-500 text-sm mt-1">Last updated: {fmtDate(lastUpdated.toISOString())}</p>
          </div>
          <div className="flex items-center gap-3">
            {view === 'inventory' && isAdmin && (
              <>
                <button onClick={() => setShowOrderModal(true)}
                  className="px-4 py-2 rounded-xl border border-orange-500/60 text-sm font-semibold transition hover:border-orange-500"
                  style={{ color: '#FF6B00' }}>
                  Send Order Email
                </button>
              </>
            )}
            {isAdmin && (
              <div className="flex gap-1 bg-gray-800 p-1 rounded-lg border border-gray-700">
                {['inventory', 'manage'].map(v => (
                  <button key={v} onClick={() => setView(v)}
                    className={`px-4 py-1.5 rounded-md text-sm font-semibold transition capitalize ${
                      view === v ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                    }`}>
                    {v === 'inventory' ? 'Inventory' : 'Manage'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {sendMsg && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-green-500/20 border border-green-500/40 text-green-300 text-sm">{sendMsg}</div>
        )}

        {loading ? <div className="text-gray-500 text-sm">Loading…</div> : (
          <>
            {/* ── Order summary (top) ── */}
            {needReorder.length > 0 && (
              <div className="mb-6 bg-gray-800 border border-gray-700 rounded-xl p-5">
                <h4 className="text-white font-semibold text-sm uppercase tracking-wider mb-3">
                  Order Summary
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-1.5">
                  {needReorder.map(l => (
                    <div key={l.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-300">{l.name}</span>
                      <span className="font-semibold ml-3" style={{ color: '#FF6B00' }}>{fmtNum(calcOrder(l))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'inventory' ? (
              /* ── Inventory view ── */
              <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Label</th>
                      <th className="text-right text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4">Rolls</th>
                      <th className="text-right text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4">Current Inv.</th>
                      <th className="text-right text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4">To Order</th>
                      <th className="text-center text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labels.map(label => {
                      const inv  = calcInv(label);
                      const order = calcOrder(label);
                      const s    = status(label);
                      const cfg  = STATUS_CONFIG[s];
                      return (
                        <tr key={label.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/20 transition">
                          <td className="px-6 py-3.5 text-white font-medium text-sm">{label.name}</td>
                          <td className="px-4 py-3.5 text-right">
                            <RollCell label={label} onSaved={handleSaved} />
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <span className={`text-sm font-semibold ${s === 'reorder' ? 'text-red-400' : s === 'low' ? 'text-amber-400' : 'text-white'}`}>
                              {fmtNum(inv)}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <span className={`text-sm font-semibold ${order > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                              {order > 0 ? fmtNum(order) : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                              {cfg.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* ── Manage view ── */
              <div>
                <div className="flex justify-end gap-2 mb-4">
                  <button onClick={() => setShowEmail(true)}
                    className="px-4 py-2 rounded-xl border border-gray-600 text-gray-300 text-sm hover:text-white hover:border-gray-500 transition">
                    Email List
                  </button>
                  <button onClick={() => setEditing('new')}
                    className="px-4 py-2 rounded-xl text-white text-sm font-semibold transition hover:opacity-90"
                    style={{ backgroundColor: '#FF6B00' }}>
                    + Add Label
                  </button>
                </div>
                <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="w-10 px-4 py-4" />
                        <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Label</th>
                        <th className="text-right text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4">Rolls</th>
                        <th className="text-right text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4 hidden lg:table-cell">Low Par</th>
                        <th className="text-right text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4 hidden lg:table-cell">High Par</th>
                        <th className="text-right text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4 hidden md:table-cell">On Order</th>
                        <th className="text-center text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4">Status</th>
                        <th className="px-4 py-4" />
                      </tr>
                    </thead>
                    <tbody>
                      {labels.map((label, i) => {
                        const s   = status(label);
                        const cfg = STATUS_CONFIG[s];
                        return (
                          <tr key={label.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/30 transition">
                            <td className="px-4 py-4">
                              <div className="flex flex-col gap-1">
                                <button onClick={() => moveLabel(i, -1)} disabled={i === 0}
                                  className="text-gray-600 hover:text-white disabled:opacity-20 text-xs leading-none transition">▲</button>
                                <button onClick={() => moveLabel(i, 1)} disabled={i === labels.length - 1}
                                  className="text-gray-600 hover:text-white disabled:opacity-20 text-xs leading-none transition">▼</button>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-white font-medium text-sm">{label.name}</td>
                            <td className="px-4 py-4 text-right text-gray-300 text-sm">{parseFloat(label.num_rolls)}</td>
                            <td className="px-4 py-4 text-right text-gray-500 text-sm hidden lg:table-cell">{fmtNum(label.low_par)}</td>
                            <td className="px-4 py-4 text-right text-gray-500 text-sm hidden lg:table-cell">{fmtNum(label.high_par)}</td>
                            <td className="px-4 py-4 text-right text-gray-400 text-sm hidden md:table-cell">
                              {parseInt(label.labels_on_order) > 0 ? fmtNum(label.labels_on_order) : '—'}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                {cfg.label}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3 justify-end">
                                <button onClick={() => setEditing(label)} className="text-sm text-gray-400 hover:text-white transition">Edit</button>
                                <button onClick={() => handleDelete(label.id)} className="text-sm text-red-500 hover:text-red-400 transition">Delete</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {editing && (
        <EditModal
          label={editing === 'new' ? null : editing}
          isNew={editing === 'new'}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
      {showEmail && <EmailModal onClose={() => setShowEmail(false)} />}
      {showOrderModal && (
        <OrderEmailModal
          labels={labels}
          onClose={() => setShowOrderModal(false)}
          onSent={handleSent}
        />
      )}
    </div>
  );
}
