import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useFrigg } from '../hooks/useFrigg'
import Layout from './Layout'
import Welcome from './Welcome'
import Dashboard from '../pages/Dashboard'
import Integrations from '../pages/Integrations'
import IntegrationDiscovery from '../pages/IntegrationDiscovery'
import IntegrationConfigure from '../pages/IntegrationConfigure'
import IntegrationTest from '../pages/IntegrationTest'
import Environment from '../pages/Environment'
import Users from '../pages/Users'
import ConnectionsEnhanced from '../pages/ConnectionsEnhanced'
import Simulation from '../pages/Simulation'
import Monitoring from '../pages/Monitoring'
import CodeGeneration from '../pages/CodeGeneration'

export default function AppRouter() {
  const { currentRepository, isLoading } = useFrigg()
  const location = useLocation()

  // Show loading screen while initializing
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Initializing Frigg Management UI...</p>
        </div>
      </div>
    )
  }

  // If no repository is selected and we're not already on the welcome page, show welcome
  if (!currentRepository && location.pathname !== '/welcome') {
    return <Welcome />
  }

  // If we have a repository but we're on the welcome page, redirect to dashboard
  if (currentRepository && location.pathname === '/welcome') {
    return <Navigate to="/dashboard" replace />
  }

  // Normal routing with Layout for all other cases
  return (
    <Layout>
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
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
  )
}