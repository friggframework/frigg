import React, { useState } from 'react'
import { useFrigg } from '../hooks/useFrigg'

const Connections = () => {
  const { connections, users, integrations } = useFrigg()
  const [selectedConnection, setSelectedConnection] = useState(null)
  const [viewMode, setViewMode] = useState('list') // list or details

  const getIntegrationName = (integrationId) => {
    const integration = integrations.find(i => i.id === integrationId)
    return integration?.displayName || integration?.name || integrationId
  }

  const getUserName = (userId) => {
    const user = users.find(u => u.id === userId)
    return user ? `${user.firstName} ${user.lastName}` : userId
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Connection Management</h2>
        <p className="mt-2 text-gray-600">View and manage integration connections and entities</p>
      </div>

      {/* View Toggle */}
      <div className="mb-6 flex justify-between items-center">
        <div className="flex space-x-2">
          <button
            onClick={() => setViewMode('list')}
            className={`px-4 py-2 rounded-md transition-colors ${
              viewMode === 'list'
                ? 'bg-frigg-blue text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            List View
          </button>
          <button
            onClick={() => setViewMode('details')}
            className={`px-4 py-2 rounded-md transition-colors ${
              viewMode === 'details'
                ? 'bg-frigg-blue text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Details View
          </button>
        </div>
        <div className="text-sm text-gray-600">
          Total Connections: <span className="font-medium">{connections.length}</span>
        </div>
      </div>

      {viewMode === 'list' ? (
        /* List View */
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Connection
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Entities
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {connections.map((connection) => (
                <tr key={connection.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {getIntegrationName(connection.integrationId)}
                    </div>
                    <div className="text-sm text-gray-500">
                      ID: {connection.id}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {getUserName(connection.userId)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      connection.active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {connection.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {connection.entities?.length || 0} entities
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => {
                        setSelectedConnection(connection)
                        setViewMode('details')
                      }}
                      className="text-frigg-blue hover:text-blue-700 mr-3"
                    >
                      View Details
                    </button>
                    <button className="text-red-600 hover:text-red-900">
                      Disconnect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Details View */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Connection List */}
          <div className="lg:col-span-1">
            <div className="bg-white shadow rounded-lg p-4">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Connections</h3>
              <div className="space-y-2">
                {connections.map((connection) => (
                  <button
                    key={connection.id}
                    onClick={() => setSelectedConnection(connection)}
                    className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                      selectedConnection?.id === connection.id
                        ? 'bg-frigg-blue text-white'
                        : 'hover:bg-gray-100'
                    }`}
                  >
                    <div className="font-medium">
                      {getIntegrationName(connection.integrationId)}
                    </div>
                    <div className={`text-sm ${
                      selectedConnection?.id === connection.id ? 'text-blue-100' : 'text-gray-500'
                    }`}>
                      {getUserName(connection.userId)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Connection Details */}
          <div className="lg:col-span-2">
            {selectedConnection ? (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Connection Details</h3>
                
                {/* Basic Info */}
                <div className="mb-6">
                  <dl className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Integration</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {getIntegrationName(selectedConnection.integrationId)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">User</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {getUserName(selectedConnection.userId)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Status</dt>
                      <dd className="mt-1">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          selectedConnection.active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {selectedConnection.active ? 'Active' : 'Inactive'}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Created</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {new Date(selectedConnection.createdAt).toLocaleDateString()}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Entities */}
                <div>
                  <h4 className="text-md font-medium text-gray-900 mb-3">Entities</h4>
                  {selectedConnection.entities?.length > 0 ? (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              Type
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              ID
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              Name
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {selectedConnection.entities.map((entity, index) => (
                            <tr key={index}>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                                {entity.type}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm font-mono text-gray-600">
                                {entity.id}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                                {entity.name}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No entities found for this connection.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white shadow rounded-lg p-6">
                <p className="text-gray-500 text-center">Select a connection to view details</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Connections