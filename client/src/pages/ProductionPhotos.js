import { useState, useEffect, useRef, useCallback } from 'react';

const API = process.env.REACT_APP_API_URL || '';

// ── Update these lists as needed ──────────────────────────────────────────────
const DISTRIBUTORS = [
  'Tri-Eagle',
  'Pepin',
  'Progressive',
  'City Beverage',
  'North Florida Sales',
  'Johnson',
  'Gold Coast',
  'Bernie Little',
  'Lewis Bear',
  'Other',
];

const PHOTO_TYPES = [
  'Can Date',
  'Keg Collar',
  'Keg Return',
  'Product On Truck',
  'Wrapped Pallet',
  'Other',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function today() {
  return new Date().toISOString().split('T')[0];
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtType(t) {
  return { distro: 'Distro', keg_return: 'Keg Return' }[t] || t;
}

function isImage(mimetype) {
  return mimetype && mimetype.startsWith('image/');
}

function blankPhotoSet(defaultType = '') {
  return { type: defaultType, product_date: '', files: [], previews: [] };
}

// Fetches an image from the authenticated API and returns an object URL
function PhotoImg({ filename, className, alt = '' }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let url;
    fetch(`${API}/api/production/photo/${filename}`, { credentials: 'include' })
      .then(r => r.blob())
      .then(b => { url = URL.createObjectURL(b); setSrc(url); });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [filename]);
  if (!src) return <div className={`bg-gray-700 animate-pulse ${className}`} />;
  return <img src={src} alt={alt} className={className} />;
}

// ── File drop zone ────────────────────────────────────────────────────────────
function DropZone({ files, previews, onChange, maxFiles = 10, label = 'Drop files or click to upload' }) {
  const inputRef = useRef();
  const [dragOver, setDragOver] = useState(false);

  const addFiles = (newFiles) => {
    const combined = [...files, ...Array.from(newFiles)].slice(0, maxFiles);
    const newPreviews = combined.map(f =>
      f.type.startsWith('image/') ? URL.createObjectURL(f) : null
    );
    onChange(combined, newPreviews);
  };

  const remove = (i) => {
    const f = files.filter((_, idx) => idx !== i);
    const p = previews.filter((_, idx) => idx !== i);
    onChange(f, p);
  };

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current.click()}
        className={`rounded-lg border-2 border-dashed px-4 py-6 text-center cursor-pointer transition ${
          dragOver ? 'border-orange-500 bg-orange-500/10' : 'border-gray-600 hover:border-gray-500'
        }`}
      >
        <p className="text-gray-400 text-sm">{label}</p>
        <p className="text-gray-600 text-xs mt-1">Up to {maxFiles} files</p>
        <input ref={inputRef} type="file" multiple className="hidden" accept="image/*,.pdf"
          onChange={e => addFiles(e.target.files)} />
      </div>

      {files.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="relative group">
              {previews[i] ? (
                <img src={previews[i]} alt={f.name}
                  className="w-20 h-20 object-cover rounded-lg border border-gray-600" />
              ) : (
                <div className="w-20 h-20 bg-gray-700 rounded-lg border border-gray-600 flex items-center justify-center">
                  <span className="text-gray-400 text-xs text-center px-1 break-all leading-tight">{f.name}</span>
                </div>
              )}
              <button
                onClick={e => { e.stopPropagation(); remove(i); }}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-400 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Submission detail modal ───────────────────────────────────────────────────
function DetailModal({ submission, onClose }) {
  if (!submission) return null;
  const kegFields = [
    ['Ology 1/2s', submission.ology_halves],
    ['Ology 1/6s', submission.ology_sixths],
    ['Keg Logistics 1/2s', submission.kl_halves],
    ['Keg Logistics 1/6s', submission.kl_sixths],
  ].filter(([, v]) => v > 0);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center px-4 py-8 overflow-y-auto">
      <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div>
            <h3 className="text-white font-semibold text-lg">{submission.submitted_by_name}</h3>
            <p className="text-gray-400 text-sm">{fmtDate(submission.submission_date)} · {fmtType(submission.submission_type)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none transition">×</button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Metadata */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {submission.distributor && (
              <div className="col-span-2 sm:col-span-4">
                <p className="text-gray-500 text-xs uppercase tracking-wider">Distributor</p>
                <p className="text-white text-sm mt-0.5">
                  {submission.distributor === 'Other' ? submission.other_distributor : submission.distributor}
                </p>
              </div>
            )}
            {kegFields.map(([label, val]) => (
              <div key={label}>
                <p className="text-gray-500 text-xs uppercase tracking-wider">{label}</p>
                <p className="text-white text-sm mt-0.5">{val}</p>
              </div>
            ))}
          </div>

          {/* Packing slips */}
          {submission.packing_slip_unavailable ? (
            <div className="px-4 py-3 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-sm">
              Packing slip was not available at time of submission.
            </div>
          ) : submission.packing_slips?.length > 0 && (
            <div>
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Packing Slips</p>
              <div className="flex flex-wrap gap-3">
                {submission.packing_slips.map(p => (
                  isImage(p.mimetype)
                    ? <PhotoImg key={p.id} filename={p.filename} className="w-28 h-28 object-cover rounded-lg border border-gray-600 cursor-pointer hover:border-orange-500 transition"
                        alt={p.original_name} />
                    : <a key={p.id} href={`${API}/api/production/photo/${p.filename}`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 px-3 py-2 bg-gray-700 rounded-lg text-gray-300 text-sm hover:text-white transition">
                        📄 {p.original_name}
                      </a>
                ))}
              </div>
            </div>
          )}

          {/* Photo sets */}
          {submission.photo_sets?.map(set => (
            <div key={set.id}>
              <div className="flex items-center gap-3 mb-3">
                {set.photo_type && (
                  <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded" style={{ backgroundColor: '#FF6B00', color: 'white' }}>
                    {set.photo_type}
                  </span>
                )}
                {set.product_date && <span className="text-gray-400 text-sm">Best by: {fmtDate(set.product_date)}</span>}
                {set.description && <span className="text-gray-400 text-sm italic">"{set.description}"</span>}
              </div>
              <div className="flex flex-wrap gap-3">
                {set.photos.map(p => (
                  isImage(p.mimetype)
                    ? <PhotoImg key={p.id} filename={p.filename}
                        className="w-28 h-28 object-cover rounded-lg border border-gray-600 cursor-pointer hover:border-orange-500 transition"
                        alt={p.original_name} />
                    : <a key={p.id} href={`${API}/api/production/photo/${p.filename}`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 px-3 py-2 bg-gray-700 rounded-lg text-gray-300 text-sm hover:text-white transition">
                        📄 {p.original_name}
                      </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function ProductionPhotos({ user, canUpload, onBack }) {
  const [view, setView] = useState('form'); // 'form' | 'log'
  const [submissions, setSubmissions] = useState([]);
  const [detail, setDetail] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [form, setForm] = useState({
    name: user.name,
    date: today(),
    type: '',
    distributor: '',
    other_distributor: '',
    ology_halves: '',
    ology_sixths: '',
    kl_halves: '',
    kl_sixths: '',
    packing_slip_unavailable: false,
  });
  const [slipFiles, setSlipFiles] = useState([]);
  const [slipPreviews, setSlipPreviews] = useState([]);
  const [photoSets, setPhotoSets] = useState([blankPhotoSet()]);

  // Load submissions

  const fetchSubmissions = useCallback(() => {
    fetch(`${API}/api/production`, { credentials: 'include' })
      .then(r => r.json()).then(d => setSubmissions(Array.isArray(d) ? d : []));
  }, []);

  useEffect(() => { fetchSubmissions(); }, [fetchSubmissions]);

  // ── Photo sets helpers ─────────────────────────────────────────────────────
  const updateSet = (i, field, value) => {
    setPhotoSets(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  };

  const addSet = () => {
    if (photoSets.length < 10) setPhotoSets(prev => [...prev, blankPhotoSet()]);
  };

  const removeSet = (i) => {
    setPhotoSets(prev => prev.filter((_, idx) => idx !== i));
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.type)          { setError('Please select a submission type.'); return; }
    if (!form.distributor && form.type !== 'other') { setError('Please select a distributor.'); return; }
    if (!slipFiles.length && !form.packing_slip_unavailable) {
      setError('Please upload the packing slip or check "Not Available".'); return;
    }

    setSubmitting(true);
    const fd = new FormData();
    fd.append('submitted_by_name',       form.name);
    fd.append('submission_date',          form.date);
    fd.append('submission_type',          form.type);
    fd.append('distributor',              form.distributor);
    fd.append('other_distributor',        form.other_distributor);
    fd.append('ology_halves',             form.ology_halves || 0);
    fd.append('ology_sixths',             form.ology_sixths || 0);
    fd.append('kl_halves',                form.kl_halves || 0);
    fd.append('kl_sixths',               form.kl_sixths || 0);
    fd.append('packing_slip_unavailable', form.packing_slip_unavailable);
    fd.append('photo_sets_meta', JSON.stringify(
      photoSets.map(s => ({ type: s.type, product_date: s.product_date }))
    ));
    slipFiles.forEach(f => fd.append('packing_slips', f));
    photoSets.forEach((set, i) => set.files.forEach(f => fd.append(`photos_${i}`, f)));

    try {
      const res  = await fetch(`${API}/api/production`, { method: 'POST', credentials: 'include', body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.message); return; }
      setSuccess('Submission saved successfully!');
      setForm({ name: user.name, date: today(), type: '', distributor: '', other_distributor: '',
                ology_halves: '', ology_sixths: '', kl_halves: '', kl_sixths: '', packing_slip_unavailable: false });
      setSlipFiles([]); setSlipPreviews([]);
      setPhotoSets([blankPhotoSet('')]);
      fetchSubmissions();
    } catch { setError('Submission failed. Please try again.'); }
    finally   { setSubmitting(false); }
  };

  // ── Delete submission ──────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this submission? This cannot be undone.')) return;
    await fetch(`${API}/api/production/${id}`, { method: 'DELETE', credentials: 'include' });
    setSubmissions(prev => prev.filter(s => s.id !== id));
  };

  // ── Load submission detail ─────────────────────────────────────────────────
  const openDetail = async (id) => {
    const res  = await fetch(`${API}/api/production/${id}`, { credentials: 'include' });
    const data = await res.json();
    setDetail(data);
  };

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="min-h-screen bg-gray-900">

      {/* Nav */}
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition">
          <span className="text-2xl font-bold" style={{ color: '#FF6B00' }}>OLOGY</span>
          <span className="text-white font-semibold text-xl">HQ</span>
        </button>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition">← Back to Dashboard</button>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-10">

        {/* Header + tabs */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-white text-4xl font-bold">Production Photos</h2>
            <p className="text-gray-400 mt-2">Submit distro and keg return documentation</p>
          </div>
          <div className="flex gap-2 bg-gray-800 p-1 rounded-lg border border-gray-700">
            {['form', 'log'].map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition capitalize ${
                  view === v ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                }`}>
                {v === 'form' ? 'New Submission' : 'Submission Log'}
              </button>
            ))}
          </div>
        </div>

        {/* ── FORM ─────────────────────────────────────────────────────────── */}
        {view === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-6">

            {error   && <div className="px-4 py-3 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-sm">{error}</div>}
            {success && <div className="px-4 py-3 rounded-lg bg-green-500/20 border border-green-500/40 text-green-300 text-sm">{success}</div>}

            {/* ── Submission Info ── */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-5">
              <h3 className="text-white font-semibold text-base">Submission Info</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-1.5">Name</label>
                  <div className="w-full bg-gray-700/50 text-white px-3 py-2.5 rounded-lg text-sm border border-gray-600">
                    {user.name}
                  </div>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1.5">Date <span className="text-orange-500">*</span></label>
                  <input type="date" value={form.date} onChange={set('date')}
                    className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
              </div>

              {/* Type selector */}
              <div>
                <label className="block text-gray-400 text-sm mb-2">Type <span className="text-orange-500">*</span></label>
                <div className="grid grid-cols-2 gap-3">
                  {[['distro', 'Distro'], ['keg_return', 'Keg Return']].map(([val, label]) => (
                    <button type="button" key={val} onClick={() => {
                      setForm(p => ({ ...p, type: val, distributor: '' }));
                      setPhotoSets([blankPhotoSet(val === 'keg_return' ? 'Keg Return' : '')]);
                    }}
                      className={`py-3 rounded-lg text-sm font-semibold border transition ${
                        form.type === val
                          ? 'border-orange-500 text-white'
                          : 'border-gray-600 text-gray-400 hover:border-gray-500 hover:text-white'
                      }`}
                      style={form.type === val ? { backgroundColor: 'rgba(255,107,0,0.15)' } : {}}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Distributor ── */}
            {form.type && (
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-4">
                <h3 className="text-white font-semibold text-base">Distributor</h3>
                <div>
                  <label className="block text-gray-400 text-sm mb-1.5">Which Distributor <span className="text-orange-500">*</span></label>
                  <select value={form.distributor} onChange={set('distributor')}
                    className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                    <option value="">Please Select</option>
                    {DISTRIBUTORS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                {form.distributor === 'Other' && (
                  <div>
                    <label className="block text-gray-400 text-sm mb-1.5">Other Distributor</label>
                    <input type="text" value={form.other_distributor} onChange={set('other_distributor')} placeholder="Enter distributor name"
                      className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                )}
              </div>
            )}

            {/* ── Keg Counts ── */}
            {form.type && (
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-4">
                <h3 className="text-white font-semibold text-base">Keg Counts</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    ['ology_halves', 'Ology 1/2 BBL'],
                    ['ology_sixths', 'Ology 1/6 BBL'],
                    ...(form.type !== 'keg_return' ? [
                      ['kl_halves', 'Keg Logistics 1/2 BBL'],
                      ['kl_sixths', 'Keg Logistics 1/6 BBL'],
                    ] : []),
                  ].map(([field, label]) => (
                    <div key={field}>
                      <label className="block text-gray-400 text-sm mb-1.5">{label}</label>
                      <input type="number" min="0" value={form[field]} onChange={set(field)} placeholder="0"
                        className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Packing Slip ── */}
            {form.type && (
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-4">
                <h3 className="text-white font-semibold text-base">Packing Slip <span className="text-orange-500">*</span></h3>

                {!form.packing_slip_unavailable && (
                  <DropZone
                    files={slipFiles} previews={slipPreviews} maxFiles={10}
                    label="Drop packing slip photos here or click to upload"
                    onChange={(f, p) => { setSlipFiles(f); setSlipPreviews(p); }}
                  />
                )}

                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.packing_slip_unavailable}
                    onChange={e => setForm(p => ({ ...p, packing_slip_unavailable: e.target.checked }))}
                    className="mt-0.5 accent-orange-500" />
                  <span className="text-gray-300 text-sm">
                    Packing Slip not Available — I understand I am supposed to upload a picture of the packing slip, but I do not currently have it.
                  </span>
                </label>

                {form.packing_slip_unavailable && (
                  <div className="px-4 py-3 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-sm font-semibold">
                    ⚠ PLEASE ENSURE THAT THE PACKING SLIP IS UPLOADED AS SOON AS POSSIBLE
                  </div>
                )}
              </div>
            )}

            {/* ── Photo Sets ── */}
            {form.type && photoSets.map((set, i) => (
              <div key={i} className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-semibold text-base">Photo {i + 1}</h3>
                  {photoSets.length > 1 && (
                    <button type="button" onClick={() => removeSet(i)}
                      className="text-sm text-red-400 hover:text-red-300 transition">Remove</button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-1.5">Type of Picture</label>
                    {form.type === 'keg_return' ? (
                      <div className="w-full bg-gray-700/50 text-white px-3 py-2.5 rounded-lg text-sm border border-gray-600">
                        Keg Return
                      </div>
                    ) : (
                      <select value={set.type} onChange={e => updateSet(i, 'type', e.target.value)}
                        className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                        <option value="">Please Select</option>
                        {PHOTO_TYPES.filter(t => t !== 'Keg Return').map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm mb-1.5">Product Date <span className="text-gray-600 text-xs">(Core only)</span></label>
                    <input type="date" value={set.product_date} onChange={e => updateSet(i, 'product_date', e.target.value)}
                      className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                </div>

                <DropZone
                  files={set.files} previews={set.previews} maxFiles={10}
                  label="Drop photos here or click to upload"
                  onChange={(f, p) => {
                    setPhotoSets(prev => prev.map((s, idx) => idx === i ? { ...s, files: f, previews: p } : s));
                  }}
                />
              </div>
            ))}

            {/* Add Photo Set */}
            {form.type && photoSets.length < 10 && (
              <button type="button" onClick={addSet}
                className="w-full py-3 rounded-xl border-2 border-dashed border-gray-600 text-gray-400 hover:border-gray-500 hover:text-white transition text-sm font-semibold">
                + Add Another Photo
              </button>
            )}

            {/* Submit */}
            {form.type && (
              <button type="submit" disabled={submitting}
                className="w-full py-3 rounded-xl font-semibold text-white text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: '#FF6B00' }}>
                {submitting ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Submitting…</>
                ) : 'Submit'}
              </button>
            )}
          </form>
        )}

        {/* ── LOG ──────────────────────────────────────────────────────────── */}
        {view === 'log' && (
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            {submissions.length === 0 ? (
              <div className="py-16 text-center text-gray-500 text-sm">No submissions yet.</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Date</th>
                    <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Name</th>
                    <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Type</th>
                    <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4 hidden sm:table-cell">Distributor</th>
                    <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4 hidden md:table-cell">Photos</th>
                    <th className="px-6 py-4" />
                  </tr>
                </thead>
                <tbody>
                  {submissions.map(s => (
                    <tr key={s.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/40 transition">
                      <td className="px-6 py-4 text-white text-sm whitespace-nowrap">{fmtDate(s.submission_date)}</td>
                      <td className="px-6 py-4 text-white text-sm">{s.submitted_by_name}</td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded text-white"
                          style={{ backgroundColor: s.submission_type === 'distro' ? '#FF6B00' : s.submission_type === 'keg_return' ? '#2563eb' : '#6b7280' }}>
                          {fmtType(s.submission_type)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-400 text-sm hidden sm:table-cell">
                        {s.distributor === 'Other' ? s.other_distributor : (s.distributor || '—')}
                      </td>
                      <td className="px-6 py-4 text-gray-400 text-sm hidden md:table-cell">
                        {s.photo_count} photo{s.photo_count !== 1 ? 's' : ''}
                        {s.packing_slip_unavailable
                          ? <span className="ml-2 text-amber-400 text-xs">⚠ no slip</span>
                          : s.slip_count > 0
                            ? <span className="ml-2 text-gray-500 text-xs">+ {s.slip_count} slip</span>
                            : null}
                      </td>
                      <td className="px-6 py-4 flex items-center gap-4">
                        <button onClick={() => openDetail(s.id)}
                          className="text-sm text-gray-400 hover:text-white transition">View</button>
                        {user.role === 'admin' && (
                          <button onClick={() => handleDelete(s.id)}
                            className="text-sm text-red-500 hover:text-red-400 transition">Delete</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>

      {detail && <DetailModal submission={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

export default ProductionPhotos;
