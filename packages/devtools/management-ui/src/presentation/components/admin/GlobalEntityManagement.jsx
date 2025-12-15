import React, { useState, useEffect } from 'react'
import { RefreshCw, Trash2, TestTube, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import api from '../../../infrastructure/http/api-client.js'

/**
 * GlobalEntityManagement
 * Admin view for managing global entities (app owner-level shared accounts)
 * Uses the Management UI server as a proxy to the Frigg app's admin API
 *
 * Features:
 * - List all global entities
 * - Test entity connections
 * - Delete entities
 *
 * Note: Requires connection to a Frigg app via the Admin Connection panel
 */
const GlobalEntityManagement = () => {
  const [entities, setEntities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [testingEntityId, setTestingEntityId] = useState(null)
  const [testResults, setTestResults] = useState({}) // Store test results by entity ID

  useEffect(() => {
    loadEntities()
  }, [])

  const loadEntities = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await api.get('/api/frigg-app/admin/global-entities')

      if (response.data.success) {
        setEntities(response.data.entities || [])
      } else {
        setError(response.data.error || 'Failed to load entities')
      }
    } catch (err) {
      console.error('Failed to load global entities:', err)
      setError(err.response?.data?.error || err.message || 'Failed to load entities')
    } finally {
      setLoading(false)
    }
  }

  const handleTestEntity = async (entityId) => {
    try {
      setTestingEntityId(entityId)
      setTestResults(prev => ({ ...prev, [entityId]: null })) // Clear previous result

      const response = await api.post(`/api/frigg-app/admin/global-entities/${entityId}/test`)

      setTestResults(prev => ({
        ...prev,
        [entityId]: {
          success: response.data.success,
          status: response.data.status,
          responseTime: response.data.responseTime,
          error: response.data.error
        }
      }))
    } catch (err) {
      console.error('Failed to test entity:', err)
      setTestResults(prev => ({
        ...prev,
        [entityId]: {
          success: false,
          status: 'error',
          error: err.response?.data?.error || err.message || 'Test failed'
        }
      }))
    } finally {
      setTestingEntityId(null)
    }
  }

  const handleDeleteEntity = async (entityId, entityName) => {
    if (!confirm(`Are you sure you want to delete the global entity "${entityName}"?`)) {
      return
    }

    try {
      const response = await api.delete(`/api/frigg-app/admin/global-entities/${entityId}`)

      if (response.data.success) {
        loadEntities() // Refresh list
      } else {
        alert(`Failed to delete entity: ${response.data.error}`)
      }
    } catch (err) {
      console.error('Failed to delete entity:', err)
      alert(`Failed to delete entity: ${err.response?.data?.error || err.message}`)
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

  const getEntityDisplayName = (entity) => {
    return entity.name || entity.displayName || entity.type || 'Unknown Entity'
  }

  const LoadingSpinner = ({ size = 'md' }) => (
    <div className={`animate-spin rounded-full border-2 border-current border-t-transparent ${
      size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'
    }`} />
  )

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
          {entities.map(entity => {
            const testResult = testResults[entity.id || entity._id]
            const entityId = entity.id || entity._id

            return (
              <Card key={entityId} className="hover:bg-muted/50 transition-colors">
                <div className="p-4 space-y-3">
                  {/* Entity header */}
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <h4 className="font-medium">{getEntityDisplayName(entity)}</h4>
                      <p className="text-sm text-muted-foreground">{entity.type}</p>
                    </div>
                    <span className={`
                      text-xs px-2 py-1 rounded-full font-medium
                      ${getStatusColor(entity.status)}
                    `}>
                      {entity.status || 'unknown'}
                    </span>
                  </div>

                  {/* Entity metadata */}
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {entity.createdAt && (
                      <div>Created: {new Date(entity.createdAt).toLocaleDateString()}</div>
                    )}
                    {entity.isGlobal && (
                      <div className="flex items-center gap-1 text-primary">
                        <span className="inline-block w-2 h-2 rounded-full bg-primary" />
                        Global Entity
                      </div>
                    )}
                  </div>

                  {/* Test result */}
                  {testResult && (
                    <div className={`
                      flex items-center gap-2 p-2 rounded text-xs
                      ${testResult.success
                        ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300'
                        : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'
                      }
                    `}>
                      {testResult.success ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : (
                        <XCircle className="w-3 h-3" />
                      )}
                      <span>
                        {testResult.success
                          ? `Connected (${testResult.responseTime}ms)`
                          : testResult.error || 'Test failed'
                        }
                      </span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-border">
                    <Button
                      onClick={() => handleTestEntity(entityId)}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled={testingEntityId === entityId}
                    >
                      {testingEntityId === entityId ? (
                        <LoadingSpinner size="sm" />
                      ) : (
                        <TestTube className="w-3 h-3 mr-1" />
                      )}
                      Test
                    </Button>
                    <Button
                      onClick={() => handleDeleteEntity(entityId, getEntityDisplayName(entity))}
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default GlobalEntityManagement
