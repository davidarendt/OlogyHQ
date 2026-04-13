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

function CocktailDetail({ cocktail, batched, onClose, onEdit, canUpload }) {
  const hasPhoto = !!cocktail.photo_filename;
  const linkedBatched = (cocktail.linked_batched_items || []).filter(b => b.name);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Photo */}
        {hasPhoto && (
          <div className="w-full h-48 bg-gray-900 rounded-t-2xl overflow-hidden flex items-center justify-center">
            <PhotoImg
              src={`${API}/api/cocktails/${cocktail.id}/photo`}
              alt={cocktail.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-cream text-2xl font-bold leading-tight">{cocktail.name}</h2>
              <div className="flex flex-wrap gap-2 mt-2">
                {(cocktail.tags || []).map(t => <TagBadge key={t.name} name={t.name} color={t.color} />)}
              </div>
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

          {/* Meta row */}
          <div className="flex flex-wrap gap-2 mb-4">
            {cocktail.method && (
              <span className="text-xs bg-gray-700 text-gray-300 px-2.5 py-1 rounded-md">{cocktail.method}</span>
            )}
            {cocktail.glass && (
              <span className="text-xs bg-gray-700 text-gray-300 px-2.5 py-1 rounded-md">{cocktail.glass}</span>
            )}
            {cocktail.ice && (
              <span className="text-xs bg-gray-700 text-gray-300 px-2.5 py-1 rounded-md">{cocktail.ice}</span>
            )}
            {cocktail.price && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md" style={{ backgroundColor: '#F05A2822', color: '#F05A28', border: '1px solid #F05A2855' }}>
                ${parseFloat(cocktail.price).toFixed(2)}
              </span>
            )}
            {cocktail.last_special_on && (
              <span className="text-xs bg-pink-900/40 text-pink-300 border border-pink-700/50 px-2.5 py-1 rounded-md">
                Special: {new Date(cocktail.last_special_on + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>

          {/* Ingredients */}
          {(cocktail.ingredients || []).length > 0 && (
            <div className="mb-4">
              <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Ingredients</h3>
              <ul className="space-y-1">
                {cocktail.ingredients.map((ing, i) => {
                  const isBatched = linkedBatched.some(b => b.name && ing.ingredient_name && ing.ingredient_name.toLowerCase().includes(b.name.toLowerCase().replace(/^"(.+)"$/, '$1').toLowerCase()));
                  return (
                    <li key={i} className="text-gray-300 text-sm flex items-baseline gap-2">
                      <span className="text-gray-500 text-xs">•</span>
                      {formatAmount(ing.amount) && <span className="text-orange-300 font-medium tabular-nums">{formatAmount(ing.amount)}</span>}
                      {ing.unit && ing.unit !== 'Garnish' && <span className="text-gray-400 text-xs">{ing.unit}</span>}
                      <span className={isBatched ? 'text-orange-200' : ''}>{ing.ingredient_name}</span>
                      {ing.unit === 'Garnish' && <span className="text-gray-500 text-xs italic">garnish</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Notes */}
          {cocktail.notes && (
            <div className="mb-4">
              <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Notes</h3>
              <p className="text-gray-300 text-sm whitespace-pre-line leading-relaxed">{cocktail.notes}</p>
            </div>
          )}

          {/* Linked batched items */}
          {linkedBatched.length > 0 && (
            <div>
              <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Batched Items Used</h3>
              <div className="flex flex-wrap gap-2">
                {linkedBatched.map(b => (
                  <span key={b.id} className="text-sm px-2.5 py-0.5 rounded-md border border-orange-500/40 bg-orange-500/10 text-orange-300">
                    {b.name}
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

function CocktailModal({ cocktail, catalog, tagDefs, batchedItems, onSave, onClose }) {
  const isNew = !cocktail;
  const [form, setForm] = useState({
    name: cocktail?.name || '',
    method: cocktail?.method || '',
    glass: cocktail?.glass || '',
    ice: cocktail?.ice || '',
    status: cocktail?.status || 'active',
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
            <h2 className="text-cream text-xl font-bold">{isNew ? 'New Cocktail' : 'Edit Cocktail'}</h2>
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wider mb-1 block">Status</label>
                <select className={selectCls} value={form.status} onChange={e => set('status', e.target.value)}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="special">Special</option>
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
                <label className="text-gray-400 text-xs uppercase tracking-wider mb-2 block">Batched Items Used</label>
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
                {saving ? 'Saving…' : 'Save'}
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
  const [manageTab, setManageTab] = useState('cocktails');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [viewCocktail, setViewCocktail] = useState(null);
  const [viewBatched, setViewBatched] = useState(null);
  const [editCocktail, setEditCocktail] = useState(undefined); // undefined=closed, null=new, obj=edit
  const [editBatched, setEditBatched] = useState(undefined);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [cRes, bRes, catRes, tdRes] = await Promise.all([
        fetch(`${API}/api/cocktails`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API}/api/cocktails/batched`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API}/api/cocktails/catalog`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API}/api/cocktails/tag-definitions`, { credentials: 'include' }).then(r => r.json()),
      ]);
      setCocktails(Array.isArray(cRes) ? cRes : []);
      setBatched(Array.isArray(bRes) ? bRes : []);
      setCatalog(catRes || {});
      setTagDefs(Array.isArray(tdRes) ? tdRes : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const allTags = [...new Set(cocktails.flatMap(c => (c.tags || []).map(t => t.name)))].sort();

  const filteredCocktails = cocktails.filter(c => {
    if (statusFilter === 'specials' && !c.last_special_on) return false;
    if (statusFilter === 'inactive' && c.status !== 'inactive') return false;
    if (statusFilter === 'active' && c.status !== 'active') return false;
    if (tagFilter && !(c.tags || []).some(t => t.name === tagFilter)) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleDelete = async (type, id) => {
    if (!window.confirm('Delete this item?')) return;
    const url = type === 'cocktail' ? `${API}/api/cocktails/${id}` : `${API}/api/cocktails/batched/${id}`;
    await fetch(url, { method: 'DELETE', credentials: 'include' });
    load();
  };

  const afterSave = () => {
    setEditCocktail(undefined);
    setEditBatched(undefined);
    load();
  };

  const TABS = [
    { key: 'cocktails', label: 'Cocktails' },
    { key: 'batched', label: 'Batched Items' },
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
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-gray-400 hover:text-white transition text-sm">← Back</button>
          <h1 className="text-cream text-xl font-bold">Cocktail Keeper</h1>
        </div>
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
            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { key: 'all', label: 'All' },
                { key: 'active', label: 'Active' },
                { key: 'specials', label: 'Was Special' },
                { key: 'inactive', label: 'Inactive' },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition ${statusFilter === f.key ? 'text-white' : 'text-gray-400 hover:text-white bg-gray-800'}`}
                  style={statusFilter === f.key ? { backgroundColor: '#F05A28' } : {}}
                >
                  {f.label}
                </button>
              ))}
              <div className="h-auto w-px bg-gray-700 mx-1" />
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

            <input
              className="w-full max-w-sm bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 mb-6"
              placeholder="Search cocktails…"
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
            {batched.length === 0 && <p className="text-gray-500 text-center py-12">No batched items.</p>}
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
              {[{ key: 'cocktails', label: 'Cocktails' }, { key: 'batched', label: 'Batched Items' }].map(t => (
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
                        <span className="text-white font-medium text-sm">{c.name}</span>
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

            {manageTab === 'batched' && (
              <>
                <div className="flex justify-end mb-4">
                  <button
                    onClick={() => setEditBatched(null)}
                    className="px-4 py-2 text-sm font-semibold rounded-lg text-white transition"
                    style={{ backgroundColor: '#F05A28' }}
                  >
                    + New Batched Item
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
    </div>
  );
}

export default CocktailKeeper;
