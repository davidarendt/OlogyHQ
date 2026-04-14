import { useState, useEffect, useRef } from 'react';

const API = process.env.REACT_APP_API_URL || '';

// Auth-gated image component (identical pattern to Recipes)
function PhotoImg({ src, alt, className }) {
  const [objectUrl, setObjectUrl] = useState(null);
  useEffect(() => {
    let url;
    fetch(src, { credentials: 'include' })
      .then(r => r.ok ? r.blob() : null)
      .then(blob => {
        if (blob) { url = URL.createObjectURL(blob); setObjectUrl(url); }
      })
      .catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [src]);
  if (!objectUrl) return null;
  return <img src={objectUrl} alt={alt || ''} className={className} />;
}

function formatAmount(n) {
  if (n == null) return '';
  const f = parseFloat(n);
  return f % 1 === 0 ? String(f) : String(f);
}

function TagBadge({ name, color }) {
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: color + '33', color, border: `1px solid ${color}66` }}>
      {name}
    </span>
  );
}

// ── Detail Views ─────────────────────────────────────────────────────────────

function CocktailDetail({ cocktail, batched, onClose, onEdit, onViewBatched, onRecommendEdit, canUpload }) {
  const hasPhoto = !!cocktail.photo_filename;
  const linkedBatched = (cocktail.linked_batched_items || []).filter(b => b.name);
  const serviceInfo = [cocktail.method, cocktail.glass, cocktail.ice].filter(Boolean).join(' · ');

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 sm:p-8" onClick={onClose}>
      <div
        className="bg-gray-700 border border-gray-500/40 shadow-2xl shadow-black/70 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Photo */}
        {hasPhoto && (
          <div className="w-full h-56 bg-gray-800 rounded-t-2xl overflow-hidden">
            <PhotoImg
              src={`${API}/api/cocktails/${cocktail.id}/photo`}
              alt={cocktail.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="p-8">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex-1 min-w-0">
              <h2 className="text-cream text-3xl font-bold leading-tight">{cocktail.name}</h2>
              {serviceInfo && (
                <p className="text-gray-400 text-sm mt-2 tracking-wide">{serviceInfo}</p>
              )}
              {(cocktail.tags || []).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {(cocktail.tags || []).map(t => <TagBadge key={t.name} name={t.name} color={t.color} />)}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 pt-1">
              {canUpload ? (
                <button
                  onClick={onEdit}
                  className="text-sm font-medium px-3 py-1.5 rounded-lg transition"
                  style={{ border: '1px solid #F05A2860', color: '#F05A28', backgroundColor: '#F05A2812' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F05A2825'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F05A2812'}
                >
                  Edit
                </button>
              ) : (
                <button
                  onClick={onRecommendEdit}
                  className="text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-500/60 text-gray-300 hover:text-white hover:border-gray-400 transition"
                >
                  Recommend an Edit
                </button>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-600 hover:bg-gray-500 text-gray-300 hover:text-white transition text-sm font-medium"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Price + Special — visually distinct from flavor tags */}
          {(cocktail.price || cocktail.last_special_on) && (
            <div className="flex flex-wrap gap-2 mb-6">
              {cocktail.price && (
                <span className="text-sm font-bold px-3 py-1 rounded-full" style={{ backgroundColor: '#F05A2820', color: '#F05A28', border: '1px solid #F05A2845' }}>
                  ${parseFloat(cocktail.price).toFixed(2)}
                </span>
              )}
              {cocktail.last_special_on && (
                <span className="text-xs font-medium bg-pink-900/30 text-pink-300 border border-pink-700/40 px-3 py-1 rounded-full">
                  Last Special · {new Date(cocktail.last_special_on + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-gray-600/50 mb-6" />

          {/* Ingredients */}
          {(cocktail.ingredients || []).length > 0 && (
            <div className="mb-6">
              <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3">Ingredients</h3>
              <ul className="space-y-2">
                {cocktail.ingredients.map((ing, i) => {
                  const isBatched = linkedBatched.some(b => b.name && ing.ingredient_name &&
                    ing.ingredient_name.toLowerCase().includes(b.name.toLowerCase().replace(/^"(.+)"$/, '$1')));
                  const isGarnish = ing.unit === 'Garnish';
                  return (
                    <li key={i} className={`flex items-baseline gap-2.5 ${isGarnish ? 'opacity-60' : ''}`}>
                      <span className="text-gray-500 text-xs shrink-0">–</span>
                      {formatAmount(ing.amount) && (
                        <span className="text-orange-300 font-semibold tabular-nums text-sm shrink-0">{formatAmount(ing.amount)}</span>
                      )}
                      {ing.unit && !isGarnish && (
                        <span className="text-gray-400 text-xs shrink-0">{ing.unit}</span>
                      )}
                      <span className={`text-sm ${isBatched ? 'text-orange-200' : 'text-gray-200'}`}>
                        {ing.ingredient_name}
                      </span>
                      {isGarnish && <span className="text-gray-500 text-xs italic shrink-0">garnish</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Notes */}
          {cocktail.notes && (
            <div className="mb-6">
              <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3">Notes</h3>
              <p className="text-gray-300 text-sm whitespace-pre-line leading-relaxed">{cocktail.notes}</p>
            </div>
          )}

          {/* House-Made — clearly actionable */}
          {linkedBatched.length > 0 && (
            <div>
              <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3">House-Made</h3>
              <div className="flex flex-wrap gap-2">
                {linkedBatched.map(b => {
                  const fullItem = batched.find(bi => bi.id === b.id);
                  return fullItem ? (
                    <button
                      key={b.id}
                      onClick={() => onViewBatched(fullItem)}
                      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-orange-500/50 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 hover:border-orange-500 hover:text-orange-200 transition"
                    >
                      {b.name}
                      <span className="text-orange-500/70 text-xs">↗</span>
                    </button>
                  ) : (
                    <span key={b.id} className="text-sm px-3 py-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-300/70">
                      {b.name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BatchedDetail({ item, cocktails, onClose, onEdit, canUpload }) {
  const linkedCocktails = (item.linked_cocktails || []).filter(c => c.name);
  const steps = (item.recipe_notes || '').split('\n').filter(s => s.trim());

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-cream text-2xl font-bold">{item.name}</h2>
              {(item.yield_amount || item.yield_unit) && (
                <p className="text-gray-400 text-sm mt-1">
                  Yield: <span className="text-gray-300">{item.yield_amount} {item.yield_unit}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canUpload && (
                <button onClick={onEdit} className="text-sm text-gray-400 hover:text-orange-400 transition px-2 py-1 rounded border border-gray-600 hover:border-orange-500">
                  Edit
                </button>
              )}
              <button onClick={onClose} className="text-gray-400 hover:text-white transition text-xl leading-none">✕</button>
            </div>
          </div>

          {steps.length > 0 && (
            <div className="mb-4">
              <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Recipe</h3>
              <ol className="space-y-2">
                {steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-gray-300 text-sm leading-relaxed">
                    <span className="text-orange-400 font-semibold tabular-nums shrink-0 mt-0.5">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {linkedCocktails.length > 0 && (
            <div>
              <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Used In</h3>
              <div className="flex flex-wrap gap-2">
                {linkedCocktails.map(c => (
                  <span key={c.id} className="text-sm px-2.5 py-0.5 rounded-md border border-orange-500/40 bg-orange-500/10 text-orange-300">
                    {c.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Edit Modals ───────────────────────────────────────────────────────────────

function CocktailModal({ cocktail, catalog, tagDefs, batchedItems, onSave, onClose, isSuggestion }) {
  const isNew = !cocktail;
  const [form, setForm] = useState({
    name: cocktail?.name || '',
    method: cocktail?.method || '',
    glass: cocktail?.glass || '',
    ice: cocktail?.ice || '',
    status: cocktail?.status || 'menu',
    price: cocktail?.price || '',
    last_special_on: cocktail?.last_special_on || '',
    notes: cocktail?.notes || '',
  });
  const [ingredients, setIngredients] = useState(
    cocktail?.ingredients?.length
      ? cocktail.ingredients.map(i => ({ ingredient_name: i.ingredient_name, amount: i.amount ?? '', unit: i.unit || '' }))
      : [{ ingredient_name: '', amount: '', unit: '' }]
  );
  const [selectedTags, setSelectedTags] = useState(new Set((cocktail?.tags || []).map(t => t.name)));
  const [selectedBatched, setSelectedBatched] = useState(new Set((cocktail?.linked_batched_item_ids || [])));
  const [photo, setPhoto] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addIngredient = () => setIngredients(prev => [...prev, { ingredient_name: '', amount: '', unit: '' }]);
  const removeIngredient = (i) => setIngredients(prev => prev.filter((_, idx) => idx !== i));
  const setIng = (i, k, v) => setIngredients(prev => prev.map((ing, idx) => idx === i ? { ...ing, [k]: v } : ing));
  const moveIng = (i, dir) => {
    const arr = [...ingredients];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setIngredients(arr);
  };

  const toggleTag = (name) => setSelectedTags(prev => {
    const s = new Set(prev);
    s.has(name) ? s.delete(name) : s.add(name);
    return s;
  });
  const toggleBatched = (id) => setSelectedBatched(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''));
      fd.append('ingredients', JSON.stringify(ingredients.filter(i => i.ingredient_name.trim())));
      fd.append('tags', JSON.stringify([...selectedTags]));
      fd.append('linked_batched_item_ids', JSON.stringify([...selectedBatched]));
      if (photo) fd.append('photo', photo);
      if (removePhoto) fd.append('remove_photo', 'true');

      const url = isNew ? `${API}/api/cocktails` : `${API}/api/cocktails/${cocktail.id}`;
      const method = isNew ? 'POST' : 'PATCH';
      const res = await fetch(url, { method, credentials: 'include', body: fd });
      if (!res.ok) throw new Error();
      onSave();
    } catch {
      alert('Failed to save cocktail.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500';
  const selectCls = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-cream text-xl font-bold">{isSuggestion ? 'Suggest a Cocktail' : isNew ? 'New Cocktail' : 'Edit Cocktail'}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-gray-400 text-xs uppercase tracking-wider mb-1 block">Name *</label>
              <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} required />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wider mb-1 block">Method</label>
                <select className={selectCls} value={form.method} onChange={e => set('method', e.target.value)}>
                  <option value="">—</option>
                  {(catalog.method || []).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wider mb-1 block">Glass</label>
                <select className={selectCls} value={form.glass} onChange={e => set('glass', e.target.value)}>
                  <option value="">—</option>
                  {(catalog.glass || []).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wider mb-1 block">Ice</label>
                <select className={selectCls} value={form.ice} onChange={e => set('ice', e.target.value)}>
                  <option value="">—</option>
                  {(catalog.ice || []).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>

            {isSuggestion ? (
              <div className="bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 text-gray-400 text-sm">
                Category: <span className="text-yellow-400 font-medium">Work-In-Progress</span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-400 text-xs uppercase tracking-wider mb-1 block">Status</label>
                    <select className={selectCls} value={form.status} onChange={e => set('status', e.target.value)}>
                      <option value="menu">Menu Item</option>
                      <option value="special">Special</option>
                      <option value="wip">Work-In-Progress</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs uppercase tracking-wider mb-1 block">Price</label>
                    <input type="number" step="0.01" className={inputCls} value={form.price} onChange={e => set('price', e.target.value)} placeholder="0.00" />
                  </div>
                </div>
                <div>
                  <label className="text-gray-400 text-xs uppercase tracking-wider mb-1 block">Last Featured as Special</label>
                  <input type="date" className={inputCls} value={form.last_special_on} onChange={e => set('last_special_on', e.target.value)} />
                </div>
              </>
            )}

            {/* Ingredients */}
            <div>
              <label className="text-gray-400 text-xs uppercase tracking-wider mb-2 block">Ingredients</label>
              <div className="space-y-2">
                {ingredients.map((ing, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <div className="flex flex-col gap-0.5">
                      <button type="button" onClick={() => moveIng(i, -1)} disabled={i === 0} className="text-gray-500 hover:text-gray-300 disabled:opacity-20 text-xs leading-none">▲</button>
                      <button type="button" onClick={() => moveIng(i, 1)} disabled={i === ingredients.length - 1} className="text-gray-500 hover:text-gray-300 disabled:opacity-20 text-xs leading-none">▼</button>
                    </div>
                    <input
                      className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500"
                      placeholder="Ingredient"
                      value={ing.ingredient_name}
                      onChange={e => setIng(i, 'ingredient_name', e.target.value)}
                    />
                    <input
                      type="number" step="0.01"
                      className="w-16 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500"
                      placeholder="Amt"
                      value={ing.amount}
                      onChange={e => setIng(i, 'amount', e.target.value)}
                    />
                    <select
                      className="w-20 bg-gray-700 border border-gray-600 rounded px-1 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500"
                      value={ing.unit}
                      onChange={e => setIng(i, 'unit', e.target.value)}
                    >
                      <option value="">—</option>
                      {(catalog.unit || []).map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <button type="button" onClick={() => removeIngredient(i)} className="text-gray-500 hover:text-red-400 transition text-sm shrink-0">✕</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addIngredient} className="mt-2 text-xs text-orange-400 hover:text-orange-300 transition">
                + Add Ingredient
              </button>
            </div>

            {/* Tags */}
            {tagDefs.length > 0 && (
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wider mb-2 block">Tags</label>
                <div className="flex flex-wrap gap-2">
                  {tagDefs.map(td => (
                    <button
                      key={td.name}
                      type="button"
                      onClick={() => toggleTag(td.name)}
                      className="text-xs font-medium px-2.5 py-1 rounded-full transition"
                      style={
                        selectedTags.has(td.name)
                          ? { backgroundColor: td.color + '33', color: td.color, border: `1px solid ${td.color}` }
                          : { backgroundColor: 'transparent', color: '#9ca3af', border: '1px solid #4b5563' }
                      }
                    >
                      {td.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Linked batched items */}
            {batchedItems.length > 0 && (
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wider mb-2 block">House-Made Items Used</label>
                <div className="flex flex-wrap gap-2">
                  {batchedItems.map(b => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => toggleBatched(b.id)}
                      className="text-xs px-2.5 py-1 rounded-md transition"
                      style={
                        selectedBatched.has(b.id)
                          ? { backgroundColor: '#F05A2822', color: '#F05A28', border: '1px solid #F05A2866' }
                          : { backgroundColor: 'transparent', color: '#9ca3af', border: '1px solid #4b5563' }
                      }
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="text-gray-400 text-xs uppercase tracking-wider mb-1 block">Notes</label>
              <textarea className={inputCls + ' resize-none'} rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>

            {/* Photo */}
            <div>
              <label className="text-gray-400 text-xs uppercase tracking-wider mb-1 block">Photo</label>
              {cocktail?.photo_filename && !removePhoto && !photo && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-gray-400 text-xs">Current photo set</span>
                  <button type="button" onClick={() => setRemovePhoto(true)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { setPhoto(e.target.files[0]); setRemovePhoto(false); }} />
              <button type="button" onClick={() => fileRef.current.click()} className="text-xs text-gray-400 hover:text-white border border-gray-600 hover:border-gray-400 rounded px-3 py-1.5 transition">
                {photo ? photo.name : 'Choose photo…'}
              </button>
              {photo && <button type="button" onClick={() => setPhoto(null)} className="ml-2 text-xs text-gray-500 hover:text-red-400">Remove</button>}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-semibold rounded-lg text-white transition disabled:opacity-50" style={{ backgroundColor: '#F05A28' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function BatchedModal({ item, cocktails, catalog, onSave, onClose }) {
  const isNew = !item;
  const [form, setForm] = useState({
    name: item?.name || '',
    recipe_notes: item?.recipe_notes || '',
    yield_amount: item?.yield_amount || '',
    yield_unit: item?.yield_unit || '',
  });
  const [selectedCocktails, setSelectedCocktails] = useState(new Set((item?.linked_cocktail_ids || [])));
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggle = (id) => setSelectedCocktails(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body = { ...form, linked_cocktail_ids: JSON.stringify([...selectedCocktails]) };
      const url = isNew ? `${API}/api/cocktails/batched` : `${API}/api/cocktails/batched/${item.id}`;
      const method = isNew ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      onSave();
    } catch {
      alert('Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-cream text-xl font-bold">{isNew ? 'New Batched Item' : 'Edit Batched Item'}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-gray-400 text-xs uppercase tracking-wider mb-1 block">Name *</label>
              <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wider mb-1 block">Yield Amount</label>
                <input type="number" step="0.01" className={inputCls} value={form.yield_amount} onChange={e => set('yield_amount', e.target.value)} />
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wider mb-1 block">Yield Unit</label>
                <select className={inputCls} value={form.yield_unit} onChange={e => set('yield_unit', e.target.value)}>
                  <option value="">—</option>
                  {(catalog.unit || []).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-gray-400 text-xs uppercase tracking-wider mb-1 block">Recipe / Instructions</label>
              <textarea className={inputCls + ' resize-none'} rows={8} value={form.recipe_notes} onChange={e => set('recipe_notes', e.target.value)} placeholder="One step per line…" />
              <p className="text-gray-500 text-xs mt-1">Each line becomes a numbered step.</p>
            </div>

            {cocktails.length > 0 && (
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wider mb-2 block">Used In Cocktails</label>

                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {cocktails.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggle(c.id)}
                      className="text-xs px-2.5 py-1 rounded-md transition"
                      style={
                        selectedCocktails.has(c.id)
                          ? { backgroundColor: '#F05A2822', color: '#F05A28', border: '1px solid #F05A2866' }
                          : { backgroundColor: 'transparent', color: '#9ca3af', border: '1px solid #4b5563' }
                      }
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-semibold rounded-lg text-white transition disabled:opacity-50" style={{ backgroundColor: '#F05A28' }}>
                {saving ? 'Saving…' : isSuggestion ? 'Submit Suggestion' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Recommend Edit Modal ──────────────────────────────────────────────────────

function RecommendEditModal({ cocktail, onClose, onSave }) {
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/cocktails/submissions`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'change', cocktail_id: cocktail.id, description }),
      });
      if (!res.ok) throw new Error();
      onSave();
    } catch {
      alert('Failed to submit.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500';

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-700 border border-gray-500/40 shadow-2xl shadow-black/70 rounded-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-cream text-xl font-bold">Recommend an Edit</h2>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-600 hover:bg-gray-500 text-gray-300 hover:text-white transition text-sm">✕</button>
          </div>
          <p className="text-gray-400 text-sm mb-5">{cocktail.name}</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-gray-400 text-xs uppercase tracking-wider mb-1 block">What would you change? *</label>
              <textarea
                className={inputCls + ' resize-none'}
                rows={5}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe your suggested change — ingredients, ratios, garnish…"
                required
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-semibold rounded-lg text-white transition disabled:opacity-50" style={{ backgroundColor: '#F05A28' }}>
                {saving ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

function CocktailKeeper({ user, canUpload, onBack }) {
  const [cocktails, setCocktails] = useState([]);
  const [batched, setBatched] = useState([]);
  const [catalog, setCatalog] = useState({});
  const [tagDefs, setTagDefs] = useState([]);
  const [tab, setTab] = useState('cocktails');
  const [cocktailCategory, setCocktailCategory] = useState('menu');
  const [manageTab, setManageTab] = useState('cocktails');
  const [tagFilter, setTagFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [viewCocktail, setViewCocktail] = useState(null);
  const [viewBatched, setViewBatched] = useState(null);
  const [editCocktail, setEditCocktail] = useState(undefined); // undefined=closed, null=new, obj=edit
  const [editBatched, setEditBatched] = useState(undefined);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [recommendCocktail, setRecommendCocktail] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const fetches = [
        fetch(`${API}/api/cocktails`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API}/api/cocktails/batched`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API}/api/cocktails/catalog`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API}/api/cocktails/tag-definitions`, { credentials: 'include' }).then(r => r.json()),
      ];
      if (canUpload) fetches.push(fetch(`${API}/api/cocktails/submissions`, { credentials: 'include' }).then(r => r.json()));
      const [cRes, bRes, catRes, tdRes, subRes] = await Promise.all(fetches);
      setCocktails(Array.isArray(cRes) ? cRes : []);
      setBatched(Array.isArray(bRes) ? bRes : []);
      setCatalog(catRes || {});
      setTagDefs(Array.isArray(tdRes) ? tdRes : []);
      if (subRes) setSubmissions(Array.isArray(subRes) ? subRes : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allTags = [...new Set(cocktails.flatMap(c => (c.tags || []).map(t => t.name)))].sort();

  const filteredCocktails = cocktails.filter(c => {
    if (c.status !== cocktailCategory) return false;
    if (tagFilter && !(c.tags || []).some(t => t.name === tagFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      const inName = c.name.toLowerCase().includes(q);
      const inIngredients = (c.ingredients || []).some(i => i.ingredient_name.toLowerCase().includes(q));
      if (!inName && !inIngredients) return false;
    }
    return true;
  });

  const pendingSubmissions = submissions.filter(s => s.status === 'pending');

  const handleDelete = async (type, id) => {
    if (!window.confirm('Delete this item?')) return;
    const url = type === 'cocktail' ? `${API}/api/cocktails/${id}` : `${API}/api/cocktails/batched/${id}`;
    await fetch(url, { method: 'DELETE', credentials: 'include' });
    load();
  };

  const afterSave = () => {
    setEditCocktail(undefined);
    setEditBatched(undefined);
    setSuggestOpen(false);
    setRecommendCocktail(null);
    load();
  };

  const handleReviewSubmission = async (id, status) => {
    await fetch(`${API}/api/cocktails/submissions/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const handleDeleteSubmission = async (id) => {
    if (!window.confirm('Delete this submission?')) return;
    await fetch(`${API}/api/cocktails/submissions/${id}`, { method: 'DELETE', credentials: 'include' });
    load();
  };

  const TABS = [
    { key: 'cocktails', label: 'Cocktails' },
    { key: 'batched', label: 'House-Made' },
    ...(canUpload ? [{ key: 'manage', label: 'Manage' }] : []),
  ];

  const tabCls = (k) => `px-4 py-2 text-sm font-medium rounded-lg transition ${
    tab === k ? 'text-white' : 'text-gray-400 hover:text-white'
  }`;
  const tabStyle = (k) => tab === k ? { backgroundColor: '#F05A28' } : {};

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Top Nav */}
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition">
          <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-xl">HQ</span>
        </button>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition">
          ← Back to Dashboard
        </button>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={tabCls(t.key)} style={tabStyle(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && <p className="text-gray-400 text-center py-12">Loading…</p>}

        {/* ── Cocktails Tab ── */}
        {!loading && tab === 'cocktails' && (
          <>
            {/* Category sub-tabs + Suggest button */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {[
                { key: 'menu', label: 'Menu Items' },
                { key: 'special', label: 'Specials' },
                { key: 'wip', label: 'Work-In-Progress' },
              ].map(cat => (
                <button
                  key={cat.key}
                  onClick={() => { setCocktailCategory(cat.key); setTagFilter(null); setSearch(''); }}
                  className={`px-3 py-1.5 text-sm rounded-lg transition ${cocktailCategory === cat.key ? 'text-white' : 'text-gray-400 hover:text-white bg-gray-800'}`}
                  style={cocktailCategory === cat.key ? { backgroundColor: '#F05A28' } : {}}
                >
                  {cat.label}
                </button>
              ))}
              <div className="flex-1" />
              <button
                onClick={() => setSuggestOpen(true)}
                className="px-3 py-1.5 text-sm font-medium rounded-lg border border-orange-500/50 text-orange-400 hover:bg-orange-500/10 transition"
              >
                + Suggest a Cocktail
              </button>
            </div>

            {/* Tag filters */}
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {allTags.map(tag => {
                  const color = (cocktails.find(c => (c.tags||[]).some(t => t.name === tag))?.tags || []).find(t => t.name === tag)?.color || '#6b7280';
                  return (
                    <button
                      key={tag}
                      onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                      className="text-xs font-medium px-2.5 py-1 rounded-full transition"
                      style={
                        tagFilter === tag
                          ? { backgroundColor: color + '33', color, border: `1px solid ${color}` }
                          : { backgroundColor: 'transparent', color: '#9ca3af', border: '1px solid #4b5563' }
                      }
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            )}

            <input
              className="w-full max-w-sm bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 mb-6"
              placeholder="Search by name or ingredient…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            {filteredCocktails.length === 0 && (
              <p className="text-gray-500 text-center py-12">No cocktails found.</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCocktails.map(c => (
                <div
                  key={c.id}
                  onClick={() => setViewCocktail(c)}
                  className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden cursor-pointer hover:border-orange-500 transition group"
                >
                  {c.photo_filename && (
                    <div className="w-full h-32 bg-gray-900 overflow-hidden">
                      <PhotoImg
                        src={`${API}/api/cocktails/${c.id}/photo`}
                        alt={c.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="text-white font-semibold text-base group-hover:text-orange-400 transition leading-tight mb-1">{c.name}</h3>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {c.method && <span className="text-xs text-gray-500">{c.method}</span>}
                      {c.glass && <span className="text-gray-600 text-xs">·</span>}
                      {c.glass && <span className="text-xs text-gray-500">{c.glass}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(c.tags || []).map(t => <TagBadge key={t.name} name={t.name} color={t.color} />)}
                    </div>
                    {c.price && (
                      <p className="text-sm font-semibold mt-2" style={{ color: '#F05A28' }}>${parseFloat(c.price).toFixed(2)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Batched Items Tab ── */}
        {!loading && tab === 'batched' && (
          <div className="space-y-3">
            {batched.length === 0 && <p className="text-gray-500 text-center py-12">No house-made items.</p>}
            {batched.map(b => (
              <div
                key={b.id}
                onClick={() => setViewBatched(b)}
                className="bg-gray-800 border border-gray-700 rounded-xl p-4 cursor-pointer hover:border-orange-500 transition group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-semibold group-hover:text-orange-400 transition">{b.name}</h3>
                    {(b.yield_amount || b.yield_unit) && (
                      <p className="text-gray-500 text-sm mt-0.5">Yield: {b.yield_amount} {b.yield_unit}</p>
                    )}
                  </div>
                  {(b.linked_cocktails || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 justify-end max-w-xs">
                      {(b.linked_cocktails || []).map(c => (
                        <span key={c.id} className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded">{c.name}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Manage Tab ── */}
        {!loading && tab === 'manage' && canUpload && (
          <>
            {/* Manage sub-tabs */}
            <div className="flex gap-2 mb-6">
              {[
                { key: 'cocktails', label: 'Cocktails' },
                { key: 'batched', label: 'House-Made' },
                { key: 'submissions', label: `Submissions${pendingSubmissions.length ? ` (${pendingSubmissions.length})` : ''}` },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setManageTab(t.key)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition ${manageTab === t.key ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {manageTab === 'cocktails' && (
              <>
                <div className="flex justify-end mb-4">
                  <button
                    onClick={() => setEditCocktail(null)}
                    className="px-4 py-2 text-sm font-semibold rounded-lg text-white transition"
                    style={{ backgroundColor: '#F05A28' }}
                  >
                    + New Cocktail
                  </button>
                </div>
                <div className="space-y-2">
                  {cocktails.map(c => (
                    <div key={c.id} className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-medium text-sm">{c.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            c.status === 'menu' ? 'bg-green-900/50 text-green-400' :
                            c.status === 'special' ? 'bg-pink-900/50 text-pink-400' :
                            'bg-yellow-900/50 text-yellow-400'
                          }`}>
                            {c.status === 'menu' ? 'Menu' : c.status === 'special' ? 'Special' : 'WIP'}
                          </span>
                          {c.suggested_by_name && (
                            <span className="text-xs text-gray-500">suggested by {c.suggested_by_name}</span>
                          )}
                        </div>
                        <div className="flex gap-1 mt-0.5 flex-wrap">
                          {c.method && <span className="text-xs text-gray-500">{c.method}</span>}
                          {(c.tags || []).map(t => <TagBadge key={t.name} name={t.name} color={t.color} />)}
                        </div>
                      </div>
                      <button onClick={() => setEditCocktail(c)} className="text-sm text-gray-400 hover:text-orange-400 transition px-2 py-1 rounded border border-gray-600 hover:border-orange-500">
                        Edit
                      </button>
                      <button onClick={() => handleDelete('cocktail', c.id)} className="text-sm text-gray-500 hover:text-red-400 transition">
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {manageTab === 'submissions' && (
              <div className="space-y-3">
                {submissions.length === 0 && (
                  <p className="text-gray-500 text-center py-12">No submissions yet.</p>
                )}
                {submissions.map(s => (
                  <div key={s.id} className={`bg-gray-800 border rounded-xl p-4 ${s.status === 'pending' ? 'border-orange-500/40' : 'border-gray-700 opacity-60'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.type === 'new' ? 'bg-blue-900/50 text-blue-300' : 'bg-purple-900/50 text-purple-300'}`}>
                            {s.type === 'new' ? 'New Idea' : 'Change Request'}
                          </span>
                          {s.type === 'change' && s.cocktail_name_ref && (
                            <span className="text-xs text-gray-400">re: {s.cocktail_name_ref}</span>
                          )}
                          {s.type === 'new' && s.cocktail_name && (
                            <span className="text-sm font-medium text-white">"{s.cocktail_name}"</span>
                          )}
                          <span className={`text-xs px-1.5 py-0.5 rounded ${s.status === 'pending' ? 'bg-yellow-900/50 text-yellow-400' : 'bg-gray-700 text-gray-400'}`}>
                            {s.status}
                          </span>
                        </div>
                        <p className="text-gray-300 text-sm whitespace-pre-line">{s.description}</p>
                        <p className="text-gray-500 text-xs mt-2">
                          From {s.submitted_by_name} · {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        {s.status === 'pending' && (
                          <button
                            onClick={() => handleReviewSubmission(s.id, 'reviewed')}
                            className="text-xs px-2 py-1 rounded border border-green-600 text-green-400 hover:bg-green-900/30 transition"
                          >
                            Mark Reviewed
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteSubmission(s.id)}
                          className="text-xs text-gray-500 hover:text-red-400 transition text-right"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {manageTab === 'batched' && (
              <>
                <div className="flex justify-end mb-4">
                  <button
                    onClick={() => setEditBatched(null)}
                    className="px-4 py-2 text-sm font-semibold rounded-lg text-white transition"
                    style={{ backgroundColor: '#F05A28' }}
                  >
                    + New House-Made Item
                  </button>
                </div>
                <div className="space-y-2">
                  {batched.map(b => (
                    <div key={b.id} className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-white font-medium text-sm">{b.name}</span>
                        {(b.yield_amount || b.yield_unit) && (
                          <span className="text-gray-500 text-xs ml-2">{b.yield_amount} {b.yield_unit}</span>
                        )}
                      </div>
                      <button onClick={() => setEditBatched(b)} className="text-sm text-gray-400 hover:text-orange-400 transition px-2 py-1 rounded border border-gray-600 hover:border-orange-500">
                        Edit
                      </button>
                      <button onClick={() => handleDelete('batched', b.id)} className="text-sm text-gray-500 hover:text-red-400 transition">
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>

      {/* Detail modals */}
      {viewCocktail && (
        <CocktailDetail
          cocktail={viewCocktail}
          batched={batched}
          canUpload={canUpload}
          onClose={() => setViewCocktail(null)}
          onEdit={() => { setEditCocktail(viewCocktail); setViewCocktail(null); }}
          onViewBatched={(item) => { setViewCocktail(null); setViewBatched(item); }}
          onRecommendEdit={() => { setRecommendCocktail(viewCocktail); setViewCocktail(null); }}
        />
      )}
      {viewBatched && (
        <BatchedDetail
          item={viewBatched}
          cocktails={cocktails}
          canUpload={canUpload}
          onClose={() => setViewBatched(null)}
          onEdit={() => { setEditBatched(viewBatched); setViewBatched(null); }}
        />
      )}

      {/* Edit modals */}
      {editCocktail !== undefined && (
        <CocktailModal
          cocktail={editCocktail}
          catalog={catalog}
          tagDefs={tagDefs}
          batchedItems={batched}
          onSave={afterSave}
          onClose={() => setEditCocktail(undefined)}
        />
      )}
      {editBatched !== undefined && (
        <BatchedModal
          item={editBatched}
          cocktails={cocktails}
          catalog={catalog}
          onSave={afterSave}
          onClose={() => setEditBatched(undefined)}
        />
      )}
      {suggestOpen && (
        <CocktailModal
          cocktail={null}
          catalog={catalog}
          tagDefs={tagDefs}
          batchedItems={batched}
          isSuggestion={true}
          onSave={afterSave}
          onClose={() => setSuggestOpen(false)}
        />
      )}
      {recommendCocktail && (
        <RecommendEditModal
          cocktail={recommendCocktail}
          onClose={() => setRecommendCocktail(null)}
          onSave={afterSave}
        />
      )}
    </div>
  );
}

export default CocktailKeeper;
