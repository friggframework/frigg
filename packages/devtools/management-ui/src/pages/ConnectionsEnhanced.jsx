import React, { useState, useEffect } from 'react'
import { useFrigg } from '../hooks/useFrigg'
import { useSocket } from '../hooks/useSocket'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import StatusBadge from '../components/StatusBadge'
import OAuthFlow from '../components/connections/OAuthFlow'
import ConnectionTester from '../components/connections/ConnectionTester'
import ConnectionHealthMonitor from '../components/connections/ConnectionHealthMonitor'
import EntityRelationshipMapper from '../components/connections/EntityRelationshipMapper'
import ConnectionConfigForm from '../components/connections/ConnectionConfigForm'
import api from '../services/api'

const ConnectionsEnhanced = () => {
  const { connections, users, integrations, refreshConnections } = useFrigg()
<<<<<<< HEAD
  const { socket, emit, on } = useSocket()
=======
<<<<<<< HEAD
<<<<<<< HEAD
  const { socket, emit, on } = useSocket()
=======
  const socket = useSocket()
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
  const { socket, emit, on } = useSocket()
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
  const [selectedConnection, setSelectedConnection] = useState(null)
  const [activeView, setActiveView] = useState('overview') // overview, test, health, entities, config
  const [showOAuthFlow, setShowOAuthFlow] = useState(false)
  const [showConfigForm, setShowConfigForm] = useState(false)
  const [selectedIntegration, setSelectedIntegration] = useState(null)
  const [connectionStats, setConnectionStats] = useState(null)

  useEffect(() => {
    fetchConnectionStats()
<<<<<<< HEAD
    
=======
<<<<<<< HEAD

>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
    // Subscribe to real-time updates
    const unsubscribeUpdate = on('connection-update', handleConnectionUpdate)
    const unsubscribeTest = on('connection-test', handleTestUpdate)
    emit('subscribe', { topics: ['connections'] })

    return () => {
      if (unsubscribeUpdate) unsubscribeUpdate()
      if (unsubscribeTest) unsubscribeTest()
      emit('unsubscribe', { topics: ['connections'] })
<<<<<<< HEAD
=======
=======
    
    // Subscribe to real-time updates
    const unsubscribeUpdate = on('connection-update', handleConnectionUpdate)
    const unsubscribeTest = on('connection-test', handleTestUpdate)
    emit('subscribe', { topics: ['connections'] })

    return () => {
<<<<<<< HEAD
      if (socket) {
        socket.off('connection-update', handleConnectionUpdate)
        socket.off('connection-test', handleTestUpdate)
        socket.emit('unsubscribe', { topics: ['connections'] })
      }
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
      if (unsubscribeUpdate) unsubscribeUpdate()
      if (unsubscribeTest) unsubscribeTest()
      emit('unsubscribe', { topics: ['connections'] })
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
    }
  }, [socket])

  const fetchConnectionStats = async () => {
    try {
      const response = await api.get('/api/connections/stats/summary')
      setConnectionStats(response.data)
    } catch (error) {
      console.error('Failed to fetch connection stats:', error)
    }
  }

  const handleConnectionUpdate = (data) => {
    refreshConnections()
    fetchConnectionStats()
  }

  const handleTestUpdate = (data) => {
    if (selectedConnection?.id === data.connectionId) {
      // Update selected connection with test results
      setSelectedConnection(prev => ({
        ...prev,
        lastTestResult: data.summary
      }))
    }
  }

  const handleCreateConnection = (integration) => {
    setSelectedIntegration(integration)
    setShowOAuthFlow(true)
  }

  const handleOAuthSuccess = async (connection) => {
    setShowOAuthFlow(false)
    setSelectedIntegration(null)
    await refreshConnections()
    setSelectedConnection(connection)
    setActiveView('config')
    setShowConfigForm(true)
  }

  const handleConfigSave = async (config) => {
    setShowConfigForm(false)
    await refreshConnections()
  }

  const handleDeleteConnection = async (connectionId) => {
    if (confirm('Are you sure you want to delete this connection?')) {
      try {
        await api.delete(`/api/connections/${connectionId}`)
        await refreshConnections()
        if (selectedConnection?.id === connectionId) {
          setSelectedConnection(null)
        }
      } catch (error) {
        console.error('Failed to delete connection:', error)
        alert('Failed to delete connection')
      }
    }
  }

  const getIntegrationDetails = (integrationId) => {
    return integrations.find(i => i.id === integrationId) || { name: integrationId }
  }

  const getUserDetails = (userId) => {
    const user = users.find(u => u.id === userId)
    return user ? `${user.firstName} ${user.lastName}` : userId
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Connection Management</h2>
          <p className="mt-2 text-gray-600">
            Manage integration connections, test connectivity, and monitor health
          </p>
        </div>
        <Button onClick={() => setShowOAuthFlow(true)} variant="primary">
          New Connection
        </Button>
      </div>

      {/* Stats Overview */}
      {connectionStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <div className="p-4">
              <p className="text-sm text-gray-500">Total Connections</p>
              <p className="text-2xl font-bold text-gray-900">
                {connectionStats.totalConnections}
              </p>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <p className="text-sm text-gray-500">Active</p>
              <p className="text-2xl font-bold text-green-600">
                {connectionStats.activeConnections}
              </p>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <p className="text-sm text-gray-500">Total Entities</p>
              <p className="text-2xl font-bold text-gray-900">
                {connectionStats.totalEntities}
              </p>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <p className="text-sm text-gray-500">Recently Used</p>
              <p className="text-2xl font-bold text-blue-600">
                {connectionStats.recentlyUsed}
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connections List */}
        <div className="lg:col-span-1">
          <Card>
            <div className="p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Connections</h3>
              <div className="space-y-2">
                {connections.map((connection) => {
                  const integration = getIntegrationDetails(connection.integration)
                  return (
                    <button
                      key={connection.id}
                      onClick={() => {
                        setSelectedConnection(connection)
                        setActiveView('overview')
                      }}
<<<<<<< HEAD
=======
<<<<<<< HEAD
                      className={`w-full text-left p-3 rounded-lg transition-colors ${selectedConnection?.id === connection.id
                          ? 'bg-blue-50 border-blue-500 border'
                          : 'hover:bg-gray-50 border border-gray-200'
                        }`}
=======
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        selectedConnection?.id === connection.id
                          ? 'bg-blue-50 border-blue-500 border'
                          : 'hover:bg-gray-50 border border-gray-200'
                      }`}
<<<<<<< HEAD
=======
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">
                            {connection.name || integration.displayName || integration.name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {getUserDetails(connection.userId)}
                          </p>
                        </div>
<<<<<<< HEAD
                        <ConnectionHealthMonitor 
                          connectionId={connection.id} 
=======
<<<<<<< HEAD
                        <ConnectionHealthMonitor
                          connectionId={connection.id}
=======
                        <ConnectionHealthMonitor 
                          connectionId={connection.id} 
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
                          compact={true}
                        />
                      </div>
                    </button>
                  )
                })}
              </div>
<<<<<<< HEAD
              
=======
<<<<<<< HEAD

=======
              
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
              {connections.length === 0 && (
                <p className="text-center text-gray-500 py-8">
                  No connections yet. Create your first connection above.
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* Detail View */}
        <div className="lg:col-span-2">
          {selectedConnection ? (
            <div className="space-y-6">
              {/* Connection Header */}
              <Card>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">
<<<<<<< HEAD
                        {selectedConnection.name || 
                         getIntegrationDetails(selectedConnection.integration).displayName}
=======
<<<<<<< HEAD
                        {selectedConnection.name ||
                          getIntegrationDetails(selectedConnection.integration).displayName}
=======
                        {selectedConnection.name || 
                         getIntegrationDetails(selectedConnection.integration).displayName}
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
                      </h3>
                      <p className="text-sm text-gray-500">
                        Connected by {getUserDetails(selectedConnection.userId)}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
<<<<<<< HEAD
                      <StatusBadge 
=======
<<<<<<< HEAD
                      <StatusBadge
=======
                      <StatusBadge 
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
                        status={selectedConnection.status === 'active' ? 'success' : 'error'}
                        text={selectedConnection.status}
                      />
                      <Button
                        onClick={() => handleDeleteConnection(selectedConnection.id)}
                        variant="secondary"
                        size="sm"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  {/* View Tabs */}
                  <div className="flex space-x-1 border-b border-gray-200">
                    {[
                      { id: 'overview', label: 'Overview' },
                      { id: 'test', label: 'Test' },
                      { id: 'health', label: 'Health' },
                      { id: 'entities', label: 'Entities' },
                      { id: 'config', label: 'Configuration' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveView(tab.id)}
<<<<<<< HEAD
=======
<<<<<<< HEAD
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeView === tab.id
                            ? 'text-blue-600 border-blue-600'
                            : 'text-gray-500 border-transparent hover:text-gray-700'
                          }`}
=======
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                          activeView === tab.id
                            ? 'text-blue-600 border-blue-600'
                            : 'text-gray-500 border-transparent hover:text-gray-700'
                        }`}
<<<<<<< HEAD
=======
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Active View Content */}
              {activeView === 'overview' && (
                <Card>
                  <div className="p-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">
                      Connection Details
                    </h4>
                    <dl className="grid grid-cols-2 gap-4">
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Connection ID</dt>
                        <dd className="mt-1 text-sm text-gray-900 font-mono">
                          {selectedConnection.id}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Created</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {new Date(selectedConnection.createdAt).toLocaleString()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {new Date(selectedConnection.updatedAt).toLocaleString()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Last Used</dt>
                        <dd className="mt-1 text-sm text-gray-900">
<<<<<<< HEAD
                          {selectedConnection.lastUsed 
=======
<<<<<<< HEAD
                          {selectedConnection.lastUsed
=======
                          {selectedConnection.lastUsed 
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
                            ? new Date(selectedConnection.lastUsed).toLocaleString()
                            : 'Never'}
                        </dd>
                      </div>
                    </dl>
<<<<<<< HEAD
                    
=======
<<<<<<< HEAD

=======
                    
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
                    {selectedConnection.description && (
                      <div className="mt-4">
                        <h5 className="text-sm font-medium text-gray-500">Description</h5>
                        <p className="mt-1 text-sm text-gray-900">
                          {selectedConnection.description}
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {activeView === 'test' && (
<<<<<<< HEAD
                <ConnectionTester 
=======
<<<<<<< HEAD
                <ConnectionTester
=======
                <ConnectionTester 
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
                  connection={selectedConnection}
                  onTestComplete={(result) => {
                    // Handle test completion
                    console.log('Test completed:', result)
                  }}
                />
              )}

              {activeView === 'health' && (
<<<<<<< HEAD
                <ConnectionHealthMonitor 
=======
<<<<<<< HEAD
                <ConnectionHealthMonitor
=======
                <ConnectionHealthMonitor 
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
                  connectionId={selectedConnection.id}
                  compact={false}
                />
              )}

              {activeView === 'entities' && (
<<<<<<< HEAD
                <EntityRelationshipMapper 
=======
<<<<<<< HEAD
                <EntityRelationshipMapper
=======
                <EntityRelationshipMapper 
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
                  connectionId={selectedConnection.id}
                />
              )}

              {activeView === 'config' && (
                <Card>
                  <div className="p-6">
                    {showConfigForm ? (
                      <ConnectionConfigForm
                        connection={selectedConnection}
                        integration={getIntegrationDetails(selectedConnection.integration)}
                        onSave={handleConfigSave}
                        onCancel={() => setShowConfigForm(false)}
                      />
                    ) : (
                      <div>
                        <h4 className="text-lg font-semibold text-gray-900 mb-4">
                          Configuration
                        </h4>
<<<<<<< HEAD
                        <Button 
=======
<<<<<<< HEAD
                        <Button
=======
                        <Button 
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
                          onClick={() => setShowConfigForm(true)}
                          variant="primary"
                        >
                          Edit Configuration
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <div className="p-8 text-center">
                <p className="text-gray-500">
                  Select a connection to view details and manage settings
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* OAuth Flow Modal */}
      {showOAuthFlow && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full">
            {selectedIntegration ? (
              <OAuthFlow
                integration={selectedIntegration}
                onSuccess={handleOAuthSuccess}
                onCancel={() => {
                  setShowOAuthFlow(false)
                  setSelectedIntegration(null)
                }}
              />
            ) : (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Select Integration
                </h3>
                <div className="space-y-2">
                  {integrations.map((integration) => (
                    <button
                      key={integration.id}
                      onClick={() => setSelectedIntegration(integration)}
                      className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                    >
                      <p className="font-medium text-gray-900">
                        {integration.displayName || integration.name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {integration.description}
                      </p>
                    </button>
                  ))}
                </div>
                <Button
                  onClick={() => setShowOAuthFlow(false)}
                  variant="secondary"
                  className="mt-4 w-full"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ConnectionsEnhanced