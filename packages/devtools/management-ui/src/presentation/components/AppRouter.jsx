import React from 'react'
import { useFrigg } from '../hooks/useFrigg'
import Layout from './layout/Layout'
import Welcome from './Welcome'
import DefinitionsZone from './zones/DefinitionsZone'
import TestingZone from './zones/TestingZone'

export default function AppRouter() {
  const { currentRepository, isLoading, activeZone, switchZone } = useFrigg()

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

  // Always show welcome screen if no repository is selected
  if (!currentRepository) {
    return <Welcome />
  }

  // Two-zone architecture: Definitions (admin/config) and Testing (test area)
  return (
    <Layout activeZone={activeZone} onZoneChange={switchZone}>
      {activeZone === 'definitions' && <DefinitionsZone />}
      {activeZone === 'testing' && <TestingZone />}
    </Layout>
  )
}
