import { useState, useEffect } from 'react';

const API = process.env.REACT_APP_API_URL || '';

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

// Build tentative placeholders for recurring customers missing from a given week
function buildTentatives(orders, days) {
  const tentatives = [];

  // Two weeks: index 0 = this week's Monday, index 1 = next week's Monday
  [0, 1].forEach(week => {
    const monday  = days[week * 5];
    const friday  = days[week * 5 + 4];
    const thursday = new Date(monday);
    thursday.setDate(monday.getDate() + 3);
    const thursdayKey = toDateKey(thursday);

    RECURRING.forEach(customer => {
      // Check if any real order for this customer falls within this Mon–Fri
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
          _dateKey:       thursdayKey,
        });
      }
    });
  });

  return tentatives;
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
      style={{ backgroundColor: 'rgba(255,107,0,0.12)', border: '1px solid rgba(255,107,0,0.3)' }}
    >
      <div className="font-semibold truncate group-hover:text-orange-400 transition" style={{ color: '#FF6B00' }}>
        {order.recipient}
      </div>
      {order.invoice_number && (
        <div className="text-gray-500 mt-0.5">#{order.invoice_number}</div>
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DistroTaproomOrders({ user, onBack }) {
  const [orders, setOrders]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [selected, setSelected] = useState(null);

  const days     = getTwoWeekDays();
  const todayKey = toDateKey(new Date());

  useEffect(() => {
    fetch(`${API}/api/distro-orders`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setOrders(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError('Failed to load orders.'); setLoading(false); });
  }, []);

  // Group real orders by date key
  const ordersByDay = {};
  orders.forEach(o => {
    const d = parseSheetDate(o.date);
    if (!d) return;
    const key = toDateKey(d);
    if (!ordersByDay[key]) ordersByDay[key] = [];
    ordersByDay[key].push(o);
  });

  // Add tentative placeholders
  buildTentatives(orders, days).forEach(t => {
    if (!ordersByDay[t._dateKey]) ordersByDay[t._dateKey] = [];
    ordersByDay[t._dateKey].push(t);
  });

  const previewUrl = selected ? drivePreviewUrl(selected.pdf_url) : null;
  const openUrl    = selected ? driveOpenUrl(selected.pdf_url) : null;

  return (
    <div className="h-screen bg-gray-900 flex flex-col overflow-hidden">

      {/* Nav — always visible */}
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition">
          <span className="text-2xl font-bold" style={{ color: '#FF6B00' }}>OLOGY</span>
          <span className="text-white font-semibold text-xl">HQ</span>
        </button>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition">
          ← Back to Dashboard
        </button>
      </nav>

      {selected ? (
        /* ── Invoice view ───────────────────────────────────────────────────── */
        <div className="flex flex-col flex-1" style={{ height: 'calc(100vh - 65px)' }}>
          {/* Invoice sub-header */}
          <div className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelected(null)}
                className="text-sm text-gray-400 hover:text-white transition"
              >
                ← Back to Calendar
              </button>
              <div className="w-px h-4 bg-gray-700" />
              <div>
                <span className="text-white font-semibold">{selected.recipient}</span>
                {selected.invoice_number && (
                  <span className="text-gray-400 text-sm ml-2">#{selected.invoice_number}</span>
                )}
                <span className="text-gray-500 text-sm ml-2">· {fmtFullDate(selected.date)}</span>
              </div>
            </div>
            {openUrl && (
              <a
                href={openUrl}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90"
                style={{ backgroundColor: '#FF6B00' }}
              >
                Open / Print
              </a>
            )}
          </div>

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
        <main className="max-w-7xl mx-auto w-full px-6 py-10">
          <div className="mb-8">
            <h2 className="text-white text-4xl font-bold">Distro / Taproom Orders</h2>
            <p className="text-gray-400 mt-2">Outgoing invoices — click any order to view</p>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-sm mb-6">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-gray-500 text-sm">Loading orders…</div>
          ) : (
            <div className="space-y-8">
              {[0, 1].map(week => (
                <div key={week}>
                  <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
                    {week === 0 ? 'This Week' : 'Next Week'}
                  </h3>
                  <div className="grid grid-cols-5 gap-4">
                    {days.slice(week * 5, week * 5 + 5).map(day => {
                      const key       = toDateKey(day);
                      const dayOrders = ordersByDay[key] || [];
                      const isToday   = key === todayKey;

                      return (
                        <div
                          key={key}
                          className={`rounded-xl border p-3 min-h-32 ${
                            isToday
                              ? 'border-orange-500 bg-orange-500/5'
                              : 'border-gray-700 bg-gray-800'
                          }`}
                        >
                          <div className={`text-xs font-semibold mb-2.5 ${isToday ? 'text-orange-400' : 'text-gray-400'}`}>
                            {fmtDay(day)}
                            {isToday && <span className="ml-1" style={{ color: '#FF6B00' }}>●</span>}
                          </div>
                          <div className="space-y-1.5">
                            {dayOrders.length === 0 ? (
                              <p className="text-gray-700 text-xs">—</p>
                            ) : (
                              dayOrders.map((o, i) => (
                                <OrderCard
                                  key={i}
                                  order={o}
                                  onClick={o.tentative ? undefined : () => setSelected(o)}
                                />
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
    </div>
  );
}
