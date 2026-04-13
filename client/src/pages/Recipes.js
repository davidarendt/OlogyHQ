import { useState, useEffect, useRef } from 'react';

const API = process.env.REACT_APP_API_URL || '';

const CATEGORIES = [
  { value: 'breakfast',  label: 'Breakfast' },
  { value: 'appetizer',  label: 'Appetizer' },
  { value: 'entree',     label: 'Entree' },
  { value: 'dessert',    label: 'Dessert' },
  { value: 'sauce',      label: 'Sauce' },
  { value: 'prep',       label: 'Prep / Component' },
  { value: 'other',      label: 'Other' },
];

const CAT_COLORS = {
  breakfast: '#f59e0b',
  appetizer: '#3b82f6',
  entree:    '#10b981',
  dessert:   '#ec4899',
  sauce:     '#F05A28',
  prep:      '#8b5cf6',
  other:     '#6b7280',
};

function getCatLabel(value) {
  return CATEGORIES.find(c => c.value === value)?.label || 'Other';
}

// ── Authenticated image loader ─────────────────────────────────────────────────
function RecipeImg({ recipeId, className }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let objUrl;
    fetch(`${API}/api/recipes/${recipeId}/photo`, { credentials: 'include' })
      .then(r => r.ok ? r.blob() : null)
      .then(blob => {
        if (blob) { objUrl = URL.createObjectURL(blob); setSrc(objUrl); }
      })
      .catch(() => {});
    return () => { if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [recipeId]);
  if (!src) return <div className="w-full h-full bg-gray-700" />;
  return <img src={src} alt="" className={className} />;
}

