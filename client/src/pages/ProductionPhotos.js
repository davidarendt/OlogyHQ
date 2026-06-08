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
  return { distro: 'Distro', keg_return: 'Ology Keg Return', keg_logistics: 'Keg Logistics' }[t] || t;
}

function typeColor(t) {
  return { distro: '#F05A28', keg_return: '#2563eb', keg_logistics: '#16a34a' }[t] || '#6b7280';
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

// Compress an image file via canvas before upload (skips PDFs)
async function compressImage(file, maxDim = 1280, quality = 0.72) {
  if (!file.type.startsWith('image/')) return file;
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, maxDim / Math.max(width, height));
      width  = Math.round(width  * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// ── File drop zone ────────────────────────────────────────────────────────────
function DropZone({ files, previews, onChange, maxFiles = 10, label = 'Drop files or click to upload' }) {
  const inputRef = useRef();
  const [dragOver, setDragOver] = useState(false);

  const addFiles = async (newFiles) => {
    const compressed = await Promise.all(Array.from(newFiles).map(compressImage));
    const combined = [...files, ...compressed].slice(0, maxFiles);
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
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-400 rounded-full text-white text-xs flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition"
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

  const showOlogy = submission.submission_type !== 'keg_logistics';
  const showKL    = submission.submission_type !== 'keg_return';
  const kegFields = [
    ...(showOlogy ? [['Ology 1/2s', submission.ology_halves], ['Ology 1/6s', submission.ology_sixths]] : []),
    ...(showKL    ? [['KL 1/2s', submission.kl_halves], ['KL 1/6s', submission.kl_sixths]] : []),
  ].filter(([, v]) => v > 0);

  const isKL = submission.submission_type === 'keg_logistics';
  const slipLabel = isKL ? 'Bill of Lading (BOL)' : 'Packing Slips';

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
            {submission.shipper && (
              <div className="col-span-2 sm:col-span-4">
                <p className="text-gray-500 text-xs uppercase tracking-wider">Shipper / Carrier</p>
                <p className="text-white text-sm mt-0.5">{submission.shipper}</p>
              </div>
            )}
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

          {/* Packing slips / BOL */}
          {submission.packing_slip_unavailable ? (
            <div className="px-4 py-3 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-sm">
              {isKL ? 'BOL' : 'Packing slip'} was not available at time of submission.
            </div>
          ) : submission.packing_slips?.length > 0 && (
            <div>
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">{slipLabel}</p>
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
                  <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded" style={{ backgroundColor: '#F05A28', color: 'white' }}>
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

// ── KL Inventory view ─────────────────────────────────────────────────────────
function KLInventoryView({ canUpload }) {
  const [data, setData]           = useState(null);
  const [editing, setEditing]     = useState(false);
  const [startHalves, setStartHalves] = useState('');
  const [startSixths, setStartSixths] = useState('');
  const [saving, setSaving]       = useState(false);

  const load = useCallback(() => {
    fetch(`${API}/api/production/kl-inventory`, { credentials: 'include' })
      .then(r => r.json()).then(setData);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveSettings = async () => {
    setSaving(true);
    await fetch(`${API}/api/production/kl-inventory/settings`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starting_halves: startHalves, starting_sixths: startSixths }),
    });
    load();
    setEditing(false);
    setSaving(false);
  };

  if (!data) return <div className="py-16 text-center text-gray-500 text-sm animate-pulse">Loading…</div>;

  return (
    <div className="space-y-6">

      {/* Current stock */}
      <div className="grid grid-cols-2 gap-4">
        {[['Current 1/2 BBL', data.current_halves], ['Current 1/6 BBL', data.current_sixths]].map(([label, val]) => (
          <div key={label} className="bg-gray-800 rounded-xl border border-gray-700 p-6 text-center">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">{label}</p>
            <p className={`text-4xl font-bold ${val < 0 ? 'text-red-400' : 'text-white'}`}>{val}</p>
          </div>
        ))}
      </div>

      {/* Starting inventory */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold">Starting Inventory</h3>
          {canUpload && !editing && (
            <button onClick={() => { setStartHalves(data.starting_halves); setStartSixths(data.starting_sixths); setEditing(true); }}
              className="text-sm text-orange-400 hover:text-orange-300 transition">Edit</button>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-400 text-sm mb-1.5">Starting 1/2 BBL</label>
                <input type="number" min="0" value={startHalves} onChange={e => setStartHalves(e.target.value)}
                  className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1.5">Starting 1/6 BBL</label>
                <input type="number" min="0" value={startSixths} onChange={e => setStartSixths(e.target.value)}
                  className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={saveSettings} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
                style={{ backgroundColor: '#F05A28' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-400 hover:text-white bg-gray-700 transition">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {[['1/2 BBL', data.starting_halves], ['1/6 BBL', data.starting_sixths]].map(([label, val]) => (
              <div key={label}>
                <p className="text-gray-500 text-xs uppercase tracking-wider">{label}</p>
                <p className="text-white text-xl font-bold mt-0.5">{val}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transaction log */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-700">
          <h3 className="text-white font-semibold">Transaction Log</h3>
        </div>
        {data.transactions.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-sm">No transactions yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-3">Date</th>
                  <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-3">Direction</th>
                  <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-3">From / To</th>
                  <th className="text-right text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-3">1/2 BBL</th>
                  <th className="text-right text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-3">1/6 BBL</th>
                  <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-3">By</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map(t => {
                  const isIn = t.submission_type === 'keg_logistics';
                  const fromTo = isIn
                    ? (t.shipper || '—')
                    : (t.distributor === 'Other' ? t.other_distributor : t.distributor) || '—';
                  return (
                    <tr key={t.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/40 transition">
                      <td className="px-6 py-3 text-white text-sm whitespace-nowrap">{fmtDate(t.submission_date)}</td>
                      <td className="px-6 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded text-white ${isIn ? 'bg-green-700' : 'bg-red-700'}`}>
                          {isIn ? '▲ In' : '▼ Out'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-300 text-sm">{fromTo}</td>
                      <td className="px-6 py-3 text-sm text-right font-mono">
                        <span className={isIn ? 'text-green-400' : 'text-red-400'}>
                          {isIn ? '+' : '-'}{t.kl_halves}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-right font-mono">
                        <span className={isIn ? 'text-green-400' : 'text-red-400'}>
                          {isIn ? '+' : '-'}{t.kl_sixths}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-400 text-sm">{t.submitted_by_name}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function ProductionPhotos({ user, canUpload, onBack }) {
  const [view, setView] = useState('form'); // 'form' | 'log' | 'kl_inventory'
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
    shipper: '',
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

    if (!form.type) { setError('Please select a submission type.'); return; }
    if ((form.type === 'distro' || form.type === 'keg_return') && !form.distributor) {
      setError('Please select a distributor.'); return;
    }
    if (form.type === 'keg_logistics' && !form.shipper.trim()) {
      setError('Please enter the shipper / carrier name.'); return;
    }
    if (!slipFiles.length && !form.packing_slip_unavailable) {
      setError(form.type === 'keg_logistics'
        ? 'Please upload the BOL or check "Not Available".'
        : 'Please upload the packing slip or check "Not Available".');
      return;
    }

    setSubmitting(true);
    const fd = new FormData();
    fd.append('submitted_by_name',       form.name);
    fd.append('submission_date',          form.date);
    fd.append('submission_type',          form.type);
    fd.append('distributor',              form.distributor);
    fd.append('other_distributor',        form.other_distributor);
    fd.append('shipper',                  form.shipper);
    fd.append('ology_halves',             form.ology_halves || 0);
    fd.append('ology_sixths',             form.ology_sixths || 0);
    fd.append('kl_halves',                form.kl_halves || 0);
    fd.append('kl_sixths',                form.kl_sixths || 0);
    fd.append('packing_slip_unavailable', form.packing_slip_unavailable);
    fd.append('photo_sets_meta', JSON.stringify(
      photoSets.map(s => ({ type: s.type, product_date: s.product_date }))
    ));
    slipFiles.forEach(f => fd.append('packing_slips', f));
    photoSets.forEach((set, i) => set.files.forEach(f => fd.append(`photos_${i}`, f)));

    try {
      const res  = await fetch(`${API}/api/production`, { method: 'POST', credentials: 'include', body: fd });
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch {
        setError(`Upload failed — server returned an unexpected response. Try with fewer or smaller photos.`);
        return;
      }
      if (!res.ok) { setError(data.message || 'Server error'); return; }
      setSuccess('Submission saved successfully!');
      setForm({ name: user.name, date: today(), type: '', distributor: '', other_distributor: '', shipper: '',
                ology_halves: '', ology_sixths: '', kl_halves: '', kl_sixths: '', packing_slip_unavailable: false });
      setSlipFiles([]); setSlipPreviews([]);
      setPhotoSets([blankPhotoSet('')]);
      fetchSubmissions();
    } catch (err) { setError('Submission failed. Please try again.'); }
    finally        { setSubmitting(false); }
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

  const isKL = form.type === 'keg_logistics';
  const bolOrSlip = isKL ? 'Bill of Lading (BOL)' : 'Packing Slip';

  return (
    <div className="min-h-screen bg-gray-900">

      {/* Nav */}
      <nav className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition">
          <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-xl">HQ</span>
        </button>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition">← Back</button>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">

        {/* Header + tabs */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-cream text-2xl sm:text-4xl font-bold">Production Photos</h2>
              <p className="text-gray-400 mt-1 text-sm sm:mt-2">Submit distro, keg return, and KL keg documentation</p>
            </div>
          </div>
          <div className="flex gap-2 bg-gray-800 p-1 rounded-lg border border-gray-700">
            {[['form', 'New Submission'], ['log', 'Submission Log'], ['kl_inventory', 'KL Inventory']].map(([v, label]) => (
              <button key={v} onClick={() => setView(v)}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-semibold transition ${
                  view === v ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                }`}>
                {label}
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    ['distro',        'Distro'],
                    ['keg_return',    'Ology Keg Return'],
                    ['keg_logistics', 'Keg Logistics'],
                  ].map(([val, label]) => (
                    <button type="button" key={val} onClick={() => {
                      setForm(p => ({ ...p, type: val, distributor: '', shipper: '' }));
                      setPhotoSets([blankPhotoSet(
                        val === 'keg_return' ? 'Keg Return' : val === 'keg_logistics' ? 'BOL' : ''
                      )]);
                    }}
                      className={`py-3 rounded-lg text-sm font-semibold border transition ${
                        form.type === val
                          ? 'border-orange-500 text-white'
                          : 'border-gray-600 text-gray-400 hover:border-gray-500 hover:text-white'
                      }`}
                      style={form.type === val ? { backgroundColor: 'rgba(240,90,40,0.15)' } : {}}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Distributor (distro + keg_return) ── */}
            {(form.type === 'distro' || form.type === 'keg_return') && (
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

            {/* ── Shipper (keg_logistics only) ── */}
            {isKL && (
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-4">
                <h3 className="text-white font-semibold text-base">Shipper</h3>
                <div>
                  <label className="block text-gray-400 text-sm mb-1.5">Shipper / Carrier <span className="text-orange-500">*</span></label>
                  <input type="text" value={form.shipper} onChange={set('shipper')} placeholder="e.g. UPS, FedEx, Estes…"
                    className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
              </div>
            )}

            {/* ── Keg Counts ── */}
            {form.type && (
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-4">
                <h3 className="text-white font-semibold text-base">Keg Counts</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    ...(!isKL ? [['ology_halves', 'Ology 1/2 BBL'], ['ology_sixths', 'Ology 1/6 BBL']] : []),
                    ...(form.type !== 'keg_return' ? [['kl_halves', 'Keg Logistics 1/2 BBL'], ['kl_sixths', 'Keg Logistics 1/6 BBL']] : []),
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

            {/* ── Packing Slip / BOL ── */}
            {form.type && (
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-4">
                <h3 className="text-white font-semibold text-base">{bolOrSlip} <span className="text-orange-500">*</span></h3>

                {!form.packing_slip_unavailable && (
                  <DropZone
                    files={slipFiles} previews={slipPreviews} maxFiles={10}
                    label={`Drop ${isKL ? 'BOL' : 'packing slip'} photos here or click to upload`}
                    onChange={(f, p) => { setSlipFiles(f); setSlipPreviews(p); }}
                  />
                )}

                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.packing_slip_unavailable}
                    onChange={e => setForm(p => ({ ...p, packing_slip_unavailable: e.target.checked }))}
                    className="mt-0.5 accent-orange-500" />
                  <span className="text-gray-300 text-sm">
                    {bolOrSlip} not Available — I understand I am supposed to upload a picture of the {isKL ? 'BOL' : 'packing slip'}, but I do not currently have it.
                  </span>
                </label>

                {form.packing_slip_unavailable && (
                  <div className="px-4 py-3 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-sm font-semibold">
                    ⚠ PLEASE ENSURE THAT THE {bolOrSlip.toUpperCase()} IS UPLOADED AS SOON AS POSSIBLE
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

                <div>
                  <label className="block text-gray-400 text-sm mb-1.5">Type of Picture</label>
                  {(form.type === 'keg_return' || isKL) ? (
                    <div className="w-full bg-gray-700/50 text-white px-3 py-2.5 rounded-lg text-sm border border-gray-600">
                      {form.type === 'keg_return' ? 'Keg Return' : 'BOL'}
                    </div>
                  ) : (
                    <select value={set.type} onChange={e => updateSet(i, 'type', e.target.value)}
                      className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                      <option value="">Please Select</option>
                      {PHOTO_TYPES.filter(t => t !== 'Keg Return').map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
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
                style={{ backgroundColor: '#F05A28' }}>
                {submitting ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Submitting…</>
                ) : 'Submit'}
              </button>
            )}
          </form>
        )}

        {/* ── LOG ──────────────────────────────────────────────────────────── */}
        {view === 'log' && (
          <div>
            {submissions.length === 0 ? (
              <div className="bg-gray-800 rounded-xl border border-gray-700 py-16 text-center text-gray-500 text-sm">No submissions yet.</div>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="sm:hidden space-y-3">
                  {submissions.map(s => (
                    <div key={s.id} className="bg-gray-800 rounded-xl border border-gray-700 p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="text-white text-sm font-semibold">{s.submitted_by_name}</p>
                          <p className="text-gray-400 text-xs mt-0.5">{fmtDate(s.submission_date)}</p>
                        </div>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded text-white shrink-0"
                          style={{ backgroundColor: typeColor(s.submission_type) }}>
                          {fmtType(s.submission_type)}
                        </span>
                      </div>
                      {(s.distributor || s.other_distributor) && (
                        <p className="text-gray-400 text-xs mb-2">
                          {s.distributor === 'Other' ? s.other_distributor : s.distributor}
                        </p>
                      )}
                      {s.shipper && (
                        <p className="text-gray-400 text-xs mb-2">{s.shipper}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="text-gray-500 text-xs">
                          {s.photo_count} photo{s.photo_count !== 1 ? 's' : ''}
                          {s.packing_slip_unavailable
                            ? <span className="ml-2 text-amber-400">⚠ no doc</span>
                            : s.slip_count > 0
                              ? <span className="ml-2">+ {s.slip_count} doc</span>
                              : null}
                        </div>
                        <div className="flex items-center gap-4">
                          <button onClick={() => openDetail(s.id)}
                            className="text-sm text-gray-400 hover:text-white transition">View</button>
                          {user.role === 'admin' && (
                            <button onClick={() => handleDelete(s.id)}
                              className="text-sm text-red-500 hover:text-red-400 transition">Delete</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Date</th>
                        <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Name</th>
                        <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Type</th>
                        <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Distributor / Shipper</th>
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
                              style={{ backgroundColor: typeColor(s.submission_type) }}>
                              {fmtType(s.submission_type)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-400 text-sm">
                            {s.shipper
                              ? s.shipper
                              : s.distributor === 'Other'
                                ? s.other_distributor
                                : (s.distributor || '—')}
                          </td>
                          <td className="px-6 py-4 text-gray-400 text-sm hidden md:table-cell">
                            {s.photo_count} photo{s.photo_count !== 1 ? 's' : ''}
                            {s.packing_slip_unavailable
                              ? <span className="ml-2 text-amber-400 text-xs">⚠ no doc</span>
                              : s.slip_count > 0
                                ? <span className="ml-2 text-gray-500 text-xs">+ {s.slip_count} doc</span>
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
                </div>
              </>
            )}
          </div>
        )}

        {/* ── KL INVENTORY ─────────────────────────────────────────────────── */}
        {view === 'kl_inventory' && <KLInventoryView canUpload={canUpload} />}

      </main>

      {detail && <DetailModal submission={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

export default ProductionPhotos;
