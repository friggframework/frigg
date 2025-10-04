import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useFrigg } from '../../hooks/useFrigg'
import Layout from './Layout'
import DefinitionsZone from '../zones/DefinitionsZone'
import TestingZone from '../zones/TestingZone'
import Settings from '../../pages/Settings'
import RepositoryPicker from '../common/RepositoryPicker'

export default function AppRouter() {
  const { isLoading, currentRepository, repositories, activeZone, switchZone } = useFrigg()
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

  // Show repository selection if no repository is selected
  if (!currentRepository && repositories.length > 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-foreground">Welcome to Frigg Management UI</h2>
            <p className="mt-2 text-muted-foreground">Select a Frigg repository to get started</p>
          </div>

          <div className="bg-card shadow rounded-lg p-6 border border-border max-w-2xl">
            <h3 className="text-lg font-medium text-card-foreground mb-4">Select Repository</h3>
            <RepositoryPicker
              currentRepo={currentRepository}
              onRepoChange={(repo) => {
                console.log('Repository selected:', repo)
                // The useFrigg hook will handle the state update via switchRepository
                // The page will reload to refresh all data with new repository context
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  // Handle Settings page without Layout (it has its own layout)
  if (location.pathname === '/settings') {
    return <Settings />
  }


  // Main application with zone-based architecture (PRD requirement)
  return (
    <Layout activeZone={activeZone} onZoneChange={switchZone}>
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route
          path="/*"
          element={
            <div className="h-full">
              {activeZone === 'definitions' && <DefinitionsZone />}
              {activeZone === 'testing' && <TestingZone />}
            </div>
          }
        />
      </Routes>
    </Layout>
  )
}