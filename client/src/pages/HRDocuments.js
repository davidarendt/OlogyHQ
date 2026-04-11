import { useState, useEffect, useRef } from 'react';

const ALL_ROLES = ['admin', 'bar_manager', 'bartender', 'barista', 'coffee_manager', 'production', 'sales', 'hr'];

const FILE_TYPES = {
  'application/pdf':                                                              { label: 'PDF', color: 'bg-red-600',    hex: '#dc2626' },
  'application/msword':                                                           { label: 'DOC', color: 'bg-blue-600',   hex: '#2563eb' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':      { label: 'DOC', color: 'bg-blue-600',   hex: '#2563eb' },
  'application/vnd.ms-excel':                                                     { label: 'XLS', color: 'bg-green-600',  hex: '#16a34a' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':            { label: 'XLS', color: 'bg-green-600',  hex: '#16a34a' },
  'application/vnd.ms-powerpoint':                                                { label: 'PPT', color: 'bg-amber-600',  hex: '#d97706' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':    { label: 'PPT', color: 'bg-amber-600',  hex: '#d97706' },
  'text/plain':                                                                   { label: 'TXT', color: 'bg-gray-500',   hex: '#6b7280' },
  'image/png':                                                                    { label: 'IMG', color: 'bg-purple-600', hex: '#9333ea' },
  'image/jpeg':                                                                   { label: 'IMG', color: 'bg-purple-600', hex: '#9333ea' },
};

function fileTypeMeta(mimetype) {
  return FILE_TYPES[mimetype] || { label: 'FILE', color: 'bg-gray-600', hex: '#4b5563' };
}

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRole(role) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function hexFontSize(name) {
  const len = name.length;
  if (len <= 8)  return '1.5rem';
  if (len <= 14) return '1.25rem';
  if (len <= 22) return '1.05rem';
  if (len <= 32) return '0.88rem';
  return '0.72rem';
}

// ── Hex card dimensions & grid constants ────────────────────────────────────
const HEX_W   = 152;
const HEX_H   = 176;
const HEX_GAP = 20;
const HEX_COLS = 4;
// Width needed to fit COLS hexes + gaps + one half-hex offset for alternating rows
const GRID_W = HEX_COLS * HEX_W + (HEX_COLS - 1) * HEX_GAP + (HEX_W + HEX_GAP) / 2;
const ROW_OVERLAP = Math.round(HEX_H * 0.25); // rows overlap for honeycomb tiling
const ROW_OFFSET  = (HEX_W + HEX_GAP) / 2;   // alternating row horizontal shift

function HexCard({ doc, onDownload }) {
  const [hovered, setHovered] = useState(false);
  const type = fileTypeMeta(doc.mimetype);

  return (
    <div
      onClick={onDownload}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`Download: ${doc.name}`}
      style={{
        width:      `${HEX_W}px`,
        height:     `${HEX_H}px`,
        position:   'relative',
        flexShrink: 0,
        cursor:     'pointer',
        userSelect: 'none',
        transform:  hovered ? 'scale(1.08)' : 'scale(1)',
        transition: 'transform 0.2s ease',
      }}
    >
      {/* Orange border layer */}
      <div style={{
        position:   'absolute',
        inset:      0,
        clipPath:   'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
        background: hovered
          ? 'linear-gradient(135deg, #FF8C00, #FF6B00)'
          : 'linear-gradient(135deg, #FF6B00, #c24d00)',
        filter: hovered
          ? 'drop-shadow(0 0 14px rgba(255,107,0,0.85))'
          : 'drop-shadow(0 4px 8px rgba(0,0,0,0.7))',
        transition: 'background 0.2s ease, filter 0.2s ease',
      }} />

      {/* Dark inner hex — inset clip-path so content is NOT scaled down */}
      <div style={{
        position:       'absolute',
        inset:          0,
        clipPath:       'polygon(50% 5%, 95% 27.5%, 95% 72.5%, 50% 95%, 5% 72.5%, 5% 27.5%)',
        background:     'linear-gradient(160deg, #2d3748 0%, #1a202c 100%)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
      }}>
        <span style={{
          color:      'white',
          fontSize:   hexFontSize(doc.name),
          fontWeight: '700',
          textAlign:  'center',
          lineHeight: '1.25',
          maxWidth:   '125px',
          wordBreak:  'break-word',
          padding:    '0 8px',
        }}>
          {doc.name}
        </span>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

function HRDocuments({ user, canUpload, onBack }) {
  const [documents, setDocuments]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [uploading, setUploading]   = useState(false);
  const [dragOver, setDragOver]     = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');
  const [mode, setMode]             = useState('library'); // 'library' | 'manage'

  // Modal state (shared between upload & edit)
  const [pendingFile, setPendingFile] = useState(null);
  const [editingDoc, setEditingDoc]   = useState(null);
  const [docName, setDocName]         = useState('');
  const [selectedRoles, setSelectedRoles] = useState([]);
  const fileInputRef = useRef();

  const fetchDocuments = async () => {
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/hr-documents`, { credentials: 'include' });
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load documents.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDocuments(); }, []);

  // ── Modal helpers ──────────────────────────────────────────────────────────
  const openUploadModal = (file) => {
    setPendingFile(file);
    setDocName(file.name.replace(/\.[^/.]+$/, ''));
    setSelectedRoles([]);
    setError('');
    setSuccess('');
  };

  const openEditModal = (doc) => {
    setEditingDoc(doc);
    setDocName(doc.name);
    setSelectedRoles(doc.roles || []);
    setError('');
    setSuccess('');
  };

  const closeModal = () => {
    setPendingFile(null);
    setEditingDoc(null);
    setDocName('');
    setSelectedRoles([]);
  };

  const toggleRole = (role) =>
    setSelectedRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);

  const toggleAll = () =>
    setSelectedRoles(prev => prev.length === ALL_ROLES.length ? [] : [...ALL_ROLES]);

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!pendingFile) return;
    if (!docName.trim())         { setError('Please enter a document name.'); return; }
    if (!selectedRoles.length)   { setError('Select at least one role that can view this document.'); return; }
    setError('');
    setUploading(true);
    const formData = new FormData();
    formData.append('file',  pendingFile);
    formData.append('name',  docName.trim());
    formData.append('roles', JSON.stringify(selectedRoles));
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/hr-documents`, { method: 'POST', credentials: 'include', body: formData });
      const data = await res.json();
      if (!res.ok) { setError(data.message); return; }
      setSuccess(`"${data.name}" uploaded successfully.`);
      closeModal();
      fetchDocuments();
    } catch { setError('Upload failed. Please try again.'); }
    finally  { setUploading(false); }
  };

  // ── Edit ───────────────────────────────────────────────────────────────────
  const handleSaveEdit = async () => {
    if (!editingDoc) return;
    if (!docName.trim())       { setError('Please enter a document name.'); return; }
    if (!selectedRoles.length) { setError('Select at least one role that can view this document.'); return; }
    setError('');
    setUploading(true);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/hr-documents/${editingDoc.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: docName.trim(), roles: selectedRoles }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message); return; }
      setSuccess(`"${data.name}" updated successfully.`);
      closeModal();
      fetchDocuments();
    } catch { setError('Save failed. Please try again.'); }
    finally  { setUploading(false); }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete "${doc.name}"?`)) return;
    setError('');
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/hr-documents/${doc.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) { const d = await res.json(); setError(d.message); return; }
      setSuccess(`"${doc.name}" deleted.`);
      fetchDocuments();
    } catch { setError('Delete failed.'); }
  };

  const handleView = (doc) =>
    window.open(`${process.env.REACT_APP_API_URL || ''}/api/hr-documents/${doc.id}/view`, '_blank', 'noopener,noreferrer');

  const handleDownload = (doc) =>
    window.open(`${process.env.REACT_APP_API_URL || ''}/api/hr-documents/${doc.id}/download`, '_blank', 'noopener,noreferrer');

  const handleMove = async (index, direction) => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= documents.length) return;
    const newOrder = [...documents];
    [newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]];
    setDocuments(newOrder); // optimistic update
    await fetch(`${process.env.REACT_APP_API_URL || ''}/api/hr-documents/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ids: newOrder.map(d => d.id) }),
    });
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) openUploadModal(file);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) openUploadModal(file);
  };

  // ── Build honeycomb rows ───────────────────────────────────────────────────
  const hexRows = [];
  for (let i = 0; i < documents.length; i += HEX_COLS) {
    hexRows.push(documents.slice(i, i + HEX_COLS));
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-900">

      {/* Top Nav */}
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition">
          <span className="text-2xl font-bold" style={{ color: '#FF6B00' }}>OLOGY</span>
          <span className="text-white font-semibold text-xl">HQ</span>
        </button>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition">
          ← Back to Dashboard
        </button>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-10">

        {/* Page Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h2 className="text-white text-4xl font-bold">HR Documents</h2>
            <p className="text-gray-400 mt-2">
              {mode === 'library' ? 'Company policies, handbooks, and employee forms' : 'Upload, edit, and manage documents'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {canUpload && mode === 'library' && (
              <button
                onClick={() => { setMode('manage'); setError(''); setSuccess(''); }}
                className="px-5 py-2.5 rounded-lg font-semibold text-white text-sm bg-gray-700 hover:bg-gray-600 transition"
              >
                Manage Documents
              </button>
            )}
            {canUpload && mode === 'manage' && (
              <>
                <button
                  onClick={() => { setMode('library'); setError(''); setSuccess(''); }}
                  className="px-5 py-2.5 rounded-lg font-semibold text-gray-400 text-sm bg-gray-700 hover:bg-gray-600 transition"
                >
                  ← Document Library
                </button>
                <button
                  onClick={() => fileInputRef.current.click()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-white text-sm transition"
                  style={{ backgroundColor: '#FF6B00' }}
                >
                  <span className="text-lg leading-none">↑</span>
                  Upload Document
                </button>
              </>
            )}
          </div>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
        </div>

        {/* Alerts */}
        {error   && <div className="mb-5 px-4 py-3 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-sm">{error}</div>}
        {success && <div className="mb-5 px-4 py-3 rounded-lg bg-green-500/20 border border-green-500/40 text-green-300 text-sm">{success}</div>}

        {/* ── LIBRARY VIEW (hex grid) ────────────────────────────────────── */}
        {mode === 'library' && (
          loading ? (
            <div className="py-24 text-center text-gray-500 text-sm">Loading documents…</div>
          ) : documents.length === 0 ? (
            <div className="py-24 text-center">
              <p className="text-gray-400 text-base font-medium">No documents available</p>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: `${ROW_OVERLAP}px` }}>
              <div style={{ width: `${GRID_W}px` }}>
                {hexRows.map((row, rowIdx) => (
                  <div
                    key={rowIdx}
                    style={{
                      display:    'flex',
                      gap:        `${HEX_GAP}px`,
                      marginTop:  rowIdx === 0 ? 0 : `-${ROW_OVERLAP}px`,
                      marginLeft: rowIdx % 2 === 1 ? `${ROW_OFFSET}px` : 0,
                    }}
                  >
                    {row.map(doc => (
                      <HexCard key={doc.id} doc={doc} onDownload={() => handleView(doc)} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )
        )}

        {/* ── MANAGE VIEW (table + upload) ──────────────────────────────── */}
        {mode === 'manage' && (
          <>
            {/* Drop Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`mb-6 rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
                dragOver ? 'border-orange-500 bg-orange-500/10' : 'border-gray-700 bg-gray-800/50'
              }`}
            >
              <p className="text-gray-400 text-sm">
                Drag and drop a file here, or{' '}
                <button
                  onClick={() => fileInputRef.current.click()}
                  className="underline hover:text-white transition"
                  style={{ color: '#FF6B00' }}
                >
                  browse to upload
                </button>
              </p>
              <p className="text-gray-600 text-xs mt-1">Max file size: 25 MB</p>
            </div>

            {/* Document Table */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              {loading ? (
                <div className="px-6 py-16 text-center text-gray-500 text-sm">Loading documents…</div>
              ) : documents.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <p className="text-gray-400 text-base font-medium">No documents yet</p>
                  <p className="text-gray-600 text-sm mt-1">Upload the first document to get started.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-4 w-16">Order</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Document</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4 hidden lg:table-cell">Visible To</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4 hidden sm:table-cell">Uploaded By</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4 hidden md:table-cell">Date</th>
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4 hidden md:table-cell">Size</th>
                      <th className="px-6 py-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc, index) => {
                      const type = fileTypeMeta(doc.mimetype);
                      return (
                        <tr key={doc.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/40 transition">
                          <td className="px-4 py-4">
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => handleMove(index, 'up')}
                                disabled={index === 0}
                                className="text-gray-500 hover:text-white disabled:opacity-20 transition text-xs leading-none"
                                title="Move up"
                              >▲</button>
                              <button
                                onClick={() => handleMove(index, 'down')}
                                disabled={index === documents.length - 1}
                                className="text-gray-500 hover:text-white disabled:opacity-20 transition text-xs leading-none"
                                title="Move down"
                              >▼</button>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <span className={`${type.color} text-white text-xs font-bold px-2 py-1 rounded min-w-[40px] text-center flex-shrink-0`}>
                                {type.label}
                              </span>
                              <span className="text-white text-sm font-medium">{doc.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 hidden lg:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {(doc.roles || []).length === 0 ? (
                                <span className="text-gray-600 text-xs">No roles assigned</span>
                              ) : (doc.roles || []).map(role => (
                                <span key={role} className="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded-full">
                                  {formatRole(role)}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-400 text-sm hidden sm:table-cell">{doc.uploaded_by_name}</td>
                          <td className="px-6 py-4 text-gray-400 text-sm hidden md:table-cell whitespace-nowrap">{formatDate(doc.uploaded_at)}</td>
                          <td className="px-6 py-4 text-gray-400 text-sm hidden md:table-cell">{formatSize(doc.size)}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-3">
                              <button onClick={() => handleDownload(doc)} className="text-sm text-gray-400 hover:text-white transition">Download</button>
                              <button onClick={() => openEditModal(doc)} className="text-sm text-gray-400 hover:text-white transition">Edit</button>
                              <button onClick={() => handleDelete(doc)} className="text-sm text-red-400 hover:text-red-300 transition">Delete</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </main>

      {/* ── Upload / Edit Modal ────────────────────────────────────────────── */}
      {(pendingFile || editingDoc) && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md p-6">
            <h3 className="text-white text-lg font-semibold mb-1">
              {editingDoc ? 'Edit Document' : 'Upload Document'}
            </h3>
            <p className="text-gray-500 text-sm mb-5 truncate">
              {editingDoc ? editingDoc.name : pendingFile.name}
            </p>

            {error && <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-sm">{error}</div>}

            {/* Display name */}
            <div className="mb-5">
              <label className="block text-gray-400 text-sm mb-1.5">Display Name</label>
              <input
                className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                value={docName}
                onChange={e => setDocName(e.target.value)}
                placeholder="e.g. Employee Handbook 2025"
              />
            </div>

            {/* Role visibility */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="text-gray-400 text-sm">Visible To</label>
                <button onClick={toggleAll} className="text-xs text-gray-400 hover:text-white transition">
                  {selectedRoles.length === ALL_ROLES.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {ALL_ROLES.map(role => (
                  <button
                    key={role}
                    onClick={() => toggleRole(role)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition ${
                      selectedRoles.includes(role)
                        ? 'bg-orange-500/20 border border-orange-500 text-orange-300'
                        : 'bg-gray-700 border border-transparent text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-sm flex-shrink-0 border flex items-center justify-center text-xs ${
                      selectedRoles.includes(role) ? 'bg-orange-500 border-orange-500' : 'border-gray-500'
                    }`}>
                      {selectedRoles.includes(role) && '✓'}
                    </span>
                    <span className="capitalize">{formatRole(role)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={closeModal} className="flex-1 px-4 py-2.5 rounded-lg text-sm text-gray-400 bg-gray-700 hover:bg-gray-600 transition">
                Cancel
              </button>
              <button
                onClick={editingDoc ? handleSaveEdit : handleUpload}
                disabled={uploading}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: '#FF6B00' }}
              >
                {uploading ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {editingDoc ? 'Saving…' : 'Uploading…'}
                  </>
                ) : editingDoc ? 'Save Changes' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HRDocuments;
