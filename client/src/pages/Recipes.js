import { useState, useEffect, useRef } from 'react';

const API = process.env.REACT_APP_API_URL || '';

const CATEGORIES = [
  { value: 'brunch',      label: 'Brunch' },
  { value: 'shareables',  label: 'Shareables' },
  { value: 'flatbreads',  label: 'Flatbreads' },
  { value: 'specials',    label: 'Specials' },
  { value: 'prep',        label: 'Prep' },
];

const CAT_COLORS = {
  brunch:     '#f59e0b',
  shareables: '#3b82f6',
  flatbreads: '#10b981',
  specials:   '#ec4899',
  prep:       '#8b5cf6',
};

function getCatLabel(v) {
  return CATEGORIES.find(c => c.value === v)?.label || 'Other';
}

// ── Authenticated image loader ─────────────────────────────────────────────────
function RecipeImg({ recipeId, bust, className }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let objUrl;
    setSrc(null);
    fetch(`${API}/api/recipes/${recipeId}/photo`, { credentials: 'include' })
      .then(r => r.ok ? r.blob() : null)
      .then(blob => { if (blob) { objUrl = URL.createObjectURL(blob); setSrc(objUrl); } })
      .catch(() => {});
    return () => { if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [recipeId, bust]); // bust = image_filename, changes when photo is replaced
  if (!src) return <div className="w-full bg-gray-700" style={{ minHeight: 200 }} />;
  return <img src={src} alt="" className={className} />;
}

// ── Helpers for display ────────────────────────────────────────────────────────
const titleCase = str => str.replace(/\b\w/g, c => c.toUpperCase());

