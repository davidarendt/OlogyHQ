import { useState, useEffect, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';

const API = process.env.REACT_APP_API_URL || '';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return new Date(+y, +m - 1, +d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function CustomerPhoto({ id, filename, className }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!filename) return;
    let objectUrl = null;
    fetch(`${API}/api/86ed/${id}/photo?v=${encodeURIComponent(filename)}`, { credentials: 'include' })
      .then(r => r.blob())
      .then(blob => { objectUrl = URL.createObjectURL(blob); setSrc(objectUrl); })
      .catch(() => {});
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, filename]);
  if (!src) return <div className={`${className} bg-gray-700 animate-pulse`} style={{ borderRadius: 'inherit' }} />;
  return <img src={src} alt="" className={`${className} object-cover`} style={{ borderRadius: 'inherit' }} />;
}

function PhotoPlaceholder({ className }) {
  return (
    <div className={`${className} bg-gray-700 flex items-center justify-center`} style={{ borderRadius: 'inherit' }}>
      <svg className="w-12 h-12 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
      </svg>
    </div>
  );
}

function StatusBadge({ status }) {
  return status === 'active'
    ? <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-900 text-red-300">Active</span>
    : <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-700 text-gray-400">Lifted</span>;
}

function DetailModal({ customer, canUpload, onClose, onEdit, onDelete, onToggleStatus }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-white font-semibold text-lg truncate">{customer.name || 'Unknown'}</h2>
            <StatusBadge status={customer.status} />
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none ml-3 shrink-0">×</button>
        </div>

        <div className="p-4">
          <div className="w-full h-64 rounded-lg overflow-hidden">
            {customer.photo_filename
              ? <CustomerPhoto id={customer.id} filename={customer.photo_filename} className="w-full h-64" />
              : <PhotoPlaceholder className="w-full h-64 rounded-lg" />
            }
          </div>
        </div>

        <div className="px-4 pb-4 space-y-3">
          <div>
            <div className="text-gray-400 text-xs mb-0.5">Incident Date</div>
            <div className="text-white text-sm">{formatDate(customer.incident_date)}</div>
          </div>
          {customer.description && (
            <div>
              <div className="text-gray-400 text-xs mb-0.5">Description</div>
              <div className="text-white text-sm">{customer.description}</div>
            </div>
          )}
          {customer.reason && (
            <div>
              <div className="text-gray-400 text-xs mb-0.5">Reason</div>
              <div className="text-white text-sm">{customer.reason}</div>
            </div>
          )}
          {customer.status === 'lifted' && customer.lifted_at && (
            <div>
              <div className="text-gray-400 text-xs mb-0.5">Ban Lifted</div>
              <div className="text-white text-sm">
                {new Date(customer.lifted_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          )}
          <div>
            <div className="text-gray-400 text-xs mb-0.5">Added By</div>
            <div className="text-white text-sm">{customer.created_by_name}</div>
          </div>
        </div>

        {canUpload && (
          <div className="px-4 pb-4 pt-3 border-t border-gray-700 flex gap-2 flex-wrap">
            <button
              onClick={onEdit}
              className="px-3 py-1.5 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 transition"
            >
              Edit
            </button>
            <button
              onClick={() => onToggleStatus(customer.status === 'active' ? 'lifted' : 'active')}
              className={`px-3 py-1.5 text-sm rounded transition ${
                customer.status === 'active'
                  ? 'bg-yellow-900 text-yellow-200 hover:bg-yellow-800'
                  : 'bg-orange-900 text-orange-200 hover:bg-orange-800'
              }`}
            >
              {customer.status === 'active' ? 'Lift Ban' : 'Reinstate Ban'}
            </button>
            <button
              onClick={onDelete}
              className="px-3 py-1.5 bg-red-950 text-red-300 text-sm rounded hover:bg-red-900 transition ml-auto"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function createImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', reject);
    img.src = url;
  });
}

async function getCroppedBlob(imageSrc, pixelCrop) {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
}

function CropModal({ imageSrc, onApply, onCancel }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const onCropComplete = useCallback((_, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleApply = async () => {
    const blob = await getCroppedBlob(imageSrc, croppedAreaPixels);
    onApply(blob);
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex flex-col z-[60]">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700 shrink-0">
        <span className="text-white font-semibold">Crop Photo</span>
        <button onClick={onCancel} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
      </div>

      <div className="relative flex-1">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      <div className="bg-gray-800 border-t border-gray-700 px-4 py-4 shrink-0 space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-xs w-10 shrink-0">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={e => setZoom(+e.target.value)}
            className="flex-1 accent-orange-500"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex-1 py-2 text-white text-sm rounded-lg transition"
            style={{ backgroundColor: '#F05A28' }}
          >
            Apply Crop
          </button>
        </div>
      </div>
    </div>
  );
}

function FormModal({ customer, onClose, onSave }) {
  const isEdit = !!customer;
  const [name, setName] = useState(customer?.name || '');
  const [description, setDescription] = useState(customer?.description || '');
  const [incidentDate, setIncidentDate] = useState(customer?.incident_date || new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState(customer?.reason || '');
  const [status, setStatus] = useState(customer?.status || 'active');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [cropSrc, setCropSrc] = useState(null);

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = ev => setCropSrc(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleCropExisting = async () => {
    const res = await fetch(`${API}/api/86ed/${customer.id}/photo`, { credentials: 'include' });
    const blob = await res.blob();
    const reader = new FileReader();
    reader.onload = ev => setCropSrc(ev.target.result);
    reader.readAsDataURL(blob);
  };

  const handleCropApply = (blob) => {
    const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
    setPhotoFile(file);
    setRemovePhoto(false);
    setPhotoPreview(URL.createObjectURL(blob));
    setCropSrc(null);
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setRemovePhoto(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!incidentDate) { setError('Incident date is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('description', description.trim());
      fd.append('incident_date', incidentDate);
      fd.append('reason', reason.trim());
      if (isEdit) fd.append('status', status);
      if (photoFile) fd.append('photo', photoFile);
      if (removePhoto) fd.append('remove_photo', 'true');

      const url = isEdit ? `${API}/api/86ed/${customer.id}` : `${API}/api/86ed`;
      const res = await fetch(url, { method: isEdit ? 'PATCH' : 'POST', body: fd, credentials: 'include' });
      if (res.ok) {
        onSave();
      } else {
        const data = await res.json();
        setError(data.message || 'Error saving entry.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const hasExistingPhoto = isEdit && customer.photo_filename && !removePhoto;

  return (
    <>
    {cropSrc && (
      <CropModal
        imageSrc={cropSrc}
        onApply={handleCropApply}
        onCancel={() => setCropSrc(null)}
      />
    )}
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 sticky top-0 bg-gray-800 z-10">
          <h2 className="text-white font-semibold">{isEdit ? 'Edit Entry' : 'Add 86ed Customer'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Photo */}
          <div>
            <div className="text-gray-400 text-xs mb-1">Photo (optional)</div>
            {photoPreview ? (
              <div className="relative">
                <img src={photoPreview} alt="" className="w-full h-48 object-cover rounded-lg" />
                <div className="absolute top-2 right-2 flex gap-1">
                  <label className="bg-gray-900/80 text-white text-xs px-2 py-1 rounded hover:bg-gray-800 cursor-pointer">
                    Recrop
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                  </label>
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="bg-gray-900/80 text-white text-xs px-2 py-1 rounded hover:bg-gray-800"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : hasExistingPhoto ? (
              <div className="relative rounded-lg overflow-hidden h-48">
                <CustomerPhoto id={customer.id} filename={customer.photo_filename} className="w-full h-48" />
                <div className="absolute top-2 right-2 flex gap-1">
                  <button
                    type="button"
                    onClick={handleCropExisting}
                    className="bg-gray-900/80 text-white text-xs px-2 py-1 rounded hover:bg-gray-800"
                  >
                    Crop
                  </button>
                  <label className="bg-gray-900/80 text-white text-xs px-2 py-1 rounded hover:bg-gray-800 cursor-pointer">
                    Replace
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                  </label>
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="bg-gray-900/80 text-white text-xs px-2 py-1 rounded hover:bg-gray-800"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex w-full h-32 border-2 border-dashed border-gray-600 rounded-lg items-center justify-center cursor-pointer hover:border-gray-500 transition">
                <span className="text-gray-400 text-sm">Click to upload photo</span>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </label>
            )}
          </div>

          {/* Name */}
          <div>
            <div className="text-gray-400 text-xs mb-1">Name (optional)</div>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Customer name"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
            />
          </div>

          {/* Description */}
          <div>
            <div className="text-gray-400 text-xs mb-1">Physical Description (optional)</div>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Tall male, brown hair, beard, sleeve tattoos..."
              rows={2}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 resize-none"
            />
          </div>

          {/* Incident Date */}
          <div>
            <div className="text-gray-400 text-xs mb-1">Incident Date *</div>
            <input
              type="date"
              value={incidentDate}
              onChange={e => setIncidentDate(e.target.value)}
              required
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
            />
          </div>

          {/* Reason */}
          <div>
            <div className="text-gray-400 text-xs mb-1">Reason (optional)</div>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="What happened..."
              rows={3}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 resize-none"
            />
          </div>

          {/* Status (edit only) */}
          {isEdit && (
            <div>
              <div className="text-gray-400 text-xs mb-1">Status</div>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
              >
                <option value="active">Active</option>
                <option value="lifted">Lifted</option>
              </select>
            </div>
          )}

          {error && <div className="text-red-400 text-sm">{error}</div>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 text-white text-sm rounded-lg disabled:opacity-50 transition"
              style={{ backgroundColor: '#F05A28' }}
            >
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </>
  );
}

export default function EightySixedCustomers({ canUpload, onBack }) {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [editCustomer, setEditCustomer] = useState(undefined);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const r = await fetch(`${API}/api/86ed`, { credentials: 'include' });
      setCustomers(await r.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = customers.filter(c =>
    !search || (c.name || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this entry permanently?')) return;
    await fetch(`${API}/api/86ed/${id}`, { method: 'DELETE', credentials: 'include' });
    setSelected(null);
    load();
  };

  const handleToggleStatus = async (id, newStatus) => {
    const msg = newStatus === 'lifted' ? 'Lift this ban?' : 'Reinstate this ban?';
    if (!window.confirm(msg)) return;
    const fd = new FormData();
    fd.append('status', newStatus);
    fd.append('incident_date', selected.incident_date);
    const res = await fetch(`${API}/api/86ed/${id}`, { method: 'PATCH', body: fd, credentials: 'include' });
    if (res.ok) {
      const updated = await res.json();
      setSelected(updated);
      setCustomers(prev => prev.map(c => c.id === id ? updated : c));
    }
  };

  const handleSave = () => {
    setEditCustomer(undefined);
    setSelected(null);
    load();
  };

  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-xl">HQ</span>
        </div>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition">
          ← Dashboard
        </button>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-cream text-3xl font-bold mb-1">86ed Customers</h1>
          <p className="text-gray-400 text-sm">Customers who have been removed from our locations</p>
        </div>

        <div className="flex gap-3 mb-6">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
          />
          {canUpload && (
            <button
              onClick={() => setEditCustomer(null)}
              className="px-4 py-2 text-white text-sm rounded-lg font-medium shrink-0"
              style={{ backgroundColor: '#F05A28' }}
            >
              + Add
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-gray-400 text-center py-16">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-gray-400 text-center py-16">
            {search ? 'No matches found.' : 'No entries yet.'}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map(c => (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden text-left hover:border-gray-500 transition-colors"
              >
                <div className="w-full h-40 overflow-hidden">
                  {c.photo_filename
                    ? <CustomerPhoto id={c.id} filename={c.photo_filename} className="w-full h-40" />
                    : <PhotoPlaceholder className="w-full h-40" />
                  }
                </div>
                <div className="p-3">
                  <div className="text-white text-sm font-medium truncate">{c.name || 'Unknown'}</div>
                  <div className="text-gray-400 text-xs mt-0.5">{formatDate(c.incident_date)}</div>
                  <div className="mt-2">
                    <StatusBadge status={c.status} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {selected && (
        <DetailModal
          customer={selected}
          canUpload={canUpload}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditCustomer(selected); setSelected(null); }}
          onDelete={() => handleDelete(selected.id)}
          onToggleStatus={(newStatus) => handleToggleStatus(selected.id, newStatus)}
        />
      )}

      {editCustomer !== undefined && (
        <FormModal
          customer={editCustomer}
          onClose={() => setEditCustomer(undefined)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
