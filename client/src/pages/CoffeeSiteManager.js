import { useState, useEffect, useRef } from 'react';

const API = process.env.REACT_APP_API_URL || '';

function todayYMD() {
  return new Date().toISOString().slice(0, 10);
}

function bagStatus(bag) {
  if (bag.sold_out) return 'sold_out';
  if (!bag.go_live_date) return 'draft';
  if (bag.go_live_date <= todayYMD()) return 'live';
  return 'upcoming';
}

const STATUS = {
  live:     { label: 'Live',     bg: 'bg-green-500/15',  text: 'text-green-400', dot: 'bg-green-500'  },
  upcoming: { label: 'Upcoming', bg: 'bg-blue-500/15',   text: 'text-blue-400',  dot: 'bg-blue-400'   },
  sold_out: { label: 'Sold Out', bg: 'bg-red-500/15',    text: 'text-red-400',   dot: 'bg-red-500'    },
  draft:    { label: 'Draft',    bg: 'bg-gray-700',      text: 'text-gray-400',  dot: 'bg-gray-500'   },
};

const FILTERS = [
  { key: 'all',      label: 'All'      },
  { key: 'live',     label: 'Live'     },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'sold_out', label: 'Sold Out' },
  { key: 'draft',    label: 'Draft'    },
];

const EMPTY = { coffee_name: '', roaster_name: '', origin: '', process: '', tasting_notes: '', price: '', go_live_date: '' };

function fmtPrice(p) {
  if (p == null || p === '') return '';
  return `$${parseFloat(p).toFixed(2)}`;
}

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

// ── BagModal ──────────────────────────────────────────────────────────────────
function BagModal({ bag, onClose, onSaved }) {
  const isEdit = !!bag?.id;
  const [form, setForm] = useState(isEdit ? {
    coffee_name:  bag.coffee_name  || '',
    roaster_name: bag.roaster_name || '',
    origin:       bag.origin       || '',
    process:      bag.process      || '',
    tasting_notes: bag.tasting_notes || '',
    price:        bag.price != null ? String(bag.price) : '',
    go_live_date: bag.go_live_date  || '',
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
        go_live_date: form.go_live_date || null,
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
          <h2 className="text-white font-semibold">{isEdit ? 'Edit Bag' : 'Add Featured Bag'}</h2>
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
            <div>
              <label className={lbl}>Go-Live Date</label>
              <input className={inp} type="date" value={form.go_live_date} onChange={set('go_live_date')} />
              <p className="text-gray-500 text-xs mt-1">Leave blank to save as draft</p>
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
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Bag'}
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
  const [filter, setFilter]   = useState('all');
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

  const deleteBag = async (bag) => {
    if (!window.confirm(`Delete "${bag.coffee_name}"? This cannot be undone.`)) return;
    await fetch(`${API}/api/coffee-site/bags/${bag.id}`, { method: 'DELETE', credentials: 'include' });
    setBags(b => b.filter(x => x.id !== bag.id));
  };

  const setFeatured = async (bag, featured) => {
    // Optimistic update
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

  const counts = FILTERS.reduce((acc, f) => {
    acc[f.key] = f.key === 'all' ? bags.length : bags.filter(b => bagStatus(b) === f.key).length;
    return acc;
  }, {});

  const filtered = filter === 'all' ? bags : bags.filter(b => bagStatus(b) === filter);

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
        {/* Filter bar + Add button */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex gap-1.5 overflow-x-auto pb-1 flex-1">
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap flex items-center gap-1.5 transition ${
                  filter === f.key ? 'text-white font-medium' : 'text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700'
                }`}
                style={filter === f.key ? { backgroundColor: '#F05A28' } : {}}>
                {f.label}
                {counts[f.key] > 0 && (
                  <span className={`text-xs ${filter === f.key ? 'text-orange-200' : 'text-gray-500'}`}>
                    {counts[f.key]}
                  </span>
                )}
              </button>
            ))}
          </div>
          {canUpload && (
            <button onClick={() => setShowAdd(true)}
              className="px-4 py-2 text-sm text-white rounded-lg font-medium flex-shrink-0 transition hover:opacity-90"
              style={{ backgroundColor: '#F05A28' }}>
              + Add Bag
            </button>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="text-gray-400 text-center py-20">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-gray-500 text-center py-20">
            {filter === 'all'
              ? 'No bags yet. Add one to get started.'
              : `No ${STATUS[filter]?.label.toLowerCase()} bags.`}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(bag => {
              const st = bagStatus(bag);
              const S  = STATUS[st];
              return (
                <div key={bag.id} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
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
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {bag.is_featured && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-400 flex items-center gap-1">
                              ★ Featured
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1.5 ${S.bg} ${S.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${S.dot}`} />
                            {S.label}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400 mt-2">
                        {bag.origin        && <span>{bag.origin}</span>}
                        {bag.process       && <span className="text-gray-500">· {bag.process}</span>}
                        {bag.price != null && <span className="text-orange-400 font-medium">{fmtPrice(bag.price)}</span>}
                      </div>

                      {bag.go_live_date && (
                        <p className="text-gray-500 text-xs mt-1">
                          {st === 'upcoming' ? 'Goes live' : 'Went live'} {fmtDate(bag.go_live_date)}
                          {bag.sold_out && bag.sold_out_at && (
                            <span> · Sold out {new Date(bag.sold_out_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                          )}
                        </p>
                      )}

                      {bag.tasting_notes && (
                        <p className="text-gray-400 text-xs mt-1.5 line-clamp-2 italic">"{bag.tasting_notes}"</p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-700/60 bg-gray-800/40 flex-wrap">
                    {canUpload && (
                      bag.is_featured
                        ? <button onClick={() => setFeatured(bag, false)}
                            className="px-3 py-1 rounded-lg text-xs font-medium bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition">
                            ★ Featured — Remove
                          </button>
                        : <button onClick={() => setFeatured(bag, true)}
                            className="px-3 py-1 rounded-lg text-xs font-medium bg-gray-700 text-gray-300 hover:text-yellow-400 hover:bg-yellow-500/15 transition">
                            ☆ Set as Featured
                          </button>
                    )}
                    <button onClick={() => toggleSoldOut(bag)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                        bag.sold_out
                          ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                          : 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                      }`}>
                      {bag.sold_out ? 'Mark Available' : 'Mark Sold Out'}
                    </button>
                    {canUpload && (
                      <>
                        <button onClick={() => setEditBag(bag)}
                          className="px-3 py-1 rounded-lg text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition">
                          Edit
                        </button>
                        <button onClick={() => deleteBag(bag)}
                          className="px-3 py-1 rounded-lg text-xs text-red-400 hover:text-red-300 bg-gray-700 hover:bg-gray-600 transition">
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
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
