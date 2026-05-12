import { useState, useEffect, useRef } from 'react';
import { Paperclip } from 'lucide-react';

const API = process.env.REACT_APP_API_URL || '';

// Recipients that never get a BOL
const BOL_EXCLUDED = ['northside', 'midtown', 'power mill', 'tampa', 'tri-eagle', 'johnson', 'progressive'];
function bolExcluded(recipient) {
  const r = (recipient || '').toLowerCase();
  return BOL_EXCLUDED.some(e => r.includes(e));
}

// Recurring customers that get a tentative Thursday if no invoice exists that week
const RECURRING = [
  { name: 'Tri-Eagle',   match: 'tri-eagle'  },
  { name: 'Northside',   match: 'northside'  },
  { name: 'Midtown',     match: 'midtown'    },
  { name: 'Power Mill',  match: 'power mill' },
  { name: 'Tampa',       match: 'tampa'      },
];

function drivePreviewUrl(url) {
  if (!url) return null;
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return `https://drive.google.com/file/d/${idMatch[1]}/preview`;
  return url;
}

function driveOpenUrl(url) {
  if (!url) return null;
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return `https://drive.google.com/file/d/${fileMatch[1]}/view`;
  return url;
}

function getMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

function getTwoWeekDays() {
  const monday = getMonday(new Date());
  return Array.from({ length: 10 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + Math.floor(i / 5) * 7 + (i % 5));
    return d;
  });
}

function toDateKey(date) {
  return date.toISOString().split('T')[0];
}

