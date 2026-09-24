import React, { useState, useEffect } from 'react'
import { useSocket } from '../../hooks/useSocket'
import StatusBadge from '../StatusBadge'
import api from '../../services/api'

const ConnectionHealthMonitor = ({ connectionId, compact = false }) => {
  const socket = useSocket()
  const [health, setHealth] = useState({
    status: 'unknown',
    lastCheck: null,
    uptime: 0,
    latency: null,
    errorRate: 0,
    apiCalls: {
      total: 0,
      successful: 0,
      failed: 0
    }
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch initial health data
    fetchHealthData()

    // Subscribe to real-time health updates
    if (socket) {
      socket.on(`connection-health-${connectionId}`, handleHealthUpdate)
      socket.emit('subscribe', { topics: [`connection-health-${connectionId}`] })
    }

    // Set up periodic health checks
    const interval = setInterval(fetchHealthData, 60000) // Check every minute

    return () => {
      if (socket) {
        socket.off(`connection-health-${connectionId}`, handleHealthUpdate)
        socket.emit('unsubscribe', { topics: [`connection-health-${connectionId}`] })
      }
      clearInterval(interval)
    }
  }, [connectionId, socket])

  const fetchHealthData = async () => {
    try {
      const response = await api.get(`/api/connections/${connectionId}/health`)
      setHealth(response.data)
      setLoading(false)
    } catch (error) {
      console.error('Failed to fetch health data:', error)
      setHealth(prev => ({ ...prev, status: 'error' }))
      setLoading(false)
    }
  }

  const handleHealthUpdate = (data) => {
    setHealth(prev => ({
      ...prev,
      ...data,
      lastCheck: new Date().toISOString()
    }))
  }

  const getHealthStatus = () => {
    if (health.status === 'healthy' && health.errorRate < 5) {
      return { color: 'success', text: 'Healthy' }
    } else if (health.status === 'healthy' && health.errorRate < 20) {
      return { color: 'warning', text: 'Degraded' }
    } else if (health.status === 'error' || health.errorRate >= 20) {
      return { color: 'error', text: 'Unhealthy' }
    }
    return { color: 'default', text: 'Unknown' }
  }

  const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    
    if (days > 0) {
      return `${days}d ${hours}h`
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  const healthStatus = getHealthStatus()

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-24"></div>
      </div>
    )
  }

  if (compact) {
    return (
      <div className="flex items-center space-x-2">
        <StatusBadge status={healthStatus.color} text={healthStatus.text} />
        {health.latency && (
          <span className="text-xs text-gray-500">{health.latency}ms</span>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Connection Health</h3>
        <StatusBadge status={healthStatus.color} text={healthStatus.text} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-gray-500">Uptime</p>
          <p className="text-lg font-medium text-gray-900">
            {formatUptime(health.uptime)}
          </p>
        </div>

        <div>
          <p className="text-sm text-gray-500">Response Time</p>
          <p className="text-lg font-medium text-gray-900">
            {health.latency ? `${health.latency}ms` : 'N/A'}
          </p>
        </div>

        <div>
          <p className="text-sm text-gray-500">Success Rate</p>
          <p className="text-lg font-medium text-gray-900">
            {health.apiCalls.total > 0
              ? `${Math.round((health.apiCalls.successful / health.apiCalls.total) * 100)}%`
              : 'N/A'}
          </p>
        </div>

        <div>
          <p className="text-sm text-gray-500">Total API Calls</p>
          <p className="text-lg font-medium text-gray-900">
            {health.apiCalls.total.toLocaleString()}
          </p>
        </div>
      </div>

      {health.apiCalls.failed > 0 && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">
            {health.apiCalls.failed} failed API calls in the last 24 hours
          </p>
        </div>
      )}

      {health.lastCheck && (
        <p className="mt-4 text-xs text-gray-500">
          Last checked: {new Date(health.lastCheck).toLocaleTimeString()}
        </p>
      )}

      <div className="mt-6 pt-4 border-t border-gray-200">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Recent Activity</h4>
        
        <div className="space-y-2">
          {health.recentEvents?.map((event, index) => (
            <div key={index} className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{event.type}</span>
              <span className="text-gray-500 text-xs">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
            </div>
          )) || (
            <p className="text-sm text-gray-500">No recent activity</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default ConnectionHealthMonitor