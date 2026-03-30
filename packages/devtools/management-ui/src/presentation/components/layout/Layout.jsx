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
        <div className="max-w-[1600px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Brand Section - Compact */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-8 h-8 flex items-center justify-center">
                <img
                  src={FriggLogo}
                  alt="Frigg"
                  className="w-7 h-7"
                />
              </div>
              <div className="hidden sm:block">
                <h1 className="font-semibold text-base leading-tight">Frigg</h1>
                <p className="text-xs text-muted-foreground leading-tight">Management UI</p>
              </div>
            </div>

            {/* Zone Navigation - Center */}
            {activeZone && onZoneChange && (
              <ZoneNavigation
                activeZone={activeZone}
                onZoneChange={onZoneChange}
              />
            )}

            {/* Action Section - Right */}
            <div className="flex items-center gap-2 flex-shrink-0">
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