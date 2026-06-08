import { useState, useEffect } from 'react';
import {
  Beer, Truck, Camera, Tag, FolderOpen, ScrollText, ListChecks,
  Wine, UtensilsCrossed, ClipboardCheck, TrendingUp, CalendarDays,
  UserX, Package, Users, Wrench, Coffee, CalendarCheck,
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
    <div className="min-h-screen bg-gray-900">
      {/* Top Nav */}
      <nav className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <button onClick={() => {}} className="flex items-center gap-3 cursor-default">
          <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-xl">HQ</span>
        </button>
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm hidden sm:inline">Welcome, {user.name}</span>
          <button onClick={onLogout} className="text-sm text-gray-400 hover:text-white transition">
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8 text-center">
          <h2 className="text-cream text-4xl font-bold">Dashboard</h2>
        </div>

        {/* Tool Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
              <div
                key={tool.id}
                onClick={handleClick}
                className={`relative bg-gray-800 rounded-xl p-6 border border-gray-700 transition group overflow-hidden ${
                  isLive ? 'hover:border-orange-500 cursor-pointer' : 'cursor-default opacity-75'
                }`}
              >
                <Icon
                  size={40}
                  className="mb-4 transition group-hover:text-orange-400"
                  style={{ color: '#F05A28' }}
                />
                <h3 className={`font-semibold text-lg transition ${isLive ? 'text-white group-hover:text-orange-400' : 'text-white'}`}>
                  {tool.name}
                </h3>
                <p className="text-gray-400 text-sm mt-2">{meta.description || tool.description || ''}</p>

                {/* Coming Soon ribbon */}
                {!isLive && (
                  <div
                    className="absolute top-4 right-[-28px] rotate-45 text-xs font-bold tracking-widest px-10 py-1 text-white"
                    style={{ backgroundColor: '#F05A28' }}
                  >
                    SOON
                  </div>
                )}
              </div>
            );
          })}

        </div>
      </main>
    </div>
  );
}

export default Dashboard;
