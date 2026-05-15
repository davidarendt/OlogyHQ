import { useState, useEffect } from 'react';

const API = process.env.REACT_APP_API_URL || '';
const ROLES = [
  { value: 'admin',           label: 'Admin' },
  { value: 'bar_manager',     label: 'Bar Manager' },
  { value: 'bartender',       label: 'Bartender' },
  { value: 'barista',         label: 'Barista' },
  { value: 'coffee_manager',  label: 'Coffee Manager' },
  { value: 'production',      label: 'Production' },
  { value: 'sales',           label: 'Sales' },
  { value: 'hr',              label: 'HR' },
  { value: 'kitchen_manager', label: 'Kitchen Manager' },
  { value: 'cook',            label: 'Cook' },
];

const ROLE_LABEL = Object.fromEntries(ROLES.map(r => [r.value, r.label]));

const inputCls = 'w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 border border-gray-600';
const labelCls = 'block text-gray-400 text-sm mb-1.5';

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditUserModal({ u, onClose, onSaved }) {
  const [form, setForm] = useState({ name: u.name, email: u.email });
  const [selectedRoles, setSelectedRoles] = useState(u.roles || [u.role]);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const toggleRole = (roleValue) => {
    setSelectedRoles(prev =>
      prev.includes(roleValue) ? prev.filter(r => r !== roleValue) : [...prev, roleValue]
    );
  };

  const handleSave = async () => {
    if (!form.name.trim())  { setError('Name is required.'); return; }
    if (!form.email.trim()) { setError('Email is required.'); return; }
    if (selectedRoles.length === 0) { setError('At least one role is required.'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`${API}/api/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: form.name.trim(), email: form.email.trim(), roles: selectedRoles }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'Save failed.'); setSaving(false); return; }
      onSaved(`${data.name} updated.`);
      onClose();
    } catch {
      setError('Could not connect to server.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold text-lg">Edit User</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-sm">{error}</div>
        )}

        <div>
          <label className={labelCls}>Name</label>
          <input className={inputCls} value={form.name} onChange={set('name')} />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input type="email" className={inputCls} value={form.email} onChange={set('email')} />
        </div>
        <div>
          <label className={labelCls}>Roles</label>
          <div className="flex flex-wrap gap-2">
            {ROLES.map(r => (
              <button
                key={r.value}
                type="button"
                onClick={() => toggleRole(r.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                  selectedRoles.includes(r.value)
                    ? 'text-white border-orange-500'
                    : 'text-gray-400 border-gray-600 hover:border-gray-500'
                }`}
                style={selectedRoles.includes(r.value) ? { backgroundColor: '#F05A28' } : {}}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-600 text-gray-300 text-sm hover:bg-gray-700 transition">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition disabled:opacity-50"
            style={{ backgroundColor: '#F05A28' }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function UserManagement({ user, onBack, onNavigate }) {
  const [users, setUsers]         = useState([]);
  const [showAddForm, setShowAdd] = useState(false);
  const [newUser, setNewUser]     = useState({ name: '', email: '', roles: ['bartender'] });
  const [editingUser, setEditing] = useState(null);
  const [resending, setResending] = useState(null);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [search, setSearch]       = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const fetchUsers = async () => {
    const res = await fetch(`${API}/api/users`, { credentials: 'include' });
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleAddUser = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      const res = await fetch(`${API}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message); return; }
      setSuccess(`Invite sent to ${data.name}!`);
      setNewUser({ name: '', email: '', roles: ['bartender'] });
      setShowAdd(false);
      fetchUsers();
    } catch { setError('Could not connect to server'); }
  };

  const handleResendInvite = async (id, name) => {
    setResending(id);
    try {
      const res = await fetch(`${API}/api/users/${id}/resend-invite`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (res.ok) setSuccess(`Invite resent to ${name}.`);
      else setError(data.message);
    } catch { setError('Could not connect to server'); }
    finally { setResending(null); }
  };

  const handleDelete = async (id, name) => {
    if (id === user.id) { setError("You can't delete your own account!"); return; }
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    const res = await fetch(`${API}/api/users/${id}`, { method: 'DELETE', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) { setError(data.message); return; }
    setSuccess(`${name} has been removed.`);
    fetchUsers();
  };

  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition">
          <span className="text-2xl font-bold" style={{ color: '#F05A28' }}>OLOGY</span>
          <span className="text-cream font-semibold text-xl">HQ</span>
        </button>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition">
          ← Back to Dashboard
        </button>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8 text-center">
          <h2 className="text-cream text-4xl font-bold">User Management</h2>
        </div>

        {error   && <div className="bg-red-500/20 border border-red-500/40 text-red-300 p-3 rounded-lg mb-4 text-sm">{error}</div>}
        {success && <div className="bg-green-500/20 border border-green-500/40 text-green-300 p-3 rounded-lg mb-4 text-sm">{success}</div>}

        <div className="mb-6 flex gap-3">
          <button
            onClick={() => { setShowAdd(!showAddForm); setError(''); setSuccess(''); }}
            className="px-4 py-2 rounded-lg font-semibold text-white transition"
            style={{ backgroundColor: '#F05A28' }}
          >
            {showAddForm ? 'Cancel' : '+ Invite New User'}
          </button>
          <button
            onClick={() => onNavigate('permissions')}
            className="px-4 py-2 rounded-lg font-semibold text-white bg-gray-700 hover:bg-gray-600 transition"
          >
            Manage Role Permissions
          </button>
        </div>

        {/* Invite form */}
        {showAddForm && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-6">
            <h3 className="text-white font-semibold text-lg mb-1">Invite New User</h3>
            <p className="text-gray-400 text-sm mb-4">They'll receive an email to set their own password.</p>
            <form onSubmit={handleAddUser} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Name</label>
                <input className={inputCls} value={newUser.name}
                  onChange={e => setNewUser({ ...newUser, name: e.target.value })} required />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" className={inputCls} value={newUser.email}
                  onChange={e => setNewUser({ ...newUser, email: e.target.value })} required />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Roles</label>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map(r => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setNewUser(u => ({
                        ...u,
                        roles: u.roles.includes(r.value) ? u.roles.filter(x => x !== r.value) : [...u.roles, r.value]
                      }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                        newUser.roles.includes(r.value)
                          ? 'text-white border-orange-500'
                          : 'text-gray-400 border-gray-600 hover:border-gray-500'
                      }`}
                      style={newUser.roles.includes(r.value) ? { backgroundColor: '#F05A28' } : {}}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <button type="submit" className="px-6 py-2.5 rounded-lg font-semibold text-white transition"
                  style={{ backgroundColor: '#F05A28' }}>
                  Send Invite
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Search + filter */}
        {users.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full bg-gray-800 border border-gray-700 text-white pl-9 pr-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <select
              value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
              <option value="all">All Roles</option>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        )}

        {/* Users table */}
        {(() => {
          const q = search.trim().toLowerCase();
          const filtered = users.filter(u => {
            const matchesSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
            const matchesRole   = roleFilter === 'all' || u.role === roleFilter;
            return matchesSearch && matchesRole;
          });
          return (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-500 text-sm">
              {users.length === 0 ? 'No users yet.' : 'No users match your search.'}
            </div>
          ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">
                  Name
                  <span className="ml-2 font-normal normal-case text-gray-600">
                    {filtered.length !== users.length ? `${filtered.length} of ${users.length}` : users.length}
                  </span>
                </th>
                <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4 hidden sm:table-cell">Email</th>
                <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-6 py-4">Role</th>
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/20 transition">
                  <td className="px-6 py-4">
                    <div className="text-white text-sm font-medium">{u.name}</div>
                    {u.invite_pending && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 mt-0.5 inline-block">
                        Invite Pending
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-400 text-sm hidden sm:table-cell">{u.email}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {(u.roles || [u.role]).map(r => (
                        <span key={r} className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 border border-gray-600">
                          {ROLE_LABEL[r] || r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3 justify-end">
                      <button onClick={() => { setError(''); setSuccess(''); setEditing(u); }}
                        className="text-sm text-orange-400 hover:text-orange-300 transition">
                        Edit
                      </button>
                      {u.invite_pending && (
                        <button
                          onClick={() => handleResendInvite(u.id, u.name)}
                          disabled={resending === u.id}
                          className="text-sm text-yellow-400 hover:text-yellow-300 transition disabled:opacity-50">
                          {resending === u.id ? 'Sending…' : 'Resend Invite'}
                        </button>
                      )}
                      <button onClick={() => handleDelete(u.id, u.name)}
                        className="text-sm text-red-400 hover:text-red-300 transition">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
          );
        })()}
      </main>

      {editingUser && (
        <EditUserModal
          u={editingUser}
          onClose={() => setEditing(null)}
          onSaved={msg => { setSuccess(msg); fetchUsers(); }}
        />
      )}
    </div>
  );
}

export default UserManagement;
