import React from 'react'
<<<<<<< HEAD
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
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
import Monitoring from './pages/Monitoring'
import CodeGeneration from './pages/CodeGeneration'
=======
import { BrowserRouter as Router } from 'react-router-dom'
import AppRouter from './components/AppRouter'
>>>>>>> d6114470 (feat: add comprehensive DDD/Hexagonal architecture RFC series)
import ErrorBoundary from './components/ErrorBoundary'
import { SocketProvider } from './hooks/useSocket'
import { FriggProvider } from './hooks/useFrigg'
import { ThemeProvider } from './components/theme-provider'
<<<<<<< HEAD
=======
import ErrorBoundary from './components/ErrorBoundary'
import { SocketProvider } from './hooks/useSocket'
import { FriggProvider } from './hooks/useFrigg'
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)

function App() {
  return (
    <ErrorBoundary>
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
      <ThemeProvider defaultTheme="system">
        <SocketProvider>
          <FriggProvider>
            <Router>
              <AppRouter />
            </Router>
          </FriggProvider>
        </SocketProvider>
      </ThemeProvider>
<<<<<<< HEAD
=======
      <SocketProvider>
        <FriggProvider>
          <Router>
            <Layout>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/integrations" element={<IntegrationDiscovery />} />
                <Route path="/integrations/:integrationName/configure" element={<IntegrationConfigure />} />
                <Route path="/integrations/:integrationName/test" element={<IntegrationTest />} />
                <Route path="/environment" element={<Environment />} />
                <Route path="/users" element={<Users />} />
                <Route path="/connections" element={<ConnectionsEnhanced />} />
                <Route path="/simulation" element={<Simulation />} />
              </Routes>
            </Layout>
          </Router>
        </FriggProvider>
      </SocketProvider>
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
    </ErrorBoundary>
  )
}

export default App