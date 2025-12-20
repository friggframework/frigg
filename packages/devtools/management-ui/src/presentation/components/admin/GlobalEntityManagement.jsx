import React, { useState, useEffect } from 'react'
import { RefreshCw, Trash2, TestTube, AlertCircle, CheckCircle, XCircle, Plus, ChevronDown } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input } from '../ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import api from '../../../infrastructure/http/api-client.js'
import OAuthCredentialsPrompt from './OAuthCredentialsPrompt'

/**
 * GlobalEntityManagement
 * Admin view for managing global entities (app owner-level shared accounts)
 * Uses the Management UI server as a proxy to the Frigg app's admin API
 *
 * Features:
 * - List all global entities
 * - Create new global entities via OAuth or form flow
 * - Test entity connections
 * - Delete entities
 * - Prompt for OAuth credentials if not configured
 *
 * Note: Requires connection to a Frigg app via the Admin Connection panel
 *
 * @param {object} props
 * @param {string} [props.repositoryPath] - Path to the Frigg app repository (for checking OAuth credentials)
 */
const GlobalEntityManagement = ({ repositoryPath }) => {
  const [entities, setEntities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [testingEntityId, setTestingEntityId] = useState(null)
  const [testResults, setTestResults] = useState({}) // Store test results by entity ID

  // Create entity state
  const [availableModules, setAvailableModules] = useState([])
  const [selectedModule, setSelectedModule] = useState(null)
  const [authRequirements, setAuthRequirements] = useState(null)
  const [loadingAuthReqs, setLoadingAuthReqs] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({})
  const [creatingEntity, setCreatingEntity] = useState(false)

  useEffect(() => {
    loadEntities()
    loadAvailableModules()
  }, [])

  const loadAvailableModules = async () => {
    try {
      // Use admin proxy to get available integrations/modules
      const response = await api.get('/api/frigg-app/admin/available-modules')

      if (response.data?.success && response.data?.modules) {
        setAvailableModules(response.data.modules)
      }
    } catch (err) {
      console.error('Failed to load available modules:', err)
      // Fallback: Try to extract from app definition if available
      // This would require the app definition to be passed down or fetched
    }
  }

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

  const handleModuleSelect = async (module) => {
    setSelectedModule(module)
    setAuthRequirements(null)
    setFormData({})
    setShowCreateForm(true)

    try {
      setLoadingAuthReqs(true)
      const response = await api.get('/api/frigg-app/admin/auth-requirements', {
        params: {
          entityType: module.name,
          isGlobal: true
        }
      })

      if (response.data?.success) {
        setAuthRequirements(response.data.requirements)
      } else {
        setError(response.data?.error || 'Failed to get auth requirements')
      }
    } catch (err) {
      console.error('Failed to get auth requirements:', err)
      setError(`Failed to get auth requirements: ${err.response?.data?.error || err.message}`)
    } finally {
      setLoadingAuthReqs(false)
    }
  }

  const handleFormInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleFormSubmit = async (e) => {
    e.preventDefault()

    try {
      setCreatingEntity(true)
      setError(null)

      const response = await api.post('/api/frigg-app/admin/global-entities', {
        type: selectedModule.name,
        credentials: formData
      })

      if (response.data?.success) {
        alert(`Global entity created successfully`)
        setShowCreateForm(false)
        setSelectedModule(null)
        setAuthRequirements(null)
        setFormData({})
        loadEntities() // Refresh list
      } else {
        setError(response.data?.error || 'Failed to create entity')
      }
    } catch (err) {
      console.error('Failed to create entity:', err)
      setError(`Failed to create entity: ${err.response?.data?.error || err.message}`)
    } finally {
      setCreatingEntity(false)
    }
  }

  const handleOAuthRedirect = () => {
    if (authRequirements?.url) {
      const urlWithGlobal = `${authRequirements.url}${authRequirements.url.includes('?') ? '&' : '?'}isGlobal=true`
      window.location.href = urlWithGlobal
    }
  }

  const handleCancelCreate = () => {
    setShowCreateForm(false)
    setSelectedModule(null)
    setAuthRequirements(null)
    setFormData({})
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

      {/* Create new global entity section */}
      {!showCreateForm ? (
        <Card>
          <div className="p-4">
            <h4 className="font-medium mb-3">Create Global Entity</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Global entities are app owner-level shared accounts that can be used across all user integrations.
            </p>

            {availableModules.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoadingSpinner size="sm" />
                Loading available modules...
              </div>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Plus className="w-4 h-4" />
                    Select Module
                    <ChevronDown className="w-3 h-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel>Available Modules</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {availableModules.map((module) => (
                    <DropdownMenuItem
                      key={module.name}
                      onClick={() => handleModuleSelect(module)}
                      className="flex flex-col items-start gap-0.5 cursor-pointer"
                    >
                      <span className="font-medium">{module.display?.name || module.name}</span>
                      {module.display?.description && (
                        <span className="text-xs text-muted-foreground">
                          {module.display.description}
                        </span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </Card>
      ) : (
        <Card>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">
                Create {selectedModule?.display?.name || selectedModule?.name} Global Entity
              </h4>
              <Button
                onClick={handleCancelCreate}
                variant="ghost"
                size="sm"
                disabled={creatingEntity}
              >
                Cancel
              </Button>
            </div>

            {loadingAuthReqs ? (
              <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
                <LoadingSpinner size="sm" />
                Loading authentication requirements...
              </div>
            ) : authRequirements?.type === 'oauth' ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  This module requires OAuth authentication.
                  {repositoryPath && !authRequirements.url && (
                    <> First, configure your OAuth credentials.</>
                  )}
                </p>

                {/* Show credentials prompt if we have a repository path */}
                {repositoryPath ? (
                  <OAuthCredentialsPrompt
                    moduleName={selectedModule?.name}
                    repositoryPath={repositoryPath}
                    authRequirements={authRequirements}
                    onCredentialsSaved={() => {
                      // OAuthCredentialsPrompt handles the success message and restart notification
                      setError(null)
                    }}
                    onCancel={handleCancelCreate}
                    onProceedToOAuth={handleOAuthRedirect}
                  />
                ) : (
                  // Fallback: no repository path, show simple OAuth button
                  <Button onClick={handleOAuthRedirect} disabled={!authRequirements.url}>
                    Connect via OAuth
                  </Button>
                )}
              </div>
            ) : authRequirements?.type === 'form' ? (
              <form onSubmit={handleFormSubmit} className="space-y-4">
                {authRequirements.jsonSchema?.properties && (
                  <div className="space-y-3">
                    {Object.entries(authRequirements.jsonSchema.properties).map(([field, schema]) => (
                      <div key={field} className="space-y-1">
                        <label htmlFor={field} className="text-sm font-medium">
                          {schema.title || field}
                          {authRequirements.jsonSchema.required?.includes(field) && (
                            <span className="text-destructive ml-1">*</span>
                          )}
                        </label>
                        {schema.description && (
                          <p className="text-xs text-muted-foreground">{schema.description}</p>
                        )}
                        <Input
                          id={field}
                          type={schema.type === 'string' && schema.format === 'password' ? 'password' : 'text'}
                          placeholder={schema.placeholder || schema.title || field}
                          value={formData[field] || ''}
                          onChange={(e) => handleFormInputChange(field, e.target.value)}
                          required={authRequirements.jsonSchema.required?.includes(field)}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <Button type="submit" disabled={creatingEntity}>
                    {creatingEntity ? (
                      <>
                        <LoadingSpinner size="sm" />
                        Creating...
                      </>
                    ) : (
                      'Create Global Entity'
                    )}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="text-sm text-muted-foreground py-4">
                Unable to load authentication requirements. Please try again.
              </div>
            )}
          </div>
        </Card>
      )}

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
            No global entities yet. Use the Create Global Entity section above to add one.
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
