import { useState, useEffect } from 'react';

// page: internal route | url: from DB (external) | null: not yet built → shows Coming Soon
const TOOL_META = {
  'taproom-inventory':   { icon: '🍺', description: 'Manage keg and product inventory across all taprooms', page: 'taproom-inventory' },
  'distro-taproom-orders': { image: '/icons/keg.png', description: 'Manage distro and taproom order requests', page: 'distro-taproom-orders' },
  'production-photos':   { icon: '📸', description: 'View and upload outgoing distro order photos',        page: 'production-photos' },
  'label-inventory':     { image: '/icons/label.png', description: 'Track label stock and usage',          page: 'label-inventory' },
  'hr-documents':        { icon: '🗂️', description: 'Access forms and employee documents',                 page: 'hr-documents' },
  'sops':                { icon: '📋', description: 'Standard operating procedures',                       page: 'sops' },
  'checklists':          { icon: '✔️', description: 'Run and track operational checklists',                 page: 'checklists' },
  'cocktail-keeper':     { icon: '🍹', description: 'Browse and manage cocktail recipes',                  page: 'cocktail-keeper' },
  'recipes':             { image: '/icons/recipes.svg', description: 'Browse and search kitchen recipes',   page: 'recipes' },
  'taproom-inspections': { icon: '✅', description: 'Conduct and review taproom quality inspections',      page: 'taproom-inspections' },
  'sales-crm':           { icon: '📊', description: 'Manage distributor and account relationships',         page: 'sales-crm' },
  'production-schedule': { icon: '🗓️', description: 'Brewery production planning and task tracking',        page: 'production-schedule' },
  'user-management':     { icon: '👥', description: 'Manage user accounts and roles',                      page: 'usermanagement' },
};

const DEFAULT_META = { icon: '🔧', description: '', page: null };

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
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <button onClick={() => {}} className="flex items-center gap-3 cursor-default">
          <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-xl">HQ</span>
        </button>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">Welcome, {user.name}</span>
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
                {meta.image
                  ? <img src={meta.image} alt="" className="w-16 h-16 object-contain mb-4" />
                  : <div className="text-4xl mb-4">{meta.icon}</div>
                }
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
