import React, { useState, useEffect } from 'react'
import { Users, Database, AlertCircle, FlaskConical, Settings, UserCog, Loader2 } from 'lucide-react'
import UserManagement from './UserManagement'
import GlobalEntityManagement from './GlobalEntityManagement'
import AdminConnectionPanel from './AdminConnectionPanel'
import SharedSecretSimulation from './SharedSecretSimulation'
import { useFriggAppConnection } from '../../hooks/useFriggAppConnection'
import { TestingDashboard } from '@friggframework/ui'
import '@friggframework/ui/dist/style.css'
import { Card } from '../ui/Card'

/**
 * AdminViewContainer
 * Main container for admin functionality with connection panel and tabs:
 * 1. Connection - Connect to running Frigg app with admin credentials
 * 2. Users - User management with org associations
 * 3. Global Entities - Shared entity management (admin only)
 * 4. User Simulation - Shared secret user simulation (when enabled)
 * 5. Testing - Comprehensive testing dashboard for user and system actions
 *
 * Features auto-connect for local Frigg apps using server-side FRIGG_ADMIN_API_KEY
 */
const AdminViewContainer = ({ friggBaseUrl, repositoryPath, onUserSelect }) => {
  const [activeTab, setActiveTab] = useState('connection')

  const {
    isConnected,
    isConnecting,
    connection,
    userManagementMode,
    appDefinition,
    error,
    autoConnectAttempted,
    connect,
    disconnect,
    clearError
  } = useFriggAppConnection({ friggBaseUrl, repositoryPath, autoConnect: true })

  // Auto-switch to user-simulation tab when connected (or on local dev)
  useEffect(() => {
    if (isConnected && activeTab === 'connection') {
      setActiveTab('user-simulation')
    }
  }, [isConnected, activeTab])

  const sharedSecretEnabled = userManagementMode?.sharedSecretEnabled || false

  // Check if friggBaseUrl is localhost (for showing dev features)
  const isLocalDev = (() => {
    try {
      if (!friggBaseUrl) return false
      const url = new URL(friggBaseUrl)
      return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    } catch {
      return false
    }
  })()

  const tabs = [
    { id: 'connection', label: 'Connection', icon: Settings, requiresConnection: false },
    // In shared secret mode or local dev, show User Simulation instead of traditional Users
    ...(sharedSecretEnabled || isLocalDev
      ? [{ id: 'user-simulation', label: 'User Simulation', icon: UserCog, requiresConnection: false }]
      : [{ id: 'users', label: 'Users', icon: Users, requiresConnection: true }]
    ),
    { id: 'global-entities', label: 'Global Entities', icon: Database, requiresConnection: true },
    { id: 'testing', label: 'Testing', icon: FlaskConical, requiresConnection: true }
  ]

  // Filter tabs based on connection status
  const availableTabs = tabs.filter(tab => !tab.requiresConnection || isConnected)

  // Switch to connection tab if currently on a tab that requires connection
  const currentTab = tabs.find(t => t.id === activeTab)
  if (currentTab?.requiresConnection && !isConnected) {
    setActiveTab('connection')
  }

  // Get the effective Frigg URL (from connection or prop)
  const effectiveFriggUrl = connection?.baseUrl || friggBaseUrl

  return (
    <div className="admin-view-container h-full flex flex-col">
      {/* Header with tabs */}
      <div className="border-b border-border bg-muted/50">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold">Admin View</h2>
            <div className="flex gap-2">
              {availableTabs.map(tab => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      flex items-center gap-2 px-4 py-2 rounded-lg transition-colors
                      ${isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background hover:bg-muted text-muted-foreground hover:text-foreground'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Connection status indicator */}
          {isConnected && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Connected
            </div>
          )}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'connection' && (
          <div className="space-y-4 max-w-2xl">
            {/* Auto-connecting indicator */}
            {isConnecting && !autoConnectAttempted && (
              <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-3 p-4">
                  <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Auto-connecting to local Frigg...
                    </h3>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      Attempting to connect using server-side FRIGG_ADMIN_API_KEY
                    </p>
                  </div>
                </div>
              </Card>
            )}

            <AdminConnectionPanel
              isConnected={isConnected}
              isConnecting={isConnecting}
              connection={connection}
              userManagementMode={userManagementMode}
              error={error}
              onConnect={connect}
              onDisconnect={disconnect}
              onClearError={clearError}
            />

            {!isConnected && !isConnecting && (
              <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-3 p-4">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-amber-900 dark:text-amber-100">
                      Connection Required
                    </h3>
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      {autoConnectAttempted
                        ? 'Auto-connect failed. Please enter your admin API key manually.'
                        : 'Connect to your running Frigg app to access user management, global entities, and testing features.'
                      }
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {isConnected && appDefinition && (
              <Card>
                <div className="p-4 space-y-2">
                  <h3 className="font-medium">App Definition</h3>
                  <div className="text-sm text-muted-foreground space-y-1">
                    {appDefinition.name && (
                      <div>Name: <span className="font-mono">{appDefinition.name}</span></div>
                    )}
                    {appDefinition.description && (
                      <div>Description: {appDefinition.description}</div>
                    )}
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {activeTab === 'users' && isConnected && (
          <UserManagement friggBaseUrl={effectiveFriggUrl} onUserSelect={onUserSelect} />
        )}

        {activeTab === 'user-simulation' && (isConnected || isLocalDev) && (
          <SharedSecretSimulation
            repositoryPath={repositoryPath}
            friggAppUrl={effectiveFriggUrl}
            onUserSelect={onUserSelect}
          />
        )}

        {activeTab === 'global-entities' && isConnected && (
          <div className="space-y-4">
            {/* Banner explaining global entities */}
            <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-3 p-4">
                <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Global Entities for Development
                  </h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Global Entities are app owner-level connected accounts that can be shared across integrations.
                    This is primarily for development convenience - use with caution in production environments.
                  </p>
                </div>
              </div>
            </Card>

            {/* Global Entity Management */}
            <GlobalEntityManagement />
          </div>
        )}


        {activeTab === 'testing' && isConnected && (
          <div className="space-y-4">
            {/* Banner explaining testing dashboard */}
            <Card className="bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800">
              <div className="flex items-start gap-3 p-4">
                <FlaskConical className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <h3 className="text-sm font-medium text-purple-900 dark:text-purple-100">
                    Comprehensive Testing Dashboard
                  </h3>
                  <p className="text-sm text-purple-700 dark:text-purple-300">
                    Test user actions, system actions, webhooks, and integration workflows.
                    Use this to verify integration behavior during development.
                  </p>
                </div>
              </div>
            </Card>

            {/* Testing Dashboard */}
            <TestingDashboard
              friggBaseUrl={effectiveFriggUrl}
              authToken={null}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminViewContainer
