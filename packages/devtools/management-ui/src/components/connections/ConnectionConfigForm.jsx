import React, { useState, useEffect } from 'react'
import { Button } from '../Button'
import api from '../../services/api'

const ConnectionConfigForm = ({ connection, integration, onSave, onCancel }) => {
  const [config, setConfig] = useState({
    name: '',
    description: '',
    syncInterval: 'hourly',
    autoSync: true,
    webhookEnabled: false,
    webhookUrl: '',
    rateLimitOverride: '',
    customHeaders: {},
    entityMappings: [],
    advanced: {}
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (connection) {
      // Load existing configuration
      setConfig({
        name: connection.name || '',
        description: connection.description || '',
        syncInterval: connection.syncInterval || 'hourly',
        autoSync: connection.autoSync !== false,
        webhookEnabled: connection.webhookEnabled || false,
        webhookUrl: connection.webhookUrl || '',
        rateLimitOverride: connection.rateLimitOverride || '',
        customHeaders: connection.customHeaders || {},
        entityMappings: connection.entityMappings || [],
        advanced: connection.advanced || {}
      })
    }
  }, [connection])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const endpoint = connection 
        ? `/api/connections/${connection.id}/config`
        : '/api/connections/config'
      
      const method = connection ? 'put' : 'post'
      
      const response = await api[method](endpoint, {
        ...config,
        integrationId: integration.id
      })

      onSave(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save configuration')
    } finally {
      setLoading(false)
    }
  }

  const addCustomHeader = () => {
    const key = prompt('Header name:')
    if (key) {
      const value = prompt('Header value:')
      if (value) {
        setConfig(prev => ({
          ...prev,
          customHeaders: {
            ...prev.customHeaders,
            [key]: value
          }
        }))
      }
    }
  }

  const removeCustomHeader = (key) => {
    setConfig(prev => {
      const { [key]: _, ...rest } = prev.customHeaders
      return { ...prev, customHeaders: rest }
    })
  }

  const addEntityMapping = () => {
    setConfig(prev => ({
      ...prev,
      entityMappings: [
        ...prev.entityMappings,
        {
          id: Date.now(),
          sourceType: '',
          targetType: '',
          fieldMappings: {}
        }
      ]
    }))
  }

  const updateEntityMapping = (id, updates) => {
    setConfig(prev => ({
      ...prev,
      entityMappings: prev.entityMappings.map(mapping =>
        mapping.id === id ? { ...mapping, ...updates } : mapping
      )
    }))
  }

  const removeEntityMapping = (id) => {
    setConfig(prev => ({
      ...prev,
      entityMappings: prev.entityMappings.filter(mapping => mapping.id !== id)
    }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Basic Configuration */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Configuration</h3>
        
        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Connection Name
            </label>
            <input
              type="text"
              id="name"
              value={config.name}
              onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder={`My ${integration.displayName} Connection`}
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="description"
              value={config.description}
              onChange={(e) => setConfig(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="Optional description for this connection"
            />
          </div>
        </div>
      </div>

      {/* Sync Configuration */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Sync Configuration</h3>
        
        <div className="space-y-4">
          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.autoSync}
                onChange={(e) => setConfig(prev => ({ ...prev, autoSync: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">Enable automatic synchronization</span>
            </label>
          </div>

          {config.autoSync && (
            <div>
              <label htmlFor="syncInterval" className="block text-sm font-medium text-gray-700">
                Sync Interval
              </label>
              <select
                id="syncInterval"
                value={config.syncInterval}
                onChange={(e) => setConfig(prev => ({ ...prev, syncInterval: e.target.value }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="realtime">Real-time</option>
                <option value="5min">Every 5 minutes</option>
                <option value="15min">Every 15 minutes</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Webhook Configuration */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Webhook Configuration</h3>
        
        <div className="space-y-4">
          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.webhookEnabled}
                onChange={(e) => setConfig(prev => ({ ...prev, webhookEnabled: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">Enable webhooks for real-time updates</span>
            </label>
          </div>

          {config.webhookEnabled && (
            <div>
              <label htmlFor="webhookUrl" className="block text-sm font-medium text-gray-700">
                Webhook URL
              </label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                  {window.location.origin}/api/webhooks/
                </span>
                <input
                  type="text"
                  id="webhookUrl"
                  value={config.webhookUrl}
                  onChange={(e) => setConfig(prev => ({ ...prev, webhookUrl: e.target.value }))}
                  className="flex-1 block w-full rounded-none rounded-r-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="connection-id"
                  disabled
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                This URL will be automatically generated when the connection is created.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Advanced Configuration */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Advanced Configuration</h3>
        
        <div className="space-y-4">
          <div>
            <label htmlFor="rateLimitOverride" className="block text-sm font-medium text-gray-700">
              Rate Limit Override (requests per minute)
            </label>
            <input
              type="number"
              id="rateLimitOverride"
              value={config.rateLimitOverride}
              onChange={(e) => setConfig(prev => ({ ...prev, rateLimitOverride: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="Leave empty to use default"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Custom Headers
              </label>
              <Button type="button" onClick={addCustomHeader} size="sm" variant="secondary">
                Add Header
              </Button>
            </div>
            {Object.keys(config.customHeaders).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(config.customHeaders).map(([key, value]) => (
                  <div key={key} className="flex items-center space-x-2 p-2 bg-gray-50 rounded">
                    <code className="text-sm font-mono flex-1">{key}: {value}</code>
                    <button
                      type="button"
                      onClick={() => removeCustomHeader(key)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No custom headers configured</p>
            )}
          </div>
        </div>
      </div>

      {/* Entity Mappings */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Entity Mappings</h3>
          <Button type="button" onClick={addEntityMapping} size="sm" variant="secondary">
            Add Mapping
          </Button>
        </div>
        
        {config.entityMappings.length > 0 ? (
          <div className="space-y-4">
            {config.entityMappings.map((mapping) => (
              <div key={mapping.id} className="border border-gray-200 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Source Type
                    </label>
                    <input
                      type="text"
                      value={mapping.sourceType}
                      onChange={(e) => updateEntityMapping(mapping.id, { sourceType: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      placeholder="e.g., Contact"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Target Type
                    </label>
                    <input
                      type="text"
                      value={mapping.targetType}
                      onChange={(e) => updateEntityMapping(mapping.id, { targetType: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      placeholder="e.g., User"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeEntityMapping(mapping.id)}
                  className="mt-2 text-sm text-red-600 hover:text-red-800"
                >
                  Remove Mapping
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No entity mappings configured</p>
        )}
      </div>

      {/* Form Actions */}
      <div className="flex justify-end space-x-3">
        <Button type="button" onClick={onCancel} variant="secondary">
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>
    </form>
  )
}

export default ConnectionConfigForm