function parseSheetDate(str) {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  const d = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
  d.setHours(0, 0, 0, 0);
  return d;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_NAMES   = ['Mon','Tue','Wed','Thu','Fri'];

function fmtDay(date) {
  return `${DAY_NAMES[date.getDay() - 1]} ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

function fmtFullDate(str) {
  const d = parseSheetDate(str);
  if (!d) return str;
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildTentatives(orders, days) {
  const tentatives = [];
  [0, 1].forEach(week => {
    const monday   = days[week * 5];
    const friday   = days[week * 5 + 4];
    const thursday = new Date(monday);
    thursday.setDate(monday.getDate() + 3);
    const thursdayKey = toDateKey(thursday);

    RECURRING.forEach(customer => {
      const hasOrder = orders.some(o => {
        const d = parseSheetDate(o.date);
        if (!d) return false;
        return o.recipient.toLowerCase().includes(customer.match) &&
               d >= monday && d <= friday;
      });
      if (!hasOrder) {
        tentatives.push({
          recipient:      customer.name,
          invoice_number: '',
          date:           `${thursday.getMonth() + 1}/${thursday.getDate()}/${thursday.getFullYear()}`,
          pdf_url:        '',
          status:         '',
          tentative:      true,
          bol:            null,
          _dateKey:       thursdayKey,
        });
      }
    });
  });
  return tentatives;
}

function extractFileId(url) {
  if (!url) return null;
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// ── BOL Upload Modal ──────────────────────────────────────────────────────────
function BOLModal({ order, onClose, onSaved }) {
  const [file, setFile]       = useState(null);
  const [saving, setSaving]   = useState(false);
  const [pct, setPct]         = useState(null);
  const [error, setError]     = useState('');
  const inputRef              = useRef();
  const isReplace             = !!order.bol;

  function uploadDirectToSupabase(signedUrl, fileObj, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signedUrl);
      xhr.setRequestHeader('Content-Type', fileObj.type || 'application/pdf');
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`Upload failed (${xhr.status})`));
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(fileObj);
    });
  }

  const handleSave = async () => {
    if (!file) { setError('Select a PDF file.'); return; }
    setSaving(true); setError(''); setPct(0);
    try {
      const presignRes = await fetch(`${API}/api/bol/presign`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_number: order.invoice_number }),
      });
      if (!presignRes.ok) { const d = await presignRes.json().catch(() => ({})); setError(d.message || 'Could not start upload.'); setSaving(false); return; }
      const { signedUrl, path } = await presignRes.json();

      await uploadDirectToSupabase(signedUrl, file, setPct);

      const commitRes = await fetch(`${API}/api/bol/commit`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_number: order.invoice_number, filename: path }),
      });
      if (!commitRes.ok) { const d = await commitRes.json().catch(() => ({})); setError(d.message || 'Upload succeeded but record save failed.'); setSaving(false); return; }
      const bol = await commitRes.json();
      onSaved(bol);
      onClose();
    } catch (e) {
      setError(e.message || 'Upload failed.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h3 className="text-white font-semibold">{isReplace ? 'Replace BOL' : 'Attach BOL'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-gray-400 text-sm">
            {order.recipient} · #{order.invoice_number}
          </div>
          {isReplace && (
            <div className="px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs">
              Replacing the existing BOL will mark it as <strong>Amended</strong>.
            </div>
          )}
          {file ? (
            <div className="flex items-center justify-between bg-gray-700 rounded-lg px-3 py-2">
              <span className="text-white text-sm truncate">{file.name}</span>
              <button onClick={() => setFile(null)} className="text-gray-400 hover:text-white ml-2 shrink-0">×</button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-gray-500 transition">
              <span className="text-gray-400 text-sm">Click to select PDF</span>
              <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden"
                onChange={e => { if (e.target.files[0]) setFile(e.target.files[0]); }} />
            </label>
          )}
          {pct !== null && pct < 100 && (
            <div className="w-full bg-gray-700 rounded-full h-1.5">
              <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: '#F05A28' }} />
            </div>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 transition">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving || !file}
              className="flex-1 py-2 text-white text-sm rounded-lg transition disabled:opacity-50"
              style={{ backgroundColor: '#F05A28' }}>
              {saving ? (pct !== null && pct < 100 ? `Uploading ${pct}%…` : 'Saving…') : isReplace ? 'Replace' : 'Attach'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Order card ────────────────────────────────────────────────────────────────
function OrderCard({ order, onClick }) {
  if (order.tentative) {
    return (
      <div className="w-full text-left px-2.5 py-2 rounded-lg text-xs"
        style={{ border: '1px dashed rgba(107,114,128,0.5)', backgroundColor: 'rgba(107,114,128,0.08)' }}>
        <div className="text-gray-500 font-semibold truncate">{order.recipient}</div>
        <div className="text-gray-600 mt-0.5">Tentative</div>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-2.5 py-2 rounded-lg text-xs transition hover:opacity-80 group"
      style={{ backgroundColor: 'rgba(240,90,40,0.12)', border: '1px solid rgba(240,90,40,0.3)' }}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="font-semibold truncate group-hover:text-orange-400 transition" style={{ color: '#F05A28' }}>
          {order.recipient}
        </div>
        {order.bol && !bolExcluded(order.recipient) && (
          <Paperclip size={10} className="shrink-0 text-gray-400" />
        )}
      </div>
      {order.invoice_number && (
        <div className="text-gray-500 mt-0.5">#{order.invoice_number}</div>
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DistroTaproomOrders({ user, canUpload, onBack }) {
  const [orders, setOrders]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [selected, setSelected]     = useState(null);
  const [printingDay, setPrintingDay] = useState(null);
  const [bolModal, setBolModal]     = useState(false);
  const [deletingBol, setDeletingBol] = useState(false);

  const handlePrintDay = (dateKey, dayOrders) => {
    const fileIds = dayOrders
      .filter(o => !o.tentative && o.pdf_url)
      .map(o => extractFileId(o.pdf_url))
      .filter(Boolean);
    if (fileIds.length === 0) return;
    setPrintingDay(dateKey);
    const url = `${API}/api/distro-orders/print-day?fileIds=${fileIds.join(',')}`;
    window.open(url, '_blank');
    setTimeout(() => setPrintingDay(null), 3000);
  };

  const days     = getTwoWeekDays();
  const todayKey = toDateKey(new Date());

  useEffect(() => {
    fetch(`${API}/api/distro-orders`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setOrders(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError('Failed to load orders.'); setLoading(false); });
  }, []);

  const updateOrderBol = (invoiceNumber, bol) => {
    setOrders(prev => prev.map(o => o.invoice_number === invoiceNumber ? { ...o, bol } : o));
    setSelected(prev => prev && prev.invoice_number === invoiceNumber ? { ...prev, bol } : prev);
  };

  const handleBolSaved = (bol) => {
    updateOrderBol(selected.invoice_number, bol);
  };

  const handleDeleteBol = async () => {
    if (!window.confirm('Delete this BOL? This cannot be undone.')) return;
    setDeletingBol(true);
    await fetch(`${API}/api/bol/${encodeURIComponent(selected.invoice_number)}`, {
      method: 'DELETE', credentials: 'include',
    });
    setDeletingBol(false);
    updateOrderBol(selected.invoice_number, null);
  };

  // Group real orders by date key
  const ordersByDay = {};
  orders.forEach(o => {
    const d = parseSheetDate(o.date);
    if (!d) return;
    const key = toDateKey(d);
    if (!ordersByDay[key]) ordersByDay[key] = [];
    ordersByDay[key].push(o);
  });

  buildTentatives(orders, days).forEach(t => {
    if (!ordersByDay[t._dateKey]) ordersByDay[t._dateKey] = [];
    ordersByDay[t._dateKey].push(t);
  });

  const previewUrl = selected ? drivePreviewUrl(selected.pdf_url) : null;
  const openUrl    = selected ? driveOpenUrl(selected.pdf_url) : null;
  const showBol    = selected && !bolExcluded(selected.recipient) && !!selected.invoice_number;

  return (
    <div className="bg-gray-900 min-h-screen flex flex-col">

      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition">
          <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-xl">HQ</span>
        </button>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition">
          ← Back to Dashboard
        </button>
      </nav>

      {selected ? (
        /* ── Invoice / BOL view ─────────────────────────────────────────────── */
        <div className="flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 65px)' }}>
          {/* Sub-header */}
          <div className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-3 flex items-center justify-between flex-shrink-0 gap-3 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              <button onClick={() => setSelected(null)} className="text-sm text-gray-400 hover:text-white transition shrink-0">
                ← Back to Calendar
              </button>
              <div className="w-px h-4 bg-gray-700 shrink-0" />
              <div className="min-w-0">
                <span className="text-white font-semibold">{selected.recipient}</span>
                {selected.invoice_number && (
                  <span className="text-gray-400 text-sm ml-2">#{selected.invoice_number}</span>
                )}
                <span className="text-gray-500 text-sm ml-2">· {fmtFullDate(selected.date)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* BOL controls */}
              {showBol && (
                <>
                  {selected.bol ? (
                    <div className="flex items-center gap-2">
                      {selected.bol.is_amended && (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-yellow-900/60 text-yellow-300">
                          Amended
                        </span>
                      )}
                      <a
                        href={`${API}/api/bol/${encodeURIComponent(selected.invoice_number)}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-600 text-gray-300 hover:text-white hover:border-gray-500 transition"
                      >
                        View BOL
                      </a>
                      {canUpload && (
                        <>
                          <button
                            onClick={() => setBolModal(true)}
                            className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-600 text-gray-300 hover:text-white hover:border-gray-500 transition"
                          >
                            Replace
                          </button>
                          <button
                            onClick={handleDeleteBol}
                            disabled={deletingBol}
                            className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-red-900 text-red-400 hover:bg-red-950 transition disabled:opacity-50"
                          >
                            {deletingBol ? '…' : 'Delete BOL'}
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    canUpload && (
                      <button
                        onClick={() => setBolModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-600 text-gray-300 hover:text-white hover:border-gray-500 transition"
                      >
                        <Paperclip size={14} />
                        Attach BOL
                      </button>
                    )
                  )}
                </>
              )}
              {openUrl && (
                <a
                  href={openUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ backgroundColor: '#F05A28' }}
                >
                  Open / Print
                </a>
              )}
            </div>
          </div>

          {/* BOL metadata strip */}
          {showBol && selected.bol && (
            <div className="bg-gray-800/50 border-b border-gray-700/50 px-4 sm:px-6 py-2 flex items-center gap-2">
              <Paperclip size={12} className="text-gray-500" />
              <span className="text-gray-400 text-xs">
                BOL attached by {selected.bol.uploaded_by_name} · {fmtDateTime(selected.bol.uploaded_at)}
              </span>
            </div>
          )}

          {/* PDF iframe */}
          <div className="flex-1">
            {previewUrl ? (
              <iframe
                src={previewUrl}
                title={`Invoice ${selected.invoice_number}`}
                className="w-full h-full border-0"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                No PDF linked to this order.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Calendar view ──────────────────────────────────────────────────── */
        <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10">
          <div className="mb-6 sm:mb-8">
            <h2 className="text-cream text-2xl sm:text-4xl font-bold">Distro / Taproom Orders</h2>
            <p className="text-gray-400 mt-1 text-sm sm:mt-2">Outgoing invoices — tap any order to view</p>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-sm mb-6">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-gray-500 text-sm">Loading orders…</div>
          ) : (
            <div className="space-y-6 sm:space-y-8">
              {[0, 1].map(week => (
                <div key={week}>
                  <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
                    {week === 0 ? 'This Week' : 'Next Week'}
                  </h3>

                  {/* Desktop: 5-column grid */}
                  <div className="hidden sm:grid grid-cols-5 gap-4">
                    {days.slice(week * 5, week * 5 + 5).map(day => {
                      const key       = toDateKey(day);
                      const dayOrders = ordersByDay[key] || [];
                      const isToday   = key === todayKey;
                      return (
                        <div
                          key={key}
                          className={`rounded-xl border p-3 min-h-32 ${
                            isToday ? 'border-orange-500 bg-orange-500/5' : 'border-gray-700 bg-gray-800'
                          }`}
                        >
                          <div className={`text-xs font-semibold mb-2.5 flex items-center justify-between ${isToday ? 'text-orange-400' : 'text-gray-400'}`}>
                            <span>
                              {fmtDay(day)}
                              {isToday && <span className="ml-1" style={{ color: '#F05A28' }}>●</span>}
                            </span>
                            {dayOrders.filter(o => !o.tentative && o.pdf_url).length > 0 && (
                              <button
                                onClick={() => handlePrintDay(key, dayOrders)}
                                disabled={!!printingDay}
                                title="Print all invoices for this day"
                                className="ml-1 transition flex-shrink-0 disabled:opacity-40"
                                style={{ color: '#F05A28', fontSize: '14px', lineHeight: 1 }}
                              >
                                {printingDay === key ? '⏳' : '🖨'}
                              </button>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            {dayOrders.length === 0 ? (
                              <p className="text-gray-700 text-xs">—</p>
                            ) : (
                              dayOrders.map((o, i) => (
                                <OrderCard key={i} order={o} onClick={o.tentative ? undefined : () => setSelected(o)} />
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Mobile: stacked list */}
                  <div className="sm:hidden space-y-2">
                    {days.slice(week * 5, week * 5 + 5).map(day => {
                      const key       = toDateKey(day);
                      const dayOrders = ordersByDay[key] || [];
                      const isToday   = key === todayKey;
                      return (
                        <div
                          key={key}
                          className={`rounded-xl border p-3 ${
                            isToday ? 'border-orange-500 bg-orange-500/5' : 'border-gray-700 bg-gray-800'
                          }`}
                        >
                          <div className={`text-xs font-semibold mb-2 flex items-center justify-between ${isToday ? 'text-orange-400' : 'text-gray-400'}`}>
                            <span>
                              {fmtDay(day)}
                              {isToday && <span className="ml-1" style={{ color: '#F05A28' }}>●</span>}
                            </span>
                            {dayOrders.filter(o => !o.tentative && o.pdf_url).length > 0 && (
                              <button
                                onClick={() => handlePrintDay(key, dayOrders)}
                                disabled={!!printingDay}
                                title="Print all invoices for this day"
                                className="ml-1 transition flex-shrink-0 disabled:opacity-40"
                                style={{ color: '#F05A28', fontSize: '14px', lineHeight: 1 }}
                              >
                                {printingDay === key ? '⏳' : '🖨'}
                              </button>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            {dayOrders.length === 0 ? (
                              <p className="text-gray-600 text-xs">No orders</p>
                            ) : (
                              dayOrders.map((o, i) => (
                                <OrderCard key={i} order={o} onClick={o.tentative ? undefined : () => setSelected(o)} />
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      {bolModal && selected && (
        <BOLModal
          order={selected}
          onClose={() => setBolModal(false)}
          onSaved={handleBolSaved}
        />
      )}
    </div>
  );
}
