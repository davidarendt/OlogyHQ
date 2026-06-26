import { useState, useEffect } from 'react';
import {
  Beer, Truck, Camera, Tag, FolderOpen, ScrollText, ListChecks,
  Wine, UtensilsCrossed, ClipboardCheck, TrendingUp, CalendarDays,
  UserX, Package, Users, Wrench, Coffee, CalendarCheck, BookOpen, FlaskConical, Globe,
} from 'lucide-react';

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
  'user-management':       { Icon: Users,           description: 'Manage user accounts and roles',                          page: 'usermanagement' },
};

const DEFAULT_META = { Icon: Wrench, description: '', page: null };

function Dashboard({ user, onLogout, onNavigate }) {
  const [tools, setTools] = useState([]);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL || ''}/api/my-tools`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setTools(Array.isArray(data) ? data : []));
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 flex">
      {/* Sidebar Nav */}
      <aside className="w-64 shrink-0 bg-gray-800 border-r border-gray-700 flex flex-col min-h-screen sticky top-0 self-start max-h-screen">
        <div className="px-5 py-5 border-b border-gray-700 flex items-center gap-2">
          <span className="text-xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-lg">HQ</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {tools.map((tool) => {
            const meta = TOOL_META[tool.slug] || DEFAULT_META;
            const { Icon } = meta;
            const isLive = !!(tool.url || meta.page);

            const handleClick = isLive
              ? tool.url
                ? () => window.open(tool.url, '_blank', 'noopener,noreferrer')
                : () => onNavigate(meta.page, { canUpload: tool.has_upload_permission })
              : undefined;

            return (
              <button
                key={tool.id}
                onClick={handleClick}
                disabled={!isLive}
                className={`w-full flex items-center gap-3 px-5 py-2.5 text-left transition group ${
                  isLive
                    ? 'text-gray-300 hover:bg-gray-700 hover:text-white cursor-pointer'
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

      {/* Main Content */}
      <main className="flex-1 px-6 py-10">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-cream text-4xl font-bold mb-2">Dashboard</h2>
          <p className="text-gray-400">Select a tool from the sidebar to get started.</p>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
