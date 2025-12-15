import React, { useState, useEffect, useCallback } from 'react'
import { useFrigg } from '../../hooks/useFrigg'
import { useSocket } from '../../hooks/useSocket'
import TestAreaWelcome from './TestAreaWelcome'
import TestAreaUserSelection from './TestAreaUserSelection'
import TestAreaContainer from './TestAreaContainer'
import AdminViewContainer from '../admin/AdminViewContainer'
import LiveLogPanel from '../common/LiveLogPanel'
import TestAreaErrorBoundary from './TestAreaErrorBoundary'
import CliPromptDialog from '../test/CliPromptDialog'
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
  Check,
  Code
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
  const [pendingPrompt, setPendingPrompt] = useState(null) // CLI prompt requiring user response

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

    // Handle CLI prompt requests from pre-flight checks
    const handlePromptRequest = (data) => {
      console.log('CLI prompt request received:', data)
      setPendingPrompt(data)
      addLog('info', `CLI prompt: ${data.prompt?.message || 'Action required'}`)
    }

    socket.socket.on('frigg:prompt_request', handlePromptRequest)

    return () => {
      if (socket.socket) {
        socket.socket.off('frigg:log', handleLog)
        socket.socket.off('frigg:prompt_request', handlePromptRequest)
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
      // For user view, first show user selection
      setTestAreaState('user_selection')
      addLog('info', 'Preparing User View - Select a user')
    }
  }

  const reloginUser = async (user, baseUrl) => {
    try {
      console.log('Re-impersonating user after session restore:', user.username || user.email)

      const response = await fetch(`${baseUrl}/api/admin/users/${user.id}/impersonate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          expiresInMinutes: 120
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        const errorMessage = errorData?.message || 'Failed to re-impersonate user'
        throw new Error(errorMessage)
      }

      const data = await response.json()

      // Restore user with fresh token
      setSelectedUser({
        ...user,
        token: data.token
      })

      addLog('info', `✅ Re-authenticated as ${user.username || user.email}`)
    } catch (err) {
      console.error('Error re-impersonating user:', err)
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
    // When switching users from the dropdown, use impersonation to get fresh token
    try {
      const baseUrl = friggStatus?.friggBaseUrl || `http://localhost:${friggStatus?.port || 3000}`

      const response = await fetch(`${baseUrl}/api/admin/users/${user.id}/impersonate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expiresInMinutes: 120
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        const errorMessage = errorData?.message || 'Failed to impersonate user'
        throw new Error(errorMessage)
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

  // Handle CLI prompt response
  const handlePromptRespond = useCallback((requestId, response) => {
    if (!socket?.socket) {
      console.error('Socket not available for prompt response')
      return
    }

    console.log('Sending prompt response:', { requestId, response })
    addLog('info', `User responded: ${response === true ? 'Yes' : response === false ? 'No' : response}`)

    // Send response via WebSocket
    socket.socket.emit('frigg:prompt_response', { requestId, response })

    // Clear the pending prompt
    setPendingPrompt(null)
  }, [socket])

  // Render view mode selection
  const renderViewModeSelection = () => {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="max-w-3xl w-full space-y-6">
          <div className="text-center space-y-3">
            <h2 className="text-2xl font-bold">Choose Your View Mode</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              <strong>User View</strong> shows what your integration users will see.
              <strong className="ml-1">Developer View</strong> provides testing and admin tools for development.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* User View Card - Blue Theme */}
            <button
              onClick={() => handleViewModeSelect('user')}
              className="group relative overflow-hidden rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-card p-6 text-left transition-all hover:border-blue-500 hover:shadow-lg"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-3 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                      <User className="w-6 h-6 text-blue-600 dark:text-blue-400 group-hover:text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold">User View</h3>
                      <Badge variant="outline" className="mt-1 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700">
                        Customer Experience
                      </Badge>
                    </div>
                  </div>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Experience exactly what your integration users will see. Test the customer-facing integration flow including OAuth, entity selection, and configuration.
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Integration gallery & connection flow</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Connected accounts management</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>User-facing integration builder</span>
                  </li>
                </ul>
              </div>
            </button>

            {/* Developer View Card - Purple Theme */}
            <button
              onClick={() => handleViewModeSelect('admin')}
              className="group relative overflow-hidden rounded-lg border-2 border-purple-200 dark:border-purple-800 bg-card p-6 text-left transition-all hover:border-purple-500 hover:shadow-lg"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-purple-100 dark:bg-purple-900/30 p-3 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                      <Code className="w-6 h-6 text-purple-600 dark:text-purple-400 group-hover:text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold">Developer View</h3>
                      <Badge variant="outline" className="mt-1 bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700">
                        Testing & Admin
                      </Badge>
                    </div>
                  </div>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Comprehensive testing and admin tools for integration development. Manage users, test actions, configure entities, and debug integrations.
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span>User & organization management</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span>Testing dashboard (user & system actions)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span>Global entity configuration</span>
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

      case 'user_selection':
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
                  <User className="w-3 h-3" />
                  User Selection
                </Badge>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <TestAreaUserSelection
                friggBaseUrl={friggStatus?.friggBaseUrl || `http://localhost:${friggStatus?.port || 3000}`}
                onUserSelected={handleUserSelected}
              />
            </div>
          </div>
        )

      case 'admin_view':
        return (
          <div className="h-full flex flex-col">
            {/* Header with back button */}
            <div className="flex items-center gap-4 px-6 py-4 border-b border-border bg-purple-50/50 dark:bg-purple-950/20">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToViewSelection}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to View Selection
              </Button>
              <div className="flex items-center gap-2 ml-auto">
                <Badge variant="outline" className="gap-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700">
                  <Code className="w-3 h-3" />
                  Developer Mode
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
            <div className="flex items-center gap-4 px-6 py-4 border-b border-border bg-blue-50/50 dark:bg-blue-950/20">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToViewSelection}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to View Selection
              </Button>
              <div className="flex items-center gap-2 ml-auto">
                <Badge variant="outline" className="gap-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700">
                  <User className="w-3 h-3" />
                  User View
                </Badge>
              {selectedUser && (
                <div className="flex items-center gap-2">
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
      {/* CLI Prompt Dialog - Shown when CLI requests user input */}
      {pendingPrompt && (
        <CliPromptDialog
          prompt={pendingPrompt}
          onRespond={handlePromptRespond}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0">
          <TestAreaErrorBoundary>
            {renderContent()}
          </TestAreaErrorBoundary>
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