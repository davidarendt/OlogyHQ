import { useState, useEffect } from 'react';

const ROLES = ['admin', 'bar_manager', 'bartender', 'barista', 'coffee_manager', 'production', 'sales', 'hr', 'kitchen_manager', 'cook'];

function Toggle({ active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-8 h-5 rounded-full transition-colors duration-200 relative ${active ? 'bg-orange-500' : 'bg-gray-600'}`}
    >
      <span className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-all duration-200 ${active ? 'left-4' : 'left-0.5'}`} />
    </button>
  );
}

function Permissions({ onBack, onHome }) {
  const [tools, setTools] = useState([]);
  const [permissions, setPermissions] = useState([]);

  const fetchData = async () => {
    const [toolsRes, permsRes] = await Promise.all([
      fetch(`${process.env.REACT_APP_API_URL || ''}/api/tools`, { credentials: 'include' }),
      fetch(`${process.env.REACT_APP_API_URL || ''}/api/permissions`, { credentials: 'include' }),
    ]);
    setTools(await toolsRes.json());
    setPermissions(await permsRes.json());
  };

  useEffect(() => { fetchData(); }, []);

  const hasPermission = (role, tool_id, permission_level = 'view') =>
    permissions.some(p => p.role === role && p.tool_id === tool_id && p.permission_level === permission_level);

  const togglePermission = async (role, tool_id, permission_level = 'view') => {
    if (hasPermission(role, tool_id, permission_level)) {
      await fetch(`${process.env.REACT_APP_API_URL || ''}/api/permissions`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role, tool_id, permission_level }),
      });
    } else {
      await fetch(`${process.env.REACT_APP_API_URL || ''}/api/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role, tool_id, permission_level }),
      });
    }
    fetchData();
  };

  const hrTool        = tools.find(t => t.slug === 'hr-documents');
  const sopTool       = tools.find(t => t.slug === 'sops');
  const checklistTool = tools.find(t => t.slug === 'checklists');
  const taproomTool   = tools.find(t => t.slug === 'taproom-inventory');
  const recipesTool   = tools.find(t => t.slug === 'recipes');
  const cocktailTool  = tools.find(t => t.slug === 'cocktail-keeper');
  const crmTool       = tools.find(t => t.slug === 'sales-crm');
  const labelTool     = tools.find(t => t.slug === 'label-inventory');
  const prodSchedTool = tools.find(t => t.slug === 'production-schedule');
  const dualSlugs     = ['hr-documents', 'sops', 'checklists', 'taproom-inventory', 'recipes', 'cocktail-keeper', 'sales-crm', 'label-inventory', 'production-schedule'];
  const otherTools    = tools.filter(t => !dualSlugs.includes(t.slug));

  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <button onClick={onHome} className="flex items-center gap-3 hover:opacity-80 transition">
          <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-xl">HQ</span>
        </button>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition">
          ← Back to User Management
        </button>
      </nav>

      <main className="px-6 py-10">
        <div className="mb-8 text-center">
          <h2 className="text-cream text-4xl font-bold">Role Permissions</h2>
          <p className="text-gray-400 mt-2">Toggle which tools each role can access</p>
        </div>

        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-gray-400 text-sm px-3 py-3 min-w-[140px]">Tool</th>
                {ROLES.map((role) => (
                  <th key={role} className="text-gray-400 text-sm px-1 relative" style={{ height: '80px', minWidth: '34px' }}>
                    <div style={{
                      position: 'absolute',
                      bottom: '10px',
                      left: '50%',
                      transform: 'rotate(-45deg)',
                      transformOrigin: 'bottom left',
                      whiteSpace: 'nowrap',
                      fontSize: '0.75rem',
                    }} className="capitalize">
                      {role.replace(/_/g, ' ')}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Standard tools — single view toggle */}
              {otherTools.map((tool) => (
                <tr key={tool.id} className="border-b border-gray-700">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="text-white text-sm font-medium">{tool.name}</div>
                  </td>
                  {ROLES.map((role) => (
                    <td key={role} className="px-1 py-2 text-center">
                      <Toggle
                        active={hasPermission(role, tool.id, 'view')}
                        onClick={() => togglePermission(role, tool.id, 'view')}
                      />
                    </td>
                  ))}
                </tr>
              ))}

              {/* HR Documents — two rows: Access and Manage */}
              {hrTool && (
                <>
                  <tr className="border-b border-gray-700/50">
                    <td className="px-3 pt-3 pb-1 whitespace-nowrap">
                      <div className="text-white text-sm font-medium">HR Documents</div>
                      <div className="text-gray-500 text-xs mt-0.5">Access</div>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role} className="px-1 pt-3 pb-1 text-center">
                        <Toggle
                          active={hasPermission(role, hrTool.id, 'view')}
                          onClick={() => togglePermission(role, hrTool.id, 'view')}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-700">
                    <td className="px-3 pt-1 pb-3 whitespace-nowrap">
                      <div className="text-gray-500 text-xs">Manage</div>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role} className="px-1 pt-1 pb-3 text-center">
                        <Toggle
                          active={hasPermission(role, hrTool.id, 'upload')}
                          onClick={() => togglePermission(role, hrTool.id, 'upload')}
                        />
                      </td>
                    ))}
                  </tr>
                </>
              )}

              {/* Taproom Inventory — two rows: Access and Manage */}
              {taproomTool && (
                <>
                  <tr className="border-b border-gray-700/50">
                    <td className="px-3 pt-3 pb-1 whitespace-nowrap">
                      <div className="text-white text-sm font-medium">Taproom Inventory</div>
                      <div className="text-gray-500 text-xs mt-0.5">Access</div>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role} className="px-1 pt-3 pb-1 text-center">
                        <Toggle
                          active={hasPermission(role, taproomTool.id, 'view')}
                          onClick={() => togglePermission(role, taproomTool.id, 'view')}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-700">
                    <td className="px-3 pt-1 pb-3 whitespace-nowrap">
                      <div className="text-gray-500 text-xs">Manage</div>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role} className="px-1 pt-1 pb-3 text-center">
                        <Toggle
                          active={hasPermission(role, taproomTool.id, 'upload')}
                          onClick={() => togglePermission(role, taproomTool.id, 'upload')}
                        />
                      </td>
                    ))}
                  </tr>
                </>
              )}

              {/* Recipes — two rows: Access and Manage */}
              {recipesTool && (
                <>
                  <tr className="border-b border-gray-700/50">
                    <td className="px-3 pt-3 pb-1 whitespace-nowrap">
                      <div className="text-white text-sm font-medium">Recipes</div>
                      <div className="text-gray-500 text-xs mt-0.5">Access</div>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role} className="px-1 pt-3 pb-1 text-center">
                        <Toggle
                          active={hasPermission(role, recipesTool.id, 'view')}
                          onClick={() => togglePermission(role, recipesTool.id, 'view')}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-700">
                    <td className="px-3 pt-1 pb-3 whitespace-nowrap">
                      <div className="text-gray-500 text-xs">Manage</div>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role} className="px-1 pt-1 pb-3 text-center">
                        <Toggle
                          active={hasPermission(role, recipesTool.id, 'upload')}
                          onClick={() => togglePermission(role, recipesTool.id, 'upload')}
                        />
                      </td>
                    ))}
                  </tr>
                </>
              )}

              {/* Cocktail Keeper — two rows: Access and Manage */}
              {cocktailTool && (
                <>
                  <tr className="border-b border-gray-700/50">
                    <td className="px-3 pt-3 pb-1 whitespace-nowrap">
                      <div className="text-white text-sm font-medium">Cocktail Keeper</div>
                      <div className="text-gray-500 text-xs mt-0.5">Access</div>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role} className="px-1 pt-3 pb-1 text-center">
                        <Toggle
                          active={hasPermission(role, cocktailTool.id, 'view')}
                          onClick={() => togglePermission(role, cocktailTool.id, 'view')}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-700">
                    <td className="px-3 pt-1 pb-3 whitespace-nowrap">
                      <div className="text-gray-500 text-xs">Manage</div>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role} className="px-1 pt-1 pb-3 text-center">
                        <Toggle
                          active={hasPermission(role, cocktailTool.id, 'upload')}
                          onClick={() => togglePermission(role, cocktailTool.id, 'upload')}
                        />
                      </td>
                    ))}
                  </tr>
                </>
              )}

              {/* Label Inventory — two rows: Access and Manage */}
              {labelTool && (
                <>
                  <tr className="border-b border-gray-700/50">
                    <td className="px-3 pt-3 pb-1 whitespace-nowrap">
                      <div className="text-white text-sm font-medium">Label Inventory</div>
                      <div className="text-gray-500 text-xs mt-0.5">Access</div>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role} className="px-1 pt-3 pb-1 text-center">
                        <Toggle
                          active={hasPermission(role, labelTool.id, 'view')}
                          onClick={() => togglePermission(role, labelTool.id, 'view')}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-700">
                    <td className="px-3 pt-1 pb-3 whitespace-nowrap">
                      <div className="text-gray-500 text-xs">Manage</div>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role} className="px-1 pt-1 pb-3 text-center">
                        <Toggle
                          active={hasPermission(role, labelTool.id, 'upload')}
                          onClick={() => togglePermission(role, labelTool.id, 'upload')}
                        />
                      </td>
                    ))}
                  </tr>
                </>
              )}

              {/* Sales CRM — two rows: Access and Manage */}
              {crmTool && (
                <>
                  <tr className="border-b border-gray-700/50">
                    <td className="px-3 pt-3 pb-1 whitespace-nowrap">
                      <div className="text-white text-sm font-medium">Sales CRM</div>
                      <div className="text-gray-500 text-xs mt-0.5">Access</div>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role} className="px-1 pt-3 pb-1 text-center">
                        <Toggle
                          active={hasPermission(role, crmTool.id, 'view')}
                          onClick={() => togglePermission(role, crmTool.id, 'view')}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-700">
                    <td className="px-3 pt-1 pb-3 whitespace-nowrap">
                      <div className="text-gray-500 text-xs">Manage</div>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role} className="px-1 pt-1 pb-3 text-center">
                        <Toggle
                          active={hasPermission(role, crmTool.id, 'upload')}
                          onClick={() => togglePermission(role, crmTool.id, 'upload')}
                        />
                      </td>
                    ))}
                  </tr>
                </>
              )}

              {/* Production Schedule — two rows: Access and Manage */}
              {prodSchedTool && (
                <>
                  <tr className="border-b border-gray-700/50">
                    <td className="px-3 pt-3 pb-1 whitespace-nowrap">
                      <div className="text-white text-sm font-medium">Production Schedule</div>
                      <div className="text-gray-500 text-xs mt-0.5">Access</div>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role} className="px-1 pt-3 pb-1 text-center">
                        <Toggle
                          active={hasPermission(role, prodSchedTool.id, 'view')}
                          onClick={() => togglePermission(role, prodSchedTool.id, 'view')}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-700">
                    <td className="px-3 pt-1 pb-3 whitespace-nowrap">
                      <div className="text-gray-500 text-xs">Manage</div>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role} className="px-1 pt-1 pb-3 text-center">
                        <Toggle
                          active={hasPermission(role, prodSchedTool.id, 'upload')}
                          onClick={() => togglePermission(role, prodSchedTool.id, 'upload')}
                        />
                      </td>
                    ))}
                  </tr>
                </>
              )}

              {/* SOP & Procedures — two rows: Access and Manage */}
              {sopTool && (
                <>
                  <tr className="border-b border-gray-700/50">
                    <td className="px-3 pt-3 pb-1 whitespace-nowrap">
                      <div className="text-white text-sm font-medium">SOP & Procedures</div>
                      <div className="text-gray-500 text-xs mt-0.5">Access</div>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role} className="px-1 pt-3 pb-1 text-center">
                        <Toggle
                          active={hasPermission(role, sopTool.id, 'view')}
                          onClick={() => togglePermission(role, sopTool.id, 'view')}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-700">
                    <td className="px-3 pt-1 pb-3 whitespace-nowrap">
                      <div className="text-gray-500 text-xs">Manage</div>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role} className="px-1 pt-1 pb-3 text-center">
                        <Toggle
                          active={hasPermission(role, sopTool.id, 'upload')}
                          onClick={() => togglePermission(role, sopTool.id, 'upload')}
                        />
                      </td>
                    ))}
                  </tr>
                </>
              )}

              {/* Checklists — two rows: Access and Manage */}
              {checklistTool && (
                <>
                  <tr className="border-b border-gray-700/50">
                    <td className="px-3 pt-3 pb-1 whitespace-nowrap">
                      <div className="text-white text-sm font-medium">Checklists</div>
                      <div className="text-gray-500 text-xs mt-0.5">Access</div>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role} className="px-1 pt-3 pb-1 text-center">
                        <Toggle
                          active={hasPermission(role, checklistTool.id, 'view')}
                          onClick={() => togglePermission(role, checklistTool.id, 'view')}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-700">
                    <td className="px-3 pt-1 pb-3 whitespace-nowrap">
                      <div className="text-gray-500 text-xs">Manage</div>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role} className="px-1 pt-1 pb-3 text-center">
                        <Toggle
                          active={hasPermission(role, checklistTool.id, 'upload')}
                          onClick={() => togglePermission(role, checklistTool.id, 'upload')}
                        />
                      </td>
                    ))}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

export default Permissions;
