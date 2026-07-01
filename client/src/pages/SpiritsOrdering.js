import { useState, useEffect, useCallback, useRef } from 'react';

const API = process.env.REACT_APP_API_URL || '';

const LOCATIONS = [
  { key: 'midtown',    label: 'Midtown',    color: '#F05A28' },
  { key: 'northside',  label: 'Northside',  color: '#22c55e' },
  { key: 'power_mill', label: 'Power Mill', color: '#3b82f6' },
  { key: 'tampa',      label: 'Tampa',      color: '#a855f7' },
];

function isoWeekStart(d = new Date()) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const dow = date.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString('en-CA');
}

function fmtQty(n) {
  const v = parseFloat(n);
  if (!isFinite(v)) return '0';
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function fmtWeekRange(weekStart) {
  if (!weekStart) return '';
  const [y, m, d] = weekStart.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}, ${y}`;
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

// ── Inline count input that saves on blur ────────────────────────────────────

function CountCell({ value, onSave, disabled }) {
  const [val, setVal] = useState(value == null ? '' : String(value));
  const [saving, setSaving] = useState(false);
  const initial = useRef(value == null ? '' : String(value));

  useEffect(() => {
    if (!saving) {
      const incoming = value == null ? '' : String(value);
      setVal(incoming);
      initial.current = incoming;
    }
  }, [value, saving]);

  const commit = async () => {
    if (val === initial.current) return;
    if (val === '' || isNaN(parseFloat(val))) {
      setVal(initial.current);
      return;
    }
    setSaving(true);
    try {
      await onSave(parseFloat(val));
      initial.current = val;
    } finally {
      setSaving(false);
    }
  };

  return (
    <input
      type="number" min="0" step="0.5" inputMode="decimal"
      value={val}
      disabled={disabled}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className="w-20 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
    />
  );
}

// ── Location landing page ─────────────────────────────────────────────────────

function LocationLanding({ onSelect, lastSync }) {
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="text-center mb-8">
        <h2 className="text-cream text-3xl sm:text-4xl font-bold">Spirits Ordering</h2>
        <p className="text-gray-400 mt-2 text-sm">Pick a location to take this week's count</p>
        {lastSync && (
          <p className="text-gray-500 text-xs mt-2">Distillery inventory last synced: {fmtDateTime(lastSync)}</p>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {LOCATIONS.map(loc => (
          <button key={loc.key} onClick={() => onSelect(loc.key)}
            className="bg-gray-800 border border-gray-700 hover:border-gray-500 rounded-2xl p-6 text-left transition group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
                style={{ backgroundColor: loc.color }}>
                {loc.label[0]}
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold text-lg">{loc.label}</h3>
                <p className="text-gray-400 text-sm">Weekly count & order</p>
              </div>
              <span className="text-gray-500 group-hover:text-white text-2xl transition">→</span>
            </div>
          </button>
        ))}
      </div>
    </main>
  );
}

// ── Order-override editor (managers only) ─────────────────────────────────────
// Blank input = auto (par − count). Any number entered persists as override.

function OrderOverrideCell({ overrideValue, autoValue, onSave }) {
  const isOverride = overrideValue != null;
  const [val, setVal] = useState(isOverride ? String(overrideValue) : '');
  const initial = useRef(isOverride ? String(overrideValue) : '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!saving) {
      const incoming = overrideValue != null ? String(overrideValue) : '';
      setVal(incoming);
      initial.current = incoming;
    }
  }, [overrideValue, saving]);

  const commit = async () => {
    if (val === initial.current) return;
    if (val !== '' && (isNaN(parseFloat(val)) || parseFloat(val) < 0)) {
      setVal(initial.current);
      return;
    }
    setSaving(true);
    try {
      await onSave(val === '' ? null : parseFloat(val));
      initial.current = val;
    } finally {
      setSaving(false);
    }
  };

  const displayAuto = autoValue != null ? fmtQty(autoValue) : '—';

  return (
    <div className="flex items-center justify-end gap-1.5">
      {isOverride && (
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
          style={{ backgroundColor: '#F05A2820', color: '#F05A28' }}
          title="Overridden by manager"
        >
          Override
        </span>
      )}
      <input
        type="number" min="0" step="0.5" inputMode="decimal"
        value={val}
        placeholder={displayAuto}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setVal(initial.current); e.currentTarget.blur(); } }}
        className={`w-20 bg-gray-700 border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-500 ${
          isOverride ? 'border-orange-500/60 text-orange-400 font-semibold' : 'border-gray-600 text-white placeholder-gray-500'
        }`}
      />
    </div>
  );
}

// ── Inventory (count entry) tab ───────────────────────────────────────────────

function InventoryTab({ location, items, counts, overrides, pars, weekStart, canUpload, onCountSaved, onOverrideSaved }) {
  const [search, setSearch] = useState('');
  const filtered = items.filter(i =>
    !search ||
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.category || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleSaveCount = async (itemId, qty) => {
    const r = await fetch(`${API}/api/spirits/counts`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, location, week_start: weekStart, count_qty: qty }),
    });
    if (r.ok) onCountSaved(itemId, qty);
  };

  const handleSaveOverride = async (itemId, override) => {
    const r = await fetch(`${API}/api/spirits/order-override`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, location, week_start: weekStart, order_override: override }),
    });
    if (r.ok) onOverrideSaved(itemId, override);
  };

  const countById = new Map(counts.map(c => [c.item_id, c]));
  const overrideById = new Map(overrides.map(o => [o.item_id, parseFloat(o.order_override)]));
  const parById = new Map(pars.map(p => [p.item_id, parseFloat(p.par_level)]));

  const computeNeeded = (item) => {
    const override = overrideById.get(item.id);
    if (override != null) return { value: override, isOverride: true };
    const par = parById.get(item.id);
    const count = countById.get(item.id);
    const auto = par != null && count?.count_qty != null
      ? Math.max(0, par - parseFloat(count.count_qty))
      : par != null ? par : null;
    return { value: auto, isOverride: false };
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search spirits…"
          className="flex-1 max-w-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
        <span className="text-gray-500 text-xs">Week of {fmtWeekRange(weekStart)}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-xl py-12 text-center text-gray-500 text-sm">
          {items.length === 0
            ? 'No spirits yet. A manager needs to sync the distillery inventory in Manage → Settings.'
            : 'No spirits match that search.'}
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {filtered.map(item => {
              const count = countById.get(item.id);
              const par = parById.get(item.id);
              const override = overrideById.get(item.id);
              const auto = par != null && count?.count_qty != null
                ? Math.max(0, par - parseFloat(count.count_qty))
                : par != null ? par : null;
              const needed = override != null ? override : auto;
              return (
                <div key={item.id} className="bg-gray-800 border border-gray-700 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm font-medium truncate">{item.name}</p>
                      <p className="text-gray-500 text-xs">
                        {[item.category, item.unit_size].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-[10px] uppercase tracking-wider text-right mb-0.5">Count</p>
                      <CountCell
                        value={count?.count_qty}
                        onSave={qty => handleSaveCount(item.id, qty)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-gray-500">Par: <span className="text-gray-300">{par != null ? fmtQty(par) : '—'}</span></span>
                    {item.production_quantity != null && (
                      <span className="text-gray-500">Avail: <span className="text-gray-300">{fmtQty(item.production_quantity)}</span></span>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                    <span className="text-gray-400 text-xs uppercase tracking-wider">Order</span>
                    {canUpload ? (
                      <OrderOverrideCell
                        overrideValue={override}
                        autoValue={auto}
                        onSave={v => handleSaveOverride(item.id, v)}
                      />
                    ) : (
                      <span className={`text-sm font-semibold ${needed > 0 ? 'text-orange-400' : 'text-gray-500'}`}>
                        {needed != null ? fmtQty(needed) : '—'}
                        {override != null && <span className="ml-1 text-[10px] uppercase" style={{ color: '#F05A28' }}>override</span>}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left text-gray-400 text-xs font-medium uppercase tracking-wider px-5 py-3">Spirit</th>
                  <th className="text-left text-gray-400 text-xs font-medium uppercase tracking-wider px-5 py-3 hidden md:table-cell">Category</th>
                  <th className="text-left text-gray-400 text-xs font-medium uppercase tracking-wider px-5 py-3 hidden md:table-cell">Size</th>
                  <th className="text-right text-gray-400 text-xs font-medium uppercase tracking-wider px-5 py-3">Par</th>
                  <th className="text-right text-gray-400 text-xs font-medium uppercase tracking-wider px-5 py-3">This Week</th>
                  <th className="text-right text-gray-400 text-xs font-medium uppercase tracking-wider px-5 py-3">Order Qty</th>
                  <th className="text-right text-gray-400 text-xs font-medium uppercase tracking-wider px-5 py-3 hidden lg:table-cell">In Production</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const { value: needed, isOverride } = computeNeeded(item);
                  const count = countById.get(item.id);
                  const par = parById.get(item.id);
                  const override = overrideById.get(item.id);
                  const auto = par != null && count?.count_qty != null
                    ? Math.max(0, par - parseFloat(count.count_qty))
                    : par != null ? par : null;
                  return (
                    <tr key={item.id} className="border-b border-gray-700/50 last:border-0 hover:bg-gray-700/20 transition">
                      <td className="px-5 py-2.5 text-white font-medium">{item.name}</td>
                      <td className="px-5 py-2.5 text-gray-400 text-sm hidden md:table-cell">{item.category || '—'}</td>
                      <td className="px-5 py-2.5 text-gray-400 text-sm hidden md:table-cell">{item.unit_size || '—'}</td>
                      <td className="px-5 py-2.5 text-right text-gray-300 text-sm">{par != null ? fmtQty(par) : '—'}</td>
                      <td className="px-5 py-2.5 text-right">
                        <CountCell
                          value={count?.count_qty}
                          onSave={qty => handleSaveCount(item.id, qty)}
                        />
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        {canUpload ? (
                          <OrderOverrideCell
                            overrideValue={override}
                            autoValue={auto}
                            onSave={v => handleSaveOverride(item.id, v)}
                          />
                        ) : (
                          <span className={`text-sm font-semibold ${needed > 0 ? (isOverride ? 'text-orange-400' : 'text-orange-400') : 'text-gray-500'}`}>
                            {needed != null ? fmtQty(needed) : '—'}
                            {isOverride && <span className="ml-1.5 text-[10px] uppercase tracking-wider" style={{ color: '#F05A28' }}>override</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-right text-gray-400 text-sm hidden lg:table-cell">
                        {item.production_quantity != null ? fmtQty(item.production_quantity) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

// ── Order email modal ────────────────────────────────────────────────────────

function SendOrderModal({ location, locationLabel, weekStart, onClose, onSent }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [overrides, setOverrides] = useState({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/api/spirits/order-preview?location=${location}&week_start=${weekStart}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        setRows(d.rows || []);
        const init = {};
        (d.rows || []).forEach(r => { if (r.needed > 0) init[r.id] = r.needed; });
        setOverrides(init);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [location, weekStart]);

  const handleSend = async () => {
    setSending(true); setError('');
    const r = await fetch(`${API}/api/spirits/send-order`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location, week_start: weekStart, overrides }),
    });
    const data = await r.json();
    setSending(false);
    if (!r.ok) { setError(data.message || 'Failed to send'); return; }
    onSent(data.message || 'Order sent.');
    onClose();
  };

  const toOrder = rows.filter(r => (overrides[r.id] ?? r.needed) > 0);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-800 rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <div>
            <h2 className="text-white font-semibold">Send Spirits Order</h2>
            <p className="text-gray-400 text-xs mt-0.5">{locationLabel} · Week of {fmtWeekRange(weekStart)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">
          {loading ? (
            <p className="text-gray-500 text-sm text-center py-8">Loading…</p>
          ) : toOrder.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">Nothing needs to be ordered this week.</p>
          ) : (
            <div className="space-y-2">
              {toOrder.map(r => (
                <div key={r.id} className="flex items-center gap-3 bg-gray-700/40 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{r.name}</p>
                    <p className="text-gray-500 text-xs">
                      Par {fmtQty(r.par)} · Count {fmtQty(r.count)}
                      {r.production_quantity != null && ` · Avail ${fmtQty(r.production_quantity)}`}
                    </p>
                  </div>
                  <input type="number" min="0" step="0.5"
                    value={overrides[r.id] ?? 0}
                    onChange={e => setOverrides(p => ({ ...p, [r.id]: e.target.value }))}
                    className="w-20 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm text-right" />
                </div>
              ))}
            </div>
          )}
          {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        </div>
        <div className="flex gap-2 justify-end p-5 border-t border-gray-700">
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white px-4 py-2">Cancel</button>
          <button onClick={handleSend} disabled={sending || loading}
            className="text-sm font-medium px-5 py-2 rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: '#F05A28' }}>
            {sending ? 'Sending…' : 'Send Email'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manage tab ───────────────────────────────────────────────────────────────

function ManageTab({ location, locationLabel, items, pars, settings, onChange, onItemsChanged, onShowSend }) {
  const [section, setSection] = useState('pars');
  const [search, setSearch] = useState('');
  const [showHidden, setShowHidden] = useState(false);

  const filtered = items.filter(i =>
    (showHidden || !i.hidden) &&
    (!search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.category || '').toLowerCase().includes(search.toLowerCase()))
  );

  const parById = new Map(pars.map(p => [p.item_id, parseFloat(p.par_level)]));

  const sBtn = (s, label) => (
    <button onClick={() => setSection(s)}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition ${section === s ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}>
      {label}
    </button>
  );

  const savePar = async (item_id, par_level) => {
    const r = await fetch(`${API}/api/spirits/pars`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id, location, par_level }),
    });
    if (r.ok) onChange();
  };

  const toggleHidden = async (item) => {
    await fetch(`${API}/api/spirits/items/${item.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden: !item.hidden }),
    });
    onItemsChanged();
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        {sBtn('pars', `${locationLabel} Pars`)}
        {sBtn('items', 'Items')}
        {sBtn('settings', 'Settings')}
      </div>

      {section === 'pars' && (
        <>
          <div className="flex items-center justify-between gap-3 mb-3">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search spirits…"
              className="flex-1 max-w-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
            <button onClick={onShowSend}
              className="text-sm font-medium px-4 py-2 rounded-lg text-white whitespace-nowrap"
              style={{ backgroundColor: '#F05A28' }}>
              Send Order Email
            </button>
          </div>
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            {filtered.length === 0 ? (
              <p className="text-gray-500 text-sm px-5 py-6">No items.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left text-gray-400 text-xs font-medium uppercase tracking-wider px-5 py-3">Spirit</th>
                    <th className="text-left text-gray-400 text-xs font-medium uppercase tracking-wider px-5 py-3 hidden md:table-cell">Category</th>
                    <th className="text-left text-gray-400 text-xs font-medium uppercase tracking-wider px-5 py-3 hidden md:table-cell">Size</th>
                    <th className="text-right text-gray-400 text-xs font-medium uppercase tracking-wider px-5 py-3">Par</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.id} className="border-b border-gray-700/50 last:border-0">
                      <td className="px-5 py-2.5 text-white">{item.name}</td>
                      <td className="px-5 py-2.5 text-gray-400 hidden md:table-cell">{item.category || '—'}</td>
                      <td className="px-5 py-2.5 text-gray-400 hidden md:table-cell">{item.unit_size || '—'}</td>
                      <td className="px-5 py-2.5 text-right">
                        <CountCell
                          value={parById.get(item.id)}
                          onSave={v => savePar(item.id, v)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {section === 'items' && (
        <ItemsManager
          items={items}
          showHidden={showHidden}
          onToggleHidden={toggleHidden}
          onShowHiddenToggle={() => setShowHidden(s => !s)}
          onChanged={onItemsChanged}
        />
      )}

      {section === 'settings' && (
        <SettingsSection settings={settings} onChanged={() => { onChange(); onItemsChanged(); }} />
      )}
    </div>
  );
}

// ── Items manager ────────────────────────────────────────────────────────────

function ItemsManager({ items, showHidden, onToggleHidden, onShowHiddenToggle, onChanged }) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // item or 'new'
  const filtered = items.filter(i =>
    (showHidden || !i.hidden) &&
    (!search || i.name.toLowerCase().includes(search.toLowerCase()))
  );
  const hiddenCount = items.filter(i => i.hidden).length;

  const handleDelete = async (item) => {
    if (!window.confirm(`Permanently delete "${item.name}"? Use "Hide" instead to keep history.`)) return;
    await fetch(`${API}/api/spirits/items/${item.id}`, { method: 'DELETE', credentials: 'include' });
    onChanged();
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-3">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="flex-1 max-w-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-400 flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showHidden} onChange={onShowHiddenToggle} className="accent-orange-500" />
            Show hidden ({hiddenCount})
          </label>
          <button onClick={() => setEditing('new')}
            className="text-sm font-medium px-3 py-2 rounded-lg text-white"
            style={{ backgroundColor: '#F05A28' }}>+ Add Item</button>
        </div>
      </div>
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-gray-500 text-sm px-5 py-6">No items.</p>
        ) : (
          <ul>
            {filtered.map(item => (
              <li key={item.id} className={`flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-gray-700 last:border-0 ${item.hidden ? 'opacity-60' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {item.name}
                    {item.hidden && <span className="ml-2 text-xs uppercase tracking-wider text-gray-500">hidden</span>}
                  </p>
                  <p className="text-gray-500 text-xs">
                    {[item.category, item.unit_size].filter(Boolean).join(' · ') || '—'}
                    {item.production_quantity != null && ` · ${fmtQty(item.production_quantity)} in production`}
                  </p>
                </div>
                <div className="flex gap-3 flex-shrink-0">
                  <button onClick={() => setEditing(item)} className="text-xs text-gray-400 hover:text-white">Edit</button>
                  <button onClick={() => onToggleHidden(item)} className="text-xs text-amber-400 hover:text-amber-300">
                    {item.hidden ? 'Unhide' : 'Hide'}
                  </button>
                  <button onClick={() => handleDelete(item)} className="text-xs text-red-500 hover:text-red-400">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing && (
        <ItemModal
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); }}
        />
      )}
    </>
  );
}

function ItemModal({ item, onClose, onSaved }) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    name: item?.name || '',
    category: item?.category || '',
    unit_size: item?.unit_size || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) return setError('Name is required');
    setSaving(true); setError('');
    const url = isEdit ? `${API}/api/spirits/items/${item.id}` : `${API}/api/spirits/items`;
    const r = await fetch(url, {
      method: isEdit ? 'PATCH' : 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        category: form.category.trim(),
        unit_size: form.unit_size.trim(),
      }),
    });
    setSaving(false);
    if (r.ok) onSaved();
    else { const d = await r.json(); setError(d.message || 'Error'); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-800 rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <h2 className="text-white font-semibold">{isEdit ? 'Edit Item' : 'Add Item'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Name *</label>
            <input autoFocus type="text" value={form.name} onChange={set('name')}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Category</label>
              <input type="text" value={form.category} onChange={set('category')}
                placeholder="e.g. Whiskey"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Unit Size</label>
              <input type="text" value={form.unit_size} onChange={set('unit_size')}
                placeholder="e.g. 750ml"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={onClose} className="text-sm text-gray-400 hover:text-white px-4 py-2">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="text-sm font-medium px-5 py-2 rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: '#F05A28' }}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Item'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Settings section: API URL + sync + email recipients ──────────────────────

function SettingsSection({ settings, onChanged }) {
  const [apiUrl, setApiUrl] = useState(settings?.distillery_api_url || '');
  const [savingUrl, setSavingUrl] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [recipients, setRecipients] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => { setApiUrl(settings?.distillery_api_url || ''); }, [settings]);

  const loadRecipients = useCallback(async () => {
    const r = await fetch(`${API}/api/spirits/email-recipients`, { credentials: 'include' });
    if (r.ok) setRecipients(await r.json());
  }, []);
  useEffect(() => { loadRecipients(); }, [loadRecipients]);

  const saveUrl = async () => {
    setSavingUrl(true);
    await fetch(`${API}/api/spirits/settings`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ distillery_api_url: apiUrl }),
    });
    setSavingUrl(false);
    onChanged();
  };

  const sync = async () => {
    setSyncing(true); setSyncMsg('');
    const r = await fetch(`${API}/api/spirits/items/sync`, {
      method: 'POST', credentials: 'include',
    });
    const d = await r.json();
    setSyncing(false);
    if (r.ok) {
      setSyncMsg(`Synced — added ${d.added}, updated ${d.updated}.`);
      onChanged();
    } else {
      setSyncMsg(d.message || 'Sync failed');
    }
  };

  const addEmail = async () => {
    if (!newEmail.trim()) return;
    setAdding(true);
    const r = await fetch(`${API}/api/spirits/email-recipients`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail.trim() }),
    });
    setAdding(false);
    if (r.ok) { setNewEmail(''); loadRecipients(); }
  };

  const removeEmail = async (id) => {
    await fetch(`${API}/api/spirits/email-recipients/${id}`, { method: 'DELETE', credentials: 'include' });
    loadRecipients();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-4xl">
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
        <h3 className="text-white font-semibold">Distillery Inventory Feed</h3>
        <p className="text-gray-500 text-xs">JSON endpoint returning the current production inventory. Each entry needs at least <code className="text-gray-400">name</code> and <code className="text-gray-400">quantity</code>.</p>
        <div>
          <label className="text-xs text-gray-400 block mb-1">API URL</label>
          <input type="url" value={apiUrl} onChange={e => setApiUrl(e.target.value)}
            placeholder="https://…"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
        </div>
        <div className="flex gap-2">
          <button onClick={saveUrl} disabled={savingUrl}
            className="text-sm px-4 py-2 rounded-lg text-gray-300 bg-gray-700 hover:bg-gray-600 disabled:opacity-50">
            {savingUrl ? 'Saving…' : 'Save URL'}
          </button>
          <button onClick={sync} disabled={syncing || !settings?.distillery_api_url}
            className="text-sm font-medium px-4 py-2 rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: '#F05A28' }}>
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
        </div>
        {syncMsg && <p className="text-sm text-gray-300">{syncMsg}</p>}
        {settings?.last_sync_at && <p className="text-xs text-gray-500">Last synced: {fmtDateTime(settings.last_sync_at)}</p>}
        {settings?.last_sync_error && <p className="text-xs text-red-400">Last error: {settings.last_sync_error}</p>}
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
        <h3 className="text-white font-semibold">Order Email Recipients</h3>
        <p className="text-gray-500 text-xs">Everyone here gets the weekly spirits order email when a manager hits Send.</p>
        <div className="space-y-2">
          {recipients.length === 0 ? (
            <p className="text-gray-500 text-sm">No recipients yet.</p>
          ) : recipients.map(r => (
            <div key={r.id} className="flex items-center justify-between bg-gray-700/40 rounded-lg px-3 py-2">
              <span className="text-gray-300 text-sm">{r.email}</span>
              <button onClick={() => removeEmail(r.id)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addEmail()}
            placeholder="distilling@ologybrewing.com"
            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
          <button onClick={addEmail} disabled={adding || !newEmail.trim()}
            className="text-sm font-medium px-4 py-2 rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: '#F05A28' }}>
            Add
          </button>
        </div>
        {settings?.last_sent_at && <p className="text-xs text-gray-500">Last order email sent: {fmtDateTime(settings.last_sent_at)}</p>}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function SpiritsOrdering({ user, canUpload, onBack }) {
  const [location, setLocation] = useState(null);
  const [tab, setTab] = useState('inventory');
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [pars, setPars] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSend, setShowSend] = useState(false);
  const [flash, setFlash] = useState('');
  const weekStart = isoWeekStart();

  const loadItems = useCallback(async () => {
    const r = await fetch(`${API}/api/spirits/items${canUpload && tab === 'manage' ? '?includeHidden=1' : ''}`, { credentials: 'include' });
    if (r.ok) setItems(await r.json());
  }, [canUpload, tab]);

  const loadCounts = useCallback(async () => {
    if (!location) return;
    const r = await fetch(`${API}/api/spirits/counts?location=${location}&week_start=${weekStart}`, { credentials: 'include' });
    if (r.ok) {
      const d = await r.json();
      setCounts(d.counts || []);
      setOverrides(d.overrides || []);
    }
  }, [location, weekStart]);

  const loadPars = useCallback(async () => {
    if (!location) return;
    const r = await fetch(`${API}/api/spirits/pars?location=${location}`, { credentials: 'include' });
    if (r.ok) setPars(await r.json());
  }, [location]);

  const loadSettings = useCallback(async () => {
    const r = await fetch(`${API}/api/spirits/settings`, { credentials: 'include' });
    if (r.ok) setSettings(await r.json());
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  useEffect(() => {
    if (!location) return;
    setLoading(true);
    Promise.all([loadItems(), loadCounts(), loadPars()]).finally(() => setLoading(false));
  }, [location, loadItems, loadCounts, loadPars]);

  const handleCountSaved = (itemId, qty) => {
    setCounts(prev => {
      const existing = prev.find(c => c.item_id === itemId);
      if (existing) return prev.map(c => c.item_id === itemId ? { ...c, count_qty: qty } : c);
      return [...prev, { item_id: itemId, count_qty: qty, submitted_by_name: user.name }];
    });
  };

  const handleOverrideSaved = (itemId, override) => {
    setOverrides(prev => {
      if (override == null) return prev.filter(o => o.item_id !== itemId);
      const existing = prev.find(o => o.item_id === itemId);
      if (existing) return prev.map(o => o.item_id === itemId ? { ...o, order_override: override } : o);
      return [...prev, { item_id: itemId, order_override: override, set_by_name: user.name }];
    });
  };

  const handleFlash = (msg) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 4000);
  };

  const locationLabel = LOCATIONS.find(l => l.key === location)?.label || '';

  if (!location) {
    return (
      <div className="min-h-screen bg-gray-900">
        <nav className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-30">
          <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition">
            <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
            <span className="text-cream font-semibold text-xl">HQ</span>
          </button>
          <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition">← Back to Dashboard</button>
        </nav>
        <LocationLanding onSelect={setLocation} lastSync={settings?.last_sync_at} />
      </div>
    );
  }

  const tabs = ['inventory', ...(canUpload ? ['manage'] : [])];
  const tabLabel = { inventory: 'Weekly Inventory', manage: 'Manage' };

  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition">
          <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-xl">HQ</span>
        </button>
        <h1 className="text-cream font-bold text-base sm:text-xl">{locationLabel} Spirits Order</h1>
        <button onClick={() => { setLocation(null); setTab('inventory'); }}
          className="text-sm text-gray-400 hover:text-white transition">← Locations</button>
      </nav>

      <div className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6">
        <div className="flex gap-1">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${tab === t ? '' : 'border-transparent text-gray-400 hover:text-white'}`}
              style={tab === t ? { borderColor: '#F05A28', color: '#F05A28', borderBottomWidth: '2px' } : {}}>
              {tabLabel[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 sm:px-6 py-5 max-w-screen-xl mx-auto">
        {flash && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-green-500/20 border border-green-500/40 text-green-300 text-sm">{flash}</div>
        )}

        {loading ? (
          <p className="text-gray-500 text-sm text-center py-12">Loading…</p>
        ) : tab === 'inventory' ? (
          <InventoryTab
            location={location}
            items={items.filter(i => !i.hidden)}
            counts={counts}
            overrides={overrides}
            pars={pars}
            weekStart={weekStart}
            canUpload={canUpload}
            onCountSaved={handleCountSaved}
            onOverrideSaved={handleOverrideSaved}
          />
        ) : (
          <ManageTab
            location={location}
            locationLabel={locationLabel}
            items={items}
            pars={pars}
            settings={settings}
            onChange={() => { loadPars(); loadSettings(); }}
            onItemsChanged={() => { loadItems(); loadSettings(); }}
            onShowSend={() => setShowSend(true)}
          />
        )}
      </div>

      {showSend && (
        <SendOrderModal
          location={location}
          locationLabel={locationLabel}
          weekStart={weekStart}
          onClose={() => setShowSend(false)}
          onSent={handleFlash}
        />
      )}
    </div>
  );
}
