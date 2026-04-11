import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import UserManagement from './pages/UserManagement';
import Permissions from './pages/Permissions';
import HRDocuments from './pages/HRDocuments';
import ProductionPhotos from './pages/ProductionPhotos';
import DistroTaproomOrders from './pages/DistroTaproomOrders';
import SOPsChecklists from './pages/SOPsChecklists';
import LabelInventory from './pages/LabelInventory';
import TaproomInventory from './pages/TaproomInventory';

function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [pageProps, setPageProps] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:5000/api/me', { credentials: 'include' })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data) setUser(data); })
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await fetch('http://localhost:5000/api/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
    setPage('dashboard');
    setPageProps({});
  };

  const handleNavigate = (pageName, props = {}) => {
    setPage(pageName);
    setPageProps(props);
  };

  if (loading) return null;
  if (!user) return <Login onLogin={setUser} />;
  if (page === 'usermanagement') return <UserManagement user={user} onBack={() => handleNavigate('dashboard')} onNavigate={handleNavigate} />;
  if (page === 'permissions') return <Permissions onBack={() => handleNavigate('usermanagement')} onHome={() => handleNavigate('dashboard')} />;
  if (page === 'hr-documents') return <HRDocuments user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'production-photos') return <ProductionPhotos user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'distro-taproom-orders') return <DistroTaproomOrders user={user} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'sops-checklists') return <SOPsChecklists user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'label-inventory') return <LabelInventory user={user} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'taproom-inventory') return <TaproomInventory user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;

  return <Dashboard user={user} onLogout={handleLogout} onNavigate={handleNavigate} />;
}

export default App;