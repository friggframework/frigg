import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Integrations from './pages/Integrations'
import IntegrationDiscovery from './pages/IntegrationDiscovery'
import IntegrationConfigure from './pages/IntegrationConfigure'
import IntegrationTest from './pages/IntegrationTest'
import Environment from './pages/Environment'
import Users from './pages/Users'
import ConnectionsEnhanced from './pages/ConnectionsEnhanced'
import Simulation from './pages/Simulation'
import Monitoring from './pages/Monitoring'
import CodeGeneration from './pages/CodeGeneration'
import ErrorBoundary from './components/ErrorBoundary'
import { SocketProvider } from './hooks/useSocket'
import { FriggProvider } from './hooks/useFrigg'
import { ThemeProvider } from './components/theme-provider'

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system">
        <SocketProvider>
          <FriggProvider>
            <Router>
              <Layout>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/integrations" element={<Integrations />} />
                  <Route path="/integrations/discover" element={<IntegrationDiscovery />} />
                  <Route path="/integrations/:integrationName/configure" element={<IntegrationConfigure />} />
                  <Route path="/integrations/:integrationName/test" element={<IntegrationTest />} />
                  <Route path="/environment" element={<Environment />} />
                  <Route path="/users" element={<Users />} />
                  <Route path="/connections" element={<ConnectionsEnhanced />} />
                  <Route path="/simulation" element={<Simulation />} />
                  <Route path="/monitoring" element={<Monitoring />} />
                  <Route path="/code-generation" element={<CodeGeneration />} />
                </Routes>
              </Layout>
            </Router>
          </FriggProvider>
        </SocketProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App