import { useState, useEffect, Fragment } from 'react';
import {
  Beer, Truck, Camera, Tag, FolderOpen, ScrollText, ListChecks,
  Wine, UtensilsCrossed, ClipboardCheck, TrendingUp, CalendarDays,
  UserX, Package, Users, Wrench, Coffee, CalendarCheck, BookOpen, FlaskConical, Globe, Martini,
  Menu, X, Megaphone,
} from 'lucide-react';

const API = process.env.REACT_APP_API_URL || '';

// Slack HTML-encodes &, <, > in message text — decode them before rendering.
function decodeSlackEntities(s) {
  return String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

// Convert Slack mrkdwn to React nodes. Handles <url|text>, <url>, <@USER>,
// *bold*, _italic_, `code`, and preserves newlines.
function renderSlackText(raw) {
  if (!raw) return null;
  const tokenRe = /<([^<>|]+)(?:\|([^<>]+))?>|\*([^*\n]+)\*|_([^_\n]+)_|`([^`\n]+)`/g;
  const lines = raw.split('\n');
  return lines.map((line, li) => {
    const parts = [];
    let last = 0;
    let m;
    while ((m = tokenRe.exec(line)) !== null) {
      if (m.index > last) parts.push(decodeSlackEntities(line.slice(last, m.index)));
      const [full, url, urlText, bold, italic, code] = m;
      if (url) {
        const label = decodeSlackEntities(urlText || url);
        if (url.startsWith('@')) {
          parts.push(<span key={`u${li}-${m.index}`} className="text-orange-400">@{decodeSlackEntities(urlText || url.slice(1))}</span>);
        } else if (url.startsWith('#')) {
          parts.push(<span key={`c${li}-${m.index}`} className="text-orange-400">#{decodeSlackEntities(urlText || url.slice(1))}</span>);
        } else {
          parts.push(
            <a key={`a${li}-${m.index}`} href={url} target="_blank" rel="noopener noreferrer"
              className="underline hover:text-white" style={{ color: '#F05A28' }}>
              {label}
            </a>
          );
        }
      } else if (bold) {
        parts.push(<strong key={`b${li}-${m.index}`} className="text-white">{decodeSlackEntities(bold)}</strong>);
      } else if (italic) {
        parts.push(<em key={`i${li}-${m.index}`}>{decodeSlackEntities(italic)}</em>);
      } else if (code) {
        parts.push(<code key={`k${li}-${m.index}`} className="bg-gray-700 px-1 py-0.5 rounded text-xs">{decodeSlackEntities(code)}</code>);
      } else {
        parts.push(decodeSlackEntities(full));
      }
      last = m.index + full.length;
    }
    if (last < line.length) parts.push(decodeSlackEntities(line.slice(last)));
    return (
      <Fragment key={li}>
        {parts}
        {li < lines.length - 1 && <br />}
      </Fragment>
    );
  });
}

function fmtRelative(ts) {
  if (!ts) return '';
  const now = Date.now();
  const diff = now - ts;
  const min = 60 * 1000, hr = 60 * min, day = 24 * hr;
  if (diff < min) return 'just now';
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function WeeklyUpdateCard() {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    fetch(`${API}/api/slack/weekly-update`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        if (!d.configured) return setState({ status: 'hidden' });
        if (!d.found) return setState({ status: 'empty' });
        setState({ status: 'ready', data: d });
      })
      .catch(() => setState({ status: 'hidden' }));
  }, []);

  if (state.status === 'loading' || state.status === 'hidden') return null;

  return (
    <div className="mb-6 bg-gray-800 border border-gray-700 rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <Megaphone size={18} style={{ color: '#F05A28' }} />
        <h3 className="text-white font-semibold text-sm uppercase tracking-wider">Weekly Update</h3>
        {state.status === 'ready' && (
          <span className="text-gray-500 text-xs ml-auto">
            {state.data.author ? `${state.data.author} · ` : ''}{fmtRelative(state.data.ts)}
          </span>
        )}
      </div>
      {state.status === 'empty' ? (
        <p className="text-gray-500 text-sm">No weekly update posted yet.</p>
      ) : (
        <div className="text-gray-300 text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words">
          {renderSlackText(state.data.text)}
        </div>
      )}
      {state.status === 'ready' && state.data.permalink && (
        <a href={state.data.permalink} target="_blank" rel="noopener noreferrer"
          className="inline-block mt-4 text-xs font-medium hover:underline" style={{ color: '#F05A28' }}>
          Open in Slack →
        </a>
      )}
    </div>
  );
}

// page: internal route | url: from DB (external) | null: not yet built → shows Coming Soon
const TOOL_META = {
  'taproom-inventory':     { Icon: Beer,            description: 'Manage keg and product inventory across all taprooms',    page: 'taproom-inventory' },
  'distro-taproom-orders': { Icon: Truck,           description: 'Manage distro and taproom order requests',                page: 'distro-taproom-orders' },
  'production-photos':     { Icon: Camera,          description: 'View and upload outgoing distro order photos',            page: 'production-photos' },
  'label-inventory':       { Icon: Tag,             description: 'Track label stock and usage',                             page: 'label-inventory' },
  'hr-documents':          { Icon: FolderOpen,      description: 'Access forms and employee documents',                     page: 'hr-documents' },
  'sops':                  { Icon: ScrollText,      description: 'Standard operating procedures and reference documents',   page: 'sops' },
  'checklists':            { Icon: ListChecks,      description: 'Run and track operational checklists',                    page: 'checklists' },
  'cocktail-keeper':       { Icon: Wine,            description: 'Browse and manage cocktail recipes',                      page: 'cocktail-keeper' },
  'recipes':               { Icon: UtensilsCrossed, description: 'Browse and search kitchen recipes',                       page: 'recipes' },
  'taproom-inspections':   { Icon: ClipboardCheck,  description: 'Conduct and review taproom quality inspections',          page: 'taproom-inspections' },
  'sales-crm':             { Icon: TrendingUp,      description: 'Manage distributor and account relationships',            page: 'sales-crm' },
  'production-schedule':   { Icon: CalendarDays,    description: 'Brewery production planning and task tracking',           page: 'production-schedule' },
  '86ed-customers':        { Icon: UserX,           description: 'Track customers removed from our locations',              page: '86ed-customers' },
  'packaging-log':         { Icon: Package,         description: 'Log kegs and cases packaged from each beer',              page: 'packaging-log' },
  'coffee-keeper':         { Icon: Coffee,          description: 'Browse and manage coffee drink recipes',                  page: 'coffee-keeper' },
  'production-weekly':     { Icon: CalendarCheck,   description: 'Weekly brew and packaging task board',                     page: 'production-weekly' },
  'equipment-manuals':     { Icon: BookOpen,        description: 'Browse and download equipment manuals and documentation',   page: 'equipment-manuals' },
  'tank-maintenance':      { Icon: Wrench,          description: 'Track recurring maintenance tasks per tank',                  page: 'tank-maintenance' },
  'distillery-inventory':  { Icon: FlaskConical,    description: 'Track distillery product inventory and order requests',        page: 'distillery-inventory' },
  'coffee-site':           { Icon: Globe,           description: 'Manage featured bags and content for the coffee website',        page: 'coffee-site' },
  'spirits-ordering':      { Icon: Martini,         description: 'Weekly spirits inventory counts and order requests to the distillery', page: 'spirits-ordering' },
  'user-management':       { Icon: Users,           description: 'Manage user accounts and roles',                          page: 'usermanagement' },
};

const DEFAULT_META = { Icon: Wrench, description: '', page: null };

function NavList({ tools, onNavigate, onClose }) {
  return (
    <nav className="flex-1 overflow-y-auto py-3">
      {tools.map((tool) => {
        const meta = TOOL_META[tool.slug] || DEFAULT_META;
        const { Icon } = meta;
        const isLive = !!(tool.url || meta.page);

        const handleClick = isLive
          ? tool.url
            ? () => { window.open(tool.url, '_blank', 'noopener,noreferrer'); onClose?.(); }
            : () => { onNavigate(meta.page, { canUpload: tool.has_upload_permission }); onClose?.(); }
          : undefined;

        return (
          <button
            key={tool.id}
            onClick={handleClick}
            disabled={!isLive}
            className={`w-full flex items-center gap-3 px-5 py-3 sm:py-2.5 text-left transition group ${
              isLive
                ? 'text-gray-300 hover:bg-gray-700 hover:text-white active:bg-gray-700 cursor-pointer'
                : 'text-gray-500 cursor-default'
            }`}
            title={meta.description || tool.description || ''}
          >
            <Icon
              size={20}
              className="shrink-0 transition"
              style={{ color: isLive ? '#F05A28' : '#636363' }}
            />
            <span className="text-sm font-medium truncate flex-1">{tool.name}</span>
            {!isLive && (
              <span
                className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded text-white"
                style={{ backgroundColor: '#F05A28' }}
              >
                SOON
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function Dashboard({ user, onLogout, onNavigate }) {
  const [tools, setTools] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL || ''}/api/my-tools`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setTools(Array.isArray(data) ? data : []));
  }, []);

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    if (drawerOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [drawerOpen]);

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="min-h-screen bg-gray-900 flex">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden sm:flex w-64 shrink-0 bg-gray-800 border-r border-gray-700 flex-col min-h-screen sticky top-0 self-start max-h-screen">
        <div className="px-5 py-5 border-b border-gray-700 flex items-center gap-2">
          <span className="text-xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-lg">HQ</span>
        </div>

        <NavList tools={tools} onNavigate={onNavigate} />

        <div className="px-5 py-4 border-t border-gray-700">
          <div className="text-gray-400 text-xs mb-2 truncate">Welcome, {user.name}</div>
          <button
            onClick={onLogout}
            className="text-sm text-gray-400 hover:text-white transition"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header className="sm:hidden bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
            <span className="text-cream font-semibold text-lg">HQ</span>
          </div>
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="text-gray-300 hover:text-white p-2 -mr-2"
          >
            <Menu size={24} />
          </button>
        </header>

        <main className="flex-1 px-4 sm:px-6 py-8 sm:py-10">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-cream text-3xl sm:text-4xl font-bold mb-2">Dashboard</h2>
            <p className="text-gray-400 text-sm sm:text-base mb-6">
              <span className="sm:hidden">Tap the menu to pick a tool.</span>
              <span className="hidden sm:inline">Select a tool from the sidebar to get started.</span>
            </p>
            <WeeklyUpdateCard />
          </div>
        </main>
      </div>

      {/* ── Mobile drawer ── */}
      {drawerOpen && (
        <div className="sm:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={closeDrawer}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] bg-gray-800 border-r border-gray-700 flex flex-col h-full shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
                <span className="text-cream font-semibold text-lg">HQ</span>
              </div>
              <button
                onClick={closeDrawer}
                aria-label="Close menu"
                className="text-gray-400 hover:text-white p-1 -mr-1"
              >
                <X size={22} />
              </button>
            </div>

            <NavList tools={tools} onNavigate={onNavigate} onClose={closeDrawer} />

            <div className="px-5 py-4 border-t border-gray-700">
              <div className="text-gray-400 text-xs mb-2 truncate">Welcome, {user.name}</div>
              <button
                onClick={() => { closeDrawer(); onLogout(); }}
                className="text-sm text-gray-400 hover:text-white transition"
              >
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
