import { useState, useEffect, useRef } from 'react';

const API = process.env.REACT_APP_API_URL || '';

function fmtPrice(p) {
  if (p == null || p === '') return '';
  return `$${parseFloat(p).toFixed(2)}`;
}


const EMPTY = { coffee_name: '', roaster_name: '', origin: '', process: '', tasting_notes: '', price: '' };

// ── BagModal ──────────────────────────────────────────────────────────────────
function BagModal({ bag, onClose, onSaved }) {
  const isEdit = !!bag?.id;
  const [form, setForm] = useState(isEdit ? {
    coffee_name:   bag.coffee_name   || '',
    roaster_name:  bag.roaster_name  || '',
    origin:        bag.origin        || '',
    process:       bag.process       || '',
    tasting_notes: bag.tasting_notes || '',
    price:         bag.price != null ? String(bag.price) : '',
  } : { ...EMPTY });
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
    setSaving(true);
    setError('');
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
        photo_filename,
      };

      const res = await fetch(`${API}/api/coffee-site/bags${isEdit ? `/${bag.id}` : ''}`, {
        method: isEdit ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Save failed.'); setSaving(false); return; }
      onSaved(await res.json());
      onClose();
    } catch {
      setError('Network error.');
      setSaving(false);
    }
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

          {/* Fields */}
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
              <label className={lbl}>Price</label>
              <input className={inp} type="number" step="0.01" min="0" value={form.price} onChange={set('price')} placeholder="0.00" />
            </div>
            <div className="col-span-2">
              <label className={lbl}>Tasting Notes</label>
              <textarea className={`${inp} resize-none`} rows={3} value={form.tasting_notes} onChange={set('tasting_notes')} placeholder="Blueberry, chocolate, caramel…" />
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-700 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-600 rounded-lg transition">
            Cancel
          </button>
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

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CoffeeSiteManager({ user, canUpload, onBack }) {
  const [bags, setBags]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('on_website');
  const [editBag, setEditBag] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    const res = await fetch(`${API}/api/coffee-site/bags`, { credentials: 'include' });
    if (res.ok) setBags(await res.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const toggleSoldOut = async (bag) => {
    const newVal = !bag.sold_out;
    setBags(b => b.map(x => x.id === bag.id ? { ...x, sold_out: newVal } : x));
    const res = await fetch(`${API}/api/coffee-site/bags/${bag.id}/sold-out`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sold_out: newVal }),
    });
    if (!res.ok) load();
  };

  const toggleArchive = async (bag, archive) => {
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

  const deleteBag = async (bag) => {
    if (!window.confirm(`Delete "${bag.coffee_name}"? This cannot be undone.`)) return;
    await fetch(`${API}/api/coffee-site/bags/${bag.id}`, { method: 'DELETE', credentials: 'include' });
    setBags(b => b.filter(x => x.id !== bag.id));
  };

  const setFeatured = async (bag, featured) => {
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

  const onSaved = (saved) => {
    setBags(prev => {
      const idx = prev.findIndex(x => x.id === saved.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n; }
      return [saved, ...prev];
    });
  };

  const onWebsite = bags.filter(b => !b.archived);
  const archived  = bags.filter(b => b.archived);
  const displayed = tab === 'on_website' ? onWebsite : archived;

  // Auto-featured fallback: first non-sold-out, non-archived bag (when none pinned)
  const hasExplicitFeatured = onWebsite.some(b => b.is_featured);
  const autoFeaturedId = hasExplicitFeatured
    ? null
    : (onWebsite.find(b => !b.sold_out)?.id ?? null);

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
        {/* Tabs + Add button */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex gap-1.5">
            {[
              { key: 'on_website', label: 'On Website', count: onWebsite.length },
              { key: 'archived',   label: 'Archived',   count: archived.length  },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition ${
                  tab === t.key ? 'text-white' : 'text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700'
                }`}
                style={tab === t.key ? { backgroundColor: '#F05A28' } : {}}>
                {t.label}
                {t.count > 0 && (
                  <span className={`text-xs ${tab === t.key ? 'text-orange-200' : 'text-gray-500'}`}>{t.count}</span>
                )}
              </button>
            ))}
          </div>
          {canUpload && tab === 'on_website' && (
            <button onClick={() => setShowAdd(true)}
              className="px-4 py-2 text-sm text-white rounded-lg font-medium flex-shrink-0 transition hover:opacity-90"
              style={{ backgroundColor: '#F05A28' }}>
              + Add Coffee
            </button>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="text-gray-400 text-center py-20">Loading…</div>
        ) : displayed.length === 0 ? (
          <div className="text-gray-500 text-center py-20">
            {tab === 'on_website' ? 'No coffees yet. Add one to get started.' : 'No archived coffees.'}
          </div>
        ) : (
          <div className="space-y-4">
            {displayed.map(bag => (
              <BagCard
                key={bag.id}
                bag={bag}
                tab={tab}
                canUpload={canUpload}
                autoFeaturedId={autoFeaturedId}
                onToggleSoldOut={() => toggleSoldOut(bag)}
                onArchive={() => toggleArchive(bag, true)}
                onUnarchive={() => toggleArchive(bag, false)}
                onSetFeatured={f => setFeatured(bag, f)}
                onEdit={() => setEditBag(bag)}
                onDelete={() => deleteBag(bag)}
              />
            ))}
          </div>
        )}
      </main>

      {(showAdd || editBag) && (
        <BagModal
          bag={editBag}
          onClose={() => { setShowAdd(false); setEditBag(null); }}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function BagCard({ bag, tab, canUpload, autoFeaturedId, onToggleSoldOut, onArchive, onUnarchive, onSetFeatured, onEdit, onDelete }) {
  const isAutoFeatured = !bag.is_featured && bag.id === autoFeaturedId;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      <div className="flex gap-4 p-4">
        {/* Photo */}
        <div className="flex-shrink-0">
          {bag.photo_url
            ? <img src={bag.photo_url} alt={bag.coffee_name} className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg object-cover" />
            : <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg bg-gray-700 flex items-center justify-center text-gray-500 text-xs text-center px-2">No photo</div>
          }
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0">
              <h3 className="text-white font-semibold leading-tight truncate">{bag.coffee_name}</h3>
              {bag.roaster_name && <p className="text-gray-400 text-sm">{bag.roaster_name}</p>}
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              {bag.is_featured && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-400">
                  ★ Featured
                </span>
              )}
              {isAutoFeatured && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-500">
                  ★ Featured (auto)
                </span>
              )}
              {bag.sold_out ? (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                  Sold Out
                </span>
              ) : !bag.archived && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  Available
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400 mt-2">
            {bag.origin        && <span>{bag.origin}</span>}
            {bag.process       && <span className="text-gray-500">· {bag.process}</span>}
            {bag.price != null && <span className="text-orange-400 font-medium">{fmtPrice(bag.price)}</span>}
          </div>

          {bag.sold_out && bag.sold_out_at && (
            <p className="text-gray-500 text-xs mt-1">
              Sold out {new Date(bag.sold_out_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {bag.archived && bag.archived_at && ` · Archived ${new Date(bag.archived_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
            </p>
          )}

          {bag.tasting_notes && (
            <p className="text-gray-400 text-xs mt-1.5 line-clamp-2 italic">"{bag.tasting_notes}"</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-gray-700/60 bg-gray-800/40">
        {/* Featured row — only for non-archived bags with upload permission */}
        {tab === 'on_website' && canUpload && (
          <div className="px-4 py-2 border-b border-gray-700/40">
            {bag.is_featured ? (
              <div className="flex items-center justify-between">
                <span className="text-yellow-400 text-xs font-medium">★ This is the featured coffee on the website</span>
                <button onClick={() => onSetFeatured(false)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition underline">
                  Remove pin
                </button>
              </div>
            ) : isAutoFeatured ? (
              <div className="flex items-center justify-between">
                <span className="text-yellow-500 text-xs">★ Showing as featured automatically (first available)</span>
                <button onClick={() => onSetFeatured(true)}
                  className="text-xs text-yellow-400 hover:text-yellow-300 transition font-medium">
                  Pin this coffee
                </button>
              </div>
            ) : (
              <button onClick={() => onSetFeatured(true)}
                className="text-xs text-gray-400 hover:text-yellow-400 transition font-medium">
                ☆ Set as featured on website
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 px-4 py-2 flex-wrap">
          {tab === 'on_website' && (
            <button onClick={onToggleSoldOut}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                bag.sold_out
                  ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                  : 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
              }`}>
              {bag.sold_out ? 'Mark Available' : 'Mark Sold Out'}
            </button>
          )}
          {canUpload && tab === 'on_website' && (
            <button onClick={onArchive}
              className="px-3 py-1 rounded-lg text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition">
              Archive
            </button>
          )}
          {canUpload && tab === 'archived' && (
            <button onClick={onUnarchive}
              className="px-3 py-1 rounded-lg text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition">
              Restore
            </button>
          )}
          {canUpload && tab === 'on_website' && (
            <button onClick={onEdit}
              className="px-3 py-1 rounded-lg text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition">
              Edit
            </button>
          )}
          {canUpload && (
            <button onClick={onDelete}
              className="px-3 py-1 rounded-lg text-xs text-red-400 hover:text-red-300 bg-gray-700 hover:bg-gray-600 transition">
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
