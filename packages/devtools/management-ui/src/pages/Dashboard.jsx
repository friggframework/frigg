import React, { useState, useEffect } from 'react'
import { useFrigg } from '../hooks/useFrigg'
import { useSocket } from '../hooks/useSocket'

const Dashboard = () => {
  const { status, startFrigg, stopFrigg, restartFrigg, integrations, users, connections, getMetrics, getLogs } = useFrigg()
  const { on } = useSocket()
  const [logs, setLogs] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [startOptions, setStartOptions] = useState({
    stage: 'dev',
    verbose: false
  })

  // Socket listeners for real-time updates
  useEffect(() => {
    const unsubscribeLogs = on('frigg:logs', (logData) => {
      setLogs(logData)
    })

    const unsubscribeLog = on('frigg:log', (logEntry) => {
      setLogs(prev => [...prev.slice(-99), logEntry]) // Keep last 100 logs
    })

    // Fetch initial logs and metrics
    const fetchData = async () => {
      try {
        if (typeof getLogs === 'function') {
          const logsData = await getLogs(50)
          setLogs(logsData)
        }
        
        if (typeof getMetrics === 'function') {
          const metricsData = await getMetrics()
          setMetrics(metricsData)
        }
      } catch (error) {
        console.error('Error fetching data:', error)
      }
    }

    fetchData()

    // Update metrics periodically when running
    const metricsInterval = setInterval(() => {
      if (status === 'running' && typeof getMetrics === 'function') {
        getMetrics().then(setMetrics).catch(console.error)
      }
    }, 5000)

    return () => {
      unsubscribeLogs && unsubscribeLogs()
      unsubscribeLog && unsubscribeLog()
      clearInterval(metricsInterval)
    }
  }, [on, getLogs, getMetrics, status])

  const handleStart = async () => {
    try {
      await startFrigg(startOptions)
    } catch (error) {
      console.error('Failed to start Frigg:', error)
    }
  }

  const handleStop = async (force = false) => {
    try {
      await stopFrigg(force)
    } catch (error) {
      console.error('Failed to stop Frigg:', error)
    }
  }

  const handleRestart = async () => {
    try {
      await restartFrigg(startOptions)
    } catch (error) {
      console.error('Failed to restart Frigg:', error)
    }
  }

  const stats = [
    { name: 'Integrations', value: integrations.length, icon: '🔌' },
    { name: 'Test Users', value: users.length, icon: '👤' },
    { name: 'Active Connections', value: connections.filter(c => c.active).length, icon: '🔗' },
    { name: 'Total Entities', value: connections.reduce((sum, c) => sum + (c.entities?.length || 0), 0), icon: '📊' },
  ]

  const formatUptime = (uptime) => {
    if (!uptime) return 'N/A'
    const seconds = Math.floor(uptime / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-foreground">Dashboard</h2>
        <p className="mt-2 text-muted-foreground">Manage your Frigg development environment</p>
      </div>

      {/* Control Panel */}
      <div className="bg-card shadow rounded-lg p-6 mb-8 border border-border">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-card-foreground">Frigg Server Control</h3>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-primary hover:text-primary/80"
          >
            {showAdvanced ? 'Hide' : 'Show'} Advanced Options
          </button>
        </div>
        
        {/* Advanced Options */}
        {showAdvanced && (
          <div className="mb-6 p-4 bg-muted/50 rounded-md">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Stage
                </label>
                <select
                  value={startOptions.stage}
                  onChange={(e) => setStartOptions(prev => ({ ...prev, stage: e.target.value }))}
                  className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="dev">Development</option>
                  <option value="staging">Staging</option>
                  <option value="prod">Production</option>
                </select>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="verbose"
                  checked={startOptions.verbose}
                  onChange={(e) => setStartOptions(prev => ({ ...prev, verbose: e.target.checked }))}
                  className="mr-2"
                />
                <label htmlFor="verbose" className="text-sm font-medium text-foreground">
                  Verbose logging
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Status Display */}
        <div className="mb-4 p-4 bg-muted/50 rounded-md">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Status:</span>
              <span className={`ml-2 font-medium ${
                status === 'running' ? 'text-green-600' : 
                status === 'stopped' ? 'text-red-600' : 
                'text-yellow-600'
              }`}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </div>
            {metrics && (
              <>
                <div>
                  <span className="text-muted-foreground">PID:</span>
                  <span className="ml-2 font-medium">{metrics.pid || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Uptime:</span>
                  <span className="ml-2 font-medium">{formatUptime(metrics.uptime)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Stage:</span>
                  <span className="ml-2 font-medium">{startOptions.stage}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center space-x-3">
          <button
            onClick={handleStart}
            disabled={status === 'running' || status === 'starting'}
            className={`px-6 py-3 rounded-md font-medium transition-colors ${
              status === 'running' || status === 'starting'
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            ▶️ Start
          </button>
          
          <button
            onClick={() => handleStop()}
            disabled={status === 'stopped' || status === 'stopping'}
            className={`px-6 py-3 rounded-md font-medium transition-colors ${
              status === 'stopped' || status === 'stopping'
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            ⏹️ Stop
          </button>

          <button
            onClick={handleRestart}
            disabled={status === 'starting' || status === 'stopping'}
            className={`px-6 py-3 rounded-md font-medium transition-colors ${
              status === 'starting' || status === 'stopping'
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            🔄 Restart
          </button>

          {(status === 'running' || status === 'stopping') && (
            <button
              onClick={() => handleStop(true)}
              className="px-4 py-3 rounded-md font-medium bg-orange-600 text-white hover:bg-orange-700 transition-colors"
            >
              ⚠️ Force Stop
            </button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-card shadow rounded-lg p-6 border border-border">
            <div className="flex items-center">
              <span className="text-3xl mr-3">{stat.icon}</span>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{stat.name}</p>
                <p className="text-2xl font-bold text-card-foreground">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Real-time Logs */}
      <div className="bg-card shadow rounded-lg p-6 mb-8 border border-border">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-card-foreground">Real-time Logs</h3>
          <button
            onClick={() => setLogs([])}
            className="text-sm text-red-600 hover:text-red-800"
          >
            Clear Logs
          </button>
        </div>
        <div className="bg-muted/30 dark:bg-gray-900 text-foreground dark:text-gray-100 p-4 rounded-md h-64 overflow-y-auto font-mono text-sm border border-border">
          {logs.length === 0 ? (
            <div className="text-muted-foreground text-center py-8">
              No logs available. Start Frigg to see real-time logs.
            </div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="mb-1 flex">
                <span className="text-muted-foreground mr-2 w-20 flex-shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`mr-2 w-12 flex-shrink-0 ${
                  log.type === 'stderr' ? 'text-red-400' : 
                  log.type === 'system' ? 'text-blue-400' : 
                  'text-green-400'
                }`}>
                  [{log.type.toUpperCase()}]
                </span>
                <span className="flex-1 break-all">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-card shadow rounded-lg p-6 border border-border">
        <h3 className="text-lg font-medium text-card-foreground mb-4">Recent Activity</h3>
        <div className="space-y-3">
          <div className="flex items-center text-sm">
            <span className="w-2 h-2 bg-green-400 rounded-full mr-3"></span>
            <span className="text-foreground">Frigg server started</span>
            <span className="ml-auto text-muted-foreground">2 minutes ago</span>
          </div>
          <div className="flex items-center text-sm">
            <span className="w-2 h-2 bg-blue-400 rounded-full mr-3"></span>
            <span className="text-foreground">Integration 'Slack' installed</span>
            <span className="ml-auto text-muted-foreground">15 minutes ago</span>
          </div>
          <div className="flex items-center text-sm">
            <span className="w-2 h-2 bg-purple-400 rounded-full mr-3"></span>
            <span className="text-foreground">Test user 'john.doe' created</span>
            <span className="ml-auto text-muted-foreground">1 hour ago</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard