import React, { useState } from 'react'
import { useFrigg } from '../hooks/useFrigg'
import UserSimulation from '../components/UserSimulation'

const Simulation = () => {
  const { users, integrations, currentUser } = useFrigg()
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedIntegration, setSelectedIntegration] = useState(null)

  // Use current user context if available
  const simulationUser = selectedUser || currentUser

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Integration Testing Simulator</h2>
        <p className="mt-2 text-gray-600">Simulate user interactions with integrations for development testing</p>
      </div>

      {/* Selection Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* User Selection */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Select Test User</h3>
          {currentUser && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                Using context user: <strong>{currentUser.firstName} {currentUser.lastName}</strong>
              </p>
            </div>
          )}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {users.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No test users available. Create some users first.
              </p>
            ) : (
              users.map(user => (
                <label
                  key={user.id}
                  className={`flex items-center p-3 border rounded-md cursor-pointer transition-colors ${
                    (simulationUser?.id === user.id) 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="user"
                    value={user.id}
                    checked={simulationUser?.id === user.id}
                    onChange={() => setSelectedUser(user)}
                    className="mr-3"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {user.role}
                      </span>
                      {user.appOrgId && (
                        <span className="text-xs text-gray-500">
                          Org: {user.appOrgId}
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Integration Selection */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Select Integration</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {integrations.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No integrations available. Install some integrations first.
              </p>
            ) : (
              integrations.map(integration => (
                <label
                  key={integration.id}
                  className={`flex items-center p-3 border rounded-md cursor-pointer transition-colors ${
                    selectedIntegration?.id === integration.id 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="integration"
                    value={integration.id}
                    checked={selectedIntegration?.id === integration.id}
                    onChange={() => setSelectedIntegration(integration)}
                    className="mr-3"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {integration.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {integration.description || 'No description'}
                    </p>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        integration.status === 'active' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {integration.status || 'inactive'}
                      </span>
                      <span className="text-xs text-gray-500">
                        v{integration.version || '1.0.0'}
                      </span>
                    </div>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Simulation Component */}
      <UserSimulation 
        user={simulationUser} 
        integration={selectedIntegration} 
      />

      {/* Help Section */}
      <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <h4 className="text-sm font-semibold text-yellow-900 mb-2">How to Use the Simulator</h4>
        <ol className="text-sm text-yellow-800 space-y-2 list-decimal list-inside">
          <li>Select a test user or use the current context user from the header</li>
          <li>Choose an integration to test</li>
          <li>Start a simulation session</li>
          <li>Execute actions and observe the responses</li>
          <li>Simulate webhook events to test integration reactions</li>
          <li>Monitor the activity log for debugging</li>
        </ol>
        <p className="text-xs text-yellow-700 mt-3">
          Note: All simulations are for local development only and do not affect real data.
        </p>
      </div>
    </div>
  )
}

export default Simulation