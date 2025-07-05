import React, { useState, useEffect } from 'react'
import { CheckCircle, AlertCircle, Clock, Activity, RefreshCw, Zap, Shield, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './Card'
import { Button } from './Button'
import LoadingSpinner from './LoadingSpinner'
<<<<<<< HEAD
<<<<<<< HEAD
import { cn } from '../lib/utils'
=======
import { cn } from '../utils/cn'
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
import { cn } from '../lib/utils'
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
import api from '../services/api'
import { useSocket } from '../hooks/useSocket'

const IntegrationStatus = ({ integrationName, className }) => {
  const { on } = useSocket()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [metrics, setMetrics] = useState(null)

  useEffect(() => {
    fetchStatus()
<<<<<<< HEAD

=======
    
>>>>>>> 652520a5 (Claude Flow RFC related development)
    // Subscribe to real-time updates
    const unsubscribeHealth = on('integration:health:update', (data) => {
      if (data.packageName === integrationName) {
        setStatus(prevStatus => ({
          ...prevStatus,
          health: data.health,
          lastChecked: new Date().toISOString()
        }))
      }
    })

    const unsubscribeMetrics = on('integration:metrics:update', (data) => {
      if (data.packageName === integrationName) {
        setMetrics(data.metrics)
      }
    })

    // Poll for updates every 30 seconds
    const interval = setInterval(fetchStatus, 30000)

    return () => {
      unsubscribeHealth && unsubscribeHealth()
      unsubscribeMetrics && unsubscribeMetrics()
      clearInterval(interval)
    }
  }, [integrationName, on])

  const fetchStatus = async () => {
    try {
      setLoading(true)
<<<<<<< HEAD

=======
      
>>>>>>> 652520a5 (Claude Flow RFC related development)
      const [healthRes, metricsRes] = await Promise.all([
        api.get(`/api/discovery/health/${integrationName}`),
        api.get(`/api/integrations/${integrationName}/metrics`)
      ])
<<<<<<< HEAD

      setStatus(healthRes.data.data)
      setMetrics(metricsRes.data.metrics)

=======
      
      setStatus(healthRes.data.data)
      setMetrics(metricsRes.data.metrics)
      
>>>>>>> 652520a5 (Claude Flow RFC related development)
    } catch (err) {
      console.error('Failed to fetch integration status:', err)
      setStatus({
        installed: false,
        available: false,
        error: 'Failed to fetch status'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchStatus()
    setRefreshing(false)
  }

  const getStatusIcon = () => {
    if (!status?.installed) return <AlertCircle className="text-gray-400" />
    if (status.error) return <AlertCircle className="text-red-500" />
    if (status.updateAvailable) return <AlertTriangle className="text-yellow-500" />
    return <CheckCircle className="text-green-500" />
  }

  const getStatusText = () => {
    if (!status?.installed) return 'Not Installed'
    if (status.error) return 'Error'
    if (status.updateAvailable) return 'Update Available'
    return 'Healthy'
  }

  const getStatusColor = () => {
    if (!status?.installed) return 'text-gray-500'
    if (status.error) return 'text-red-500'
    if (status.updateAvailable) return 'text-yellow-600'
    return 'text-green-600'
  }

  if (loading && !status) {
    return (
      <Card className={className}>
        <CardContent className="p-6 flex items-center justify-center">
          <LoadingSpinner size="sm" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center">
            <Activity size={20} className="mr-2" />
            Integration Status
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={cn(refreshing && "animate-spin")} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Status */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center">
            {getStatusIcon()}
            <div className="ml-3">
              <p className={cn("font-medium", getStatusColor())}>
                {getStatusText()}
              </p>
              {status?.lastChecked && (
                <p className="text-xs text-gray-500">
                  Last checked: {new Date(status.lastChecked).toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
          {status?.installed && (
            <div className="text-right">
              <p className="text-sm font-medium text-gray-700">
                v{status.version}
              </p>
              {status.updateAvailable && (
                <p className="text-xs text-blue-600">
                  v{status.latestVersion} available
                </p>
              )}
            </div>
          )}
        </div>

        {/* Connection Metrics */}
        {metrics && (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-between">
                <Zap size={16} className="text-blue-500" />
                <span className="text-2xl font-bold text-blue-700">
                  {metrics.activeConnections || 0}
                </span>
              </div>
              <p className="text-xs text-blue-600 mt-1">Active Connections</p>
            </div>
<<<<<<< HEAD

=======
            
>>>>>>> 652520a5 (Claude Flow RFC related development)
            <div className="p-3 bg-green-50 rounded-lg">
              <div className="flex items-center justify-between">
                <Activity size={16} className="text-green-500" />
                <span className="text-2xl font-bold text-green-700">
                  {metrics.requestsToday || 0}
                </span>
              </div>
              <p className="text-xs text-green-600 mt-1">Requests Today</p>
            </div>
<<<<<<< HEAD

=======
            
>>>>>>> 652520a5 (Claude Flow RFC related development)
            <div className="p-3 bg-purple-50 rounded-lg">
              <div className="flex items-center justify-between">
                <Clock size={16} className="text-purple-500" />
                <span className="text-lg font-bold text-purple-700">
                  {metrics.avgResponseTime || 0}ms
                </span>
              </div>
              <p className="text-xs text-purple-600 mt-1">Avg Response Time</p>
            </div>
<<<<<<< HEAD

=======
            
>>>>>>> 652520a5 (Claude Flow RFC related development)
            <div className="p-3 bg-orange-50 rounded-lg">
              <div className="flex items-center justify-between">
                <Shield size={16} className="text-orange-500" />
                <span className="text-lg font-bold text-orange-700">
                  {metrics.successRate || 100}%
                </span>
              </div>
              <p className="text-xs text-orange-600 mt-1">Success Rate</p>
            </div>
          </div>
        )}

        {/* Recent Events */}
        {metrics?.recentEvents && metrics.recentEvents.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Recent Events</h4>
            <div className="space-y-1">
              {metrics.recentEvents.slice(0, 3).map((event, index) => (
                <div key={index} className="flex items-center text-xs">
                  <span className={cn(
                    "w-2 h-2 rounded-full mr-2",
                    event.type === 'success' && "bg-green-500",
                    event.type === 'error' && "bg-red-500",
                    event.type === 'warning' && "bg-yellow-500"
                  )} />
                  <span className="text-gray-600 flex-1">{event.message}</span>
                  <span className="text-gray-400">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error Details */}
        {status?.error && (
          <div className="p-3 bg-red-50 rounded-lg">
            <div className="flex items-start">
              <AlertCircle size={16} className="text-red-500 mr-2 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Error Details</p>
                <p className="text-xs text-red-600 mt-1">{status.error}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default IntegrationStatus