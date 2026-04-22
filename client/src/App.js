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
import TaproomInspections from './pages/TaproomInspections';
import Recipes from './pages/Recipes';
import CocktailKeeper from './pages/CocktailKeeper';
import SalesCRM from './pages/SalesCRM';
import ProductionSchedule from './pages/ProductionSchedule';

function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [pageProps, setPageProps] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL || ''}/api/me`, { credentials: 'include' })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data) {
          setUser(data);
          // Seed initial history state so back button stays within the app
          window.history.replaceState({ pageName: 'dashboard', props: {} }, '');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await fetch(`${process.env.REACT_APP_API_URL || ''}/api/logout`, { method: 'POST', credentials: 'include' });
    setUser(null);
    setPage('dashboard');
    setPageProps({});
  };

  const handleNavigate = (pageName, props = {}) => {
    window.history.pushState({ pageName, props }, '', '');
    setPage(pageName);
    setPageProps(props);
  };

  useEffect(() => {
    const onPop = (e) => {
      try {
        const state = e.state;
        if (state && state.pageName) {
          setPage(state.pageName);
          setPageProps(state.props || {});
        } else {
          setPage('dashboard');
          setPageProps({});
        }
      } catch (err) {
        setPage('dashboard');
        setPageProps({});
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (loading) return null;
  if (!user) return <Login onLogin={setUser} />;
  if (page === 'usermanagement') return <UserManagement user={user} onBack={() => handleNavigate('dashboard')} onNavigate={handleNavigate} />;
  if (page === 'permissions') return <Permissions onBack={() => handleNavigate('usermanagement')} onHome={() => handleNavigate('dashboard')} />;
  if (page === 'hr-documents') return <HRDocuments user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'production-photos') return <ProductionPhotos user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'distro-taproom-orders') return <DistroTaproomOrders user={user} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'sops-checklists') return <SOPsChecklists user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'label-inventory') return <LabelInventory user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'taproom-inventory') return <TaproomInventory user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'taproom-inspections') return <TaproomInspections user={user} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'recipes') return <Recipes user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'cocktail-keeper') return <CocktailKeeper user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'sales-crm') return <SalesCRM user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'production-schedule') return <ProductionSchedule user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;

  return <Dashboard user={user} onLogout={handleLogout} onNavigate={handleNavigate} />;
}

export default App;