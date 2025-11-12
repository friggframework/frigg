import React, { useState } from 'react'
import { Users, Database, AlertCircle } from 'lucide-react'
import UserManagement from './UserManagement'
import GlobalEntityManagement from './GlobalEntityManagement'
import { Card } from '../ui/Card'

/**
 * AdminViewContainer
 * Main container for admin functionality with two tabs:
 * 1. Users - User management with org associations
 * 2. Global Entities - Shared entity management (for dev convenience)
 */
const AdminViewContainer = ({ friggBaseUrl, onUserSelect }) => {
  const [activeTab, setActiveTab] = useState('users')

  const tabs = [
    { id: 'users', label: 'Users', icon: Users },
    { id: 'global-entities', label: 'Global Entities', icon: Database }
  ]

  return (
    <div className="admin-view-container h-full flex flex-col">
      {/* Header with tabs */}
      <div className="border-b border-border bg-muted/50">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold">Admin View</h2>
            <div className="flex gap-2">
              {tabs.map(tab => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      flex items-center gap-2 px-4 py-2 rounded-lg transition-colors
                      ${activeTab === tab.id
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
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'users' && (
          <UserManagement friggBaseUrl={friggBaseUrl} onUserSelect={onUserSelect} />
        )}

        {activeTab === 'global-entities' && (
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
            <GlobalEntityManagement friggBaseUrl={friggBaseUrl} />
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminViewContainer
