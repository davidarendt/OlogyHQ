import { useState, useEffect, useCallback } from 'react';

const API = process.env.REACT_APP_API_URL || '';

function fmtQty(n) {
  const v = parseFloat(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function fmtDate(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${parseInt(m)}/${parseInt(d)}/${y}`;
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function today() { return new Date().toLocaleDateString('en-CA'); }

const STATUS_STYLE = {
  pending:   { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Pending'   },
  fulfilled: { bg: 'bg-green-500/10',  text: 'text-green-400',  label: 'Fulfilled' },
  cancelled: { bg: 'bg-gray-700',      text: 'text-gray-400',   label: 'Cancelled' },
};

const TX_STYLE = {
  add:    { bg: 'bg-green-500/10',  text: 'text-green-400',  label: 'Add'    },
  remove: { bg: 'bg-red-500/10',    text: 'text-red-400',    label: 'Remove' },
  adjust: { bg: 'bg-blue-500/10',   text: 'text-blue-400',   label: 'Adjust' },
};

// ─── StockModal ───────────────────────────────────────────────────────────────

function StockModal({ product, onClose, onSaved }) {
  const [type, setType] = useState('add');
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const current = parseFloat(product.current_quantity);
  const preview = qty !== '' && !isNaN(parseFloat(qty))
    ? type === 'add'    ? current + parseFloat(qty)
    : type === 'remove' ? current - parseFloat(qty)
    : parseFloat(qty)
    : null;

  const handleSave = async () => {
    const q = parseFloat(qty);
    if (isNaN(q) || q < 0) return setError('Enter a valid quantity');
    setSaving(true); setError('');
    const r = await fetch(`${API}/api/distillery/stock`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: product.id, type, quantity: q, notes }),
    });
    setSaving(false);
    if (r.ok) { onSaved(); onClose(); }
    else { const d = await r.json(); setError(d.message || 'Error'); }
  };

  const typeBtn = (t, label) => (
    <button
      onClick={() => setType(t)}
      className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${type === t ? 'text-white' : 'text-gray-400 bg-gray-700 hover:text-white'}`}
      style={type === t ? { backgroundColor: '#F05A28' } : {}}
    >{label}</button>
  );

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-800 rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <div>
            <h2 className="text-white font-semibold">{product.name}</h2>
            <p className="text-gray-400 text-sm">{product.unit_size} · Current: <span className="text-white">{fmtQty(product.current_quantity)}</span></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            {typeBtn('add', '+ Add')}
            {typeBtn('remove', '− Remove')}
            {typeBtn('adjust', '= Set To')}
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">
              {type === 'add' ? 'Quantity to Add' : type === 'remove' ? 'Quantity to Remove' : 'Set Quantity To'}
            </label>
            <input
              type="number" min="0" value={qty} onChange={e => setQty(e.target.value)}
              autoFocus placeholder="0"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
          {preview !== null && (
            <div className="flex items-center gap-2 text-sm bg-gray-700/40 rounded-lg px-4 py-2.5">
              <span className="text-gray-400">{fmtQty(current)}</span>
              <span className="text-gray-600">→</span>
              <span className={`font-semibold ${preview < 0 ? 'text-red-400' : 'text-white'}`}>{fmtQty(preview)}</span>
            </div>
          )}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Notes (optional)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Reason for adjustment..."
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={onClose} className="text-sm text-gray-400 hover:text-white px-4 py-2">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="text-sm font-medium px-5 py-2 rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: '#F05A28' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── OrderModal ───────────────────────────────────────────────────────────────

function OrderModal({ products, onClose, onSaved }) {
  const [form, setForm] = useState({ recipient: '', requested_date: today(), notes: '' });
  const [items, setItems] = useState([{ product_id: '', quantity: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setField = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const setItem = (i, f, v) => setItems(arr => arr.map((it, idx) => idx === i ? { ...it, [f]: v } : it));
  const addItem = () => setItems(arr => [...arr, { product_id: '', quantity: '' }]);
  const removeItem = i => setItems(arr => arr.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!form.recipient.trim()) return setError('Recipient is required');
    const validItems = items.filter(it => it.product_id && it.quantity > 0);
    if (!validItems.length) return setError('Add at least one item with a quantity');
    setSaving(true); setError('');
    const r = await fetch(`${API}/api/distillery/orders`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, items: validItems }),
    });
    setSaving(false);
    if (r.ok) { onSaved(); onClose(); }
    else { const d = await r.json(); setError(d.message || 'Error'); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-800 rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <h2 className="text-white font-semibold text-lg">Place Order</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Recipient *</label>
              <input type="text" value={form.recipient} onChange={e => setField('recipient', e.target.value)}
                placeholder="e.g. Midtown Taproom"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Requested Date</label>
              <input type="date" value={form.requested_date} onChange={e => setField('requested_date', e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Notes</label>
            <input type="text" value={form.notes} onChange={e => setField('notes', e.target.value)}
              placeholder="Any special instructions..."
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400 uppercase tracking-wider">Items</label>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => {
                const prod = products.find(p => p.id === parseInt(item.product_id));
                return (
                  <div key={i} className="flex gap-2 items-center">
                    <select value={item.product_id} onChange={e => setItem(i, 'product_id', e.target.value)}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm min-w-0">
                      <option value="">Select product…</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.unit_size})</option>
                      ))}
                    </select>
                    <input type="number" min="1" value={item.quantity} onChange={e => setItem(i, 'quantity', e.target.value)}
                      placeholder="Qty"
                      className="w-20 flex-shrink-0 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
                    {items.length > 1 && (
                      <button onClick={() => removeItem(i)} className="text-gray-500 hover:text-red-400 flex-shrink-0">✕</button>
                    )}
                  </div>
                );
              })}
            </div>
            <button onClick={addItem}
              className="mt-2 text-sm text-gray-400 hover:text-white flex items-center gap-1">
              + Add another item
            </button>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
        <div className="flex gap-2 justify-end p-5 border-t border-gray-700">
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white px-4 py-2">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="text-sm font-medium px-5 py-2 rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: '#F05A28' }}>
            {saving ? 'Submitting…' : 'Submit Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── OrderDetailModal ─────────────────────────────────────────────────────────

function OrderDetailModal({ orderId, onClose, canUpload, onUpdated }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`${API}/api/distillery/orders/${orderId}`, { credentials: 'include' });
    if (r.ok) setOrder(await r.json());
    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (action) => {
    if (action === 'fulfill' && !window.confirm('Fulfill this order? Inventory will be deducted automatically.')) return;
    setActing(true);
    const r = await fetch(`${API}/api/distillery/orders/${orderId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setActing(false);
    if (r.ok) { await load(); onUpdated(); }
  };

  const st = order ? STATUS_STYLE[order.status] : null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-800 rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <h2 className="text-white font-semibold">Order #{orderId}</h2>
            {st && <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${st.bg} ${st.text}`}>{st.label}</span>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {loading ? (
            <p className="text-gray-500 text-sm text-center py-8">Loading…</p>
          ) : !order ? (
            <p className="text-gray-500 text-sm text-center py-8">Not found.</p>
          ) : (
            <div className="space-y-5">
              {/* Order info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">Recipient</p>
                  <p className="text-white font-medium">{order.recipient}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">Requested Date</p>
                  <p className="text-white">{fmtDate(order.requested_date)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">Requested By</p>
                  <p className="text-white">{order.requested_by_name}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">Placed On</p>
                  <p className="text-white">{fmtDateTime(order.created_at)}</p>
                </div>
                {order.notes && (
                  <div className="col-span-2">
                    <p className="text-gray-500 text-xs mb-0.5">Notes</p>
                    <p className="text-gray-300">{order.notes}</p>
                  </div>
                )}
                {order.status === 'fulfilled' && (
                  <div className="col-span-2">
                    <p className="text-gray-500 text-xs mb-0.5">Fulfilled By</p>
                    <p className="text-white">{order.fulfilled_by_name} — {fmtDateTime(order.fulfilled_at)}</p>
                  </div>
                )}
              </div>

              {/* Items */}
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">Items</p>
                <div className="bg-gray-700/40 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-600">
                        <th className="text-left text-gray-500 text-xs px-4 py-2.5 font-medium">Product</th>
                        <th className="text-left text-gray-500 text-xs px-4 py-2.5 font-medium">Size</th>
                        <th className="text-right text-gray-500 text-xs px-4 py-2.5 font-medium">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(order.items || []).map(item => (
                        <tr key={item.id} className="border-b border-gray-600/50 last:border-0">
                          <td className="px-4 py-2.5 text-white">{item.product_name}</td>
                          <td className="px-4 py-2.5 text-gray-400">{item.unit_size}</td>
                          <td className="px-4 py-2.5 text-white text-right font-medium">{fmtQty(item.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {canUpload && order?.status === 'pending' && (
          <div className="flex gap-2 p-5 border-t border-gray-700">
            <button onClick={() => handleAction('cancel')} disabled={acting}
              className="flex-1 py-2 text-sm text-gray-400 bg-gray-700 hover:bg-gray-600 rounded-lg transition disabled:opacity-50">
              Cancel Order
            </button>
            <button onClick={() => handleAction('fulfill')} disabled={acting}
              className="flex-1 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-500 rounded-lg transition disabled:opacity-50">
              {acting ? 'Processing…' : 'Fulfill Order'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ProductModal ─────────────────────────────────────────────────────────────

function ProductModal({ product, onClose, onSaved }) {
  const isEdit = !!product;
  const [form, setForm] = useState({
    name: product?.name || '',
    category: product?.category || '',
    unit_size: product?.unit_size || '',
    current_quantity: product ? String(product.current_quantity) : '0',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.unit_size.trim()) return setError('Name and unit size are required');
    setSaving(true); setError('');
    const url = isEdit ? `${API}/api/distillery/products/${product.id}` : `${API}/api/distillery/products`;
    const r = await fetch(url, {
      method: isEdit ? 'PATCH' : 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        category: form.category.trim() || null,
        unit_size: form.unit_size.trim(),
        ...(isEdit ? {} : { current_quantity: parseFloat(form.current_quantity) || 0 }),
      }),
    });
    setSaving(false);
    if (r.ok) { onSaved(); onClose(); }
    else { const d = await r.json(); setError(d.message || 'Error'); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-800 rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <h2 className="text-white font-semibold">{isEdit ? 'Edit Product' : 'Add Product'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Name *</label>
            <input autoFocus type="text" value={form.name} onChange={set('name')}
              placeholder="e.g. Single Malt Whiskey"
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
              <label className="text-xs text-gray-400 block mb-1">Unit Size *</label>
              <input type="text" value={form.unit_size} onChange={set('unit_size')}
                placeholder="e.g. 750ml"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
          </div>
          {!isEdit && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Starting Quantity</label>
              <input type="number" min="0" value={form.current_quantity} onChange={set('current_quantity')}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={onClose} className="text-sm text-gray-400 hover:text-white px-4 py-2">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="text-sm font-medium px-5 py-2 rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: '#F05A28' }}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Product'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ManageTab ────────────────────────────────────────────────────────────────

function ManageTab({ products, onProductsChanged }) {
  const [section, setSection] = useState('products');
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(false);
  const [productModal, setProductModal] = useState(null); // null | {} (new) | product (edit)
  const [search, setSearch] = useState('');

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    const r = await fetch(`${API}/api/distillery/transactions`, { credentials: 'include' });
    if (r.ok) setTransactions(await r.json());
    setTxLoading(false);
  }, []);

  useEffect(() => { if (section === 'transactions') loadTransactions(); }, [section, loadTransactions]);

  const handleDeactivate = async (product) => {
    if (!window.confirm(`Remove "${product.name}" from the active inventory? All logs are preserved.`)) return;
    await fetch(`${API}/api/distillery/products/${product.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false }),
    });
    onProductsChanged();
  };

  const sBtn = (s, label) => (
    <button onClick={() => setSection(s)}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition ${section === s ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}>
      {label}
    </button>
  );

  const filtered = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.category || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex gap-2 mb-6">
        {sBtn('products', 'Products')}
        {sBtn('transactions', 'Transaction History')}
      </div>

      {section === 'products' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-gray-700 gap-3">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search products…"
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm max-w-xs" />
            <button onClick={() => setProductModal({})}
              className="text-sm font-medium px-3 py-2 rounded-lg text-white flex-shrink-0"
              style={{ backgroundColor: '#F05A28' }}>
              + Add Product
            </button>
          </div>
          {filtered.length === 0 ? (
            <p className="text-gray-500 text-sm px-5 py-6">No products yet.</p>
          ) : (
            <ul>
              {filtered.map(p => (
                <li key={p.id} className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-gray-700 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{p.name}</p>
                    <p className="text-gray-500 text-xs">{[p.category, p.unit_size].filter(Boolean).join(' · ')}</p>
                  </div>
                  <span className="text-white text-sm font-semibold flex-shrink-0">{fmtQty(p.current_quantity)}</span>
                  <div className="flex gap-3 flex-shrink-0">
                    <button onClick={() => setProductModal(p)} className="text-xs text-gray-400 hover:text-white">Edit</button>
                    <button onClick={() => handleDeactivate(p)} className="text-xs text-red-500 hover:text-red-400">Remove</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {section === 'transactions' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-700">
            <h3 className="text-white font-medium">Transaction History</h3>
          </div>
          {txLoading ? (
            <p className="text-gray-500 text-sm px-5 py-6">Loading…</p>
          ) : transactions.length === 0 ? (
            <p className="text-gray-500 text-sm px-5 py-6">No transactions yet.</p>
          ) : (
            <>
              {/* Mobile */}
              <div className="sm:hidden divide-y divide-gray-700">
                {transactions.map(tx => {
                  const ts = TX_STYLE[tx.type];
                  return (
                    <div key={tx.id} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white text-sm font-medium">{tx.product_name}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ts.bg} ${ts.text}`}>{ts.label}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>{fmtQty(tx.quantity_before)} → {fmtQty(tx.quantity_after)}</span>
                        <span>·</span>
                        <span>{tx.created_by_name}</span>
                        <span>·</span>
                        <span>{fmtDateTime(tx.created_at)}</span>
                      </div>
                      {tx.notes && <p className="text-gray-500 text-xs mt-1 italic">{tx.notes}</p>}
                    </div>
                  );
                })}
              </div>
              {/* Desktop */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700">
                      {['Date', 'Product', 'Type', 'Change', 'Before → After', 'By', 'Notes'].map(h => (
                        <th key={h} className="text-left text-gray-400 text-xs font-medium uppercase tracking-wider px-5 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => {
                      const ts = TX_STYLE[tx.type];
                      return (
                        <tr key={tx.id} className="border-b border-gray-700/50 last:border-0 hover:bg-gray-700/20">
                          <td className="px-5 py-3 text-gray-400 whitespace-nowrap text-xs">{fmtDateTime(tx.created_at)}</td>
                          <td className="px-5 py-3 text-white">{tx.product_name}</td>
                          <td className="px-5 py-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ts.bg} ${ts.text}`}>{ts.label}</span>
                          </td>
                          <td className={`px-5 py-3 font-medium ${tx.quantity_change > 0 ? 'text-green-400' : tx.quantity_change < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                            {tx.quantity_change > 0 ? '+' : ''}{fmtQty(tx.quantity_change)}
                          </td>
                          <td className="px-5 py-3 text-gray-400">{fmtQty(tx.quantity_before)} → {fmtQty(tx.quantity_after)}</td>
                          <td className="px-5 py-3 text-gray-400">{tx.created_by_name}</td>
                          <td className="px-5 py-3 text-gray-500 italic">{tx.notes || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {productModal !== null && (
        <ProductModal
          product={Object.keys(productModal).length ? productModal : null}
          onClose={() => setProductModal(null)}
          onSaved={() => { setProductModal(null); onProductsChanged(); }}
        />
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DistilleryInventory({ user, canUpload, onBack }) {
  const [tab, setTab] = useState('inventory');
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stockModal, setStockModal] = useState(null);
  const [orderModal, setOrderModal] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [orderFilter, setOrderFilter] = useState('all');
  const [invSearch, setInvSearch] = useState('');

  const loadProducts = useCallback(async () => {
    const r = await fetch(`${API}/api/distillery/products`, { credentials: 'include' });
    if (r.ok) setProducts(await r.json());
  }, []);

  const loadOrders = useCallback(async () => {
    const url = orderFilter !== 'all' ? `${API}/api/distillery/orders?status=${orderFilter}` : `${API}/api/distillery/orders`;
    const r = await fetch(url, { credentials: 'include' });
    if (r.ok) setOrders(await r.json());
  }, [orderFilter]);

  const loadAll = useCallback(async (spinner = false) => {
    if (spinner) setLoading(true);
    await Promise.all([loadProducts(), loadOrders()]);
    setLoading(false);
  }, [loadProducts, loadOrders]);

  useEffect(() => { loadAll(true); }, [loadAll]);
  useEffect(() => { if (tab === 'orders') loadOrders(); }, [tab, loadOrders]);

  const tabs = ['inventory', 'orders', ...(canUpload ? ['manage'] : [])];
  const tabLabel = { inventory: 'Inventory', orders: 'Orders', manage: 'Manage' };

  const filteredProducts = products.filter(p =>
    !invSearch || p.name.toLowerCase().includes(invSearch.toLowerCase()) || (p.category || '').toLowerCase().includes(invSearch.toLowerCase())
  );

  const pendingCount = orders.filter(o => o.status === 'pending').length;

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Nav */}
      <nav className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition">
          <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-xl">HQ</span>
        </button>
        <h1 className="text-cream font-bold text-lg sm:text-xl">Distillery Inventory</h1>
      </nav>

      {/* Tabs */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6">
        <div className="flex gap-1">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`relative px-4 py-3 text-sm font-medium border-b-2 transition ${tab === t ? '' : 'border-transparent text-gray-400 hover:text-white'}`}
              style={tab === t ? { borderColor: '#F05A28', color: '#F05A28', borderBottomWidth: '2px' } : {}}>
              {tabLabel[t]}
              {t === 'orders' && pendingCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-xs font-bold" style={{ backgroundColor: '#F05A28', fontSize: '10px' }}>
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 sm:px-6 py-5 max-w-screen-xl mx-auto">
        {/* ── INVENTORY TAB ── */}
        {tab === 'inventory' && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <input type="text" value={invSearch} onChange={e => setInvSearch(e.target.value)}
                placeholder="Search products…"
                className="flex-1 max-w-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
              <span className="text-gray-500 text-sm">{filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}</span>
            </div>

            {loading ? (
              <div className="text-gray-500 text-sm text-center py-16">Loading…</div>
            ) : products.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <p className="text-lg mb-2">No products yet.</p>
                {canUpload && <p className="text-sm">Go to Manage to add products.</p>}
              </div>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="sm:hidden space-y-2">
                  {filteredProducts.map(p => (
                    <div key={p.id} className="bg-gray-800 rounded-xl border border-gray-700 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-white font-medium text-sm truncate">{p.name}</p>
                          <p className="text-gray-500 text-xs mt-0.5">{[p.category, p.unit_size].filter(Boolean).join(' · ')}</p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-white font-bold text-lg">{fmtQty(p.current_quantity)}</span>
                          {canUpload && (
                            <button onClick={() => setStockModal(p)}
                              className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-white"
                              style={{ backgroundColor: '#F05A28' }}>
                              Adjust
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left text-gray-400 text-xs font-medium uppercase tracking-wider px-5 py-3">Product</th>
                        <th className="text-left text-gray-400 text-xs font-medium uppercase tracking-wider px-5 py-3">Category</th>
                        <th className="text-left text-gray-400 text-xs font-medium uppercase tracking-wider px-5 py-3">Unit Size</th>
                        <th className="text-right text-gray-400 text-xs font-medium uppercase tracking-wider px-5 py-3">Quantity</th>
                        {canUpload && <th className="px-5 py-3" />}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map(p => (
                        <tr key={p.id} className="border-b border-gray-700/50 last:border-0 hover:bg-gray-700/20 transition">
                          <td className="px-5 py-3 text-white font-medium">{p.name}</td>
                          <td className="px-5 py-3 text-gray-400 text-sm">{p.category || '—'}</td>
                          <td className="px-5 py-3 text-gray-400 text-sm">{p.unit_size}</td>
                          <td className="px-5 py-3 text-right font-semibold text-white">{fmtQty(p.current_quantity)}</td>
                          {canUpload && (
                            <td className="px-5 py-3 text-right">
                              <button onClick={() => setStockModal(p)}
                                className="text-xs font-medium px-3 py-1.5 rounded-lg text-white"
                                style={{ backgroundColor: '#F05A28' }}>
                                Adjust
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {/* ── ORDERS TAB ── */}
        {tab === 'orders' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              {/* Status filter */}
              <div className="flex gap-1">
                {['all', 'pending', 'fulfilled', 'cancelled'].map(s => (
                  <button key={s} onClick={() => setOrderFilter(s)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition capitalize ${orderFilter === s ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                    {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              <button onClick={() => setOrderModal(true)}
                className="text-sm font-medium px-4 py-2 rounded-lg text-white"
                style={{ backgroundColor: '#F05A28' }}>
                + Place Order
              </button>
            </div>

            {orders.length === 0 ? (
              <div className="bg-gray-800 rounded-xl border border-gray-700 py-16 text-center text-gray-500 text-sm">
                No orders{orderFilter !== 'all' ? ` with status "${orderFilter}"` : ''} yet.
              </div>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="sm:hidden space-y-2">
                  {orders.map(o => {
                    const st = STATUS_STYLE[o.status];
                    return (
                      <button key={o.id} onClick={() => setDetailId(o.id)}
                        className="w-full bg-gray-800 rounded-xl border border-gray-700 p-4 text-left hover:border-gray-500 transition">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <p className="text-white font-medium text-sm">#{o.id} — {o.recipient}</p>
                            <p className="text-gray-500 text-xs mt-0.5">{o.requested_by_name} · {fmtDate(o.requested_date)}</p>
                          </div>
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${st.bg} ${st.text}`}>{st.label}</span>
                        </div>
                        <p className="text-gray-500 text-xs">{o.item_count} item{o.item_count !== 1 ? 's' : ''} · {fmtDateTime(o.created_at)}</p>
                      </button>
                    );
                  })}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700">
                        {['#', 'Recipient', 'Requested Date', 'Items', 'Placed By', 'Submitted', 'Status', ''].map(h => (
                          <th key={h} className="text-left text-gray-400 text-xs font-medium uppercase tracking-wider px-5 py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(o => {
                        const st = STATUS_STYLE[o.status];
                        return (
                          <tr key={o.id} className="border-b border-gray-700/50 last:border-0 hover:bg-gray-700/20 transition cursor-pointer" onClick={() => setDetailId(o.id)}>
                            <td className="px-5 py-3 text-gray-400 text-sm">#{o.id}</td>
                            <td className="px-5 py-3 text-white font-medium">{o.recipient}</td>
                            <td className="px-5 py-3 text-gray-400 text-sm">{fmtDate(o.requested_date)}</td>
                            <td className="px-5 py-3 text-gray-400 text-sm">{o.item_count}</td>
                            <td className="px-5 py-3 text-gray-400 text-sm">{o.requested_by_name}</td>
                            <td className="px-5 py-3 text-gray-400 text-sm whitespace-nowrap">{fmtDateTime(o.created_at)}</td>
                            <td className="px-5 py-3">
                              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
                            </td>
                            <td className="px-5 py-3 text-gray-500 text-sm">View →</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {/* ── MANAGE TAB ── */}
        {tab === 'manage' && canUpload && (
          <ManageTab products={products} onProductsChanged={() => loadProducts()} />
        )}
      </div>

      {/* Modals */}
      {stockModal && (
        <StockModal
          product={stockModal}
          onClose={() => setStockModal(null)}
          onSaved={() => { setStockModal(null); loadProducts(); }}
        />
      )}
      {orderModal && (
        <OrderModal
          products={products}
          onClose={() => setOrderModal(false)}
          onSaved={() => { setOrderModal(false); loadOrders(); }}
        />
      )}
      {detailId && (
        <OrderDetailModal
          orderId={detailId}
          onClose={() => setDetailId(null)}
          canUpload={canUpload}
          onUpdated={() => { loadProducts(); loadOrders(); }}
        />
      )}
    </div>
  );
}
