import { useState, useEffect, useRef } from 'react';

const API = process.env.REACT_APP_API_URL || '';

const CATEGORIES = [
  { value: 'brunch',      label: 'Brunch' },
  { value: 'shareables',  label: 'Shareables' },
  { value: 'flatbreads',  label: 'Flatbreads' },
  { value: 'prep',        label: 'Prep' },
];

const CAT_COLORS = {
  brunch:     '#f59e0b',
  shareables: '#3b82f6',
  flatbreads: '#10b981',
  prep:       '#8b5cf6',
};

function getCatLabel(v) {
  return CATEGORIES.find(c => c.value === v)?.label || 'Other';
}

// ── Authenticated image loader ─────────────────────────────────────────────────
function RecipeImg({ recipeId, className }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let objUrl;
    fetch(`${API}/api/recipes/${recipeId}/photo`, { credentials: 'include' })
      .then(r => r.ok ? r.blob() : null)
      .then(blob => { if (blob) { objUrl = URL.createObjectURL(blob); setSrc(objUrl); } })
      .catch(() => {});
    return () => { if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [recipeId]);
  if (!src) return <div className="w-full h-full bg-gray-700" />;
  return <img src={src} alt="" className={className} />;
}

// ── Photo crop editor ──────────────────────────────────────────────────────────
const CROP_W = 480;
const CROP_H = 320;

