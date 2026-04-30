import { useState, useEffect, useRef } from 'react';

const API = process.env.REACT_APP_API_URL || '';

const ROLES = [
  'admin', 'bar_manager', 'bartender', 'barista',
  'coffee_manager', 'production', 'sales', 'hr',
  'kitchen_manager', 'cook',
];

const ROLE_LABELS = {
  admin: 'Admin', bar_manager: 'Bar Manager', bartender: 'Bartender',
  barista: 'Barista', coffee_manager: 'Coffee Manager',
  production: 'Production', sales: 'Sales', hr: 'HR',
  kitchen_manager: 'Kitchen Manager', cook: 'Cook',
};

function fileTypeInfo(mimetype) {
  if (!mimetype) return { label: 'FILE', color: '#6b7280' };
  if (mimetype === 'application/pdf')                          return { label: 'PDF',  color: '#ef4444' };
  if (mimetype.includes('word') || mimetype.includes('document')) return { label: 'DOC',  color: '#3b82f6' };
  if (mimetype.includes('sheet') || mimetype.includes('excel'))   return { label: 'XLS',  color: '#22c55e' };
  if (mimetype.startsWith('image/'))                           return { label: 'IMG',  color: '#a855f7' };
  return { label: 'FILE', color: '#6b7280' };
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function uploadDirectToSupabase(signedUrl, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
}

// ── Upload / Edit Modal ───────────────────────────────────────────────────────
function DocModal({ doc, onClose, onSaved }) {
  const isEdit = !!doc;
  const [name, setName]         = useState(doc?.name || '');
  const [roles, setRoles]       = useState(doc?.roles || []);
  const [file, setFile]         = useState(null);
  const [saving, setSaving]     = useState(false);
  const [uploadPct, setUploadPct] = useState(null);
  const [error, setError]       = useState('');
  const inputRef                = useRef();

  const toggleRole = (role) =>
    setRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);

  const allSelected = ROLES.every(r => roles.includes(r));
  const toggleAll   = () => setRoles(allSelected ? [] : [...ROLES]);

  const handleSave = async () => {
    if (!name.trim())     { setError('Display name is required.'); return; }
    if (!isEdit && !file) { setError('Please select a file.'); return; }
    if (!roles.length)    { setError('Select at least one role.'); return; }
    setSaving(true);
    setError('');
    setUploadPct(null);

    try {
      if (!isEdit && file) {
        // Step 1: get a presigned URL (no file data sent through Lambda)
        const presignRes = await fetch(`${API}/api/sop-documents/presign`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name }),
        });
        if (!presignRes.ok) {
          const d = await presignRes.json().catch(() => ({}));
          setError(d.message || 'Could not initiate upload.'); setSaving(false); return;
        }
        const { signedUrl, path } = await presignRes.json();

        // Step 2: upload file directly to Supabase (bypasses Lambda — no size limit)
        setUploadPct(0);
        await uploadDirectToSupabase(signedUrl, file, setUploadPct);

        // Step 3: save metadata
        const commitRes = await fetch(`${API}/api/sop-documents/commit`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), roles, filename: path, mimetype: file.type, size: file.size }),
        });
        if (!commitRes.ok) {
          const d = await commitRes.json().catch(() => ({}));
          setError(d.message || 'File uploaded but failed to save record.'); setSaving(false); return;
        }
      } else {
        // Edit: name/roles only, no file re-upload
        const fd = new FormData();
        fd.append('name', name.trim());
        fd.append('roles', JSON.stringify(roles));
        const res = await fetch(`${API}/api/sop-documents/${doc.id}`, { method: 'PATCH', credentials: 'include', body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setError(data.message || 'Save failed.'); setSaving(false); return; }
      }
      onSaved();
      onClose();
    } catch (err) {
      setError('Upload failed. Please check your connection and try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center px-4">
      <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-md p-6 space-y-5">
        <h3 className="text-white font-semibold text-lg">{isEdit ? 'Edit Document' : 'Upload Document'}</h3>

        {error && <div className="px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-sm">{error}</div>}

        <div>
          <label className="block text-gray-400 text-sm mb-1.5">Display Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Opening Checklist — Bar"
            className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>

        {!isEdit && (
          <div>
            <label className="block text-gray-400 text-sm mb-1.5">File</label>
            <div onClick={() => inputRef.current.click()}
              className="w-full border-2 border-dashed border-gray-600 rounded-lg px-4 py-5 text-center cursor-pointer hover:border-gray-500 transition">
              <p className="text-gray-400 text-sm">{file ? file.name : 'Click to select file'}</p>
            </div>
            <input ref={inputRef} type="file" className="hidden"
              onChange={e => setFile(e.target.files[0])} />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-gray-400 text-sm">Visible to</label>
            <button onClick={toggleAll} className="text-xs text-orange-400 hover:text-orange-300 transition">
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map(role => (
              <label key={role} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)}
                  className="accent-orange-500" />
                <span className="text-gray-300 text-sm">{ROLE_LABELS[role]}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-600 text-gray-300 text-sm hover:bg-gray-700 transition">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition disabled:opacity-50"
            style={{ backgroundColor: '#F05A28' }}>
            {saving
              ? (uploadPct !== null ? `Uploading… ${uploadPct}%` : 'Saving…')
              : isEdit ? 'Save Changes' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Document viewer ───────────────────────────────────────────────────────────
function ViewerModal({ doc, onClose }) {
  const viewUrl     = `${API}/api/sop-documents/${doc.id}/view`;
  const downloadUrl = `${API}/api/sop-documents/${doc.id}/download`;
  const isPdf       = doc.mimetype === 'application/pdf';

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <h3 className="text-white font-semibold truncate max-w-xl">{doc.name}</h3>
        <div className="flex items-center gap-3">
          <a href={downloadUrl} className="px-4 py-1.5 rounded-lg text-sm text-gray-300 border border-gray-600 hover:text-white hover:border-gray-500 transition">
            Download
          </a>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none transition">×</button>
        </div>
      </div>
      <div className="flex-1">
        {isPdf ? (
          <iframe src={viewUrl} title={doc.name} className="w-full h-full border-0" />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400">
            <p className="text-sm">Preview not available for this file type.</p>
            <a href={downloadUrl} className="px-5 py-2 rounded-lg text-white text-sm font-semibold"
              style={{ backgroundColor: '#F05A28' }}>Download to view</a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Library card ──────────────────────────────────────────────────────────────
function DocCard({ doc, onView }) {
  const { label, color } = fileTypeInfo(doc.mimetype);
  return (
    <button
      onClick={onView}
      className="group relative bg-gray-800 rounded-2xl border border-gray-700 hover:border-orange-500 transition-all duration-200 text-left overflow-hidden flex flex-col hover:shadow-lg hover:shadow-orange-500/10 hover:-translate-y-0.5"
    >
      {/* Top accent stripe */}
      <div className="h-1 w-full" style={{ backgroundColor: '#F05A28' }} />

      <div className="p-5 flex flex-col gap-3 flex-1">
        {/* File type badge */}
        <div className="flex items-start justify-between">
          <span className="text-xs font-bold px-2 py-1 rounded-md tracking-wider text-white"
            style={{ backgroundColor: color }}>
            {label}
          </span>
          <span className="text-gray-600 text-xs">{fmtDate(doc.uploaded_at)}</span>
        </div>

        {/* Title */}
        <p className="text-white font-semibold text-sm leading-snug group-hover:text-orange-400 transition-colors">
          {doc.name}
        </p>

        {/* Footer */}
        <div className="mt-auto pt-2 border-t border-gray-700/50 flex items-center justify-between">
          <span className="text-gray-600 text-xs">{doc.uploaded_by_name}</span>
          <span className="text-orange-500 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
            View →
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SOPsChecklists({ user, canUpload, onBack }) {
  const [docs, setDocs]         = useState([]);
  const [view, setView]         = useState('library'); // 'library' | 'manage'
  const [viewing, setViewing]   = useState(null);
  const [editing, setEditing]   = useState(null);      // null | doc | 'new'
  const [loading, setLoading]   = useState(true);

  const fetchDocs = () => {
    fetch(`${API}/api/sop-documents`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setDocs(Array.isArray(d) ? d : []); setLoading(false); });
  };

  useEffect(() => { fetchDocs(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this document?')) return;
    await fetch(`${API}/api/sop-documents/${id}`, { method: 'DELETE', credentials: 'include' });
    setDocs(prev => prev.filter(d => d.id !== id));
  };

  const moveDoc = async (index, direction) => {
    const next = [...docs];
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    setDocs(next);
    await fetch(`${API}/api/sop-documents/reorder`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: next.map(d => d.id) }),
    });
  };

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
            <h2 className="text-cream text-4xl font-bold">SOPs</h2>
            <p className="text-gray-400 mt-2">Standard operating procedures</p>
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
          /* ── Library grid ── */
          docs.length === 0 ? (
            <div className="text-center py-20 text-gray-600 text-sm">No documents available.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {docs.map(doc => (
                <DocCard key={doc.id} doc={doc} onView={() => setViewing(doc)} />
              ))}
            </div>
          )
        ) : (
          /* ── Manage table ── */
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={() => setEditing('new')}
                className="px-4 py-2 rounded-xl text-white text-sm font-semibold transition hover:opacity-90"
                style={{ backgroundColor: '#F05A28' }}>
                + Upload Document
              </button>
            </div>
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              {docs.length === 0 ? (
                <div className="py-16 text-center text-gray-500 text-sm">No documents uploaded yet.</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Order</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Name</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4 hidden sm:table-cell">Type</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4 hidden md:table-cell">Visible To</th>
                      <th className="px-6 py-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((doc, i) => {
                      const { label, color } = fileTypeInfo(doc.mimetype);
                      return (
                        <tr key={doc.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/30 transition">
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <button onClick={() => moveDoc(i, -1)} disabled={i === 0}
                                className="text-gray-500 hover:text-white disabled:opacity-20 transition text-xs leading-none">▲</button>
                              <button onClick={() => moveDoc(i, 1)} disabled={i === docs.length - 1}
                                className="text-gray-500 hover:text-white disabled:opacity-20 transition text-xs leading-none">▼</button>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-white text-sm font-medium">{doc.name}</td>
                          <td className="px-6 py-4 hidden sm:table-cell">
                            <span className="text-xs font-bold px-2 py-0.5 rounded text-white" style={{ backgroundColor: color }}>{label}</span>
                          </td>
                          <td className="px-6 py-4 hidden md:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {(doc.roles || []).map(r => (
                                <span key={r} className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">{ROLE_LABELS[r]}</span>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3 justify-end">
                              <button onClick={() => setViewing(doc)} className="text-sm text-gray-400 hover:text-white transition">View</button>
                              <button onClick={() => setEditing(doc)} className="text-sm text-gray-400 hover:text-white transition">Edit</button>
                              <button onClick={() => handleDelete(doc.id)} className="text-sm text-red-500 hover:text-red-400 transition">Delete</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>

      {viewing && <ViewerModal doc={viewing} onClose={() => setViewing(null)} />}
      {editing && (
        <DocModal
          doc={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={fetchDocs}
        />
      )}
    </div>
  );
}
