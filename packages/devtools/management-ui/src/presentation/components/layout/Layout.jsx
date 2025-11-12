import React from 'react'
import { useFrigg } from '../../hooks/useFrigg'
import RepositoryPicker from '../common/RepositoryPicker'
import ZoneNavigation from '../common/ZoneNavigation'
import SettingsButton from '../common/SettingsButton'
import FriggLogo from '../../../assets/FriggLogo.svg?url'

const Layout = ({ children, activeZone, onZoneChange }) => {
  const { currentProject, currentRepository } = useFrigg()

  return (
    <div className="min-h-screen bg-background">
      {/* Global Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40 backdrop-blur-sm bg-card/95">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Brand Section */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center">
                  <img
                    src={FriggLogo}
                    alt="Frigg"
                    className="w-8 h-8"
                  />
                </div>
                <div>
                  <h1 className="font-semibold text-xl">Frigg Management UI</h1>
                  <p className="text-sm text-muted-foreground">
                    {currentProject ? `Project: ${currentProject}` : 'Integration Management Interface'}
                  </p>
                </div>
              </div>

              {/* Zone Navigation - Always show for two-zone architecture */}
              {activeZone && onZoneChange && (
                <div className="ml-8">
                  <ZoneNavigation
                    activeZone={activeZone}
                    onZoneChange={onZoneChange}
                  />
                </div>
              )}
            </div>

            {/* Action Section */}
            <div className="flex items-center gap-3">
              <RepositoryPicker
                currentRepo={currentRepository}
                onRepoChange={(repo) => {
                  console.log('Repository selected in Layout:', repo)
                  // The useFrigg hook will handle the state update
                }}
              />
              <SettingsButton />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area - Full height tab navigation */}
      <main className="h-[calc(100vh-5rem)] overflow-hidden bg-background">
        <div className="max-w-7xl mx-auto h-full">
          {children}
        </div>
      </main>
    </div>
  )
}

export { Layout }
export default Layout