function PhotoEditor({ file, onApply, onCancel }) {
  const [imageSrc, setImageSrc] = useState(null);
  const [nat, setNat]           = useState({ w: 1, h: 1 });
  const [scale, setScale]       = useState(1);
  const [offset, setOffset]     = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const drag                    = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  useEffect(() => {
    const reader = new FileReader();
    reader.onload = e => {
      const src = e.target.result;
      setImageSrc(src);
      const img = new Image();
      img.onload = () => {
        const n = { w: img.naturalWidth, h: img.naturalHeight };
        setNat(n);
        setScale(Math.max(CROP_W / n.w, CROP_H / n.h));
        setOffset({ x: 0, y: 0 });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }, [file]);

  const minScale = Math.max(CROP_W / nat.w, CROP_H / nat.h);

  const clamp = (ox, oy, sc) => ({
    x: Math.max(-(Math.max(0, (nat.w * sc - CROP_W) / 2)), Math.min(Math.max(0, (nat.w * sc - CROP_W) / 2), ox)),
    y: Math.max(-(Math.max(0, (nat.h * sc - CROP_H) / 2)), Math.min(Math.max(0, (nat.h * sc - CROP_H) / 2), oy)),
  });

  const onDown = (e) => {
    e.preventDefault(); setDragging(true);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onMove = (e) => {
    if (!dragging) return;
    setOffset(clamp(drag.current.ox + e.clientX - drag.current.x, drag.current.oy + e.clientY - drag.current.y, scale));
  };
  const onUp = () => setDragging(false);

  const onTouchDown = (e) => {
    const t = e.touches[0]; setDragging(true);
    drag.current = { x: t.clientX, y: t.clientY, ox: offset.x, oy: offset.y };
  };
  const onTouchMove = (e) => {
    e.preventDefault(); if (!dragging) return;
    const t = e.touches[0];
    setOffset(clamp(drag.current.ox + t.clientX - drag.current.x, drag.current.oy + t.clientY - drag.current.y, scale));
  };

  const onWheel = (e) => {
    e.preventDefault();
    const ns = Math.max(minScale, Math.min(minScale * 4, scale - e.deltaY * 0.002));
    setScale(ns); setOffset(prev => clamp(prev.x, prev.y, ns));
  };

  const onSlider = (e) => {
    const ns = parseFloat(e.target.value);
    setScale(ns); setOffset(prev => clamp(prev.x, prev.y, ns));
  };

  const handleApply = () => {
    // Export at 3× display resolution so the image stays sharp when viewed full-size
    const EXPORT_RATIO = 3;
    const EW = CROP_W * EXPORT_RATIO;
    const EH = CROP_H * EXPORT_RATIO;
    const canvas = document.createElement('canvas');
    canvas.width = EW; canvas.height = EH;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      const dw = nat.w * scale * EXPORT_RATIO;
      const dh = nat.h * scale * EXPORT_RATIO;
      ctx.drawImage(img, EW / 2 - dw / 2 + offset.x * EXPORT_RATIO, EH / 2 - dh / 2 + offset.y * EXPORT_RATIO, dw, dh);
      canvas.toBlob(blob => onApply(new File([blob], 'photo.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.93);
    };
    img.src = imageSrc;
  };

  const imgX = CROP_W / 2 - (nat.w * scale) / 2 + offset.x;
  const imgY = CROP_H / 2 - (nat.h * scale) / 2 + offset.y;

  return (
    <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center px-4">
      <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6 w-full max-w-xl space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-white font-semibold">Adjust Photo</h4>
          <button onClick={onCancel} className="text-gray-500 hover:text-white text-2xl leading-none transition">×</button>
        </div>

        {/* Crop viewport */}
        <div
          className="relative overflow-hidden rounded-xl bg-gray-900 mx-auto select-none"
          style={{ width: CROP_W, height: CROP_H, maxWidth: '100%', cursor: dragging ? 'grabbing' : 'grab' }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onWheel={onWheel}
          onTouchStart={onTouchDown} onTouchMove={onTouchMove} onTouchEnd={onUp}
        >
          {imageSrc && (
            <img
              src={imageSrc} alt="" draggable={false}
              style={{
                position: 'absolute', left: 0, top: 0,
                width: nat.w * scale, height: nat.h * scale,
                transform: `translate(${imgX}px, ${imgY}px)`,
                transformOrigin: '0 0', pointerEvents: 'none',
              }}
            />
          )}
          {/* Rule-of-thirds overlay */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.25 }}
            viewBox={`0 0 ${CROP_W} ${CROP_H}`} preserveAspectRatio="none">
            <line x1={CROP_W/3}   y1="0" x2={CROP_W/3}   y2={CROP_H} stroke="white" strokeWidth="1"/>
            <line x1={CROP_W*2/3} y1="0" x2={CROP_W*2/3} y2={CROP_H} stroke="white" strokeWidth="1"/>
            <line x1="0" y1={CROP_H/3}   x2={CROP_W} y2={CROP_H/3}   stroke="white" strokeWidth="1"/>
            <line x1="0" y1={CROP_H*2/3} x2={CROP_W} y2={CROP_H*2/3} stroke="white" strokeWidth="1"/>
          </svg>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-sm">−</span>
          <input type="range" min={minScale} max={minScale * 4} step={0.005} value={scale}
            onChange={onSlider} className="flex-1 accent-orange-500" />
          <span className="text-gray-500 text-sm">+</span>
        </div>
        <p className="text-gray-600 text-xs text-center -mt-2">Drag to reframe · scroll or slider to zoom</p>

        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-600 text-gray-300 text-sm hover:bg-gray-700 transition">
            Cancel
          </button>
          <button onClick={handleApply}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition"
            style={{ backgroundColor: '#F05A28' }}>
            Use This Crop
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers for display ────────────────────────────────────────────────────────
const titleCase = str => str.replace(/\b\w/g, c => c.toUpperCase());

function BulletedList({ text }) {
  const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  return (
    <ul className="space-y-1.5">
      {lines.map((line, i) => (
        <li key={i} className="flex gap-2.5 text-gray-300 text-sm leading-relaxed">
          <span className="mt-0.5 flex-shrink-0" style={{ color: '#F05A28' }}>•</span>
          <span>{titleCase(line)}</span>
        </li>
      ))}
    </ul>
  );
}

function NumberedList({ text }) {
  const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  return (
    <ol className="space-y-2">
      {lines.map((line, i) => (
        <li key={i} className="flex gap-2.5 text-gray-300 text-sm leading-relaxed">
          <span className="font-bold flex-shrink-0 w-5 text-right" style={{ color: '#F05A28' }}>{i + 1}.</span>
          <span>{line}</span>
        </li>
      ))}
    </ol>
  );
}

// ── Recipe detail modal ────────────────────────────────────────────────────────
function RecipeDetail({ recipe, canUpload, onClose, onEdit }) {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-2xl">
        {recipe.image_filename && (
          <div className="w-full h-56 overflow-hidden rounded-t-2xl">
            <RecipeImg recipeId={recipe.id} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Header */}
        <div className="p-6 pb-2 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded text-white flex-shrink-0"
                style={{ backgroundColor: CAT_COLORS[recipe.category] || '#6b7280' }}>
                {getCatLabel(recipe.category)}
              </span>
            </div>
            <h3 className="text-white text-2xl font-bold leading-tight">{recipe.name}</h3>
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

        <div className="p-6 pt-3 space-y-6">
          {/* Ingredients + Instructions */}
          {(recipe.ingredients || recipe.instructions) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {recipe.ingredients && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#F05A28' }}>Ingredients</h4>
                  <BulletedList text={recipe.ingredients} />
                </div>
              )}
              {recipe.instructions && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#F05A28' }}>Instructions</h4>
                  <NumberedList text={recipe.instructions} />
                </div>
              )}
            </div>
          )}

          {/* Cook Time */}
          {recipe.cook_time && (
            <div className="flex items-center gap-2 text-gray-300 text-sm">
              <span className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#F05A28' }}>Cook Time</span>
              <span className="text-gray-300">{recipe.cook_time}</span>
            </div>
          )}

          {/* Plating */}
          {recipe.plating && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#F05A28' }}>Plating</h4>
              <p className="text-gray-300 text-sm leading-relaxed">{recipe.plating}</p>
            </div>
          )}

          {/* Related recipes */}
          {recipe.linked_recipes && recipe.linked_recipes.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#F05A28' }}>Related Recipes</h4>
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
  const [category, setCategory]       = useState(recipe?.category || 'brunch');
  const [cookTime, setCookTime]       = useState(recipe?.cook_time || '');
  const [ingredients, setIngredients] = useState(recipe?.ingredients || '');
  const [instructions, setInstructions] = useState(recipe?.instructions || '');
  const [plating, setPlating]         = useState(recipe?.plating || '');
  const [linkedIds, setLinkedIds]     = useState(recipe?.linked_recipe_ids || []);

  // Photo state
  const [rawPhoto, setRawPhoto]       = useState(null);   // file waiting for crop editor
  const [photo, setPhoto]             = useState(null);   // cropped file to upload
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
    if (file && file.type.startsWith('image/')) setRawPhoto(file);
  };

  const handleEditorApply = (croppedFile) => {
    setPhoto(croppedFile);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(croppedFile));
    setClearPhoto(false);
    setRawPhoto(null);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDraggingOver(false);
    handleFileSelected(e.dataTransfer.files[0]);
  };

  const toggleLinked = (id) =>
    setLinkedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const otherRecipes = allRecipes.filter(r => r.id !== recipe?.id);

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
                      : <RecipeImg recipeId={recipe.id} className="w-full h-full object-cover" />
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

          {/* Related recipes */}
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

      {/* Photo crop editor — rendered above the recipe modal */}
      {rawPhoto && (
        <PhotoEditor
          file={rawPhoto}
          onApply={handleEditorApply}
          onCancel={() => setRawPhoto(null)}
        />
      )}
    </>
  );
}

// ── Recipe card ────────────────────────────────────────────────────────────────
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

// ── Main component ─────────────────────────────────────────────────────────────
export default function Recipes({ user, canUpload, onBack }) {
  const [recipes, setRecipes]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [view, setView]         = useState('library');
  const [search, setSearch]     = useState('');
  const [activeCat, setActiveCat] = useState('all');
  const [viewing, setViewing]   = useState(null);
  const [editing, setEditing]   = useState(null);

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
    const swap = index + direction;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setRecipes(next);
    await fetch(`${API}/api/recipes/reorder`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: next.map(r => r.id) }),
    });
  };

  const filtered = recipes.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q);
    const matchCat = activeCat === 'all' || r.category === activeCat;
    return matchSearch && matchCat;
  });

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
            <div className="mb-6 space-y-3">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search recipes…"
                className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent" />
              <div className="flex flex-wrap gap-2">
                {[{ value: 'all', label: 'All' }, ...CATEGORIES].map(c => (
                  <button key={c.value} onClick={() => setActiveCat(c.value)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                      activeCat === c.value ? 'text-white' : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
                    }`}
                    style={activeCat === c.value ? { backgroundColor: CAT_COLORS[c.value] || '#F05A28' } : {}}>
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
                {filtered.map(r => <RecipeCard key={r.id} recipe={r} onClick={() => setViewing(r)} />)}
              </div>
            )}
          </>
        ) : (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={() => setEditing('new')}
                className="px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition"
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
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4 hidden md:table-cell">Cook Time</th>
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
                        <td className="px-6 py-4 hidden md:table-cell text-gray-400 text-sm">{recipe.cook_time || '—'}</td>
                        <td className="px-6 py-4 hidden md:table-cell">
                          <span className={recipe.image_filename ? 'text-green-400 text-xs' : 'text-gray-600 text-xs'}>
                            {recipe.image_filename ? '✓' : '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4 hidden lg:table-cell text-gray-400 text-sm">{recipe.created_by_name || '—'}</td>
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
