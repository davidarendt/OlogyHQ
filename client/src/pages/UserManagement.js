import { useState, useEffect } from 'react';

const API = process.env.REACT_APP_API_URL || '';
const ROLES = [
  { value: 'admin',          label: 'Admin' },
  { value: 'bar_manager',    label: 'Bar Manager' },
  { value: 'bartender',      label: 'Bartender' },
  { value: 'barista',        label: 'Barista' },
  { value: 'coffee_manager', label: 'Coffee Manager' },
  { value: 'production',     label: 'Production' },
  { value: 'sales',          label: 'Sales' },
  { value: 'hr',             label: 'HR' },
];

function UserManagement({ user, onBack, onNavigate }) {
  const [users, setUsers]           = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser]       = useState({ name: '', email: '', role: 'bartender' });
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');
  const [resending, setResending]   = useState(null);

  const fetchUsers = async () => {
    const res = await fetch(`${API}/api/users`, { credentials: 'include' });
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleAddUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
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
      setNewUser({ name: '', email: '', role: 'bartender' });
      setShowAddForm(false);
      fetchUsers();
    } catch {
      setError('Could not connect to server');
    }
  };

  const handleRoleChange = async (id, role) => {
    await fetch(`${API}/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ role }),
    });
    fetchUsers();
  };

  const handleResendInvite = async (id, name) => {
    setResending(id);
    try {
      const res = await fetch(`${API}/api/users/${id}/resend-invite`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) setSuccess(`Invite resent to ${name}.`);
      else setError(data.message);
    } catch {
      setError('Could not connect to server');
    } finally {
      setResending(null);
    }
  };

  const handleDelete = async (id, name) => {
    if (id === user.id) { setError("You can't delete your own account!"); return; }
    if (!window.confirm(`Are you sure you want to delete ${name}?`)) return;
    const res = await fetch(`${API}/api/users/${id}`, { method: 'DELETE', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) { setError(data.message); return; }
    setSuccess(`${name} has been removed.`);
    fetchUsers();
  };

  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
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

        {error && <div className="bg-red-500/20 border border-red-500/40 text-red-300 p-3 rounded mb-4 text-sm">{error}</div>}
        {success && <div className="bg-green-500/20 border border-green-500/40 text-green-300 p-3 rounded mb-4 text-sm">{success}</div>}

        <div className="mb-6 flex gap-3">
          <button
            onClick={() => { setShowAddForm(!showAddForm); setError(''); setSuccess(''); }}
            className="px-4 py-2 rounded font-semibold text-white transition"
            style={{ backgroundColor: '#F05A28' }}
          >
            {showAddForm ? 'Cancel' : '+ Invite New User'}
          </button>
          <button
            onClick={() => onNavigate('permissions')}
            className="px-4 py-2 rounded font-semibold text-white bg-gray-700 hover:bg-gray-600 transition"
          >
            Manage Role Permissions
          </button>
        </div>

        {showAddForm && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-6">
            <h3 className="text-white font-semibold text-lg mb-1">Invite New User</h3>
            <p className="text-gray-400 text-sm mb-4">They'll receive an email to set their own password.</p>
            <form onSubmit={handleAddUser} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-gray-400 text-sm mb-1">Name</label>
                <input
                  className="w-full bg-gray-700 text-white p-3 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1">Email</label>
                <input
                  type="email"
                  className="w-full bg-gray-700 text-white p-3 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1">Role</label>
                <select
                  className="w-full bg-gray-700 text-white p-3 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="sm:col-span-3">
                <button
                  type="submit"
                  className="px-6 py-2 rounded font-semibold text-white transition"
                  style={{ backgroundColor: '#F05A28' }}
                >
                  Send Invite
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-gray-400 text-sm px-6 py-4">Name</th>
                <th className="text-left text-gray-400 text-sm px-6 py-4">Email</th>
                <th className="text-left text-gray-400 text-sm px-6 py-4">Role</th>
                <th className="text-left text-gray-400 text-sm px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-700 last:border-0">
                  <td className="text-white px-6 py-4">
                    <div>{u.name}</div>
                    {u.invite_pending && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                        Invite Pending
                      </span>
                    )}
                  </td>
                  <td className="text-gray-400 px-6 py-4">{u.email}</td>
                  <td className="px-6 py-4">
                    <select
                      className="bg-gray-700 text-white text-sm p-1 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    >
                      {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {u.invite_pending && (
                        <button
                          onClick={() => handleResendInvite(u.id, u.name)}
                          disabled={resending === u.id}
                          className="text-yellow-400 hover:text-yellow-300 text-sm transition disabled:opacity-50"
                        >
                          {resending === u.id ? 'Sending…' : 'Resend Invite'}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(u.id, u.name)}
                        className="text-red-400 hover:text-red-300 text-sm transition"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

export default UserManagement;
