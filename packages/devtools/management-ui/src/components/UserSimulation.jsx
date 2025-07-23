import React, { useState, useEffect } from 'react'
import { Play, Square, AlertCircle, CheckCircle, Clock, Zap } from 'lucide-react'
import { useFrigg } from '../hooks/useFrigg'
import { useSocket } from '../hooks/useSocket'
import api from '../services/api'
<<<<<<< HEAD
<<<<<<< HEAD
import { cn } from '../lib/utils'
=======
import { cn } from '../utils/cn'
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
import { cn } from '../lib/utils'
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)

const UserSimulation = ({ user, integration }) => {
  const { currentUser } = useFrigg()
  const { on } = useSocket()
  const [isSimulating, setIsSimulating] = useState(false)
  const [session, setSession] = useState(null)
  const [logs, setLogs] = useState([])
  const [selectedAction, setSelectedAction] = useState('list')
  const [actionPayload, setActionPayload] = useState('')

  const simulationUser = user || currentUser

  useEffect(() => {
    // Listen for simulation events
    const unsubscribeAuth = on('simulation:auth', (data) => {
      addLog('Authentication', data.session)
    })

    const unsubscribeAction = on('simulation:action', (data) => {
      addLog('Action Performed', data.actionResult)
    })

    const unsubscribeWebhook = on('simulation:webhook', (data) => {
      addLog('Webhook Event', data.webhookEvent)
    })

    return () => {
      unsubscribeAuth && unsubscribeAuth()
      unsubscribeAction && unsubscribeAction()
      unsubscribeWebhook && unsubscribeWebhook()
    }
  }, [on])

  const addLog = (type, data) => {
    setLogs(prev => [{
      id: Date.now(),
      type,
      data,
      timestamp: new Date().toISOString()
    }, ...prev].slice(0, 50)) // Keep last 50 logs
  }

  const startSimulation = async () => {
    if (!simulationUser || !integration) {
      alert('Please select a user and integration')
      return
    }

    try {
      setIsSimulating(true)
      const response = await api.post('/api/users/simulation/authenticate', {
        userId: simulationUser.id,
        integrationId: integration.id
      })
<<<<<<< HEAD

=======
      
>>>>>>> 652520a5 (Claude Flow RFC related development)
      setSession(response.data.session)
      addLog('Session Started', response.data.session)
    } catch (error) {
      console.error('Failed to start simulation:', error)
      alert('Failed to start simulation')
      setIsSimulating(false)
    }
  }

  const stopSimulation = async () => {
    if (!session) return

    try {
      await api.delete(`/api/users/simulation/sessions/${session.sessionId}`)
      setSession(null)
      setIsSimulating(false)
      addLog('Session Ended', { sessionId: session.sessionId })
    } catch (error) {
      console.error('Failed to stop simulation:', error)
    }
  }

  const performAction = async () => {
    if (!session) return

    try {
      let payload = {}
      if (actionPayload) {
        try {
          payload = JSON.parse(actionPayload)
        } catch {
          payload = { data: actionPayload }
        }
      }

      const response = await api.post('/api/users/simulation/action', {
        sessionId: session.sessionId,
        action: selectedAction,
        payload
      })

      addLog('Action Result', response.data.actionResult)
    } catch (error) {
      console.error('Failed to perform action:', error)
      alert('Failed to perform action')
    }
  }

  const simulateWebhook = async () => {
    if (!simulationUser || !integration) return

    try {
      const response = await api.post('/api/users/simulation/webhook', {
        userId: simulationUser.id,
        integrationId: integration.id,
        event: 'data.updated',
        data: {
          id: 'webhook_item_' + Date.now(),
          changes: ['field1', 'field2'],
          timestamp: new Date().toISOString()
        }
      })

      addLog('Webhook Simulated', response.data.webhookEvent)
    } catch (error) {
      console.error('Failed to simulate webhook:', error)
      alert('Failed to simulate webhook')
    }
  }

  const commonActions = [
    { value: 'list', label: 'List Items' },
    { value: 'create', label: 'Create Item' },
    { value: 'update', label: 'Update Item' },
    { value: 'delete', label: 'Delete Item' },
    { value: 'sync', label: 'Sync Data' }
  ]

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">User Simulation</h3>
        <p className="text-sm text-gray-600">
          Simulate user interactions with integrations for testing
        </p>
      </div>

      {/* Simulation Controls */}
      <div className="space-y-4 mb-6">
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="text-sm font-medium text-gray-900">
              {simulationUser ? `${simulationUser.firstName} ${simulationUser.lastName}` : 'No user selected'}
            </p>
            <p className="text-xs text-gray-500">
              {integration ? integration.name : 'No integration selected'}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            {!isSimulating ? (
              <button
                onClick={startSimulation}
                disabled={!simulationUser || !integration}
                className={cn(
                  "flex items-center space-x-2 px-4 py-2 rounded-md transition-colors",
                  simulationUser && integration
                    ? "bg-green-600 text-white hover:bg-green-700"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                )}
              >
                <Play size={16} />
                <span>Start Simulation</span>
              </button>
            ) : (
              <button
                onClick={stopSimulation}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                <Square size={16} />
                <span>Stop Simulation</span>
              </button>
            )}
          </div>
        </div>

        {session && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start space-x-3">
              <CheckCircle className="text-blue-600 mt-0.5" size={20} />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900">Session Active</p>
                <p className="text-xs text-blue-700 mt-1">
                  Session ID: {session.sessionId}
                </p>
                <p className="text-xs text-blue-700">
                  Expires: {new Date(session.expiresAt).toLocaleTimeString()}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Simulator */}
      {isSimulating && session && (
        <div className="space-y-4 mb-6">
          <div className="p-4 border border-gray-200 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Simulate Action</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Action Type
                </label>
                <select
                  value={selectedAction}
                  onChange={(e) => setSelectedAction(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                >
                  {commonActions.map(action => (
                    <option key={action.value} value={action.value}>
                      {action.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Payload (JSON)
                </label>
                <textarea
                  value={actionPayload}
                  onChange={(e) => setActionPayload(e.target.value)}
                  placeholder='{"name": "Test Item"}'
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500 font-mono text-xs"
                  rows={3}
                />
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={performAction}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
                >
                  <Zap size={14} />
                  <span>Execute Action</span>
                </button>
                <button
                  onClick={simulateWebhook}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700"
                >
                  <AlertCircle size={14} />
                  <span>Trigger Webhook</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Activity Logs */}
      <div>
        <h4 className="text-sm font-medium text-gray-900 mb-3">Activity Log</h4>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No activity yet. Start a simulation to see logs.
            </p>
          ) : (
            logs.map(log => (
              <div
                key={log.id}
                className="p-3 bg-gray-50 rounded-md border border-gray-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <Clock size={14} className="text-gray-500" />
                    <span className="text-xs font-medium text-gray-900">
                      {log.type}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="mt-1">
                  <pre className="text-xs text-gray-600 font-mono overflow-x-auto">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default UserSimulation