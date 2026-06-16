import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import UserManagement from './pages/UserManagement';
import Permissions from './pages/Permissions';
import HRDocuments from './pages/HRDocuments';
import ProductionPhotos from './pages/ProductionPhotos';
import DistroTaproomOrders from './pages/DistroTaproomOrders';
import SOPsChecklists from './pages/SOPsChecklists';
import Checklists from './pages/Checklists';
import LabelInventory from './pages/LabelInventory';
import TaproomInventory from './pages/TaproomInventory';
import TaproomInspections from './pages/TaproomInspections';
import Recipes from './pages/Recipes';
import CocktailKeeper from './pages/CocktailKeeper';
import SalesCRM from './pages/SalesCRM';
import ProductionSchedule from './pages/ProductionSchedule';
import EightySixedCustomers from './pages/EightySixedCustomers';
import PackagingLog from './pages/PackagingLog';
import CoffeeKeeper from './pages/CoffeeKeeper';
import ProductionWeekly from './pages/ProductionWeekly';
import EquipmentManuals from './pages/EquipmentManuals';
import TankMaintenance from './pages/TankMaintenance';

const API = process.env.REACT_APP_API_URL || '';

function pageNameFromPath(pathname) {
  const slug = pathname.replace(/^\//, '').replace(/\/$/, '');
  return slug || 'dashboard';
}

function pathFromPageName(pageName) {
  return pageName === 'dashboard' ? '/' : `/${pageName}`;
}

function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [pageProps, setPageProps] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initialPage = pageNameFromPath(window.location.pathname);
    fetch(`${API}/api/me`, { credentials: 'include' })
      .then((res) => res.ok ? res.json() : null)
      .then(async (data) => {
        if (data) {
          setUser(data);
          // Fetch tools so we can restore canUpload when landing directly on a tool URL
          let tools = [];
          try {
            const r = await fetch(`${API}/api/my-tools`, { credentials: 'include' });
            if (r.ok) tools = await r.json();
          } catch {}
          const toolEntry = tools.find(t => t.slug === initialPage);
          const props = toolEntry ? { canUpload: toolEntry.has_upload_permission } : {};
          setPage(initialPage);
          setPageProps(props);
          window.history.replaceState({ pageName: initialPage, props }, '', pathFromPageName(initialPage));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await fetch(`${API}/api/logout`, { method: 'POST', credentials: 'include' });
    setUser(null);
    setPage('dashboard');
    setPageProps({});
    window.history.replaceState({ pageName: 'dashboard', props: {} }, '', '/');
  };

  const handleNavigate = (pageName, props = {}) => {
    window.history.pushState({ pageName, props }, '', pathFromPageName(pageName));
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

  const handleLogin = async (userData) => {
    setUser(userData);
    const currentPage = pageNameFromPath(window.location.pathname);
    if (currentPage !== 'dashboard') {
      try {
        const r = await fetch(`${API}/api/my-tools`, { credentials: 'include' });
        if (r.ok) {
          const tools = await r.json();
          const toolEntry = tools.find(t => t.slug === currentPage);
          setPage(currentPage);
          setPageProps(toolEntry ? { canUpload: toolEntry.has_upload_permission } : {});
        }
      } catch {}
    }
  };

  if (loading) return null;
  if (!user) return <Login onLogin={handleLogin} />;
  if (page === 'usermanagement') return <UserManagement user={user} onBack={() => handleNavigate('dashboard')} onNavigate={handleNavigate} />;
  if (page === 'permissions') return <Permissions onBack={() => handleNavigate('usermanagement')} onHome={() => handleNavigate('dashboard')} />;
  if (page === 'hr-documents') return <HRDocuments user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'production-photos') return <ProductionPhotos user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'distro-taproom-orders') return <DistroTaproomOrders user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'sops') return <SOPsChecklists user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'checklists') return <Checklists user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'label-inventory') return <LabelInventory user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'taproom-inventory') return <TaproomInventory user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'taproom-inspections') return <TaproomInspections user={user} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'recipes') return <Recipes user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'cocktail-keeper') return <CocktailKeeper user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'sales-crm') return <SalesCRM user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'production-schedule') return <ProductionSchedule user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === '86ed-customers') return <EightySixedCustomers user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'packaging-log') return <PackagingLog user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'coffee-keeper') return <CoffeeKeeper user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'production-weekly') return <ProductionWeekly user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'equipment-manuals') return <EquipmentManuals user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;
  if (page === 'tank-maintenance') return <TankMaintenance user={user} canUpload={pageProps.canUpload} onBack={() => handleNavigate('dashboard')} />;

  return <Dashboard user={user} onLogout={handleLogout} onNavigate={handleNavigate} />;
}

export default App;