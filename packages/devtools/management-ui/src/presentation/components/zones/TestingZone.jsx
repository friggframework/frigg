import React, { useState, useEffect } from 'react'
import { useFrigg } from '../../hooks/useFrigg'
import { useSocket } from '../../hooks/useSocket'
import TestAreaWelcome from './TestAreaWelcome'
import TestAreaUserSelection from './TestAreaUserSelection'
import TestAreaContainer from './TestAreaContainer'
import AdminViewContainer from '../admin/AdminViewContainer'
import LiveLogPanel from '../common/LiveLogPanel'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { cn } from '../../../lib/utils'
import {
  ArrowLeft,
  Settings,
  User,
  AlertCircle,
  CheckCircle,
  Loader2,
  Square,
  Shield,
  Users,
  ChevronDown,
  Check
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import api from '../../../infrastructure/http/api-client'
import { AdminService } from '../../../application/services/AdminService'
import { AdminRepositoryAdapter } from '../../../infrastructure/adapters/AdminRepositoryAdapter'
import axios from 'axios'

/**
 * TestingZone Component - Refactored with proper state machine
 *
 * States:
 * - not_started: Initial state, show welcome screen
 * - starting: Frigg is starting
 * - running: Frigg is running, show view mode selection (Admin/User)
 * - admin_view: Admin view - manage users and global entities
 * - user_view: User view - IntegrationList, EntityManager, IntegrationBuilder
 *
 * Flow:
 * Welcome → Start Frigg → Choose View Mode (Admin/User)
 * - Admin View: Manage users/global entities, can select user to switch to User View
 * - User View: Full Frigg UI library integration testing
 */
const TestingZone = ({ className }) => {
  const {
    switchZone,
    currentRepository,
    startFrigg,
    stopFrigg,
    getFriggStatus
  } = useFrigg()

  const socket = useSocket()

  // Test Area State Machine
  const [testAreaState, setTestAreaState] = useState('not_started')
  const [viewMode, setViewMode] = useState(null) // 'admin' or 'user'
  const [friggStatus, setFriggStatus] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [allUsers, setAllUsers] = useState([])
  const [error, setError] = useState(null)
  const [logs, setLogs] = useState([])
  const [isStopping, setIsStopping] = useState(false)
  const [existingProcess, setExistingProcess] = useState(null)

  // Load Frigg status and restore from localStorage on mount
  useEffect(() => {
    loadFriggStatus()
    restoreSessionState()
  }, [])

  // Save session state to localStorage whenever it changes
  useEffect(() => {
    if (testAreaState !== 'not_started' && friggStatus) {
      const sessionState = {
        testAreaState,
        viewMode,
        friggStatus,
        selectedUser,
        timestamp: new Date().toISOString()
      }
      localStorage.setItem('frigg-test-area-session', JSON.stringify(sessionState))

      // Also save executionId to sessionStorage (persists across page reload)
      if (friggStatus.executionId) {
        sessionStorage.setItem('frigg-execution-id', friggStatus.executionId)
      }
    } else if (testAreaState === 'not_started') {
      // Clear storage when stopped
      localStorage.removeItem('frigg-test-area-session')
      sessionStorage.removeItem('frigg-execution-id')
    }
  }, [testAreaState, viewMode, friggStatus, selectedUser])

  const restoreSessionState = () => {
    try {
      const savedState = localStorage.getItem('frigg-test-area-session')
      if (savedState) {
        const session = JSON.parse(savedState)
        // Only restore if session is less than 1 hour old
        const sessionAge = Date.now() - new Date(session.timestamp).getTime()
        if (sessionAge < 3600000) { // 1 hour
          console.log('Restoring session state from localStorage:', session)
          // Will be validated by loadFriggStatus()
        } else {
          console.log('Session too old, clearing localStorage')
          localStorage.removeItem('frigg-test-area-session')
        }
      }
    } catch (err) {
      console.error('Error restoring session state:', err)
      localStorage.removeItem('frigg-test-area-session')
    }
  }

  // Subscribe to WebSocket logs and detect "Server ready"
  useEffect(() => {
    if (!socket || !socket.socket) return

    const handleLog = (log) => {
      setLogs(prev => [...prev, log])

      // Detect when Frigg is fully ready (Server ready message)
      if (log.message && log.message.includes('Server ready:')) {
        // Extract actual port from the "Server ready" message
        const portMatch = log.message.match(/Server ready:.*?:(\d+)/)
        if (portMatch) {
          const actualPort = parseInt(portMatch[1])
          console.log(`Detected actual port from logs: ${actualPort}`)

          // Update friggStatus with actual port
          setFriggStatus(prev => ({
            ...prev,
            port: actualPort,
            friggBaseUrl: `http://localhost:${actualPort}`
          }))
        }

        // Frigg is ready, transition from 'starting' to 'running'
        if (testAreaState === 'starting') {
          console.log('Frigg is ready! Transitioning to running state')
          setTestAreaState('running')
        }
      }
    }

    socket.socket.on('frigg:log', handleLog)

    return () => {
      if (socket.socket) {
        socket.socket.off('frigg:log', handleLog)
      }
    }
  }, [socket, testAreaState])

  // Load users when entering user_view
  useEffect(() => {
    if (testAreaState === 'user_view' && friggStatus?.friggBaseUrl) {
      loadUsers()
    }
  }, [testAreaState, friggStatus?.friggBaseUrl])

  const loadUsers = async () => {
    try {
      const baseUrl = friggStatus?.friggBaseUrl || `http://localhost:${friggStatus?.port || 3000}`

      // Create Frigg API client and admin service
      const friggApiClient = axios.create({
        baseURL: baseUrl,
        headers: { 'Content-Type': 'application/json' }
      })
      const adminRepository = new AdminRepositoryAdapter(friggApiClient)
      const adminService = new AdminService(adminRepository)

      // Fetch users using admin service
      const result = await adminService.listUsers({
        page: 1,
        limit: 100, // Get all users
        sortBy: 'createdAt',
        sortOrder: 'desc'
      })

      console.log('Loaded users for dropdown:', result.users.length, result.users)
      setAllUsers(result.users)
    } catch (err) {
      console.error('Error loading users:', err)
    }
  }

  // Health check polling
  useEffect(() => {
    if (testAreaState !== 'running' && testAreaState !== 'user_selected') return

    const interval = setInterval(async () => {
      try {
        // Use new useFrigg hook method
        const status = await getFriggStatus()

        if (!status.running) {
          // Process crashed
          setError('Frigg process stopped unexpectedly')
          setTestAreaState('not_started')
          addLog('error', 'Frigg process crashed or was terminated')
        }
      } catch (error) {
        console.error('Health check failed:', error)
      }
    }, 5000) // Check every 5 seconds

    return () => clearInterval(interval)
  }, [testAreaState, getFriggStatus])

  const loadFriggStatus = async () => {
    try {
      // Use new useFrigg hook method
      const status = await getFriggStatus()

      // Check for executionId in sessionStorage first (persists across page reload)
      const savedExecutionId = sessionStorage.getItem('frigg-execution-id')

      const statusData = {
        isRunning: status.running || false,
        port: status.port || 3000,
        friggBaseUrl: status.friggBaseUrl || `http://localhost:${status.port || 3000}`,
        executionId: status.executionId || savedExecutionId
      }

      setFriggStatus(statusData)

      // Save executionId to sessionStorage if we have one
      if (statusData.executionId) {
        sessionStorage.setItem('frigg-execution-id', statusData.executionId)
      }

      // Try to restore session state from localStorage
      const savedState = localStorage.getItem('frigg-test-area-session')

      if (statusData.isRunning) {
        if (savedState) {
          try {
            const session = JSON.parse(savedState)
            const sessionAge = Date.now() - new Date(session.timestamp).getTime()

            if (sessionAge < 3600000) { // 1 hour
              // Restore previous state
              setTestAreaState(session.testAreaState)
              setViewMode(session.viewMode)

              // If there was a selected user, restore but re-login to get fresh token
              if (session.selectedUser) {
                reloginUser(session.selectedUser, statusData.friggBaseUrl)
              } else {
                setSelectedUser(null)
              }

              addLog('info', '✅ Restored previous session - Frigg is still running')
            } else {
              // Session expired, just mark as running
              setTestAreaState('running')
              addLog('info', '🔄 Detected running Frigg process (session expired)')
            }
          } catch (err) {
            setTestAreaState('running')
            addLog('info', '🔄 Detected running Frigg process')
          }
        } else {
          setTestAreaState('running')
          addLog('info', '🔄 Detected running Frigg process')
        }
      } else {
        setTestAreaState('not_started')
        localStorage.removeItem('frigg-test-area-session')
      }
    } catch (error) {
      console.error('Error loading Frigg status:', error)
      setError(error.message)
    }
  }

  const handleStopFrigg = async () => {
    try {
      setIsStopping(true)
      setError(null)

      addLog('info', 'Stopping Frigg application...')

      // Use new useFrigg hook method
      await stopFrigg()

      setTestAreaState('not_started')
      setViewMode(null)
      setFriggStatus(null)
      setSelectedUser(null)
      localStorage.removeItem('frigg-test-area-session')
      sessionStorage.removeItem('frigg-execution-id')
      addLog('info', '✅ Frigg application stopped successfully')
    } catch (err) {
      console.error('Error stopping Frigg:', err)
      const errorMessage = err.response?.data?.error || err.message || 'Failed to stop Frigg application'
      setError(errorMessage)
      addLog('error', `Failed to stop Frigg: ${errorMessage}`)
    } finally {
      setIsStopping(false)
    }
  }

  const handleStartFrigg = async () => {
    try {
      setTestAreaState('starting')
      setError(null)
      setExistingProcess(null)

      // Log BEFORE making the request
      addLog('info', 'Starting Frigg application...')
      addLog('info', 'Spawning Frigg serverless process, waiting for server to be ready...')

      // Use new useFrigg hook method
      const executionData = await startFrigg({ port: 3000 })

      const statusData = {
        isRunning: true,
        port: executionData.port,
        friggBaseUrl: executionData.friggBaseUrl,
        executionId: executionData.executionId,
        websocketUrl: executionData.websocketUrl
      }

      setFriggStatus(statusData)
      // Don't transition to 'running' yet - wait for "Server ready" log
      // State will be updated by the log handler when it sees "Server ready"

      // Note: Don't add log here - it would appear AFTER "Server ready" which comes from WebSocket
    } catch (err) {
      console.error('Error starting Frigg:', err)

      // Check if this is a 409 Conflict response
      if (err.response?.status === 409 && err.response?.data?.conflict) {
        const existing = err.response.data.existingProcess
        setExistingProcess(existing)
        setError(null) // Clear error since we're showing the conflict UI
        addLog('warn', `Existing process detected: PID ${existing.pid}, Port ${existing.port}`)
      } else {
        const errorMessage = err.response?.data?.error || err.message || 'Failed to start Frigg application'
        setError(errorMessage)
        addLog('error', `Failed to start Frigg: ${errorMessage}`)
      }

      setTestAreaState('not_started')
    }
  }

  const handleAttachToExisting = async () => {
    if (!existingProcess) return

    try {
      setError(null)
      addLog('info', `Attaching to existing Frigg process (PID: ${existingProcess.pid}, Port: ${existingProcess.port})...`)

      // Set status to reflect existing process
      const statusData = {
        isRunning: true,
        port: existingProcess.port,
        friggBaseUrl: `http://localhost:${existingProcess.port}`,
        executionId: null, // External process
        detectedExisting: true
      }

      setFriggStatus(statusData)
      setTestAreaState('running')
      setExistingProcess(null)
      addLog('info', '✅ Attached to existing process (logs not available)')
    } catch (err) {
      console.error('Error attaching to existing process:', err)
      setError('Failed to attach to existing process')
    }
  }

  const handleStopAndRestart = async () => {
    try {
      setIsStopping(true)
      setError(null)
      addLog('info', 'Stopping existing Frigg process...')

      await stopFrigg()
      setExistingProcess(null)

      addLog('info', 'Process stopped, waiting before restart...')
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Now start fresh
      await handleStartFrigg()
    } catch (err) {
      console.error('Error stopping existing process:', err)
      const errorMessage = err.response?.data?.error || err.message || 'Failed to stop existing process'
      setError(errorMessage)
      addLog('error', `Failed to stop: ${errorMessage}`)
    } finally {
      setIsStopping(false)
    }
  }

  const handleViewModeSelect = (mode) => {
    setViewMode(mode)
    if (mode === 'admin') {
      setTestAreaState('admin_view')
      addLog('info', 'Switched to Admin View')
    } else {
      setTestAreaState('user_view')
      addLog('info', 'Switched to User View')
    }
  }

  const reloginUser = async (user, baseUrl) => {
    try {
      console.log('Re-logging in user after session restore:', user.username || user.email)

      const response = await fetch(`${baseUrl}/users/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: user.username || user.email,
          password: 'defaultPassword123' // Must match the password used in TestAreaUserSelection
        })
      })

      if (!response.ok) {
        throw new Error('Failed to re-login user')
      }

      const data = await response.json()

      // Restore user with fresh token
      setSelectedUser({
        ...user,
        token: data.token
      })

      addLog('info', `✅ Re-authenticated as ${user.username || user.email}`)
    } catch (err) {
      console.error('Error re-logging in user:', err)
      setSelectedUser(null)
      setTestAreaState('running')
      addLog('error', `Failed to re-authenticate user: ${err.message}`)
    }
  }

  const handleUserSelected = (user) => {
    // User object should include token from login
    console.log('User selected with token:', user.token ? 'Yes' : 'No')
    setSelectedUser(user) // This includes the token
    setViewMode('user')
    setTestAreaState('user_view')
    addLog('info', `Selected user: ${user.username || user.email} - Switching to User View`)
  }

  const handleUserSwitch = async (user) => {
    // When switching users from the dropdown, login to get fresh token
    try {
      const baseUrl = friggStatus?.friggBaseUrl || `http://localhost:${friggStatus?.port || 3000}`

      const response = await fetch(`${baseUrl}/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username || user.email,
          password: 'defaultPassword123'
        })
      })

      if (!response.ok) {
        throw new Error('Failed to login user')
      }

      const data = await response.json()
      setSelectedUser({ ...user, token: data.token })
      addLog('info', `Switched to user: ${user.username || user.email}`)
    } catch (err) {
      console.error('Error switching user:', err)
      addLog('error', `Failed to switch user: ${err.message}`)
    }
  }

  const handleBackToViewSelection = () => {
    setSelectedUser(null)
    setViewMode(null)
    setTestAreaState('running')
  }

  const addLog = (level, message) => {
    setLogs(prev => [...prev, {
      level,
      message,
      timestamp: new Date().toISOString(),
      source: 'test-area'
    }])
  }

  const clearLogs = () => {
    setLogs([])
  }

  const downloadLogs = () => {
    const logData = logs.map(log =>
      `[${log.timestamp}] ${log.level.toUpperCase()} [${log.source}] ${log.message}`
    ).join('\n')

    const blob = new Blob([logData], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `test-area-logs-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Render view mode selection
  const renderViewModeSelection = () => {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="max-w-2xl w-full space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">Choose View Mode</h2>
            <p className="text-muted-foreground">
              Select how you want to interact with Frigg
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Admin View Card */}
            <button
              onClick={() => handleViewModeSelect('admin')}
              className="group relative overflow-hidden rounded-lg border-2 border-border bg-card p-6 text-left transition-all hover:border-primary hover:shadow-lg"
            >
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-3 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Shield className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-semibold">Admin View</h3>
                </div>
                <p className="text-muted-foreground text-sm">
                  Manage users, organizations, and global entities. Create test users and configure shared resources.
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    User management
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    Global entity configuration
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    Switch to user view
                  </li>
                </ul>
              </div>
            </button>

            {/* User View Card */}
            <button
              onClick={() => handleViewModeSelect('user')}
              className="group relative overflow-hidden rounded-lg border-2 border-border bg-card p-6 text-left transition-all hover:border-primary hover:shadow-lg"
            >
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-3 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Users className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-semibold">User View</h3>
                </div>
                <p className="text-muted-foreground text-sm">
                  Test integrations as an end user. Browse integrations, manage entities, and build connections.
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    Integration gallery
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    Entity management
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    Integration builder
                  </li>
                </ul>
              </div>
            </button>
          </div>

          <div className="flex justify-center pt-4">
            <Button variant="outline" onClick={handleStopFrigg} disabled={isStopping}>
              {isStopping ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Stopping...
                </>
              ) : (
                <>
                  <Square className="w-4 h-4 mr-2" />
                  Stop Frigg
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Render based on state
  const renderContent = () => {
    switch (testAreaState) {
      case 'not_started':
      case 'starting':
        return (
          <TestAreaWelcome
            friggStatus={friggStatus}
            onStartFrigg={handleStartFrigg}
            onStopFrigg={handleStopAndRestart}
            onAttachToExisting={handleAttachToExisting}
            isStarting={testAreaState === 'starting'}
            isStopping={isStopping}
            error={error}
            existingProcess={existingProcess}
          />
        )

      case 'running':
        // Show view mode selection
        if (!friggStatus?.port) {
          return (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-4">
                <Loader2 className="mx-auto h-12 w-12 text-primary animate-spin" />
                <div>
                  <h3 className="text-lg font-semibold">Starting Frigg...</h3>
                  <p className="text-muted-foreground mt-2">
                    Waiting for server to be ready
                  </p>
                </div>
              </div>
            </div>
          )
        }

        return renderViewModeSelection()

      case 'admin_view':
        return (
          <div className="h-full flex flex-col">
            {/* Header with back button */}
            <div className="flex items-center gap-4 px-6 py-4 border-b border-border bg-muted/30">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToViewSelection}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to View Selection
              </Button>
              <div className="flex items-center gap-2 ml-auto">
                <Badge variant="outline" className="gap-2">
                  <Shield className="w-3 h-3" />
                  Admin Mode
                </Badge>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <AdminViewContainer
                friggBaseUrl={friggStatus?.friggBaseUrl || `http://localhost:${friggStatus?.port || 3000}`}
                onUserSelect={handleUserSelected}
              />
            </div>
          </div>
        )

      case 'user_view':
        return (
          <div className="h-full flex flex-col">
            {/* Header with back button and user info */}
            <div className="flex items-center gap-4 px-6 py-4 border-b border-border bg-muted/30">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToViewSelection}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to View Selection
              </Button>
              {selectedUser && (
                <div className="flex items-center gap-2 ml-auto">
                  {allUsers.length > 0 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2">
                          <User className="w-3 h-3" />
                          {selectedUser.username || selectedUser.email}
                          <ChevronDown className="w-3 h-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel>Switch User</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {allUsers.map((user) => (
                          <DropdownMenuItem
                            key={user.id}
                            onClick={() => handleUserSwitch(user)}
                            className="flex items-center justify-between"
                          >
                            <span className="truncate">{user.username || user.email}</span>
                            {selectedUser?.id === user.id && (
                              <Check className="w-3 h-3 ml-2" />
                            )}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleBackToViewSelection}>
                          Back to View Selection
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <Badge variant="outline" className="gap-2">
                      <User className="w-3 h-3" />
                      {selectedUser.username || selectedUser.email}
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-auto">
              <TestAreaContainer
                friggBaseUrl={friggStatus?.friggBaseUrl || `http://localhost:${friggStatus?.port || 3000}`}
                authToken={selectedUser?.token}
                selectedUser={selectedUser}
                allUsers={allUsers}
                onUserSwitch={handleUserSwitch}
                onBackToUserSelection={handleBackToViewSelection}
              />
            </div>
          </div>
        )

      default:
        return (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-4">
              <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <div>
                <h3 className="text-lg font-semibold">Invalid State</h3>
                <p className="text-muted-foreground mt-2">
                  Something went wrong. Please refresh the page.
                </p>
              </div>
            </div>
          </div>
        )
    }
  }

  return (
    <div className={cn('h-full flex flex-col', className)}>
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0">
          {renderContent()}
        </div>

        {/* Live Log Panel - Always visible at bottom */}
        <div className="flex-shrink-0">
          <LiveLogPanel
            logs={logs}
            onClear={clearLogs}
            onDownload={downloadLogs}
            isStreaming={testAreaState !== 'not_started'}
          />
        </div>
      </div>
    </div>
  )
}

export default TestingZone