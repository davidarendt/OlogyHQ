import { useState, useEffect, useRef } from 'react';

const API = process.env.REACT_APP_API_URL || '';

const CATEGORIES = [
  'Brewing',
  'Packaging',
  'Refrigeration & HVAC',
  'Electrical',
  'Kitchen',
  'Taproom',
  'General',
];

const ALL_ROLES = [
  'admin', 'bar_manager', 'bartender', 'barista', 'coffee_manager',
  'production', 'sales', 'hr', 'kitchen_manager', 'cook',
];

function formatRole(r) {
  return r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const FILE_META = {
  'application/pdf': { label: 'PDF', bg: 'bg-red-700' },
  'application/msword': { label: 'DOC', bg: 'bg-blue-700' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { label: 'DOC', bg: 'bg-blue-700' },
  'application/vnd.ms-excel': { label: 'XLS', bg: 'bg-green-700' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { label: 'XLS', bg: 'bg-green-700' },
  'image/png':  { label: 'IMG', bg: 'bg-purple-700' },
  'image/jpeg': { label: 'IMG', bg: 'bg-purple-700' },
};
function fileMeta(mime) { return FILE_META[mime] || { label: 'FILE', bg: 'bg-gray-600' }; }

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ── Role picker ───────────────────────────────────────────────────────────────
function RolePicker({ selected, onChange }) {
  const toggle = (role) =>
    onChange(selected.includes(role) ? selected.filter(r => r !== role) : [...selected, role]);
  const allOn = ALL_ROLES.every(r => selected.includes(r));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-sm">Visible to roles <span className="text-orange-500">*</span></span>
        <button type="button" onClick={() => onChange(allOn ? [] : [...ALL_ROLES])}
          className="text-xs text-orange-400 hover:text-orange-300 transition">
          {allOn ? 'Deselect all' : 'Select all'}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {ALL_ROLES.map(role => (
          <button key={role} type="button" onClick={() => toggle(role)}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
              selected.includes(role)
                ? 'border-orange-500 text-white'
                : 'border-gray-600 text-gray-400 hover:border-gray-500'
            }`}
            style={selected.includes(role) ? { backgroundColor: 'rgba(240,90,40,0.2)' } : {}}>
            {formatRole(role)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Single manual row ─────────────────────────────────────────────────────────
function ManualRow({ doc, canUpload, onEdit, onDelete }) {
  const meta = fileMeta(doc.mimetype);
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-700 last:border-0 hover:bg-gray-700/30 transition group">
      <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded text-white ${meta.bg}`}>
        {meta.label}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{doc.name}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-gray-500 text-xs">{fmtDate(doc.uploaded_at)}{doc.size ? ` · ${fmtSize(doc.size)}` : ''}</span>
          {canUpload && doc.roles?.length > 0 && (
            <span className="text-gray-600 text-xs">
              {doc.roles.length === ALL_ROLES.length ? 'All roles' : doc.roles.map(formatRole).join(', ')}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <a href={`${API}/api/equipment-manuals/${doc.id}/view`} target="_blank" rel="noreferrer"
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-700 text-gray-300 hover:text-white transition">
          View
        </a>
        <a href={`${API}/api/equipment-manuals/${doc.id}/download`} download
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-700 text-gray-300 hover:text-white transition">
          Download
        </a>
        {canUpload && (
          <>
            <button onClick={() => onEdit(doc)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-white bg-gray-700 transition opacity-0 group-hover:opacity-100">
              Edit
            </button>
            <button onClick={() => onDelete(doc)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 bg-gray-700 transition opacity-0 group-hover:opacity-100">
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditModal({ doc, onSave, onClose }) {
  const [name, setName]         = useState(doc.name);
  const [category, setCategory] = useState(doc.category);
  const [roles, setRoles]       = useState(doc.roles || []);
  const [saving, setSaving]     = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !roles.length) return;
    setSaving(true);
    await onSave(doc.id, name.trim(), category, roles);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center px-4 py-8 overflow-y-auto">
      <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h3 className="text-white font-semibold">Edit Manual</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-gray-400 text-sm mb-1.5">Name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1.5">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <RolePicker selected={roles} onChange={setRoles} />
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={handleSave} disabled={saving || !name.trim() || !roles.length}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition"
            style={{ backgroundColor: '#F05A28' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-400 hover:text-white bg-gray-700 transition">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function EquipmentManuals({ user, canUpload, onBack }) {
  const [tab, setTab]       = useState('browse');
  const [docs, setDocs]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [editDoc, setEditDoc] = useState(null);

  // Upload state
  const fileRef = useRef();
  const [uploadName, setUploadName]         = useState('');
  const [uploadCategory, setUploadCategory] = useState('General');
  const [uploadRoles, setUploadRoles]       = useState([...ALL_ROLES]);
  const [uploadFile, setUploadFile]         = useState(null);
  const [uploading, setUploading]           = useState(false);
  const [error, setError]                   = useState('');
  const [success, setSuccess]               = useState('');

  const load = () => {
    setLoading(true);
    fetch(`${API}/api/equipment-manuals`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setDocs(Array.isArray(d) ? d : []); setLoading(false); });
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Group docs by category for browse view
  const byCategory = CATEGORIES.reduce((acc, cat) => {
    const items = docs.filter(d => d.category === cat);
    if (items.length) acc[cat] = items;
    return acc;
  }, {});
  const knownCats = new Set(CATEGORIES);
  const other = docs.filter(d => !knownCats.has(d.category));
  if (other.length) byCategory['Other'] = other;

  // ── Upload ──────────────────────────────────────────────────────────────────
  const handleUpload = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!uploadName.trim())   { setError('Please enter a name.'); return; }
    if (!uploadFile)          { setError('Please choose a file.'); return; }
    if (!uploadRoles.length)  { setError('Select at least one role.'); return; }

    setUploading(true);
    try {
      const ext = uploadFile.name.split('.').pop();
      const presignRes = await fetch(`${API}/api/equipment-manuals/presign`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ext }),
      });
      if (!presignRes.ok) { setError('Could not start upload.'); return; }
      const { filename, signedUrl } = await presignRes.json();

      const putRes = await fetch(signedUrl, {
        method: 'PUT', body: uploadFile,
        headers: { 'Content-Type': uploadFile.type || 'application/octet-stream' },
      });
      if (!putRes.ok) { setError('File upload failed. Please try again.'); return; }

      const commitRes = await fetch(`${API}/api/equipment-manuals/commit`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: uploadName.trim(), category: uploadCategory,
          filename, original_name: uploadFile.name,
          mimetype: uploadFile.type, size: uploadFile.size,
          roles: uploadRoles,
        }),
      });
      if (!commitRes.ok) { setError('Failed to save record.'); return; }

      setSuccess(`"${uploadName.trim()}" uploaded successfully.`);
      setUploadName(''); setUploadCategory('General');
      setUploadRoles([...ALL_ROLES]); setUploadFile(null);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // ── Edit ────────────────────────────────────────────────────────────────────
  const handleEdit = async (id, name, category, roles) => {
    await fetch(`${API}/api/equipment-manuals/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, roles }),
    });
    setEditDoc(null);
    load();
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
    await fetch(`${API}/api/equipment-manuals/${doc.id}`, { method: 'DELETE', credentials: 'include' });
    load();
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {editDoc && <EditModal doc={editDoc} onSave={handleEdit} onClose={() => setEditDoc(null)} />}

      {/* Nav */}
      <nav className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition">
          <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-xl">HQ</span>
        </button>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition">← Back</button>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">

        {/* Header + tabs */}
        <div className="mb-6 sm:mb-8">
          <h2 className="text-cream text-2xl sm:text-4xl font-bold mb-1">Equipment Manuals</h2>
          <p className="text-gray-400 text-sm mb-4">Browse and download manuals for brewery equipment</p>
          <div className="flex gap-2 bg-gray-800 p-1 rounded-lg border border-gray-700 w-fit">
            {[['browse', 'Browse'], ...(canUpload ? [['manage', 'Manage']] : [])].map(([v, label]) => (
              <button key={v} onClick={() => setTab(v)}
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition ${
                  tab === v ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── BROWSE ─────────────────────────────────────────────────────────── */}
        {tab === 'browse' && (
          loading ? (
            <div className="py-16 text-center text-gray-500 text-sm animate-pulse">Loading…</div>
          ) : Object.keys(byCategory).length === 0 ? (
            <div className="py-16 text-center text-gray-500 text-sm">No manuals available.</div>
          ) : (
            <div className="space-y-6">
              {Object.entries(byCategory).map(([cat, items]) => (
                <div key={cat} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-700 flex items-center gap-2">
                    <span className="text-white font-semibold text-sm">{cat}</span>
                    <span className="text-gray-500 text-xs">{items.length} {items.length === 1 ? 'manual' : 'manuals'}</span>
                  </div>
                  {items.map(doc => (
                    <ManualRow key={doc.id} doc={doc} canUpload={canUpload}
                      onEdit={setEditDoc} onDelete={handleDelete} />
                  ))}
                </div>
              ))}
            </div>
          )
        )}

        {/* ── MANAGE ─────────────────────────────────────────────────────────── */}
        {tab === 'manage' && canUpload && (
          <div className="space-y-8">

            {/* Upload form */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
              <h3 className="text-white font-semibold mb-4">Upload Manual</h3>
              {error   && <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-sm">{error}</div>}
              {success && <div className="mb-4 px-4 py-3 rounded-lg bg-green-500/20 border border-green-500/40 text-green-300 text-sm">{success}</div>}
              <form onSubmit={handleUpload} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-1.5">Name <span className="text-orange-500">*</span></label>
                    <input value={uploadName} onChange={e => setUploadName(e.target.value)}
                      placeholder="e.g. Brite Tank Glycol Manual"
                      className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm mb-1.5">Category</label>
                    <select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)}
                      className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1.5">File <span className="text-orange-500">*</span></label>
                  <input ref={fileRef} type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                    onChange={e => {
                      const f = e.target.files[0];
                      setUploadFile(f || null);
                      if (f && !uploadName.trim())
                        setUploadName(f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
                    }}
                    className="w-full text-gray-300 text-sm"
                  />
                  {uploadFile && (
                    <p className="mt-1.5 text-gray-500 text-xs">{uploadFile.name} · {fmtSize(uploadFile.size)}</p>
                  )}
                </div>
                <RolePicker selected={uploadRoles} onChange={setUploadRoles} />
                <button type="submit" disabled={uploading}
                  className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition"
                  style={{ backgroundColor: '#F05A28' }}>
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
              </form>
            </div>

            {/* All manuals list */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-700">
                <h3 className="text-white font-semibold text-sm">All Manuals ({docs.length})</h3>
              </div>
              {docs.length === 0 ? (
                <div className="py-12 text-center text-gray-500 text-sm">No manuals uploaded yet.</div>
              ) : (
                docs.map(doc => (
                  <ManualRow key={doc.id} doc={doc} canUpload={canUpload}
                    onEdit={setEditDoc} onDelete={handleDelete} />
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default EquipmentManuals;