// ── Recipe detail modal (read-only) ───────────────────────────────────────────
function RecipeDetail({ recipe, canUpload, onClose, onEdit }) {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-2xl">
        {recipe.image_filename && (
          <div className="w-full h-56 overflow-hidden rounded-t-2xl">
            <RecipeImg recipeId={recipe.id} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="p-6 pb-2 flex items-start justify-between gap-4">
          <div>
            <span className="text-xs font-bold px-2 py-0.5 rounded text-white inline-block mb-2"
              style={{ backgroundColor: CAT_COLORS[recipe.category] || '#6b7280' }}>
              {getCatLabel(recipe.category)}
            </span>
            <h3 className="text-white text-2xl font-bold">{recipe.name}</h3>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {canUpload && (
              <button onClick={onEdit}
                className="px-3 py-1.5 rounded-lg text-sm text-gray-300 border border-gray-600 hover:text-white hover:border-gray-500 transition">
                Edit
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none transition">×</button>
          </div>
        </div>

        <div className="p-6 pt-4 space-y-5">
          {recipe.description && (
            <p className="text-gray-300 text-sm leading-relaxed">{recipe.description}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {recipe.ingredients && (
              <div>
                <h4 className="text-orange-400 font-semibold text-xs uppercase tracking-wider mb-2">Ingredients</h4>
                <pre className="text-gray-300 text-sm whitespace-pre-wrap font-sans leading-relaxed">{recipe.ingredients}</pre>
              </div>
            )}
            {recipe.instructions && (
              <div>
                <h4 className="text-orange-400 font-semibold text-xs uppercase tracking-wider mb-2">Instructions</h4>
                <pre className="text-gray-300 text-sm whitespace-pre-wrap font-sans leading-relaxed">{recipe.instructions}</pre>
              </div>
            )}
          </div>

          {recipe.notes && (
            <div className="bg-gray-700/50 rounded-xl p-4 border border-gray-600">
              <h4 className="text-orange-400 font-semibold text-xs uppercase tracking-wider mb-2">Notes</h4>
              <p className="text-gray-300 text-sm leading-relaxed">{recipe.notes}</p>
            </div>
          )}

          {recipe.linked_recipes && recipe.linked_recipes.length > 0 && (
            <div>
              <h4 className="text-orange-400 font-semibold text-xs uppercase tracking-wider mb-2">Related Recipes</h4>
              <div className="flex flex-wrap gap-2">
                {recipe.linked_recipes.map(lr => (
                  <span key={lr.id}
                    className="px-3 py-1 rounded-full bg-gray-700 text-gray-300 text-xs border border-gray-600">
                    {lr.name}
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

// ── Create / Edit modal ────────────────────────────────────────────────────────
function RecipeModal({ recipe, allRecipes, onClose, onSaved }) {
  const isEdit = !!recipe;
  const [name, setName]               = useState(recipe?.name || '');
  const [category, setCategory]       = useState(recipe?.category || 'entree');
  const [description, setDescription] = useState(recipe?.description || '');
  const [ingredients, setIngredients] = useState(recipe?.ingredients || '');
  const [instructions, setInstructions] = useState(recipe?.instructions || '');
  const [notes, setNotes]             = useState(recipe?.notes || '');
  const [linkedIds, setLinkedIds]     = useState(recipe?.linked_recipe_ids || []);
  const [photo, setPhoto]             = useState(null);
  const [clearPhoto, setClearPhoto]   = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const photoRef                      = useRef();

  const toggleLinked = (id) =>
    setLinkedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const otherRecipes = allRecipes.filter(r => r.id !== recipe?.id);

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    const fd = new FormData();
    fd.append('name', name.trim());
    fd.append('category', category);
    fd.append('description', description);
    fd.append('ingredients', ingredients);
    fd.append('instructions', instructions);
    fd.append('notes', notes);
    fd.append('linked_recipe_ids', JSON.stringify(linkedIds));
    if (photo) fd.append('photo', photo);
    if (isEdit && clearPhoto) fd.append('clear_photo', '1');

    const url    = isEdit ? `${API}/api/recipes/${recipe.id}` : `${API}/api/recipes`;
    const method = isEdit ? 'PATCH' : 'POST';
    const res    = await fetch(url, { method, credentials: 'include', body: fd });
    const data   = await res.json();
    if (!res.ok) { setError(data.message || 'Save failed.'); setSaving(false); return; }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-2xl p-6 space-y-5">
        <h3 className="text-white font-semibold text-lg">{isEdit ? 'Edit Recipe' : 'Add Recipe'}</h3>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-sm">{error}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-gray-400 text-sm mb-1.5">
              Recipe Name <span className="text-red-400">*</span>
            </label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Hollandaise Sauce"
              className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-1.5">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-1.5">Photo</label>
            <div onClick={() => photoRef.current.click()}
              className="w-full border-2 border-dashed border-gray-600 rounded-lg px-4 py-3 text-center cursor-pointer hover:border-gray-500 transition">
              <p className="text-gray-400 text-sm truncate">
                {photo ? photo.name : (isEdit && recipe.image_filename ? 'Replace photo…' : 'Click to upload photo')}
              </p>
            </div>
            <input ref={photoRef} type="file" accept="image/*" className="hidden"
              onChange={e => { setPhoto(e.target.files[0]); setClearPhoto(false); }} />
            {isEdit && recipe.image_filename && !photo && (
              <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                <input type="checkbox" checked={clearPhoto} onChange={e => setClearPhoto(e.target.checked)}
                  className="accent-orange-500" />
                <span className="text-gray-500 text-xs">Remove existing photo</span>
              </label>
            )}
          </div>
        </div>

        <div>
          <label className="block text-gray-400 text-sm mb-1.5">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
            placeholder="Brief description of this recipe…"
            className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-400 text-sm mb-1.5">Ingredients</label>
            <textarea value={ingredients} onChange={e => setIngredients(e.target.value)} rows={7}
              placeholder={"2 egg yolks\n1 tbsp lemon juice\n½ cup butter…"}
              className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono" />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1.5">Instructions</label>
            <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={7}
              placeholder={"1. Whisk egg yolks with lemon juice…\n2. …"}
              className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono" />
          </div>
        </div>

        <div>
          <label className="block text-gray-400 text-sm mb-1.5">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Prep tips, storage instructions, allergen info…"
            className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>

        {otherRecipes.length > 0 && (
          <div>
            <label className="block text-gray-400 text-sm mb-2">Related Recipes</label>
            <div className="max-h-40 overflow-y-auto bg-gray-700 rounded-lg p-3 grid grid-cols-2 gap-2 border border-gray-600">
              {otherRecipes.map(r => (
                <label key={r.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={linkedIds.includes(r.id)} onChange={() => toggleLinked(r.id)}
                    className="accent-orange-500 flex-shrink-0" />
                  <span className="text-gray-300 text-sm truncate">{r.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-600 text-gray-300 text-sm hover:bg-gray-700 transition">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition disabled:opacity-50"
            style={{ backgroundColor: '#F05A28' }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Recipe'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Recipe card (library grid) ─────────────────────────────────────────────────
function RecipeCard({ recipe, onClick }) {
  return (
    <button onClick={onClick}
      className="group bg-gray-800 rounded-2xl border border-gray-700 hover:border-orange-500 transition-all duration-200 text-left overflow-hidden flex flex-col hover:shadow-lg hover:shadow-orange-500/10 hover:-translate-y-0.5">
      <div className="w-full h-36 overflow-hidden flex-shrink-0">
        {recipe.image_filename
          ? <RecipeImg recipeId={recipe.id} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          : <div className="w-full h-full bg-gray-700 flex items-center justify-center text-4xl">🍽️</div>
        }
      </div>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <span className="text-xs font-bold px-2 py-0.5 rounded self-start text-white"
          style={{ backgroundColor: CAT_COLORS[recipe.category] || '#6b7280' }}>
          {getCatLabel(recipe.category)}
        </span>
        <p className="text-white font-semibold text-sm leading-snug group-hover:text-orange-400 transition-colors">
          {recipe.name}
        </p>
        {recipe.description && (
          <p className="text-gray-500 text-xs leading-snug overflow-hidden"
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {recipe.description}
          </p>
        )}
      </div>
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Recipes({ user, canUpload, onBack }) {
  const [recipes, setRecipes]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [view, setView]         = useState('library');
  const [search, setSearch]     = useState('');
  const [activeCat, setActiveCat] = useState('all');
  const [viewing, setViewing]   = useState(null);
  const [editing, setEditing]   = useState(null); // null | recipe | 'new'

  const fetchRecipes = () => {
    fetch(`${API}/api/recipes`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setRecipes(Array.isArray(d) ? d : []); setLoading(false); });
  };

  useEffect(() => { fetchRecipes(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this recipe?')) return;
    await fetch(`${API}/api/recipes/${id}`, { method: 'DELETE', credentials: 'include' });
    setRecipes(prev => prev.filter(r => r.id !== id));
  };

  const moveRecipe = async (index, direction) => {
    const next = [...recipes];
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    setRecipes(next);
    await fetch(`${API}/api/recipes/reorder`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: next.map(r => r.id) }),
    });
  };

  const filtered = recipes.filter(r => {
    const matchSearch = !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.description || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCat === 'all' || r.category === activeCat;
    return matchSearch && matchCat;
  });

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Nav */}
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition">
          <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-xl">HQ</span>
        </button>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition">
          ← Back to Dashboard
        </button>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h2 className="text-cream text-4xl font-bold">Recipes</h2>
            <p className="text-gray-400 mt-2">Kitchen recipe library</p>
          </div>
          {canUpload && (
            <div className="flex gap-2 bg-gray-800 p-1 rounded-lg border border-gray-700">
              {['library', 'manage'].map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-4 py-1.5 rounded-md text-sm font-semibold transition capitalize ${
                    view === v ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                  }`}>
                  {v === 'library' ? 'Library' : 'Manage'}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-gray-500 text-sm">Loading…</div>
        ) : view === 'library' ? (
          <>
            {/* Search + category filter */}
            <div className="mb-6 space-y-3">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search recipes…"
                className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent" />
              <div className="flex flex-wrap gap-2">
                {[{ value: 'all', label: 'All' }, ...CATEGORIES].map(c => (
                  <button key={c.value} onClick={() => setActiveCat(c.value)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                      activeCat === c.value
                        ? 'text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
                    }`}
                    style={activeCat === c.value
                      ? { backgroundColor: CAT_COLORS[c.value] || '#F05A28' }
                      : {}}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-20 text-gray-600 text-sm">
                {recipes.length === 0 ? 'No recipes yet.' : 'No recipes match your search.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map(r => (
                  <RecipeCard key={r.id} recipe={r} onClick={() => setViewing(r)} />
                ))}
              </div>
            )}
          </>
        ) : (
          /* ── Manage view ── */
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={() => setEditing('new')}
                className="px-4 py-2 rounded-xl text-white text-sm font-semibold transition hover:opacity-90"
                style={{ backgroundColor: '#F05A28' }}>
                + Add Recipe
              </button>
            </div>
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              {recipes.length === 0 ? (
                <div className="py-16 text-center text-gray-500 text-sm">No recipes yet. Click Add Recipe to get started.</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Order</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Name</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4 hidden sm:table-cell">Category</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4 hidden md:table-cell">Photo</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4 hidden lg:table-cell">Added By</th>
                      <th className="px-6 py-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {recipes.map((recipe, i) => (
                      <tr key={recipe.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/30 transition">
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <button onClick={() => moveRecipe(i, -1)} disabled={i === 0}
                              className="text-gray-500 hover:text-white disabled:opacity-20 transition text-xs leading-none">▲</button>
                            <button onClick={() => moveRecipe(i, 1)} disabled={i === recipes.length - 1}
                              className="text-gray-500 hover:text-white disabled:opacity-20 transition text-xs leading-none">▼</button>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-white text-sm font-medium">{recipe.name}</td>
                        <td className="px-6 py-4 hidden sm:table-cell">
                          <span className="text-xs font-bold px-2 py-0.5 rounded text-white"
                            style={{ backgroundColor: CAT_COLORS[recipe.category] || '#6b7280' }}>
                            {getCatLabel(recipe.category)}
                          </span>
                        </td>
                        <td className="px-6 py-4 hidden md:table-cell">
                          <span className={recipe.image_filename ? 'text-green-400 text-xs' : 'text-gray-600 text-xs'}>
                            {recipe.image_filename ? '✓' : '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4 hidden lg:table-cell text-gray-400 text-sm">
                          {recipe.created_by_name || '—'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3 justify-end">
                            <button onClick={() => setViewing(recipe)} className="text-sm text-gray-400 hover:text-white transition">View</button>
                            <button onClick={() => setEditing(recipe)} className="text-sm text-gray-400 hover:text-white transition">Edit</button>
                            <button onClick={() => handleDelete(recipe.id)} className="text-sm text-red-500 hover:text-red-400 transition">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>

      {viewing && (
        <RecipeDetail
          recipe={viewing}
          canUpload={canUpload}
          onClose={() => setViewing(null)}
          onEdit={() => { setEditing(viewing); setViewing(null); }}
        />
      )}
      {editing && (
        <RecipeModal
          recipe={editing === 'new' ? null : editing}
          allRecipes={recipes}
          onClose={() => setEditing(null)}
          onSaved={fetchRecipes}
        />
      )}
    </div>
  );
}
