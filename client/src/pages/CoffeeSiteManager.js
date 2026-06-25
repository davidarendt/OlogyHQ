import { useState, useEffect, useRef } from 'react';

const API = process.env.REACT_APP_API_URL || '';

function fmtPrice(p) {
  if (p == null || p === '') return '';
  return `$${parseFloat(p).toFixed(2)}`;
}

function fmtCents(c) {
  if (c == null) return '—';
  return `$${(c / 100).toFixed(2)}`;
}

function fmtOrderDate(s) {
  if (!s) return '';
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const MERCH_CATEGORIES = ['Apparel', 'Accessories', 'Drinkware'];
const VARIANT_TYPES    = ['Size', 'Style'];

// ── BagModal ──────────────────────────────────────────────────────────────────
const BAG_EMPTY = { coffee_name: '', roaster_name: '', origin: '', process: '', tasting_notes: '', price: '', weight_oz: '12', quantity: '0' };

function BagModal({ bag, onClose, onSaved }) {
  const isEdit = !!bag?.id;
  const [form, setForm] = useState(isEdit ? {
    coffee_name:   bag.coffee_name   || '',
    roaster_name:  bag.roaster_name  || '',
    origin:        bag.origin        || '',
    process:       bag.process       || '',
    tasting_notes: bag.tasting_notes || '',
    price:         bag.price != null ? String(bag.price) : '',
    weight_oz:     bag.weight_oz != null ? String(bag.weight_oz) : '',
    quantity:      bag.quantity != null ? String(bag.quantity) : '0',
  } : { ...BAG_EMPTY });
  const [photoFile, setPhotoFile]       = useState(null);
  const [photoPreview, setPhotoPreview] = useState(bag?.photo_url || null);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');
  const fileRef = useRef();

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const pickFile = e => {
    const f = e.target.files[0];
    if (!f) return;
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!form.coffee_name.trim()) { setError('Coffee name is required.'); return; }
    setSaving(true); setError('');
    try {
      let photo_filename = bag?.photo_filename || null;
      if (photoFile) {
        const pr = await fetch(`${API}/api/coffee-site/bags/presign`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: photoFile.name }),
        });
        if (!pr.ok) { setError('Photo upload failed.'); setSaving(false); return; }
        const { signedUrl, filename } = await pr.json();
        const put = await fetch(signedUrl, { method: 'PUT', body: photoFile, headers: { 'Content-Type': photoFile.type } });
        if (!put.ok) { setError('Photo upload failed.'); setSaving(false); return; }
        photo_filename = filename;
      }
      const payload = {
        ...form,
        price: form.price !== '' ? parseFloat(form.price) : null,
        weight_oz: form.weight_oz !== '' ? parseFloat(form.weight_oz) : null,
        quantity: form.quantity !== '' ? parseInt(form.quantity, 10) : 0,
        photo_filename,
      };
      const res = await fetch(`${API}/api/coffee-site/bags${isEdit ? `/${bag.id}` : ''}`, {
        method: isEdit ? 'PATCH' : 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Save failed.'); setSaving(false); return; }
      onSaved(await res.json());
      onClose();
    } catch { setError('Network error.'); setSaving(false); }
  };

  const inp = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
  const lbl = 'block text-gray-400 text-xs mb-1';

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-gray-800 w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border border-gray-700 flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-white font-semibold">{isEdit ? 'Edit Coffee' : 'Add Coffee'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">
          <div>
            <label className={lbl}>Photo</label>
            <div className="flex items-center gap-3">
              {photoPreview
                ? <img src={photoPreview} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
                : <div className="w-20 h-20 rounded-lg bg-gray-700 flex items-center justify-center text-gray-500 text-xs flex-shrink-0">No photo</div>
              }
              <div>
                <button onClick={() => fileRef.current.click()}
                  className="text-sm text-orange-400 hover:text-orange-300 border border-orange-500/40 hover:border-orange-400 px-3 py-1.5 rounded-lg transition">
                  {photoPreview ? 'Change Photo' : 'Upload Photo'}
                </button>
                <p className="text-gray-500 text-xs mt-1">JPG, PNG, or WebP</p>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={lbl}>Coffee Name *</label>
              <input className={inp} value={form.coffee_name} onChange={set('coffee_name')} placeholder="e.g. Ethiopia Yirgacheffe" />
            </div>
            <div>
              <label className={lbl}>Roaster</label>
              <input className={inp} value={form.roaster_name} onChange={set('roaster_name')} placeholder="Roaster name" />
            </div>
            <div>
              <label className={lbl}>Origin</label>
              <input className={inp} value={form.origin} onChange={set('origin')} placeholder="Country / Region" />
            </div>
            <div>
              <label className={lbl}>Process</label>
              <input className={inp} value={form.process} onChange={set('process')} placeholder="Washed, Natural…" />
            </div>
            <div>
              <label className={lbl}>Bag Size (oz)</label>
              <input className={inp} type="number" step="0.1" min="0" value={form.weight_oz} onChange={set('weight_oz')} placeholder="12" />
            </div>
            <div>
              <label className={lbl}>Price</label>
              <input className={inp} type="number" step="0.01" min="0" value={form.price} onChange={set('price')} placeholder="0.00" />
            </div>
            <div>
              <label className={lbl}>Quantity in Stock</label>
              <input className={inp} type="number" step="1" min="0" value={form.quantity} onChange={set('quantity')} placeholder="0" />
            </div>
            <div className="col-span-2">
              <label className={lbl}>Tasting Notes</label>
              <textarea className={`${inp} resize-none`} rows={3} value={form.tasting_notes} onChange={set('tasting_notes')} placeholder="Blueberry, chocolate, caramel…" />
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-700 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-600 rounded-lg transition">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-50 transition"
            style={{ backgroundColor: '#F05A28' }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Coffee'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MerchModal ────────────────────────────────────────────────────────────────
const MERCH_EMPTY = { name: '', category: '', description: '', price: '', weight_oz: '', quantity: '0' };

function MerchModal({ item, onClose, onSaved }) {
  const isEdit = !!item?.id;
  const [form, setForm] = useState(isEdit ? {
    name:        item.name        || '',
    category:    item.category    || '',
    description: item.description || '',
    price:       item.price != null ? String(item.price) : '',
    weight_oz:   item.weight_oz != null ? String(item.weight_oz) : '',
    quantity:    item.quantity != null ? String(item.quantity) : '0',
  } : { ...MERCH_EMPTY });
  const [variants, setVariants]         = useState(
    (item?.variants || []).map(v => ({
      variant_type: v.variant_type,
      variant_value: v.variant_value,
      available: v.available,
      quantity: v.quantity != null ? String(v.quantity) : '0',
    }))
  );
  const [photoFile, setPhotoFile]       = useState(null);
  const [photoPreview, setPhotoPreview] = useState(item?.photo_url || null);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');
  const fileRef = useRef();

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const addVariant    = (type = 'Size') => setVariants(v => [...v, { variant_type: type, variant_value: '', available: true, quantity: '0' }]);
  const removeVariant = i  => setVariants(v => v.filter((_, idx) => idx !== i));
  const setVariant    = (i, field, val) => setVariants(v => v.map((vv, idx) => idx === i ? { ...vv, [field]: val } : vv));
  const renameType    = (oldType, newType) => {
    const trimmed = newType.trim();
    if (!trimmed || trimmed === oldType) return;
    setVariants(v => v.map(vv => vv.variant_type === oldType ? { ...vv, variant_type: trimmed } : vv));
  };
  const removeType    = type => setVariants(v => v.filter(vv => vv.variant_type !== type));

  const pickFile = e => {
    const f = e.target.files[0];
    if (!f) return;
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    try {
      let photo_filename = item?.photo_filename || null;
      if (photoFile) {
        const pr = await fetch(`${API}/api/coffee-site/merch/presign`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: photoFile.name }),
        });
        if (!pr.ok) { setError('Photo upload failed.'); setSaving(false); return; }
        const { signedUrl, filename } = await pr.json();
        const put = await fetch(signedUrl, { method: 'PUT', body: photoFile, headers: { 'Content-Type': photoFile.type } });
        if (!put.ok) { setError('Photo upload failed.'); setSaving(false); return; }
        photo_filename = filename;
      }
      const payload = {
        ...form,
        price: form.price !== '' ? parseFloat(form.price) : null,
        weight_oz: form.weight_oz !== '' ? parseFloat(form.weight_oz) : null,
        quantity: form.quantity !== '' ? parseInt(form.quantity, 10) : 0,
        photo_filename,
        variants: variants
          .filter(v => v.variant_type?.trim() && v.variant_value?.trim())
          .map(v => ({ ...v, quantity: v.quantity !== '' ? parseInt(v.quantity, 10) : 0 })),
      };
      const res = await fetch(`${API}/api/coffee-site/merch${isEdit ? `/${item.id}` : ''}`, {
        method: isEdit ? 'PATCH' : 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Save failed.'); setSaving(false); return; }
      onSaved(await res.json());
      onClose();
    } catch { setError('Network error.'); setSaving(false); }
  };

  const inp = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
  const lbl = 'block text-gray-400 text-xs mb-1';

  // Group variants by type; orderedTypes preserves first-occurrence order
  const groupsByType = {};
  const orderedTypes = [];
  variants.forEach((v, idx) => {
    const t = v.variant_type || '';
    if (!t) return;
    if (!groupsByType[t]) { groupsByType[t] = []; orderedTypes.push(t); }
    groupsByType[t].push(idx);
  });

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-gray-800 w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border border-gray-700 flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-white font-semibold">{isEdit ? 'Edit Item' : 'Add Merch Item'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">
          {/* Photo */}
          <div>
            <label className={lbl}>Photo</label>
            <div className="flex items-center gap-3">
              {photoPreview
                ? <img src={photoPreview} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
                : <div className="w-20 h-20 rounded-lg bg-gray-700 flex items-center justify-center text-gray-500 text-xs flex-shrink-0">No photo</div>
              }
              <div>
                <button onClick={() => fileRef.current.click()}
                  className="text-sm text-orange-400 hover:text-orange-300 border border-orange-500/40 hover:border-orange-400 px-3 py-1.5 rounded-lg transition">
                  {photoPreview ? 'Change Photo' : 'Upload Photo'}
                </button>
                <p className="text-gray-500 text-xs mt-1">JPG, PNG, or WebP</p>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
            </div>
          </div>

          {/* Core fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={lbl}>Item Name *</label>
              <input className={inp} value={form.name} onChange={set('name')} placeholder="e.g. Ology Logo T-Shirt" />
            </div>
            <div>
              <label className={lbl}>Category</label>
              <select className={inp} value={form.category} onChange={set('category')}>
                <option value="">— Select —</option>
                {MERCH_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Price</label>
              <input className={inp} type="number" step="0.01" min="0" value={form.price} onChange={set('price')} placeholder="0.00" />
            </div>
            <div>
              <label className={lbl}>Weight (oz)</label>
              <input className={inp} type="number" step="0.1" min="0" value={form.weight_oz} onChange={set('weight_oz')} placeholder="—" />
            </div>
            {variants.length === 0 && (
              <div className="col-span-2">
                <label className={lbl}>Quantity in Stock</label>
                <input className={inp} type="number" step="1" min="0" value={form.quantity} onChange={set('quantity')} placeholder="0" />
              </div>
            )}
            <div className="col-span-2">
              <label className={lbl}>Description</label>
              <textarea className={`${inp} resize-none`} rows={2} value={form.description} onChange={set('description')} placeholder="Brief description…" />
            </div>
          </div>

          {/* Variants */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-gray-400 text-xs">Variants (Size, Style, etc.)</label>
              <button onClick={() => addVariant('Size')}
                className="text-xs text-orange-400 hover:text-orange-300 transition font-medium">
                + Add Size
              </button>
            </div>

            {orderedTypes.length === 0 ? (
              <p className="text-gray-600 text-xs italic">No variants — add one if this item comes in different sizes or styles.</p>
            ) : (
              <div className="space-y-3">
                {orderedTypes.map(type => (
                  <div key={type} className="border border-gray-700/60 rounded-lg p-3 bg-gray-900/30">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <input
                        key={`type-${type}`}
                        list="variant-types"
                        defaultValue={type}
                        onBlur={e => renameType(type, e.target.value)}
                        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs font-semibold w-28 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                      <datalist id="variant-types">
                        {VARIANT_TYPES.map(t => <option key={t} value={t} />)}
                      </datalist>
                      <button onClick={() => removeType(type)}
                        className="text-xs text-gray-500 hover:text-red-400 transition">
                        Remove all
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {groupsByType[type].map(i => {
                        const v = variants[i];
                        return (
                          <div key={i} className="flex gap-2 items-center">
                            <input
                              className="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 flex-1 min-w-0"
                              value={v.variant_value}
                              onChange={e => setVariant(i, 'variant_value', e.target.value)}
                              placeholder={type === 'Size' ? 'e.g. S, M, L, XL' : 'Value'}
                            />
                            <input
                              type="number" step="1" min="0"
                              className="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-xs w-14 flex-shrink-0 text-center"
                              value={v.quantity}
                              onChange={e => setVariant(i, 'quantity', e.target.value)}
                              placeholder="0"
                              title="Quantity in stock"
                            />
                            <button
                              onClick={() => setVariant(i, 'available', !v.available)}
                              className={`px-2 py-1 rounded text-xs font-medium flex-shrink-0 transition ${
                                v.available ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                              }`}
                              title={v.available ? 'Visible on site' : 'Hidden from site'}>
                              {v.available ? 'In' : 'Off'}
                            </button>
                            <button onClick={() => removeVariant(i)} className="text-gray-500 hover:text-red-400 transition text-sm flex-shrink-0">✕</button>
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={() => addVariant(type)}
                      className="text-xs text-orange-400 hover:text-orange-300 transition font-medium mt-2">
                      + Add {type}
                    </button>
                  </div>
                ))}
                <button onClick={() => {
                  const used = new Set(orderedTypes);
                  const next = VARIANT_TYPES.find(t => !used.has(t)) || 'Style';
                  addVariant(next);
                }}
                  className="text-xs text-gray-400 hover:text-orange-400 transition">
                  + Add another variant type
                </button>
              </div>
            )}
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-700 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-600 rounded-lg transition">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-50 transition"
            style={{ backgroundColor: '#F05A28' }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── BagCard ───────────────────────────────────────────────────────────────────
function BagCard({ bag, tab, canUpload, autoFeaturedId, onToggleSoldOut, onArchive, onUnarchive, onSetFeatured, onEdit, onDelete }) {
  const isAutoFeatured = !bag.is_featured && bag.id === autoFeaturedId;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      <div className="flex gap-4 p-4">
        <div className="flex-shrink-0">
          {bag.photo_url
            ? <img src={bag.photo_url} alt={bag.coffee_name} className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg object-cover" />
            : <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg bg-gray-700 flex items-center justify-center text-gray-500 text-xs text-center px-2">No photo</div>
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0">
              <h3 className="text-white font-semibold leading-tight truncate">{bag.coffee_name}</h3>
              {bag.roaster_name && <p className="text-gray-400 text-sm">{bag.roaster_name}</p>}
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              {bag.is_featured && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-400">★ Featured</span>
              )}
              {isAutoFeatured && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-500">★ Featured (auto)</span>
              )}
              {bag.sold_out ? (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />Sold Out
                </span>
              ) : !bag.archived && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />Available
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400 mt-2">
            {bag.origin            && <span>{bag.origin}</span>}
            {bag.process           && <span className="text-gray-500">· {bag.process}</span>}
            {bag.weight_oz != null && <span className="text-gray-300">{bag.weight_oz} oz</span>}
            {bag.price != null     && <span className="text-orange-400 font-medium">{fmtPrice(bag.price)}</span>}
            <span className={bag.quantity > 0 ? 'text-gray-300' : 'text-red-400'}>
              {bag.quantity ?? 0} in stock
            </span>
          </div>
          {bag.sold_out && bag.sold_out_at && (
            <p className="text-gray-500 text-xs mt-1">
              Sold out {new Date(bag.sold_out_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {bag.archived && bag.archived_at && ` · Archived ${new Date(bag.archived_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
            </p>
          )}
          {bag.tasting_notes && <p className="text-gray-400 text-xs mt-1.5 line-clamp-2 italic">"{bag.tasting_notes}"</p>}
        </div>
      </div>
      <div className="border-t border-gray-700/60 bg-gray-800/40">
        {tab === 'on_website' && canUpload && (
          <div className="px-4 py-2 border-b border-gray-700/40">
            {bag.is_featured ? (
              <div className="flex items-center justify-between">
                <span className="text-yellow-400 text-xs font-medium">★ This is the featured coffee on the website</span>
                <button onClick={() => onSetFeatured(false)} className="text-xs text-gray-500 hover:text-gray-300 transition underline">Remove pin</button>
              </div>
            ) : isAutoFeatured ? (
              <div className="flex items-center justify-between">
                <span className="text-yellow-500 text-xs">★ Showing as featured automatically (first available)</span>
                <button onClick={() => onSetFeatured(true)} className="text-xs text-yellow-400 hover:text-yellow-300 transition font-medium">Pin this coffee</button>
              </div>
            ) : (
              <button onClick={() => onSetFeatured(true)} className="text-xs text-gray-400 hover:text-yellow-400 transition font-medium">
                ☆ Set as featured on website
              </button>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 px-4 py-2 flex-wrap">
          {tab === 'on_website' && (
            <button onClick={onToggleSoldOut}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${bag.sold_out ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25' : 'bg-red-500/15 text-red-400 hover:bg-red-500/25'}`}>
              {bag.sold_out ? 'Mark Available' : 'Mark Sold Out'}
            </button>
          )}
          {canUpload && tab === 'on_website' && (
            <button onClick={onArchive} className="px-3 py-1 rounded-lg text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition">Archive</button>
          )}
          {canUpload && tab === 'archived' && (
            <button onClick={onUnarchive} className="px-3 py-1 rounded-lg text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition">Restore</button>
          )}
          {canUpload && tab === 'on_website' && (
            <button onClick={onEdit} className="px-3 py-1 rounded-lg text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition">Edit</button>
          )}
          {canUpload && (
            <button onClick={onDelete} className="px-3 py-1 rounded-lg text-xs text-red-400 hover:text-red-300 bg-gray-700 hover:bg-gray-600 transition">Delete</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MerchCard ─────────────────────────────────────────────────────────────────
function MerchCard({ item, tab, canUpload, onToggleSoldOut, onArchive, onUnarchive, onEdit, onDelete }) {
  const variantsByType = (item.variants || []).reduce((acc, v) => {
    (acc[v.variant_type] = acc[v.variant_type] || []).push(v);
    return acc;
  }, {});

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      <div className="flex gap-4 p-4">
        <div className="flex-shrink-0">
          {item.photo_url
            ? <img src={item.photo_url} alt={item.name} className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg object-cover" />
            : <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg bg-gray-700 flex items-center justify-center text-gray-500 text-xs text-center px-2">No photo</div>
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0">
              <h3 className="text-white font-semibold leading-tight truncate">{item.name}</h3>
              {item.category && <p className="text-gray-400 text-xs mt-0.5">{item.category}</p>}
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              {item.sold_out ? (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />Sold Out
                </span>
              ) : !item.archived && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />Available
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 items-center mt-1">
            {item.price     != null && <p className="text-orange-400 text-sm font-medium">{fmtPrice(item.price)}</p>}
            {item.weight_oz != null && <span className="text-gray-400 text-xs">{item.weight_oz} oz</span>}
            {Object.keys(variantsByType).length === 0 && (
              <span className={`text-xs ${item.quantity > 0 ? 'text-gray-300' : 'text-red-400'}`}>
                {item.quantity ?? 0} in stock
              </span>
            )}
          </div>
          {item.description && <p className="text-gray-400 text-xs mt-1 line-clamp-2">{item.description}</p>}

          {Object.keys(variantsByType).length > 0 && (
            <div className="mt-2 space-y-1">
              {Object.entries(variantsByType).map(([type, vals]) => (
                <div key={type} className="flex flex-wrap gap-1 items-center">
                  <span className="text-gray-500 text-xs w-12 flex-shrink-0">{type}:</span>
                  {vals.map((v, i) => {
                    const out = !v.available || (v.quantity ?? 0) <= 0;
                    return (
                      <span key={i} className={`px-1.5 py-0.5 rounded text-xs border ${
                        out
                          ? 'border-gray-700 text-gray-600 bg-gray-800 line-through'
                          : 'border-gray-600 text-gray-300 bg-gray-700/50'
                      }`} title={`${v.quantity ?? 0} in stock`}>
                        {v.variant_value} <span className="text-gray-500">×{v.quantity ?? 0}</span>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-gray-700/60 bg-gray-800/40">
        <div className="flex items-center gap-2 px-4 py-2 flex-wrap">
          {tab === 'on_website' && (
            <button onClick={onToggleSoldOut}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${item.sold_out ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25' : 'bg-red-500/15 text-red-400 hover:bg-red-500/25'}`}>
              {item.sold_out ? 'Mark Available' : 'Mark Sold Out'}
            </button>
          )}
          {canUpload && tab === 'on_website' && (
            <button onClick={onArchive} className="px-3 py-1 rounded-lg text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition">Archive</button>
          )}
          {canUpload && tab === 'archived' && (
            <button onClick={onUnarchive} className="px-3 py-1 rounded-lg text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition">Restore</button>
          )}
          {canUpload && tab === 'on_website' && (
            <button onClick={onEdit} className="px-3 py-1 rounded-lg text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition">Edit</button>
          )}
          {canUpload && (
            <button onClick={onDelete} className="px-3 py-1 rounded-lg text-xs text-red-400 hover:text-red-300 bg-gray-700 hover:bg-gray-600 transition">Delete</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MenuCard ──────────────────────────────────────────────────────────────────
function MenuCard({ menu, canUpload, onUpload, onDelete }) {
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const fileRef = useRef();

  const handleFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setUploadErr('');
    const err = await onUpload(menu.location, file);
    if (err) setUploadErr(err);
    setUploading(false);
  };

  const label = menu.location === 'midtown' ? 'Midtown' : 'Northside';

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-white font-semibold text-base">{label} Menu</h3>
          {menu.filename ? (
            <p className="text-gray-400 text-sm mt-0.5">
              Updated {new Date(menu.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              {menu.uploaded_by_name && ` by ${menu.uploaded_by_name}`}
            </p>
          ) : (
            <p className="text-gray-500 text-sm mt-0.5">No menu uploaded</p>
          )}
          {uploadErr && <p className="text-red-400 text-xs mt-1">{uploadErr}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {menu.url && (
            <a href={menu.url} target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 transition">
              View PDF
            </a>
          )}
          {canUpload && (
            <>
              <button onClick={() => fileRef.current.click()} disabled={uploading}
                className="px-3 py-1.5 rounded-lg text-sm text-white font-medium transition disabled:opacity-50 hover:opacity-90"
                style={{ backgroundColor: '#F05A28' }}>
                {uploading ? 'Uploading…' : menu.filename ? 'Replace PDF' : 'Upload PDF'}
              </button>
              {menu.filename && (
                <button onClick={() => onDelete(menu.location)}
                  className="px-3 py-1.5 rounded-lg text-sm text-red-400 hover:text-red-300 bg-gray-700 hover:bg-gray-600 transition">
                  Remove
                </button>
              )}
            </>
          )}
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={handleFile} />
        </div>
      </div>
    </div>
  );
}

// ── ShipModal ─────────────────────────────────────────────────────────────────
function ShipModal({ order, onClose, onShipped }) {
  const [tracking, setTracking] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setSaving(true); setError('');
    try {
      const res = await fetch(`${API}/api/coffee-site/orders/${order.id}/ship`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracking_number: tracking }),
      });
      if (!res.ok) { setError('Failed to mark shipped.'); setSaving(false); return; }
      onShipped(await res.json());
      onClose();
    } catch { setError('Network error.'); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-gray-800 w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-gray-700">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="text-white font-semibold">Mark Order #{order.id} Shipped</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-gray-400 text-xs mb-1">Tracking Number (optional)</label>
            <input
              autoFocus
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              value={tracking}
              onChange={e => setTracking(e.target.value)}
              placeholder="e.g. 9400 1112 0234 5678 9012 34"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-700 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-600 rounded-lg transition">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-50 transition"
            style={{ backgroundColor: '#F05A28' }}>
            {saving ? 'Saving…' : 'Mark Shipped'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── OrderCard ─────────────────────────────────────────────────────────────────
function OrderCard({ order, canUpload, onShip, onUnship, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const isShipped = order.status === 'shipped';
  const totalItems = (order.items || []).reduce((a, it) => a + it.quantity, 0);
  const addr = order.shipping_address || {};
  const accent = isShipped ? 'border-l-green-500' : 'border-l-orange-500';

  const copyAddress = () => {
    const lines = [
      order.customer_name,
      addr.line1,
      addr.line2,
      [addr.city, addr.state, addr.postal_code].filter(Boolean).join(', '),
      addr.country,
    ].filter(Boolean).join('\n');
    if (lines) navigator.clipboard?.writeText(lines);
  };

  return (
    <div className={`bg-gray-800 border border-gray-700 border-l-4 rounded-xl overflow-hidden ${accent} ${isShipped ? 'opacity-80' : ''}`}>
      {/* ── Header strip ────────────────────────────────────────────── */}
      <div className={`px-5 py-2.5 flex items-center justify-between gap-3 flex-wrap ${isShipped ? 'bg-green-500/5' : 'bg-orange-500/5'}`}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider ${
            isShipped ? 'bg-green-500/20 text-green-300' : 'bg-orange-500/25 text-orange-300'
          }`}>
            {isShipped ? '✓ Shipped' : '● Pending'}
          </span>
          <span className="text-gray-400 text-sm font-medium">Order #{order.id}</span>
          <span className="text-gray-600">·</span>
          <span className="text-gray-400 text-sm">{fmtOrderDate(order.created_at)}</span>
        </div>
        <div className="text-right">
          <div className="text-white font-bold text-lg leading-none">{fmtCents(order.total_cents)}</div>
          <div className="text-gray-500 text-xs mt-0.5">{totalItems} item{totalItems !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* ── Customer name (big & prominent) ─────────────────────────── */}
      <div className="px-5 pt-4 pb-2">
        <h3 className="text-white font-bold text-xl leading-tight">{order.customer_name || 'Customer'}</h3>
        {order.customer_email && (
          <a href={`mailto:${order.customer_email}`} className="text-gray-300 text-sm hover:text-orange-400 transition inline-block mt-0.5">
            {order.customer_email}
          </a>
        )}
      </div>

      {/* ── Customer notes (loud if present) ────────────────────────── */}
      {order.notes && (
        <div className="px-5 pb-3">
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
            <p className="text-yellow-400 text-[10px] font-bold uppercase tracking-wider mb-1">📝 Customer Notes</p>
            <p className="text-yellow-100 text-sm">{order.notes}</p>
          </div>
        </div>
      )}

      {/* ── Items to pack + Ship to (two columns on desktop) ────────── */}
      <div className="px-5 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Items */}
        <div>
          <h4 className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">📦 Items to Pack</h4>
          <div className="bg-gray-900/50 border border-gray-700/40 rounded-lg p-3 space-y-2">
            {(order.items || []).map(it => (
              <div key={it.id} className="flex items-start gap-3">
                <span className="bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded font-bold text-sm flex-shrink-0 min-w-[2rem] text-center">
                  ×{it.quantity}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-medium leading-snug">{it.name}</p>
                  {it.variant_label && <p className="text-gray-400 text-xs mt-0.5">{it.variant_label}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Address */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">📍 Ship To</h4>
            {(addr.line1 || addr.city) && (
              <button onClick={copyAddress} className="text-orange-400 hover:text-orange-300 text-[10px] font-medium uppercase tracking-wider transition">
                Copy
              </button>
            )}
          </div>
          <div className="bg-gray-900/50 border border-gray-700/40 rounded-lg p-3 text-sm leading-relaxed">
            {(addr.line1 || addr.city) ? (
              <>
                {order.customer_name && <div className="text-white font-medium">{order.customer_name}</div>}
                {addr.line1 && <div className="text-gray-200">{addr.line1}</div>}
                {addr.line2 && <div className="text-gray-200">{addr.line2}</div>}
                {(addr.city || addr.state || addr.postal_code) && (
                  <div className="text-gray-200">
                    {[addr.city, addr.state, addr.postal_code].filter(Boolean).join(', ')}
                  </div>
                )}
                {addr.country && <div className="text-gray-400 text-xs mt-0.5">{addr.country}</div>}
              </>
            ) : (
              <p className="text-gray-500 italic">No shipping address provided</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Shipped confirmation strip ──────────────────────────────── */}
      {isShipped && (
        <div className="px-5 pb-4">
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2.5">
            <p className="text-green-300 text-sm font-semibold">
              ✓ Shipped {fmtOrderDate(order.shipped_at)}
              {order.shipped_by_name && <span className="text-green-300/70 font-normal"> by {order.shipped_by_name}</span>}
            </p>
            {order.tracking_number && (
              <p className="text-gray-200 text-sm mt-1">
                Tracking: <span className="font-mono text-white">{order.tracking_number}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Expanded details (totals + stripe id) ───────────────────── */}
      {expanded && (
        <div className="px-5 py-3 border-t border-gray-700/40 bg-gray-900/30 space-y-2.5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="text-gray-200">{fmtCents(order.subtotal_cents)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Shipping</span><span className="text-gray-200">{fmtCents(order.shipping_cents)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Tax</span><span className="text-gray-200">{fmtCents(order.tax_cents)}</span></div>
            <div className="flex justify-between font-bold"><span className="text-gray-300">Total</span><span className="text-white">{fmtCents(order.total_cents)}</span></div>
          </div>
          <p className="text-gray-600 text-[10px] font-mono pt-1 border-t border-gray-700/30">Stripe: {order.stripe_payment_id}</p>
        </div>
      )}

      {/* ── Action bar ──────────────────────────────────────────────── */}
      <div className="border-t border-gray-700/60 bg-gray-800/60 px-5 py-3 flex items-center gap-2 flex-wrap">
        {!isShipped && (
          <button onClick={onShip}
            className="px-5 py-2 rounded-lg text-sm font-bold text-white transition hover:opacity-90 shadow-lg shadow-orange-500/20"
            style={{ backgroundColor: '#F05A28' }}>
            ✓ Mark Shipped
          </button>
        )}
        {isShipped && canUpload && (
          <button onClick={onUnship}
            className="px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 transition">
            Reopen
          </button>
        )}
        <button onClick={() => setExpanded(e => !e)}
          className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white transition">
          {expanded ? 'Hide totals' : 'Show totals'}
        </button>
        <div className="flex-1" />
        {canUpload && (
          <button onClick={onDelete}
            className="px-3 py-1.5 rounded-lg text-sm text-red-400 hover:text-red-300 bg-gray-700 hover:bg-gray-600 transition">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CoffeeSiteManager({ user, canUpload, onBack }) {
  const [section, setSection]           = useState('coffee');
  const [tab, setTab]                   = useState('on_website');
  const [orderTab, setOrderTab]         = useState('pending');
  const [bags, setBags]                 = useState([]);
  const [merch, setMerch]               = useState([]);
  const [menus, setMenus]               = useState([]);
  const [orders, setOrders]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [editBag, setEditBag]           = useState(null);
  const [showAddBag, setShowAddBag]     = useState(false);
  const [editMerch, setEditMerch]       = useState(null);
  const [showAddMerch, setShowAddMerch] = useState(false);
  const [shipOrder, setShipOrder]       = useState(null);

  const load = async () => {
    const [bagsRes, merchRes, menusRes, ordersRes] = await Promise.all([
      fetch(`${API}/api/coffee-site/bags`, { credentials: 'include' }),
      fetch(`${API}/api/coffee-site/merch`, { credentials: 'include' }),
      fetch(`${API}/api/coffee-site/menus`, { credentials: 'include' }),
      fetch(`${API}/api/coffee-site/orders`, { credentials: 'include' }),
    ]);
    if (bagsRes.ok)   setBags(await bagsRes.json());
    if (merchRes.ok)  setMerch(await merchRes.json());
    if (menusRes.ok)  setMenus(await menusRes.json());
    if (ordersRes.ok) setOrders(await ordersRes.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  // ── Bag handlers ────────────────────────────────────────────────────────────
  const toggleBagSoldOut = async (bag) => {
    const newVal = !bag.sold_out;
    setBags(b => b.map(x => x.id === bag.id ? { ...x, sold_out: newVal } : x));
    const res = await fetch(`${API}/api/coffee-site/bags/${bag.id}/sold-out`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sold_out: newVal }),
    });
    if (!res.ok) load();
  };

  const toggleBagArchive = async (bag, archive) => {
    setBags(b => b.map(x => x.id === bag.id
      ? { ...x, archived: archive, archived_at: archive ? new Date().toISOString() : null, is_featured: archive ? false : x.is_featured }
      : x
    ));
    const res = await fetch(`${API}/api/coffee-site/bags/${bag.id}/archive`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: archive }),
    });
    if (!res.ok) load();
  };

  const setBagFeatured = async (bag, featured) => {
    setBags(b => b.map(x =>
      x.id === bag.id ? { ...x, is_featured: featured } : { ...x, is_featured: featured ? false : x.is_featured }
    ));
    const res = await fetch(`${API}/api/coffee-site/bags/${bag.id}/feature`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featured }),
    });
    if (!res.ok) load();
  };

  const deleteBag = async (bag) => {
    if (!window.confirm(`Delete "${bag.coffee_name}"? This cannot be undone.`)) return;
    await fetch(`${API}/api/coffee-site/bags/${bag.id}`, { method: 'DELETE', credentials: 'include' });
    setBags(b => b.filter(x => x.id !== bag.id));
  };

  const onSavedBag = (saved) => {
    setBags(prev => {
      const idx = prev.findIndex(x => x.id === saved.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n; }
      return [saved, ...prev];
    });
  };

  // ── Merch handlers ──────────────────────────────────────────────────────────
  const toggleMerchSoldOut = async (item) => {
    const newVal = !item.sold_out;
    setMerch(m => m.map(x => x.id === item.id ? { ...x, sold_out: newVal } : x));
    const res = await fetch(`${API}/api/coffee-site/merch/${item.id}/sold-out`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sold_out: newVal }),
    });
    if (!res.ok) load();
  };

  const toggleMerchArchive = async (item, archive) => {
    setMerch(m => m.map(x => x.id === item.id
      ? { ...x, archived: archive, archived_at: archive ? new Date().toISOString() : null }
      : x
    ));
    const res = await fetch(`${API}/api/coffee-site/merch/${item.id}/archive`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: archive }),
    });
    if (!res.ok) load();
  };

  const deleteMerch = async (item) => {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    await fetch(`${API}/api/coffee-site/merch/${item.id}`, { method: 'DELETE', credentials: 'include' });
    setMerch(m => m.filter(x => x.id !== item.id));
  };

  const onSavedMerch = (saved) => {
    setMerch(prev => {
      const idx = prev.findIndex(x => x.id === saved.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n; }
      return [saved, ...prev];
    });
  };

  // ── Menu handlers ───────────────────────────────────────────────────────────
  const handleMenuUpload = async (location, file) => {
    try {
      const old_filename = menus.find(m => m.location === location)?.filename || null;
      const pr = await fetch(`${API}/api/coffee-site/menus/presign`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location }),
      });
      if (!pr.ok) return 'Upload failed.';
      const { signedUrl, filename } = await pr.json();
      const put = await fetch(signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': 'application/pdf' } });
      if (!put.ok) return 'Upload failed.';
      const res = await fetch(`${API}/api/coffee-site/menus/commit`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, filename, old_filename }),
      });
      if (!res.ok) return 'Failed to save.';
      const updated = await res.json();
      setMenus(m => m.map(x => x.location === location ? updated : x));
      return null;
    } catch { return 'Network error.'; }
  };

  // ── Order handlers ──────────────────────────────────────────────────────────
  const onOrderShipped = (updated) => {
    setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
  };

  const unshipOrder = async (order) => {
    if (!window.confirm(`Reopen order #${order.id}? This clears the tracking number.`)) return;
    const res = await fetch(`${API}/api/coffee-site/orders/${order.id}/unship`, {
      method: 'PATCH', credentials: 'include',
    });
    if (!res.ok) { load(); return; }
    const updated = await res.json();
    setOrders(prev => prev.map(o => o.id === order.id ? updated : o));
  };

  const deleteOrder = async (order) => {
    if (!window.confirm(`Delete order #${order.id}? Inventory is NOT restored. This cannot be undone.`)) return;
    const res = await fetch(`${API}/api/coffee-site/orders/${order.id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) setOrders(prev => prev.filter(o => o.id !== order.id));
  };

  const handleMenuDelete = async (location) => {
    if (!window.confirm('Remove this menu PDF?')) return;
    await fetch(`${API}/api/coffee-site/menus/${location}`, { method: 'DELETE', credentials: 'include' });
    setMenus(m => m.map(x => x.location === location ? { ...x, filename: null, url: null, uploaded_at: null, uploaded_by_name: null } : x));
  };

  // ── Computed ─────────────────────────────────────────────────────────────────
  const bagsOnSite  = bags.filter(b => !b.archived);
  const bagsArchived = bags.filter(b => b.archived);
  const merchOnSite  = merch.filter(m => !m.archived);
  const merchArchived = merch.filter(m => m.archived);

  const hasExplicitFeatured = bagsOnSite.some(b => b.is_featured);
  const autoFeaturedId = hasExplicitFeatured ? null : (bagsOnSite.find(b => !b.sold_out)?.id ?? null);

  const displayed = section === 'coffee'
    ? (tab === 'on_website' ? bagsOnSite : bagsArchived)
    : (tab === 'on_website' ? merchOnSite : merchArchived);

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Nav */}
      <nav className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition">
          <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-xl">HQ</span>
        </button>
        <h1 className="text-cream font-bold text-lg sm:text-xl">Coffee Site</h1>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Section tabs */}
        <div className="flex gap-1.5 mb-5">
          {[
            { key: 'coffee', label: 'Coffee Bags' },
            { key: 'merch',  label: 'Merch' },
            { key: 'orders', label: 'Orders', badge: orders.filter(o => o.status !== 'shipped').length },
            ...(canUpload ? [{ key: 'menus', label: 'Menus' }] : []),
          ].map(s => (
            <button key={s.key} onClick={() => setSection(s.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
                section === s.key ? 'text-white' : 'text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700'
              }`}
              style={section === s.key ? { backgroundColor: '#F05A28' } : {}}>
              {s.label}
              {s.badge > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  section === s.key ? 'bg-white/20 text-white' : 'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {s.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Orders section */}
        {section === 'orders' && (
          <div>
            <div className="flex gap-1.5 mb-5">
              {[
                { key: 'pending',  label: 'Pending',  count: orders.filter(o => o.status !== 'shipped').length },
                { key: 'shipped',  label: 'Shipped',  count: orders.filter(o => o.status === 'shipped').length },
                { key: 'all',      label: 'All',      count: orders.length },
              ].map(t => (
                <button key={t.key} onClick={() => setOrderTab(t.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition ${
                    orderTab === t.key ? 'text-white font-medium bg-gray-600' : 'text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700'
                  }`}>
                  {t.label}
                  {t.count > 0 && (
                    <span className={`text-xs ${orderTab === t.key ? 'text-gray-300' : 'text-gray-500'}`}>{t.count}</span>
                  )}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="text-gray-400 text-center py-20">Loading…</div>
            ) : (() => {
              const filtered = orderTab === 'all'
                ? orders
                : orders.filter(o => orderTab === 'pending' ? o.status !== 'shipped' : o.status === 'shipped');
              if (filtered.length === 0) return (
                <div className="text-gray-500 text-center py-20">
                  {orderTab === 'pending' ? 'No pending orders.' : orderTab === 'shipped' ? 'No shipped orders yet.' : 'No orders yet.'}
                </div>
              );
              return (
                <div className="space-y-4">
                  {filtered.map(o => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      canUpload={canUpload}
                      onShip={() => setShipOrder(o)}
                      onUnship={() => unshipOrder(o)}
                      onDelete={() => deleteOrder(o)}
                    />
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* Menus section */}
        {section === 'menus' && (
          <div className="space-y-4">
            {loading ? (
              <div className="text-gray-400 text-center py-20">Loading…</div>
            ) : (
              ['midtown', 'northside'].map(loc => {
                const menu = menus.find(m => m.location === loc) || { location: loc, filename: null, url: null, uploaded_at: null, uploaded_by_name: null };
                return (
                  <MenuCard
                    key={loc}
                    menu={menu}
                    canUpload={canUpload}
                    onUpload={handleMenuUpload}
                    onDelete={handleMenuDelete}
                  />
                );
              })
            )}
          </div>
        )}

        {/* On Website / Archived sub-tabs + content — only for coffee/merch sections */}
        {section !== 'menus' && section !== 'orders' && (
          <>
            <div className="flex items-center justify-between gap-4 mb-6">
              <div className="flex gap-1.5">
                {[
                  { key: 'on_website', label: 'On Website', count: section === 'coffee' ? bagsOnSite.length : merchOnSite.length },
                  { key: 'archived',   label: 'Archived',   count: section === 'coffee' ? bagsArchived.length : merchArchived.length },
                ].map(t => (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition ${
                      tab === t.key ? 'text-white font-medium bg-gray-600' : 'text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700'
                    }`}>
                    {t.label}
                    {t.count > 0 && (
                      <span className={`text-xs ${tab === t.key ? 'text-gray-300' : 'text-gray-500'}`}>{t.count}</span>
                    )}
                  </button>
                ))}
              </div>
              {canUpload && tab === 'on_website' && (
                <button onClick={() => section === 'coffee' ? setShowAddBag(true) : setShowAddMerch(true)}
                  className="px-4 py-2 text-sm text-white rounded-lg font-medium flex-shrink-0 transition hover:opacity-90"
                  style={{ backgroundColor: '#F05A28' }}>
                  + {section === 'coffee' ? 'Add Coffee' : 'Add Item'}
                </button>
              )}
            </div>

            {loading ? (
              <div className="text-gray-400 text-center py-20">Loading…</div>
            ) : displayed.length === 0 ? (
              <div className="text-gray-500 text-center py-20">
                {tab === 'on_website'
                  ? `No ${section === 'coffee' ? 'coffees' : 'merch items'} yet. Add one to get started.`
                  : 'Nothing archived.'}
              </div>
            ) : (
              <div className="space-y-4">
                {section === 'coffee'
                  ? displayed.map(bag => (
                      <BagCard
                        key={bag.id}
                        bag={bag}
                        tab={tab}
                        canUpload={canUpload}
                        autoFeaturedId={autoFeaturedId}
                        onToggleSoldOut={() => toggleBagSoldOut(bag)}
                        onArchive={() => toggleBagArchive(bag, true)}
                        onUnarchive={() => toggleBagArchive(bag, false)}
                        onSetFeatured={f => setBagFeatured(bag, f)}
                        onEdit={() => setEditBag(bag)}
                        onDelete={() => deleteBag(bag)}
                      />
                    ))
                  : displayed.map(item => (
                      <MerchCard
                        key={item.id}
                        item={item}
                        tab={tab}
                        canUpload={canUpload}
                        onToggleSoldOut={() => toggleMerchSoldOut(item)}
                        onArchive={() => toggleMerchArchive(item, true)}
                        onUnarchive={() => toggleMerchArchive(item, false)}
                        onEdit={() => setEditMerch(item)}
                        onDelete={() => deleteMerch(item)}
                      />
                    ))
                }
              </div>
            )}
          </>
        )}
      </main>

      {(showAddBag || editBag) && (
        <BagModal bag={editBag} onClose={() => { setShowAddBag(false); setEditBag(null); }} onSaved={onSavedBag} />
      )}
      {(showAddMerch || editMerch) && (
        <MerchModal item={editMerch} onClose={() => { setShowAddMerch(false); setEditMerch(null); }} onSaved={onSavedMerch} />
      )}
      {shipOrder && (
        <ShipModal order={shipOrder} onClose={() => setShipOrder(null)} onShipped={onOrderShipped} />
      )}
    </div>
  );
}