function BulletedList({ text, prepLinks = [], onViewRecipe }) {
  const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  return (
    <ul className="space-y-2.5">
      {lines.map((line, i) => {
        const h = line.toLowerCase();
        const linked = prepLinks.find(lr => {
          const n = lr.name.toLowerCase();
          if (h.includes(n)) return true;
          const words = n.split(/\W+/).filter(w => w.length >= 4);
          return words.length >= 2 && words.every(w => h.includes(w));
        });
        return (
          <li key={i} className="flex gap-3 text-gray-200 text-lg leading-snug">
            <span className="text-xl leading-none flex-shrink-0 mt-0.5" style={{ color: '#F05A28' }}>•</span>
            {linked && onViewRecipe ? (
              <button onClick={() => onViewRecipe(linked.id)}
                className="text-left hover:text-orange-400 transition underline decoration-dotted underline-offset-2 decoration-orange-500/50">
                {titleCase(line)}
              </button>
            ) : (
              <span>{titleCase(line)}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function NumberedList({ text }) {
  const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  return (
    <ol className="space-y-3">
      {lines.map((line, i) => (
        <li key={i} className="flex gap-3 text-gray-200 text-lg leading-snug">
          <span className="font-bold flex-shrink-0 w-6 text-right" style={{ color: '#F05A28' }}>{i + 1}.</span>
          <span>{line}</span>
        </li>
      ))}
    </ol>
  );
}

// ── Recipe detail modal ────────────────────────────────────────────────────────
function RecipeDetail({ recipe, canUpload, onClose, onEdit, onViewRecipe }) {
  const isPrep = recipe.category === 'prep';
  // For menu items: pass linked prep items into the ingredient list for inline linking
  const prepLinks = !isPrep ? (recipe.linked_recipes || []).filter(lr => lr.name) : [];
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="bg-gray-700 rounded-2xl border border-gray-600 shadow-2xl shadow-black/70 w-full max-w-5xl flex flex-col sm:flex-row overflow-hidden">

        {/* Photo — left column on desktop, bottom on mobile */}
        {recipe.image_filename && (
          <div className="order-last sm:order-first sm:w-64 flex-shrink-0 bg-gray-900">
            <RecipeImg
              recipeId={recipe.id}
              bust={recipe.image_filename}
              className="w-full h-auto sm:h-full object-cover"
            />
          </div>
        )}

        {/* Content — right column on desktop */}
        <div className="flex-1 min-w-0 flex flex-col">

          {/* Header */}
          <div className="px-8 pt-7 pb-6 flex items-start justify-between gap-4 border-b border-gray-600">
            <div className="min-w-0">
              <span className="inline-block text-xs font-bold px-2.5 py-1 rounded mb-3 text-white"
                style={{ backgroundColor: CAT_COLORS[recipe.category] || '#6b7280' }}>
                {getCatLabel(recipe.category)}
              </span>
              <h3 className="text-white text-3xl font-bold leading-tight">{recipe.name}</h3>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 pt-1">
              {canUpload && (
                <button onClick={onEdit}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-200 border border-gray-500 hover:border-orange-500 hover:text-orange-400 transition">
                  Edit
                </button>
              )}
              <button onClick={onClose}
                className="w-9 h-9 rounded-lg bg-gray-600 hover:bg-gray-500 text-gray-300 hover:text-white text-xl flex items-center justify-center transition leading-none flex-shrink-0">
                ×
              </button>
            </div>
          </div>

          <div className="px-8 py-7 space-y-8 overflow-y-auto">
            {/* Ingredients + Instructions */}
            {(recipe.ingredients || recipe.instructions) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                {recipe.ingredients && (
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: '#F05A28' }}>Ingredients</h4>
                    <BulletedList text={recipe.ingredients} prepLinks={prepLinks} onViewRecipe={onViewRecipe} />
                  </div>
                )}
                {recipe.instructions && (
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: '#F05A28' }}>Instructions</h4>
                    <NumberedList text={recipe.instructions} />
                  </div>
                )}
              </div>
            )}

            {/* Cook Time */}
            {recipe.cook_time && (
              <>
                <div className="border-t border-gray-600" />
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: '#F05A28' }}>Cook Time</h4>
                  <p className="text-gray-200 text-lg">{recipe.cook_time}</p>
                </div>
              </>
            )}

            {/* Plating */}
            {recipe.plating && (
              <>
                <div className="border-t border-gray-600" />
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: '#F05A28' }}>Plating</h4>
                  <p className="text-gray-200 text-lg leading-loose">{recipe.plating}</p>
                </div>
              </>
            )}

            {/* "Used In" — only shown for prep items */}
            {isPrep && recipe.linked_recipes && recipe.linked_recipes.filter(lr => lr.name).length > 0 && (
              <>
                <div className="border-t border-gray-600" />
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: '#F05A28' }}>Used In</h4>
                  <div className="flex flex-wrap gap-2">
                    {recipe.linked_recipes.filter(lr => lr.name).map(lr => (
                      <button key={lr.id} onClick={() => onViewRecipe(lr.id)}
                        className="px-3 py-1.5 rounded-full bg-gray-600 text-gray-200 text-sm border border-gray-500 hover:border-orange-500 hover:text-orange-400 transition text-left">
                        {lr.name}
                      </button>
                    ))}
                  </div>
                  <p className="text-gray-600 text-xs mt-3">Click any item to open its recipe</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Fuzzy ingredient matching ──────────────────────────────────────────────────
// Returns true if needle (prep name) is found in haystack (ingredient text),
// either as an exact substring OR via all significant words (4+ chars) appearing.
function fuzzyMatch(haystack, needle) {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (h.includes(n)) return true;
  const words = n.split(/\W+/).filter(w => w.length >= 4);
  if (words.length < 2) return false; // single-word names require exact match
  return words.every(w => h.includes(w));
}

