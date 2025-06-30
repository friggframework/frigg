import { Routes, Route } from 'react-router-dom';
import { Toaster } from '@friggframework/ui/components';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Integrations from './pages/Integrations';
import IntegrationDetail from './pages/IntegrationDetail';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="integrations/:id" element={<IntegrationDetail />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}

export default App;