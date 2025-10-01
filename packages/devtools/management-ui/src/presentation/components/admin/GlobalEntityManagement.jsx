import React, { useState, useEffect, useMemo } from 'react'
import { RefreshCw, Plus, Trash2, TestTube, AlertCircle } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { LoadingSpinner } from '@friggframework/ui'
import { AdminService } from '../../../application/services/AdminService'
import { AdminRepositoryAdapter } from '../../../infrastructure/adapters/AdminRepositoryAdapter'
import axios from 'axios'

/**
 * GlobalEntityManagement
 * Admin view for managing global entities (app owner-level shared accounts)
 * Features:
 * - List all global entities
 * - Test entity connections
 * - Delete entities
 *
 * Note: Global entity creation is handled through the Frigg UI EntityManager
 * when in admin mode, as it follows the same flow as user-level entities
 */
const GlobalEntityManagement = ({ friggBaseUrl }) => {
  const [entities, setEntities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [testingEntityId, setTestingEntityId] = useState(null)

  // Create axios client for Frigg API
  const friggApiClient = useMemo(() => {
    return axios.create({
      baseURL: friggBaseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }, [friggBaseUrl])

  // Initialize admin service
  const adminRepository = useMemo(() => new AdminRepositoryAdapter(friggApiClient), [friggApiClient])
  const adminService = useMemo(() => new AdminService(adminRepository), [adminRepository])

  useEffect(() => {
    loadEntities()
  }, [])

  const loadEntities = async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await adminService.listGlobalEntities()
      setEntities(result)
    } catch (err) {
      console.error('Failed to load global entities:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleTestEntity = async (entityId) => {
    try {
      setTestingEntityId(entityId)
      const result = await adminService.testGlobalEntity(entityId)

      if (result.success) {
        alert('Connection test successful!')
      } else {
        alert(`Connection test failed: ${result.message}`)
      }
    } catch (err) {
      console.error('Failed to test entity:', err)
      alert(`Connection test failed: ${err.message}`)
    } finally {
      setTestingEntityId(null)
    }
  }

  const handleDeleteEntity = async (entityId, entityName) => {
    if (!confirm(`Are you sure you want to delete the global entity "${entityName}"?`)) {
      return
    }

    try {
      await adminService.deleteGlobalEntity(entityId)
      loadEntities() // Refresh list
    } catch (err) {
      console.error('Failed to delete entity:', err)
      alert(`Failed to delete entity: ${err.message}`)
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'connected':
        return 'text-green-600 bg-green-50 dark:bg-green-950'
      case 'error':
        return 'text-red-600 bg-red-50 dark:bg-red-950'
      case 'pending':
        return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950'
      default:
        return 'text-gray-600 bg-gray-50 dark:bg-gray-950'
    }
  }

  return (
    <div className="global-entity-management space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Global Entities</h3>
        <div className="flex items-center gap-2">
          <Button
            onClick={loadEntities}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Info message about creating entities */}
      <Card className="bg-muted/50 border-muted">
        <div className="flex items-start gap-3 p-4">
          <AlertCircle className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              To create a new global entity, use the User View and connect a new account.
              Global entities are created through the same flow as user-level entities.
            </p>
          </div>
        </div>
      </Card>

      {/* Error message */}
      {error && (
        <Card className="bg-destructive/10 border-destructive/50">
          <div className="p-4 text-sm text-destructive">
            Error: {error}
          </div>
        </Card>
      )}

      {/* Entity list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : entities.length === 0 ? (
        <Card>
          <div className="p-8 text-center text-muted-foreground">
            No global entities yet. Switch to User View to create one.
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {entities.map(entity => (
            <Card key={entity.id} className="hover:bg-muted/50 transition-colors">
              <div className="p-4 space-y-3">
                {/* Entity header */}
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <h4 className="font-medium">{entity.getDisplayName()}</h4>
                    <p className="text-sm text-muted-foreground">{entity.type}</p>
                  </div>
                  <span className={`
                    text-xs px-2 py-1 rounded-full font-medium
                    ${getStatusColor(entity.status)}
                  `}>
                    {entity.status}
                  </span>
                </div>

                {/* Entity metadata */}
                <div className="space-y-1 text-xs text-muted-foreground">
                  {entity.createdAt && (
                    <div>Created: {new Date(entity.createdAt).toLocaleDateString()}</div>
                  )}
                  {entity.isGlobalEntity() && (
                    <div className="flex items-center gap-1 text-primary">
                      <span className="inline-block w-2 h-2 rounded-full bg-primary" />
                      Global Entity
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Button
                    onClick={() => handleTestEntity(entity.id)}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={testingEntityId === entity.id}
                  >
                    {testingEntityId === entity.id ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <TestTube className="w-3 h-3 mr-1" />
                    )}
                    Test
                  </Button>
                  <Button
                    onClick={() => handleDeleteEntity(entity.id, entity.getDisplayName())}
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default GlobalEntityManagement