// ── Create / Edit modal ────────────────────────────────────────────────────────
function RecipeModal({ recipe, allRecipes, onClose, onSaved }) {
  const isEdit = !!recipe;
  const [name, setName]               = useState(recipe?.name || '');
  const [category, setCategory]       = useState(recipe?.category || 'brunch');
  const [cookTime, setCookTime]       = useState(recipe?.cook_time || '');
  const [ingredients, setIngredients] = useState(recipe?.ingredients || '');
  const [instructions, setInstructions] = useState(recipe?.instructions || '');
  const [plating, setPlating]         = useState(recipe?.plating || '');

  // Auto-match: find linked recipes by scanning ingredient text
  const initialIsPrep = (recipe?.category || 'brunch') === 'prep';
  const initialPool = initialIsPrep
    ? allRecipes.filter(r => r.id !== recipe?.id && MENU_CATS.includes(r.category))
    : allRecipes.filter(r => r.id !== recipe?.id && r.category === 'prep');
  const autoMatchedIds = recipe
    ? initialPool
        .filter(r => initialIsPrep
          ? fuzzyMatch(r.ingredients || '', recipe.name)
          : fuzzyMatch(recipe.ingredients || '', r.name)
        )
        .map(r => r.id)
    : [];
  const [linkedIds, setLinkedIds] = useState(() =>
    [...new Set([...(recipe?.linked_recipe_ids || []), ...autoMatchedIds])]
  );

  // Photo state
  const [photo, setPhoto]             = useState(null);   // file to upload
  const [previewUrl, setPreviewUrl]   = useState(null);   // object URL for thumbnail
  const [clearPhoto, setClearPhoto]   = useState(false);
  const [draggingOver, setDraggingOver] = useState(false);
  const photoRef = useRef();

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  // Clean up preview URL on unmount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, []);

  const handleFileSelected = (file) => {
    if (file && file.type.startsWith('image/')) {
      setPhoto(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));
      setClearPhoto(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDraggingOver(false);
    handleFileSelected(e.dataTransfer.files[0]);
  };

  const toggleLinked = (id) =>
    setLinkedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    const fd = new FormData();
    fd.append('name', name.trim());
    fd.append('category', category);
    fd.append('cook_time', cookTime);
    fd.append('ingredients', ingredients);
    fd.append('instructions', instructions);
    fd.append('plating', plating);
    fd.append('linked_recipe_ids', JSON.stringify(linkedIds));
    if (photo) fd.append('photo', photo);
    if (isEdit && clearPhoto) fd.append('clear_photo', '1');

    const url    = isEdit ? `${API}/api/recipes/${recipe.id}` : `${API}/api/recipes`;
    const method = isEdit ? 'PATCH' : 'POST';
    const res    = await fetch(url, { method, credentials: 'include', body: fd });
    const data   = await res.json();
    if (!res.ok) { setError(data.message || 'Save failed.'); setSaving(false); return; }
    onSaved(); onClose();
  };

  const hasExistingPhoto = isEdit && recipe.image_filename && !clearPhoto;
  const photoLabel = photo
    ? '✓ Photo ready to upload'
    : hasExistingPhoto ? 'Photo attached — drop here to replace'
    : 'Drop an image here, or click to browse';

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
        <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-2xl p-6 space-y-5">
          <h3 className="text-white font-semibold text-lg">{isEdit ? 'Edit Recipe' : 'Add Recipe'}</h3>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-sm">{error}</div>
          )}

          {/* Name + Category + Cook Time */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-3">
              <label className="block text-gray-400 text-sm mb-1.5">Recipe Name <span className="text-red-400">*</span></label>
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
            <div className="sm:col-span-2">
              <label className="block text-gray-400 text-sm mb-1.5">Cook Time</label>
              <input value={cookTime} onChange={e => setCookTime(e.target.value)}
                placeholder="e.g. 30 min prep / 20 min cook"
                className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>

          {/* Photo drop zone */}
          <div>
            <label className="block text-gray-400 text-sm mb-1.5">Photo</label>
            <div
              onClick={() => photoRef.current.click()}
              onDragOver={e => { e.preventDefault(); setDraggingOver(true); }}
              onDragLeave={() => setDraggingOver(false)}
              onDrop={handleDrop}
              className={`relative w-full border-2 border-dashed rounded-xl transition cursor-pointer overflow-hidden
                ${draggingOver ? 'border-orange-500 bg-orange-500/10' : photo || hasExistingPhoto ? 'border-gray-600 bg-gray-700/30' : 'border-gray-600 hover:border-gray-500'}`}
              style={{ minHeight: 80 }}
            >
              {/* Thumbnail preview */}
              {(photo || hasExistingPhoto) && (
                <div className="flex items-center gap-4 p-3">
                  <div className="w-20 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-gray-700">
                    {photo
                      ? <img src={previewUrl} alt="" className="w-full h-full object-cover" />
                      : <RecipeImg recipeId={recipe.id} bust={recipe.image_filename} className="w-full h-full object-cover" />
                    }
                  </div>
                  <p className="text-gray-400 text-sm">{photoLabel}</p>
                </div>
              )}
              {!photo && !hasExistingPhoto && (
                <div className="flex flex-col items-center justify-center py-6 px-4">
                  <svg className="w-8 h-8 text-gray-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-gray-500 text-sm">{photoLabel}</p>
                </div>
              )}
            </div>
            <input ref={photoRef} type="file" accept="image/*" className="hidden"
              onChange={e => handleFileSelected(e.target.files[0])} />
            {isEdit && recipe.image_filename && !photo && (
              <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                <input type="checkbox" checked={clearPhoto} onChange={e => { setClearPhoto(e.target.checked); if (e.target.checked) setPreviewUrl(null); }}
                  className="accent-orange-500" />
                <span className="text-gray-500 text-xs">Remove existing photo</span>
              </label>
            )}
          </div>

          {/* Ingredients + Instructions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-400 text-sm mb-1">Ingredients</label>
              <p className="text-gray-600 text-xs mb-1.5">One ingredient per line — auto-bulleted</p>
              <textarea value={ingredients} onChange={e => setIngredients(e.target.value)} rows={7}
                placeholder={"2 egg yolks\n1 tbsp lemon juice\n½ cup unsalted butter\nSalt and white pepper"}
                className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono" />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1">Instructions</label>
              <p className="text-gray-600 text-xs mb-1.5">One step per line — auto-numbered</p>
              <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={7}
                placeholder={"Whisk egg yolks with lemon juice in a bowl\nPlace bowl over simmering water\nGradually add melted butter while whisking\nSeason and serve immediately"}
                className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono" />
            </div>
          </div>

          {/* Plating */}
          <div>
            <label className="block text-gray-400 text-sm mb-1.5">Plating</label>
            <textarea value={plating} onChange={e => setPlating(e.target.value)} rows={3}
              placeholder="How to plate and present this dish…"
              className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>

          {/* Related recipes — filtered by section */}
          {(() => {
            const isPrep = category === 'prep';
            const linkedPool = (isPrep
              ? allRecipes.filter(r => r.id !== recipe?.id && MENU_CATS.includes(r.category))
              : allRecipes.filter(r => r.id !== recipe?.id && r.category === 'prep')
            ).sort((a, b) => a.name.localeCompare(b.name));
            const linkedLabel = isPrep ? 'Menu Items That Use This' : 'Related Prep Items';
            if (!linkedPool.length) return null;
            return (
              <div>
                <label className="block text-gray-400 text-sm mb-2">{linkedLabel}</label>
                <div className="max-h-40 overflow-y-auto bg-gray-700 rounded-lg p-3 grid grid-cols-2 gap-2 border border-gray-600">
                  {linkedPool.map(r => {
                    const isAuto = autoMatchedIds.includes(r.id) && !(recipe?.linked_recipe_ids || []).includes(r.id);
                    return (
                      <label key={r.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={linkedIds.includes(r.id)} onChange={() => toggleLinked(r.id)}
                          className="accent-orange-500 flex-shrink-0" />
                        <span className="text-gray-300 text-sm truncate">{r.name}</span>
                        {isAuto && (
                          <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#F05A28' }}>auto</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })()}

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

    </>
  );
}

// ── Recipe card ────────────────────────────────────────────────────────────────
function RecipeCard({ recipe, onClick }) {
  return (
    <button onClick={onClick}
      className="group bg-gray-800 rounded-2xl border border-gray-700 hover:border-orange-500 transition-all duration-200 text-left overflow-hidden flex flex-col hover:shadow-lg hover:shadow-orange-500/10 hover:-translate-y-0.5">
      <div className="w-full h-56 overflow-hidden flex-shrink-0">
        {recipe.image_filename
          ? <RecipeImg recipeId={recipe.id} bust={recipe.image_filename} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          : <div className="w-full h-full bg-gray-700 flex items-center justify-center text-4xl">
              {recipe.category === 'prep' ? '🔪' : '🍽️'}
            </div>
        }
      </div>
      <div className="p-4 flex flex-col gap-1.5 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold px-2 py-0.5 rounded text-white flex-shrink-0"
            style={{ backgroundColor: CAT_COLORS[recipe.category] || '#6b7280' }}>
            {getCatLabel(recipe.category)}
          </span>
          {recipe.cook_time && (
            <span className="text-gray-500 text-xs truncate">{recipe.cook_time}</span>
          )}
        </div>
        <p className="text-white font-semibold text-sm leading-snug group-hover:text-orange-400 transition-colors">
          {recipe.name}
        </p>
        {recipe.description && (
          <p className="text-gray-500 text-xs leading-snug"
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {recipe.description}
          </p>
        )}
      </div>
    </button>
  );
}

const MENU_CATS = ['brunch', 'shareables', 'flatbreads', 'specials'];
const MENU_CATEGORIES = CATEGORIES.filter(c => MENU_CATS.includes(c.value));

// ── Main component ─────────────────────────────────────────────────────────────
export default function Recipes({ user, canUpload, onBack }) {
  const [recipes, setRecipes]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState('library');
  const [section, setSection]     = useState('menu'); // 'menu' | 'prep'
  const [search, setSearch]       = useState('');
  const [activeCat, setActiveCat] = useState('all');
  const [viewing, setViewing]     = useState(null);
  const [editing, setEditing]     = useState(null);

  const fetchRecipes = () => {
    fetch(`${API}/api/recipes`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setRecipes(Array.isArray(d) ? d : []); setLoading(false); });
  };

  useEffect(() => { fetchRecipes(); }, []);

  const handleSectionChange = (s) => { setSection(s); setActiveCat('all'); setSearch(''); };

  const handleAlphabetize = async () => {
    const sorted = [...sectionRecipes].sort((a, b) => a.name.localeCompare(b.name));
    const sortedIds = sorted.map(r => r.id);
    const otherIds = recipes.filter(r => !sortedIds.includes(r.id)).map(r => r.id);
    const orderedIds = [...otherIds, ...sortedIds];
    setRecipes(recipes.map(r => r).sort((a, b) => {
      const ai = orderedIds.indexOf(a.id), bi = orderedIds.indexOf(b.id);
      return ai - bi;
    }));
    await fetch(`${API}/api/recipes/reorder`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds }),
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this recipe?')) return;
    await fetch(`${API}/api/recipes/${id}`, { method: 'DELETE', credentials: 'include' });
    setRecipes(prev => prev.filter(r => r.id !== id));
  };

  const moveRecipe = async (index, direction, sectionRecipes) => {
    const ids = sectionRecipes.map(r => r.id);
    const swap = index + direction;
    if (swap < 0 || swap >= ids.length) return;
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
    // Rebuild full ordered list: other section keeps its positions, this section gets new order
    const otherIds = recipes.filter(r => !ids.includes(r.id)).map(r => r.id);
    const orderedIds = section === 'menu' ? [...ids, ...otherIds] : [...otherIds, ...ids];
    const next = orderedIds.map(id => recipes.find(r => r.id === id));
    setRecipes(next);
    await fetch(`${API}/api/recipes/reorder`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds }),
    });
  };

  const sectionRecipes = recipes.filter(r =>
    section === 'menu' ? MENU_CATS.includes(r.category) : r.category === 'prep'
  );
  // Library view shows prep alphabetically; manage view respects manual sort_order
  const librarySectionRecipes = section === 'prep'
    ? [...sectionRecipes].sort((a, b) => a.name.localeCompare(b.name))
    : sectionRecipes;

  const filtered = librarySectionRecipes.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.name.toLowerCase().includes(q);
    const matchCat = activeCat === 'all' || r.category === activeCat;
    return matchSearch && matchCat;
  });

  // Section toggle bar — shared between library and manage
  const SectionTabs = () => (
    <div className="flex gap-1 bg-gray-800 p-1 rounded-xl border border-gray-700 self-start">
      {[['menu', 'Menu Items'], ['prep', 'Prep']].map(([s, label]) => (
        <button key={s} onClick={() => handleSectionChange(s)}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
            section === s ? 'text-white' : 'text-gray-400 hover:text-white'
          }`}
          style={section === s ? { backgroundColor: '#F05A28' } : {}}>
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition">
          <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-xl">HQ</span>
        </button>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition">← Back to Dashboard</button>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between mb-6">
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
            <div className="mb-6 space-y-4">
              <SectionTabs />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={section === 'menu' ? 'Search menu items…' : 'Search prep recipes…'}
                className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent" />
              {section === 'menu' && (
                <div className="flex flex-wrap gap-2">
                  {[{ value: 'all', label: 'All' }, ...MENU_CATEGORIES].map(c => (
                    <button key={c.value} onClick={() => setActiveCat(c.value)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                        activeCat === c.value ? 'text-white' : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
                      }`}
                      style={activeCat === c.value ? { backgroundColor: CAT_COLORS[c.value] || '#F05A28' } : {}}>
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-20 text-gray-600 text-sm">
                {librarySectionRecipes.length === 0 ? 'No recipes yet.' : 'No recipes match your search.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map(r => <RecipeCard key={r.id} recipe={r} onClick={() => setViewing(r)} />)}
              </div>
            )}
          </>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-5">
              <SectionTabs />
              <div className="flex items-center gap-2">
                {section === 'prep' && (
                  <button onClick={handleAlphabetize}
                    className="px-4 py-2 rounded-xl text-sm font-semibold border border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white transition">
                    A→Z
                  </button>
                )}
                <button onClick={() => setEditing('new')}
                  className="px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition"
                  style={{ backgroundColor: '#F05A28' }}>
                  + Add Recipe
                </button>
              </div>
            </div>
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              {sectionRecipes.length === 0 ? (
                <div className="py-16 text-center text-gray-500 text-sm">No recipes yet. Click Add Recipe to get started.</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Order</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Name</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4 hidden sm:table-cell">Category</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4 hidden md:table-cell">Cook Time</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4 hidden md:table-cell">Photo</th>
                      <th className="px-6 py-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {sectionRecipes.map((recipe, i) => (
                      <tr key={recipe.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/30 transition">
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <button onClick={() => moveRecipe(i, -1, sectionRecipes)} disabled={i === 0}
                              className="text-gray-500 hover:text-white disabled:opacity-20 transition text-xs leading-none">▲</button>
                            <button onClick={() => moveRecipe(i, 1, sectionRecipes)} disabled={i === sectionRecipes.length - 1}
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
                        <td className="px-6 py-4 hidden md:table-cell text-gray-400 text-sm">{recipe.cook_time || '—'}</td>
                        <td className="px-6 py-4 hidden md:table-cell">
                          <span className={recipe.image_filename ? 'text-green-400 text-xs' : 'text-gray-600 text-xs'}>
                            {recipe.image_filename ? '✓' : '—'}
                          </span>
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
          onViewRecipe={(id) => setViewing(recipes.find(r => r.id === id) || null)}
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
