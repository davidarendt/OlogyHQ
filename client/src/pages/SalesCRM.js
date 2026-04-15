import { useState, useEffect, useCallback } from 'react';

const API = process.env.REACT_APP_API_URL || '';

const ACCOUNT_TYPES = ['bar', 'restaurant', 'retail', 'hotel', 'other'];
const PRODUCT_TYPE_LABELS = { beer: 'Beer', spirit: 'Spirit', other: 'Other' };
const PRODUCT_TYPE_COLORS = {
  beer:   'bg-amber-900/40 text-amber-300 border-amber-700/40',
  spirit: 'bg-purple-900/40 text-purple-300 border-purple-700/40',
  other:  'bg-gray-700 text-gray-300 border-gray-600',
};

function apiFetch(path, opts = {}) {
  return fetch(`${API}${path}`, { credentials: 'include', ...opts });
}

function jsonFetch(path, method, body) {
  return apiFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── Small shared components ────────────────────────────────────────────────

function ProductPill({ line }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border font-medium ${PRODUCT_TYPE_COLORS[line.type] || PRODUCT_TYPE_COLORS.other}`}>
      {line.name}
    </span>
  );
}

function TypeBadge({ type }) {
  const colors = {
    bar:        'bg-blue-900/40 text-blue-300',
    restaurant: 'bg-green-900/40 text-green-300',
    retail:     'bg-yellow-900/40 text-yellow-300',
    hotel:      'bg-teal-900/40 text-teal-300',
    other:      'bg-gray-700 text-gray-400',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${colors[type] || colors.other}`}>
      {type}
    </span>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className={`bg-gray-800 rounded-xl border border-gray-600 shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h3 className="text-white font-semibold text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-gray-400 text-xs mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500';
const selectCls = `${inputCls} cursor-pointer`;

// ── Activity log modal ─────────────────────────────────────────────────────

function ActivityLogModal({ account, activityTypes, onClose }) {
  const [activities, setActivities] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ activity_type_id: '', activity_date: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/crm/accounts/${account.id}/activities`);
    setActivities(await res.json());
  }, [account.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setForm({ activity_type_id: activityTypes[0]?.id || '', activity_date: new Date().toISOString().slice(0, 10), notes: '' });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (act) => {
    setForm({ activity_type_id: act.activity_type_id || '', activity_date: act.activity_date?.slice(0, 10) || '', notes: act.notes || '' });
    setEditingId(act.id);
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    const method = editingId ? 'PATCH' : 'POST';
    const url = editingId
      ? `/api/crm/accounts/${account.id}/activities/${editingId}`
      : `/api/crm/accounts/${account.id}/activities`;
    await jsonFetch(url, method, { ...form, activity_type_id: form.activity_type_id || null });
    setShowForm(false);
    setSaving(false);
    load();
  };

  const del = async (id) => {
    if (!window.confirm('Delete this activity?')) return;
    await jsonFetch(`/api/crm/accounts/${account.id}/activities/${id}`, 'DELETE');
    load();
  };

  return (
    <Modal title={`Activity Log — ${account.name}`} onClose={onClose} wide>
      <div className="flex justify-between items-center mb-4">
        <p className="text-gray-400 text-sm">{activities.length} entr{activities.length === 1 ? 'y' : 'ies'}</p>
        <button onClick={openNew} className="text-sm px-3 py-1.5 rounded-lg font-medium text-white" style={{ backgroundColor: '#F05A28' }}>
          + Log Activity
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select className={selectCls} value={form.activity_type_id} onChange={e => setForm(f => ({ ...f, activity_type_id: e.target.value }))}>
                <option value="">— select —</option>
                {activityTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Date">
              <input type="date" className={inputCls} value={form.activity_date} onChange={e => setForm(f => ({ ...f, activity_date: e.target.value }))} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea className={`${inputCls} resize-none`} rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="What happened?" />
          </Field>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-sm px-3 py-1.5 rounded-lg bg-gray-600 text-gray-300 hover:bg-gray-500">Cancel</button>
            <button onClick={save} disabled={saving || !form.activity_date} className="text-sm px-4 py-1.5 rounded-lg font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#F05A28' }}>
              {editingId ? 'Save' : 'Log'}
            </button>
          </div>
        </div>
      )}

      {activities.length === 0 && !showForm && (
        <p className="text-gray-500 text-sm text-center py-8">No activities logged yet.</p>
      )}

      <div className="space-y-2">
        {activities.map(act => (
          <div key={act.id} className="bg-gray-700/40 border border-gray-600/40 rounded-lg p-3 flex gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {act.activity_type_name && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-900/40 text-orange-300 font-medium">{act.activity_type_name}</span>
                )}
                <span className="text-gray-400 text-xs">{act.activity_date?.slice(0, 10)}</span>
                <span className="text-gray-600 text-xs">by {act.created_by_name}</span>
              </div>
              {act.notes && <p className="text-gray-300 text-sm">{act.notes}</p>}
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => openEdit(act)} className="text-gray-500 hover:text-gray-300 text-xs px-1">Edit</button>
              <button onClick={() => del(act.id)} className="text-gray-500 hover:text-red-400 text-xs px-1">×</button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ── Account modal (add/edit) ───────────────────────────────────────────────

function AccountModal({ account, distributors, productLines, onClose, onSaved }) {
  const isNew = !account;
  const [form, setForm] = useState({
    name: account?.name || '',
    type: account?.type || 'bar',
    address: account?.address || '',
    city: account?.city || '',
    state: account?.state || 'FL',
    phone: account?.phone || '',
    email: account?.email || '',
    contact_name: account?.contact_name || '',
    contact_title: account?.contact_title || '',
    distributor_id: account?.distributor_id || '',
    notes: account?.notes || '',
  });
  const [selectedProducts, setSelectedProducts] = useState(
    (account?.product_lines || []).map(p => p.id)
  );
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleProduct = (id) => {
    setSelectedProducts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const method = isNew ? 'POST' : 'PATCH';
    const url = isNew ? '/api/crm/accounts' : `/api/crm/accounts/${account.id}`;
    const payload = { ...form, distributor_id: form.distributor_id || null };
    const res = await jsonFetch(url, method, payload);
    const saved = await res.json();
    await jsonFetch(`/api/crm/accounts/${saved.id}/products`, 'PUT', { product_line_ids: selectedProducts });
    onSaved();
  };

  return (
    <Modal title={isNew ? 'Add Account' : 'Edit Account'} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Account Name *">
            <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} />
          </Field>
          <Field label="Type">
            <select className={selectCls} value={form.type} onChange={e => set('type', e.target.value)}>
              {ACCOUNT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="Address">
              <input className={inputCls} value={form.address} onChange={e => set('address', e.target.value)} />
            </Field>
          </div>
          <Field label="City">
            <input className={inputCls} value={form.city} onChange={e => set('city', e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact Name">
            <input className={inputCls} value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
          </Field>
          <Field label="Contact Title">
            <input className={inputCls} value={form.contact_title} onChange={e => set('contact_title', e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className={inputCls} value={form.phone} onChange={e => set('phone', e.target.value)} />
          </Field>
          <Field label="Email">
            <input className={inputCls} type="email" value={form.email} onChange={e => set('email', e.target.value)} />
          </Field>
        </div>

        <Field label="Distributor">
          <select className={selectCls} value={form.distributor_id} onChange={e => set('distributor_id', e.target.value)}>
            <option value="">— none —</option>
            {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>

        {productLines.length > 0 && (
          <div>
            <label className="block text-gray-400 text-xs mb-2">Products Carried</label>
            <div className="flex flex-wrap gap-2">
              {productLines.map(pl => {
                const active = selectedProducts.includes(pl.id);
                return (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => toggleProduct(pl.id)}
                    className={`px-3 py-1 rounded text-xs font-medium border transition ${
                      active
                        ? 'border-orange-500 text-orange-300 bg-orange-900/30'
                        : 'border-gray-600 text-gray-400 bg-gray-700 hover:border-gray-500'
                    }`}
                  >
                    {pl.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <Field label="Notes">
          <textarea className={`${inputCls} resize-none`} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </Field>

        <div className="flex gap-3 justify-end pt-2">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600">Cancel</button>
          <button onClick={save} disabled={saving || !form.name.trim()} className="text-sm px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#F05A28' }}>
            {saving ? 'Saving…' : isNew ? 'Add Account' : 'Save Changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Account detail modal ───────────────────────────────────────────────────

function AccountDetail({ account, activityTypes, onClose, onEdit, onDelete, onLogActivity }) {
  return (
    <Modal title={account.name} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2 items-center">
          <TypeBadge type={account.type} />
          {account.distributor_name && (
            <span className="text-xs text-gray-400">via {account.distributor_name}</span>
          )}
        </div>

        {/* Contact info */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {account.contact_name && (
            <>
              <span className="text-gray-500">Contact</span>
              <span className="text-gray-200">{account.contact_name}{account.contact_title ? `, ${account.contact_title}` : ''}</span>
            </>
          )}
          {account.phone && (
            <>
              <span className="text-gray-500">Phone</span>
              <a href={`tel:${account.phone}`} className="text-orange-400 hover:underline">{account.phone}</a>
            </>
          )}
          {account.email && (
            <>
              <span className="text-gray-500">Email</span>
              <a href={`mailto:${account.email}`} className="text-orange-400 hover:underline">{account.email}</a>
            </>
          )}
          {(account.address || account.city) && (
            <>
              <span className="text-gray-500">Address</span>
              <span className="text-gray-200">{[account.address, account.city, account.state].filter(Boolean).join(', ')}</span>
            </>
          )}
        </div>

        {account.product_lines?.length > 0 && (
          <div>
            <p className="text-gray-500 text-xs mb-2">Products Carried</p>
            <div className="flex flex-wrap gap-1.5">
              {account.product_lines.map(pl => <ProductPill key={pl.id} line={pl} />)}
            </div>
          </div>
        )}

        {account.notes && (
          <div>
            <p className="text-gray-500 text-xs mb-1">Notes</p>
            <p className="text-gray-300 text-sm whitespace-pre-wrap">{account.notes}</p>
          </div>
        )}

        <div className="flex gap-2 flex-wrap pt-1">
          <button onClick={onLogActivity} className="text-sm px-4 py-2 rounded-lg font-medium text-white" style={{ backgroundColor: '#F05A28' }}>
            Activity Log
          </button>
          <button onClick={onEdit} className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600">
            Edit
          </button>
          <button onClick={onDelete} className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-red-400 hover:bg-red-900/30 ml-auto">
            Delete
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Distributor modal (add/edit) ───────────────────────────────────────────

function DistributorModal({ distributor, productLines, onClose, onSaved }) {
  const isNew = !distributor;
  const [form, setForm] = useState({
    name: distributor?.name || '',
    territory: distributor?.territory || '',
    notes: distributor?.notes || '',
  });
  const [contacts, setContacts] = useState(distributor?.contacts || []);
  const [selectedProducts, setSelectedProducts] = useState(
    (distributor?.product_lines || []).map(p => p.id)
  );
  const [contactForm, setContactForm] = useState(null); // null = hidden, {} = new, {id,...} = edit
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleProduct = (id) => {
    setSelectedProducts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const saveDistributor = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const method = isNew ? 'POST' : 'PATCH';
    const url = isNew ? '/api/crm/distributors' : `/api/crm/distributors/${distributor.id}`;
    const res = await jsonFetch(url, method, form);
    const saved = await res.json();
    // Save product lines
    await jsonFetch(`/api/crm/distributors/${saved.id}/products`, 'PUT', { product_line_ids: selectedProducts });
    // Save any pending new contacts
    onSaved();
  };

  const addContact = async () => {
    if (!contactForm?.name?.trim() || isNew) return;
    await jsonFetch(`/api/crm/distributors/${distributor.id}/contacts`, 'POST', contactForm);
    setContactForm(null);
    // Reload contacts
    const res = await apiFetch(`/api/crm/distributors`);
    const all = await res.json();
    const updated = all.find(d => d.id === distributor.id);
    if (updated) setContacts(updated.contacts);
  };

  const removeContact = async (cId) => {
    if (!window.confirm('Remove this contact?')) return;
    await jsonFetch(`/api/crm/distributors/${distributor.id}/contacts/${cId}`, 'DELETE');
    setContacts(prev => prev.filter(c => c.id !== cId));
  };

  return (
    <Modal title={isNew ? 'Add Distributor' : 'Edit Distributor'} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name *">
            <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} />
          </Field>
          <Field label="Territory">
            <input className={inputCls} value={form.territory} onChange={e => set('territory', e.target.value)} placeholder="e.g. Tampa Bay Area" />
          </Field>
        </div>

        {productLines.length > 0 && (
          <div>
            <label className="block text-gray-400 text-xs mb-2">Brands Carried</label>
            <div className="flex flex-wrap gap-2">
              {productLines.map(pl => {
                const active = selectedProducts.includes(pl.id);
                return (
                  <button key={pl.id} type="button" onClick={() => toggleProduct(pl.id)}
                    className={`px-3 py-1 rounded text-xs font-medium border transition ${
                      active ? 'border-orange-500 text-orange-300 bg-orange-900/30' : 'border-gray-600 text-gray-400 bg-gray-700 hover:border-gray-500'
                    }`}>
                    {pl.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <Field label="Notes">
          <textarea className={`${inputCls} resize-none`} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </Field>

        {/* Contacts — only editable after distributor is created */}
        {!isNew && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-gray-400 text-xs">Key Contacts</label>
              <button onClick={() => setContactForm({ name: '', title: '', phone: '', email: '', is_primary: false })}
                className="text-xs text-orange-400 hover:text-orange-300">+ Add Contact</button>
            </div>
            {contactForm && (
              <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-3 mb-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Name *"><input className={inputCls} value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} /></Field>
                  <Field label="Title"><input className={inputCls} value={contactForm.title} onChange={e => setContactForm(f => ({ ...f, title: e.target.value }))} /></Field>
                  <Field label="Phone"><input className={inputCls} value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} /></Field>
                  <Field label="Email"><input className={inputCls} value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} /></Field>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={contactForm.is_primary} onChange={e => setContactForm(f => ({ ...f, is_primary: e.target.checked }))} />
                  Primary contact
                </label>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setContactForm(null)} className="text-xs px-3 py-1 rounded bg-gray-600 text-gray-300">Cancel</button>
                  <button onClick={addContact} disabled={!contactForm.name?.trim()} className="text-xs px-3 py-1 rounded text-white disabled:opacity-50" style={{ backgroundColor: '#F05A28' }}>Add</button>
                </div>
              </div>
            )}
            {contacts.length === 0 && !contactForm && (
              <p className="text-gray-600 text-xs">No contacts yet.</p>
            )}
            <div className="space-y-1">
              {contacts.map(c => (
                <div key={c.id} className="flex items-center justify-between bg-gray-700/40 rounded-lg px-3 py-2">
                  <div>
                    <span className="text-white text-sm font-medium">{c.name}</span>
                    {c.is_primary && <span className="ml-2 text-xs text-orange-400">primary</span>}
                    {c.title && <span className="text-gray-400 text-xs ml-2">{c.title}</span>}
                    <div className="text-gray-500 text-xs">{[c.phone, c.email].filter(Boolean).join(' · ')}</div>
                  </div>
                  <button onClick={() => removeContact(c.id)} className="text-gray-600 hover:text-red-400 text-sm ml-2">×</button>
                </div>
              ))}
            </div>
          </div>
        )}
        {isNew && (
          <p className="text-gray-600 text-xs">Save the distributor first, then you can add contacts.</p>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600">Cancel</button>
          <button onClick={saveDistributor} disabled={saving || !form.name.trim()} className="text-sm px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#F05A28' }}>
            {saving ? 'Saving…' : isNew ? 'Add Distributor' : 'Save Changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Manage tab ─────────────────────────────────────────────────────────────

function ManageTab({ productLines, activityTypes, onRefreshProductLines, onRefreshActivityTypes }) {
  const [section, setSection] = useState('products');

  // Product lines state
  const [plForm, setPlForm] = useState({ name: '', type: 'beer' });
  const [editingPl, setEditingPl] = useState(null);

  // Activity types state
  const [atForm, setAtForm] = useState('');
  const [editingAt, setEditingAt] = useState(null); // { id, name } | null

  const addProductLine = async () => {
    if (!plForm.name.trim()) return;
    await jsonFetch('/api/crm/product-lines', 'POST', plForm);
    setPlForm({ name: '', type: 'beer' });
    onRefreshProductLines();
  };

  const saveProductLine = async (id) => {
    await jsonFetch(`/api/crm/product-lines/${id}`, 'PATCH', editingPl);
    setEditingPl(null);
    onRefreshProductLines();
  };

  const deletePl = async (id) => {
    if (!window.confirm('Delete this product line? It will be removed from all distributors and accounts.')) return;
    await jsonFetch(`/api/crm/product-lines/${id}`, 'DELETE');
    onRefreshProductLines();
  };

  const addActivityType = async () => {
    if (!atForm.trim()) return;
    await jsonFetch('/api/crm/activity-types', 'POST', { name: atForm });
    setAtForm('');
    onRefreshActivityTypes();
  };

  const saveAt = async () => {
    if (!editingAt?.name?.trim()) return;
    await jsonFetch(`/api/crm/activity-types/${editingAt.id}`, 'PATCH', { name: editingAt.name });
    setEditingAt(null);
    onRefreshActivityTypes();
  };

  const deleteAt = async (id) => {
    if (!window.confirm('Delete this activity type?')) return;
    await jsonFetch(`/api/crm/activity-types/${id}`, 'DELETE');
    onRefreshActivityTypes();
  };

  return (
    <div>
      <div className="flex gap-1 mb-6 border-b border-gray-700">
        {['products', 'activity-types'].map(s => (
          <button key={s} onClick={() => setSection(s)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
              section === s ? 'border-orange-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}>
            {s === 'products' ? 'Product Lines' : 'Activity Types'}
          </button>
        ))}
      </div>

      {section === 'products' && (
        <div className="max-w-md space-y-3">
          <div className="flex gap-2">
            <input className={`${inputCls} flex-1`} placeholder="Product line name…" value={plForm.name} onChange={e => setPlForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addProductLine()} />
            <select className={`${selectCls} w-28`} value={plForm.type} onChange={e => setPlForm(f => ({ ...f, type: e.target.value }))}>
              <option value="beer">Beer</option>
              <option value="spirit">Spirit</option>
              <option value="other">Other</option>
            </select>
            <button onClick={addProductLine} disabled={!plForm.name.trim()} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 shrink-0" style={{ backgroundColor: '#F05A28' }}>
              Add
            </button>
          </div>
          {productLines.length === 0 && <p className="text-gray-600 text-sm">No product lines yet.</p>}
          {productLines.map(pl => (
            <div key={pl.id} className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
              {editingPl?.id === pl.id ? (
                <>
                  <input className={`${inputCls} flex-1`} value={editingPl.name} onChange={e => setEditingPl(f => ({ ...f, name: e.target.value }))} autoFocus />
                  <select className={`${selectCls} w-24`} value={editingPl.type} onChange={e => setEditingPl(f => ({ ...f, type: e.target.value }))}>
                    <option value="beer">Beer</option><option value="spirit">Spirit</option><option value="other">Other</option>
                  </select>
                  <button onClick={() => saveProductLine(pl.id)} className="text-xs px-2 py-1 rounded text-white" style={{ backgroundColor: '#F05A28' }}>Save</button>
                  <button onClick={() => setEditingPl(null)} className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300">Cancel</button>
                </>
              ) : (
                <>
                  <ProductPill line={pl} />
                  <span className="text-white text-sm flex-1">{pl.name}</span>
                  <button onClick={() => setEditingPl({ id: pl.id, name: pl.name, type: pl.type })} className="text-gray-500 hover:text-gray-300 text-xs">Edit</button>
                  <button onClick={() => deletePl(pl.id)} className="text-gray-500 hover:text-red-400 text-xs">×</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {section === 'activity-types' && (
        <div className="max-w-xs space-y-3">
          <div className="flex gap-2">
            <input className={`${inputCls} flex-1`} placeholder="Type name…" value={atForm} onChange={e => setAtForm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addActivityType()} />
            <button onClick={addActivityType} disabled={!atForm.trim()} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 shrink-0" style={{ backgroundColor: '#F05A28' }}>
              Add
            </button>
          </div>
          {activityTypes.map(at => (
            <div key={at.id} className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
              {editingAt?.id === at.id ? (
                <>
                  <input className={`${inputCls} flex-1`} value={editingAt.name}
                    onChange={e => setEditingAt(f => ({ ...f, name: e.target.value }))}
                    autoFocus />
                  <button onClick={saveAt} className="text-xs px-2 py-1 rounded text-white" style={{ backgroundColor: '#F05A28' }}>Save</button>
                  <button onClick={() => setEditingAt(null)} className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300">Cancel</button>
                </>
              ) : (
                <>
                  <span className="text-white text-sm flex-1">{at.name}</span>
                  <button onClick={() => setEditingAt({ id: at.id, name: at.name })} className="text-gray-500 hover:text-gray-300 text-xs">Edit</button>
                  <button onClick={() => deleteAt(at.id)} className="text-gray-500 hover:text-red-400 text-xs">×</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

function SalesCRM({ user, canUpload, onBack }) {
  const [tab, setTab] = useState('accounts');
  const [accounts, setAccounts] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [productLines, setProductLines] = useState([]);
  const [activityTypes, setActivityTypes] = useState([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDist, setFilterDist] = useState('');

  // Modal state
  const [accountDetail, setAccountDetail] = useState(null);
  const [accountEdit, setAccountEdit] = useState(null); // null=closed, false=new, obj=edit
  const [activityAccount, setActivityAccount] = useState(null);
  const [distEdit, setDistEdit] = useState(null); // null=closed, false=new, obj=edit
  const [distDetail, setDistDetail] = useState(null);

  const loadAccounts = async () => {
    const res = await apiFetch('/api/crm/accounts');
    setAccounts(await res.json());
  };
  const loadDistributors = async () => {
    const res = await apiFetch('/api/crm/distributors');
    setDistributors(await res.json());
  };
  const loadProductLines = async () => {
    const res = await apiFetch('/api/crm/product-lines');
    setProductLines(await res.json());
  };
  const loadActivityTypes = async () => {
    const res = await apiFetch('/api/crm/activity-types');
    setActivityTypes(await res.json());
  };

  useEffect(() => {
    loadAccounts();
    loadDistributors();
    loadProductLines();
    loadActivityTypes();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteAccount = async (id) => {
    if (!window.confirm('Delete this account? All activity history will also be deleted.')) return;
    await jsonFetch(`/api/crm/accounts/${id}`, 'DELETE');
    setAccountDetail(null);
    loadAccounts();
  };

  const deleteDistributor = async (id) => {
    if (!window.confirm('Delete this distributor? Accounts linked to them will be unlinked.')) return;
    await jsonFetch(`/api/crm/distributors/${id}`, 'DELETE');
    setDistDetail(null);
    loadDistributors();
    loadAccounts(); // distributor names on accounts may have changed
  };

  const filteredAccounts = accounts.filter(a => {
    const q = search.toLowerCase();
    if (q && !a.name.toLowerCase().includes(q) &&
        !(a.contact_name || '').toLowerCase().includes(q) &&
        !(a.city || '').toLowerCase().includes(q)) return false;
    if (filterType && a.type !== filterType) return false;
    if (filterDist && String(a.distributor_id) !== filterDist) return false;
    return true;
  });

  const tabs = [
    { id: 'accounts', label: 'Accounts' },
    { id: 'distributors', label: 'Distributors' },
    ...(canUpload ? [{ id: 'manage', label: 'Manage' }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition">
          <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-xl">HQ</span>
        </button>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition">← Dashboard</button>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8 text-center">
          <h2 className="text-cream text-4xl font-bold">Sales CRM</h2>
          <p className="text-gray-400 mt-2">Distributor &amp; account relationships</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-700 mb-6">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
                tab === t.id ? 'border-orange-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Accounts tab ── */}
        {tab === 'accounts' && (
          <div>
            <div className="flex flex-wrap gap-3 mb-5">
              <input
                className={`${inputCls} flex-1 min-w-48`}
                placeholder="Search accounts…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <select className={`${selectCls} w-36`} value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="">All types</option>
                {ACCOUNT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
              <select className={`${selectCls} w-44`} value={filterDist} onChange={e => setFilterDist(e.target.value)}>
                <option value="">All distributors</option>
                {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button
                onClick={() => setAccountEdit(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white shrink-0"
                style={{ backgroundColor: '#F05A28' }}
              >
                + Add Account
              </button>
            </div>

            {filteredAccounts.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                {accounts.length === 0 ? 'No accounts yet. Add your first one.' : 'No accounts match your filters.'}
              </div>
            ) : (
              <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700 text-left">
                      <th className="px-4 py-3 text-gray-400 text-xs font-medium">Account</th>
                      <th className="px-4 py-3 text-gray-400 text-xs font-medium hidden sm:table-cell">Type</th>
                      <th className="px-4 py-3 text-gray-400 text-xs font-medium hidden md:table-cell">Contact</th>
                      <th className="px-4 py-3 text-gray-400 text-xs font-medium hidden lg:table-cell">Distributor</th>
                      <th className="px-4 py-3 text-gray-400 text-xs font-medium hidden md:table-cell">Products</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAccounts.map(a => (
                      <tr key={a.id}
                        onClick={() => setAccountDetail(a)}
                        className="border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer transition">
                        <td className="px-4 py-3">
                          <div className="text-white font-medium text-sm">{a.name}</div>
                          {a.city && <div className="text-gray-500 text-xs">{a.city}</div>}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell"><TypeBadge type={a.type} /></td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {a.contact_name
                            ? <div className="text-gray-300 text-sm">{a.contact_name}{a.contact_title ? <span className="text-gray-500 text-xs ml-1">· {a.contact_title}</span> : ''}</div>
                            : <span className="text-gray-600 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="text-gray-400 text-sm">{a.distributor_name || <span className="text-gray-600">—</span>}</span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {(a.product_lines || []).slice(0, 3).map(pl => <ProductPill key={pl.id} line={pl} />)}
                            {(a.product_lines || []).length > 3 && (
                              <span className="text-gray-500 text-xs">+{a.product_lines.length - 3}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Distributors tab ── */}
        {tab === 'distributors' && (
          <div>
            {canUpload && (
              <div className="flex justify-end mb-5">
                <button onClick={() => setDistEdit(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: '#F05A28' }}>
                  + Add Distributor
                </button>
              </div>
            )}
            {distributors.length === 0 ? (
              <div className="text-center py-16 text-gray-500">No distributors yet.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {distributors.map(d => (
                  <div key={d.id}
                    onClick={() => setDistDetail(d)}
                    className="bg-gray-800 border border-gray-700 rounded-xl p-5 cursor-pointer hover:border-orange-500/50 transition group">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-white font-semibold group-hover:text-orange-400 transition">{d.name}</h3>
                      {d.territory && <span className="text-gray-500 text-xs shrink-0 ml-2">{d.territory}</span>}
                    </div>
                    {d.contacts.length > 0 && (
                      <div className="mb-3 space-y-0.5">
                        {d.contacts.slice(0, 2).map(c => (
                          <div key={c.id} className="text-sm text-gray-400">
                            {c.name}{c.is_primary ? <span className="text-orange-500/70 text-xs ml-1">●</span> : ''}
                            {c.title ? <span className="text-gray-600 text-xs"> · {c.title}</span> : ''}
                          </div>
                        ))}
                        {d.contacts.length > 2 && <div className="text-gray-600 text-xs">+{d.contacts.length - 2} more</div>}
                      </div>
                    )}
                    {d.product_lines.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {d.product_lines.map(pl => <ProductPill key={pl.id} line={pl} />)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Manage tab ── */}
        {tab === 'manage' && canUpload && (
          <ManageTab
            productLines={productLines}
            activityTypes={activityTypes}
            onRefreshProductLines={loadProductLines}
            onRefreshActivityTypes={loadActivityTypes}
          />
        )}
      </main>

      {/* ── Modals ── */}

      {accountDetail && !accountEdit && !activityAccount && (
        <AccountDetail
          account={accountDetail}
          activityTypes={activityTypes}
          onClose={() => setAccountDetail(null)}
          onEdit={() => setAccountEdit(accountDetail)}
          onDelete={() => deleteAccount(accountDetail.id)}
          onLogActivity={() => setActivityAccount(accountDetail)}
        />
      )}

      {accountEdit !== null && (
        <AccountModal
          account={accountEdit || null}
          distributors={distributors}
          productLines={productLines}
          onClose={() => setAccountEdit(null)}
          onSaved={() => {
            setAccountEdit(null);
            setAccountDetail(null);
            loadAccounts();
          }}
        />
      )}

      {activityAccount && (
        <ActivityLogModal
          account={activityAccount}
          activityTypes={activityTypes}
          onClose={() => setActivityAccount(null)}
        />
      )}

      {distDetail && !distEdit && (
        <Modal title={distDetail.name} onClose={() => setDistDetail(null)} wide>
          <div className="space-y-4">
            {distDetail.territory && <p className="text-gray-400 text-sm">{distDetail.territory}</p>}
            {distDetail.product_lines.length > 0 && (
              <div>
                <p className="text-gray-500 text-xs mb-2">Brands Carried</p>
                <div className="flex flex-wrap gap-1.5">
                  {distDetail.product_lines.map(pl => <ProductPill key={pl.id} line={pl} />)}
                </div>
              </div>
            )}
            {distDetail.contacts.length > 0 && (
              <div>
                <p className="text-gray-500 text-xs mb-2">Key Contacts</p>
                <div className="space-y-2">
                  {distDetail.contacts.map(c => (
                    <div key={c.id} className="bg-gray-700/40 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-medium">{c.name}</span>
                        {c.is_primary && <span className="text-xs text-orange-400">primary</span>}
                        {c.title && <span className="text-gray-500 text-xs">{c.title}</span>}
                      </div>
                      <div className="text-gray-400 text-xs mt-0.5 flex gap-3">
                        {c.phone && <a href={`tel:${c.phone}`} className="hover:text-orange-400">{c.phone}</a>}
                        {c.email && <a href={`mailto:${c.email}`} className="hover:text-orange-400">{c.email}</a>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {distDetail.notes && (
              <div>
                <p className="text-gray-500 text-xs mb-1">Notes</p>
                <p className="text-gray-300 text-sm whitespace-pre-wrap">{distDetail.notes}</p>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              {canUpload && (
                <>
                  <button onClick={() => setDistEdit(distDetail)} className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600">Edit</button>
                  <button onClick={() => deleteDistributor(distDetail.id)} className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-red-400 hover:bg-red-900/30 ml-auto">Delete</button>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}

      {distEdit !== null && (
        <DistributorModal
          distributor={distEdit || null}
          productLines={productLines}
          onClose={() => setDistEdit(null)}
          onSaved={() => {
            setDistEdit(null);
            setDistDetail(null);
            loadDistributors();
          }}
        />
      )}
    </div>
  );
}

export default SalesCRM;
