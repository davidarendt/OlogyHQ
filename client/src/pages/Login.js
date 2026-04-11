import { useState, useEffect } from 'react';

const API = process.env.REACT_APP_API_URL || '';

function Login({ onLogin }) {
  const [view, setView] = useState('login'); // 'login' | 'forgot' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset');
    if (token) {
      setResetToken(token);
      setView('reset');
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message); return; }
      onLogin(data.user);
    } catch {
      setError('Could not connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setMessage(data.message);
    } catch {
      setError('Could not connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message); return; }
      setMessage(data.message);
      setView('login');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setError('Could not connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-md">

        <h1 className="text-3xl font-bold text-white mb-2 text-center">OlogyHQ</h1>
        <p className="text-gray-400 text-center mb-6">
          {view === 'login' && 'Sign in to your account'}
          {view === 'forgot' && 'Reset your password'}
          {view === 'reset' && 'Set a new password'}
        </p>

        {error && (
          <div className="bg-red-500/20 border border-red-500/40 text-red-300 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}
        {message && (
          <div className="bg-green-500/20 border border-green-500/40 text-green-300 p-3 rounded mb-4 text-sm">
            {message}
          </div>
        )}

        {view === 'login' && (
          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label className="block text-gray-400 text-sm mb-1">Email</label>
              <input
                type="email"
                className="w-full bg-gray-700 text-white p-3 rounded focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': '#FF6B00' }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="mb-2">
              <label className="block text-gray-400 text-sm mb-1">Password</label>
              <input
                type="password"
                className="w-full bg-gray-700 text-white p-3 rounded focus:outline-none focus:ring-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="mb-6 text-right">
              <button
                type="button"
                onClick={() => { setView('forgot'); setError(''); setMessage(''); }}
                className="text-sm text-gray-400 hover:text-white transition"
              >
                Forgot password?
              </button>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full text-white font-bold p-3 rounded transition disabled:opacity-50"
              style={{ backgroundColor: '#FF6B00' }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}

        {view === 'forgot' && (
          <form onSubmit={handleForgot}>
            <p className="text-gray-400 text-sm mb-4">
              Enter your email and we'll send you a link to reset your password.
            </p>
            <div className="mb-6">
              <label className="block text-gray-400 text-sm mb-1">Email</label>
              <input
                type="email"
                className="w-full bg-gray-700 text-white p-3 rounded focus:outline-none focus:ring-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading || !!message}
              className="w-full text-white font-bold p-3 rounded transition disabled:opacity-50 mb-3"
              style={{ backgroundColor: '#FF6B00' }}
            >
              {loading ? 'Sending…' : 'Send Reset Link'}
            </button>
            <button
              type="button"
              onClick={() => { setView('login'); setError(''); setMessage(''); }}
              className="w-full text-gray-400 hover:text-white text-sm transition"
            >
              ← Back to Sign In
            </button>
          </form>
        )}

        {view === 'reset' && (
          <form onSubmit={handleReset}>
            <div className="mb-4">
              <label className="block text-gray-400 text-sm mb-1">New Password</label>
              <input
                type="password"
                className="w-full bg-gray-700 text-white p-3 rounded focus:outline-none focus:ring-2"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <div className="mb-6">
              <label className="block text-gray-400 text-sm mb-1">Confirm Password</label>
              <input
                type="password"
                className="w-full bg-gray-700 text-white p-3 rounded focus:outline-none focus:ring-2"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full text-white font-bold p-3 rounded transition disabled:opacity-50"
              style={{ backgroundColor: '#FF6B00' }}
            >
              {loading ? 'Updating…' : 'Set New Password'}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}

export default Login;
