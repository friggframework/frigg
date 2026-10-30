import React, { useState, useEffect } from 'react'
import { useFrigg } from '../hooks/useFrigg'
import { useSocket } from '../hooks/useSocket'
import api from '../services/api'
import EnvironmentEditor from '../components/EnvironmentEditor'
import EnvironmentSchema from '../components/EnvironmentSchema'
import EnvironmentCompare from '../components/EnvironmentCompare'
import EnvironmentImportExport from '../components/EnvironmentImportExport'
import EnvironmentSecurity from '../components/EnvironmentSecurity'

const Environment = () => {
  const { envVariables, updateEnvVariable, refreshData } = useFrigg()
  const { on } = useSocket()
  const [activeTab, setActiveTab] = useState('editor') // editor, schema, compare, import-export, security
  const [selectedEnvironment, setSelectedEnvironment] = useState('local')
  const [variables, setVariables] = useState([])
  const [loading, setLoading] = useState(false)
  const [notification, setNotification] = useState(null)

  // Load environment variables
  useEffect(() => {
    loadEnvironmentVariables()
  }, [selectedEnvironment])

  // Listen for real-time updates
  useEffect(() => {
    const unsubscribe = on('env-update', (data) => {
      if (data.environment === selectedEnvironment) {
        loadEnvironmentVariables()
        showNotification('Environment variables updated', 'success')
      }
    })
    return unsubscribe
  }, [on, selectedEnvironment])

  const loadEnvironmentVariables = async () => {
    setLoading(true)
    try {
      const response = await api.get(`/api/environment/variables/${selectedEnvironment}`)
      setVariables(response.data.variables || [])
    } catch (error) {
      console.error('Error loading variables:', error)
      showNotification('Failed to load environment variables', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveVariables = async (updatedVariables) => {
    try {
      await api.put(`/api/environment/variables/${selectedEnvironment}`, {
        variables: updatedVariables
      })
      await loadEnvironmentVariables()
      showNotification('Environment variables saved successfully', 'success')
    } catch (error) {
      console.error('Error saving variables:', error)
      showNotification('Failed to save environment variables', 'error')
      throw error
    }
  }

  const handleVariableUpdate = async (key, value) => {
    try {
      await api.post('/api/environment', { key, value })
      await loadEnvironmentVariables()
      showNotification(`Variable ${key} updated`, 'success')
    } catch (error) {
      console.error('Error updating variable:', error)
      showNotification('Failed to update variable', 'error')
    }
  }

  const handleVariableDelete = async (key) => {
    if (!window.confirm(`Are you sure you want to delete ${key}?`)) return
    
    try {
      await api.delete(`/api/environment/${key}`)
      await loadEnvironmentVariables()
      showNotification(`Variable ${key} deleted`, 'success')
    } catch (error) {
      console.error('Error deleting variable:', error)
      showNotification('Failed to delete variable', 'error')
    }
  }

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 5000)
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Environment Variables</h2>
            <p className="mt-2 text-gray-600">Manage environment variables across different environments</p>
          </div>
          
          {/* Environment Selector */}
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">Environment:</label>
            <select
              value={selectedEnvironment}
              onChange={(e) => setSelectedEnvironment(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
            >
              <option value="local">Local</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`mb-4 p-4 rounded-md ${
          notification.type === 'success' ? 'bg-green-50 text-green-800' :
          notification.type === 'error' ? 'bg-red-50 text-red-800' :
          'bg-blue-50 text-blue-800'
        }`}>
          <div className="flex">
            <div className="flex-shrink-0">
              {notification.type === 'success' && (
                <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
              {notification.type === 'error' && (
                <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium">{notification.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('editor')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'editor'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Editor
            </button>
            <button
              onClick={() => setActiveTab('schema')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'schema'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Schema & Validation
            </button>
            <button
              onClick={() => setActiveTab('compare')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'compare'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Compare & Sync
            </button>
            <button
              onClick={() => setActiveTab('import-export')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'import-export'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Import/Export
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'security'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Security
            </button>
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Loading...</div>
          </div>
        ) : (
          <>
            {/* Editor Tab */}
            {activeTab === 'editor' && (
              <EnvironmentEditor
                variables={variables}
                environment={selectedEnvironment}
                onSave={handleSaveVariables}
                onVariableUpdate={handleVariableUpdate}
                onVariableDelete={handleVariableDelete}
                readOnly={selectedEnvironment === 'production'}
              />
            )}

            {/* Schema Tab */}
            {activeTab === 'schema' && (
              <EnvironmentSchema
                variables={variables}
                environment={selectedEnvironment}
                onSchemaUpdate={(schema) => {
                  showNotification('Schema updated', 'success')
                }}
              />
            )}

            {/* Compare Tab */}
            {activeTab === 'compare' && (
              <EnvironmentCompare
                onSync={(result) => {
                  showNotification(
                    `Synced ${result.count} variables from ${result.source} to ${result.target}`,
                    'success'
                  )
                  if (result.target === selectedEnvironment) {
                    loadEnvironmentVariables()
                  }
                }}
              />
            )}

            {/* Import/Export Tab */}
            {activeTab === 'import-export' && (
              <EnvironmentImportExport
                environment={selectedEnvironment}
                onImport={(result) => {
                  showNotification(
                    `Imported ${result.imported} variables`,
                    'success'
                  )
                  loadEnvironmentVariables()
                }}
                onExport={(result) => {
                  showNotification(
                    `Exported variables as ${result.format.toUpperCase()}`,
                    'success'
                  )
                }}
              />
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              <EnvironmentSecurity
                environment={selectedEnvironment}
              />
            )}
          </>
        )}
      </div>

      {/* AWS Parameter Store Status (for production) */}
      {selectedEnvironment === 'production' && (
        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex">
              <svg className="h-5 w-5 text-yellow-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="text-sm text-yellow-700">
                <p className="font-medium">Production Environment</p>
                <p>This environment can sync with AWS Parameter Store for secure secret management.</p>
              </div>
            </div>
            <button
              onClick={async () => {
                try {
                  await api.post('/api/environment/sync/aws-parameter-store', {
                    environment: 'production'
                  })
                  showNotification('Synced with AWS Parameter Store', 'success')
                } catch (error) {
                  showNotification('Failed to sync with AWS', 'error')
                }
              }}
              className="px-3 py-1 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700"
            >
              Sync with AWS
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Environment