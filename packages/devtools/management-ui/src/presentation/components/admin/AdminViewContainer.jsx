import React, { useState, useEffect } from 'react'
import { Users, Database, AlertCircle, Settings, Loader2 } from 'lucide-react'
import GlobalEntityManagement from './GlobalEntityManagement'
import AdminConnectionPanel from './AdminConnectionPanel'
import UserSelection from '../shared/UserSelection'
import { useFriggAppConnection } from '../../hooks/useFriggAppConnection'
import { Card } from '../ui/Card'

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

  useEffect(() => {
    if (isConnected && activeTab === 'connection') {
      setActiveTab('users')
    }
  }, [isConnected, activeTab])

  const tabs = [
    { id: 'connection', label: 'Connection', icon: Settings, requiresConnection: false },
    { id: 'users', label: 'Users', icon: Users, requiresConnection: false },
    { id: 'global-entities', label: 'Global Entities', icon: Database, requiresConnection: true }
  ]

  const availableTabs = tabs.filter(tab => !tab.requiresConnection || isConnected)
  const currentTab = tabs.find(t => t.id === activeTab)
  if (currentTab?.requiresConnection && !isConnected) {
    setActiveTab('connection')
  }

  const effectiveFriggUrl = connection?.baseUrl || friggBaseUrl

  return (
    <div className="admin-view-container h-full flex flex-col">
      <div className="border-b border-border bg-muted/30">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold">Admin</h2>
            <div className="flex gap-1 p-0.5 bg-muted rounded">
              {availableTabs.map(tab => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors
                      ${isActive ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
          {isConnected && (
            <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Connected
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'connection' && (
          <div className="space-y-3 max-w-xl">
            {isConnecting && !autoConnectAttempted && (
              <div className="flex items-center gap-2 p-3 text-xs bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded">
                <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin flex-shrink-0" />
                <span className="text-blue-700 dark:text-blue-300">Auto-connecting via server-side admin key...</span>
              </div>
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
              <div className="flex items-start gap-2 p-3 text-xs bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <span className="text-amber-700 dark:text-amber-300">
                  {autoConnectAttempted
                    ? 'Auto-connect failed. Enter admin API key manually.'
                    : 'Connect to access user management and entities.'}
                </span>
              </div>
            )}

            {isConnected && appDefinition && (
              <div className="p-3 text-xs border rounded bg-muted/30">
                <div className="font-medium mb-1">App: {appDefinition.name || 'Unknown'}</div>
                {appDefinition.description && (
                  <div className="text-muted-foreground">{appDefinition.description}</div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'users' && (
          <UserSelection
            isConnected={isConnected}
            onUserSelect={onUserSelect}
            userManagementMode={userManagementMode}
            repositoryPath={repositoryPath}
          />
        )}

        {activeTab === 'global-entities' && isConnected && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-2 text-xs bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded">
              <AlertCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <span className="text-blue-700 dark:text-blue-300">
                Global Entities are app owner-level accounts shared across integrations.
              </span>
            </div>
            <GlobalEntityManagement repositoryPath={repositoryPath} />
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminViewContainer
