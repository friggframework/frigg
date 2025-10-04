import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useFrigg } from '../../hooks/useFrigg'
import { useSocket } from '../../hooks/useSocket'
import TestAreaWelcome from './TestAreaWelcome'
import TestAreaUserSelection from './TestAreaUserSelection'
import TestAreaContainer from './TestAreaContainer'
import AdminViewContainer from '../admin/AdminViewContainer'
import LiveLogPanel from '../common/LiveLogPanel'
import TestAreaErrorBoundary from './TestAreaErrorBoundary'
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
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    switchZone,
    currentRepository,
    startFrigg,
    stopFrigg,
    getFriggStatus
  } = useFrigg()

  const socket = useSocket()

  // 🔥 ESCAPE HATCH 1: URL parameter to force reset (?reset=true)
  const forceReset = searchParams.get('reset') === 'true'

  // Use React's lazy initializer pattern to avoid re-computing on every render
  const [initialState] = useState(() => {
    try {
      // 🔥 ESCAPE HATCH 1: Check for force reset
      if (forceReset) {
        console.log('🔄 Force reset requested via URL parameter')
        localStorage.removeItem('frigg-test-area-session')
        localStorage.removeItem('frigg-oauth-redirect-state')
        // Remove URL param after reading it
        searchParams.delete('reset')
        setSearchParams(searchParams)
        return {
          testAreaState: 'not_started',
          viewMode: null,
          friggStatus: null,
          selectedUser: null,
          logs: [],
          fromOAuth: false
        }
      }

      // First check for OAuth redirect state (highest priority)
      const oauthState = localStorage.getItem('frigg-oauth-redirect-state')
      if (oauthState) {
        const parsed = JSON.parse(oauthState)
        const stateAge = Date.now() - new Date(parsed.timestamp).getTime()

        // 🔥 ESCAPE HATCH 2: OAuth state timeout (5 minutes)
        if (stateAge < 300000 && parsed.isOAuthRedirect) {
          console.log('🔄 Initializing from OAuth redirect state')
          return {
            testAreaState: parsed.testAreaState || 'not_started',
            viewMode: parsed.viewMode || null,
            friggStatus: parsed.friggStatus || null,
            selectedUser: parsed.selectedUser || null,
            logs: parsed.logs || [],
            fromOAuth: true
          }
        } else if (stateAge >= 300000) {
          console.log('⏰ OAuth redirect state expired, clearing...')
          localStorage.removeItem('frigg-oauth-redirect-state')
        }
      }

      // Check for regular session state
      const savedSession = localStorage.getItem('frigg-test-area-session')
      if (savedSession) {
        const session = JSON.parse(savedSession)
        const sessionAge = Date.now() - new Date(session.timestamp).getTime()

        // 🔥 ESCAPE HATCH 3: Session timeout (15 minutes instead of 1 hour for stuck states)
        const maxAge = session.testAreaState === 'starting' || session.testAreaState === 'stopping' ? 900000 : 3600000

        if (sessionAge < maxAge) {
          // 🔥 ESCAPE HATCH 4: Detect stuck states and reset them
          if ((session.testAreaState === 'starting' || session.testAreaState === 'stopping') && sessionAge > 30000) {
            console.log(`⚠️ Detected stuck state '${session.testAreaState}' (${Math.round(sessionAge/1000)}s old), resetting to not_started`)
            return {
              testAreaState: 'not_started',
              viewMode: null,
              friggStatus: null,
              selectedUser: null,
              logs: [],
              fromOAuth: false
            }
          }

          console.log('🔄 Initializing from saved session')
          return {
            testAreaState: session.testAreaState || 'not_started',
            viewMode: session.viewMode || null,
            friggStatus: session.friggStatus || null,
            selectedUser: session.selectedUser || null,
            logs: session.logs || [],
            fromOAuth: false
          }
        } else {
          console.log('⏰ Session expired, starting fresh')
          localStorage.removeItem('frigg-test-area-session')
        }
      }
    } catch (err) {
      console.error('Error loading initial state:', err)
    }

    // Default state
    console.log('🔄 Initializing with default state')
    return {
      testAreaState: 'not_started',
      viewMode: null,
      friggStatus: null,
      selectedUser: null,
      logs: [],
      fromOAuth: false
    }
  })

  // Test Area State Machine - initialized from localStorage (lazy initialization above)
  const [testAreaState, setTestAreaState] = useState(initialState.testAreaState)
  const [viewMode, setViewMode] = useState(initialState.viewMode)
  const [friggStatus, setFriggStatus] = useState(initialState.friggStatus)
  const [selectedUser, setSelectedUser] = useState(initialState.selectedUser)
  const [allUsers, setAllUsers] = useState([])
  const [error, setError] = useState(null)
  const [isStopping, setIsStopping] = useState(false)
  const [existingProcess, setExistingProcess] = useState(null)

  // Store logs in ref to avoid re-renders - logs are presentation-only
  const logsRef = useRef(initialState.logs)
  const logSubscribersRef = useRef(new Set())

  // Notify log subscribers when logs change (for LiveLogPanel only)
  const notifyLogSubscribers = useCallback(() => {
    logSubscribersRef.current.forEach(callback => callback(logsRef.current))
  }, [])

  // DEBUG: Track what causes re-renders
  const prevPropsRef = useRef({ testAreaState, viewMode, friggStatus, selectedUser, allUsers })
  useEffect(() => {
    const prev = prevPropsRef.current
    const changes = []
    if (prev.testAreaState !== testAreaState) changes.push(`testAreaState: ${prev.testAreaState} → ${testAreaState}`)
    if (prev.viewMode !== viewMode) changes.push(`viewMode: ${prev.viewMode} → ${viewMode}`)
    if (prev.friggStatus !== friggStatus) changes.push('friggStatus changed')
    if (prev.selectedUser !== selectedUser) changes.push('selectedUser changed')
    if (prev.allUsers !== allUsers) changes.push(`allUsers: ${prev.allUsers.length} → ${allUsers.length}`)

    if (changes.length > 0) {
      console.log('🔍 TestingZone re-render caused by:', changes.join(', '))
    }

    prevPropsRef.current = { testAreaState, viewMode, friggStatus, selectedUser, allUsers }
  })

  // Post-initialization cleanup and status check
  useEffect(() => {
    // If state was initialized from OAuth redirect, clear the one-time storage
    if (initialState.fromOAuth) {
      console.log('🧹 Clearing used OAuth redirect state')
      localStorage.removeItem('frigg-oauth-redirect-state')

      // Update regular session storage with OAuth-restored state
      const sessionState = {
        testAreaState: initialState.testAreaState,
        viewMode: initialState.viewMode,
        friggStatus: initialState.friggStatus,
        selectedUser: initialState.selectedUser,
        timestamp: new Date().toISOString()
      }
      localStorage.setItem('frigg-test-area-session', JSON.stringify(sessionState))
    } else if (testAreaState === 'not_started') {
      // Only check Frigg status if we started with default state
      loadFriggStatus()
    }
  }, [])

  // Debug: Log current state
  useEffect(() => {
    console.log('🔥 Current testAreaState:', testAreaState, 'viewMode:', viewMode, 'selectedUser:', selectedUser?.username || selectedUser?.email)
  }, [testAreaState, viewMode, selectedUser])

  // Handle OAuth callback after state is restored
  useEffect(() => {
    handleOAuthCallback()
  }, [testAreaState, friggStatus])

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
    // NOTE: This is now handled by restoreOAuthRedirectState and loadFriggStatus
    // Keeping this function for backwards compatibility but it doesn't do anything
  }

  // Subscribe to WebSocket logs and detect "Server ready"
  useEffect(() => {
    if (!socket || !socket.socket) return

    const handleLog = (log) => {
      logsRef.current = [...logsRef.current, log]
      notifyLogSubscribers()

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
  }, [socket, testAreaState, notifyLogSubscribers])

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

  const handleOAuthCallback = () => {
    // Check for OAuth callback parameters
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const module = searchParams.get('module')
    const entityId = searchParams.get('entityId')

    // Check if we're in a state where we can handle OAuth (user_view with selected user)
    if (testAreaState !== 'user_view' || !selectedUser) {
      // Not ready yet - OAuth handling will run again when state is restored
      return
    }

    if (success === 'true') {
      if (code && state) {
        // OAuth callback with code and state - this is a successful OAuth flow
        addLog('success', `✅ OAuth authorization successful! Code: ${code.substring(0, 20)}...`)

        // Call the IntegrationHub's OAuth redirect handler via redirectContext
        // This is saved before redirect and should trigger the UI library's flow
        addLog('info', `🔄 Processing OAuth callback via IntegrationHub...`)

        // NOTE: The IntegrationHub should detect URL params and process automatically
        // We just need to ensure state is restored so it has the right context

        // Clear the URL parameters after a short delay to let IntegrationHub process them
        setTimeout(() => {
          setSearchParams({})
          addLog('success', `✅ OAuth flow completed successfully!`)
        }, 1000)
      } else if (module && entityId) {
        // Direct success with module and entity ID
        addLog('success', `✅ Successfully connected to ${module}! Entity ID: ${entityId}`)
        // Clear the URL parameters
        setSearchParams({})
      }
    } else if (error) {
      addLog('error', `❌ OAuth error: ${error}`)
      // Clear the URL parameters
      setSearchParams({})
    }
  }

  const saveOAuthRedirectState = useCallback(() => {
    // Save current state before OAuth redirect
    const oauthState = {
      testAreaState,
      viewMode,
      friggStatus,
      selectedUser,
      logs: logsRef.current.slice(-50), // Save last 50 logs via ref
      timestamp: new Date().toISOString(),
      isOAuthRedirect: true
    }
    console.log('🔥 SAVING OAuth redirect state:', oauthState)
    localStorage.setItem('frigg-oauth-redirect-state', JSON.stringify(oauthState))
  }, [testAreaState, viewMode, friggStatus, selectedUser])

  const restoreOAuthRedirectState = () => {
    try {
      const savedState = localStorage.getItem('frigg-oauth-redirect-state')
      console.log('Checking for OAuth redirect state:', savedState)

      if (savedState) {
        const oauthState = JSON.parse(savedState)
        const stateAge = Date.now() - new Date(oauthState.timestamp).getTime()

        console.log('OAuth state age:', stateAge, 'ms')

        // Restore state if less than 5 minutes old (OAuth redirects should be quick)
        if (stateAge < 300000 && oauthState.isOAuthRedirect) {
          console.log('✅ Restoring OAuth redirect state:', oauthState)

          // Restore ALL state in a single batch
          setTestAreaState(oauthState.testAreaState)
          setViewMode(oauthState.viewMode)
          setFriggStatus(oauthState.friggStatus)
          setSelectedUser(oauthState.selectedUser)
          setLogs([
            ...oauthState.logs || [],
            {
              level: 'success',
              message: '✅ Restored session after OAuth redirect',
              timestamp: new Date().toISOString(),
              source: 'test-area'
            }
          ])

          // Update the regular session state to match the OAuth-restored state
          // This keeps both storage locations in sync
          const updatedSessionState = {
            testAreaState: oauthState.testAreaState,
            viewMode: oauthState.viewMode,
            friggStatus: oauthState.friggStatus,
            selectedUser: oauthState.selectedUser,
            timestamp: new Date().toISOString()
          }
          localStorage.setItem('frigg-test-area-session', JSON.stringify(updatedSessionState))

          // Clear only the OAuth redirect state (one-time use)
          localStorage.removeItem('frigg-oauth-redirect-state')

          return true // Indicate that OAuth state was restored
        } else {
          // State too old, clear it
          console.log('OAuth state too old, clearing')
          localStorage.removeItem('frigg-oauth-redirect-state')
        }
      } else {
        console.log('No OAuth redirect state found')
      }
    } catch (err) {
      console.error('Error restoring OAuth redirect state:', err)
      localStorage.removeItem('frigg-oauth-redirect-state')
    }
    return false // OAuth state was NOT restored
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

  const addLog = useCallback((level, message) => {
    const newLog = {
      level,
      message,
      timestamp: new Date().toISOString(),
      source: 'test-area'
    }
    logsRef.current = [...logsRef.current, newLog]
    notifyLogSubscribers()
  }, [notifyLogSubscribers])

  const clearLogs = useCallback(() => {
    logsRef.current = []
    notifyLogSubscribers()
  }, [notifyLogSubscribers])

  const downloadLogs = useCallback(() => {
    const logData = logsRef.current.map(log =>
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
  }, [])

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
        console.log('🔥 RENDERING user_view case');
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
              {(() => {
                console.log('🔥 RENDERING TestAreaContainer with onOAuthRedirect:', saveOAuthRedirectState ? 'provided' : 'missing');
                return (
                  <TestAreaContainer
                    friggBaseUrl={friggStatus?.friggBaseUrl || `http://localhost:${friggStatus?.port || 3000}`}
                    authToken={selectedUser?.token}
                    selectedUser={selectedUser}
                    allUsers={allUsers}
                    onUserSwitch={handleUserSwitch}
                    onBackToUserSelection={handleBackToViewSelection}
                    onOAuthRedirect={saveOAuthRedirectState}
                  />
                );
              })()}
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

  // 🔥 ESCAPE HATCH 5: Manual reset function
  const handleManualReset = () => {
    console.log('🔄 Manual reset triggered')
    localStorage.removeItem('frigg-test-area-session')
    localStorage.removeItem('frigg-oauth-redirect-state')
    localStorage.removeItem('frigg-wizard-state')
    sessionStorage.removeItem('frigg-execution-id')
    window.location.href = window.location.pathname // Hard reload to apply reset
  }

  return (
    <div className={cn('h-full flex flex-col', className)}>
      {/* 🔥 ESCAPE HATCH 5: Manual Reset Button (shown when stuck) */}
      {(testAreaState === 'starting' || testAreaState === 'stopping') && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-yellow-800">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>State: {testAreaState}... (if stuck, use reset)</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualReset}
            className="h-7 text-xs"
          >
            Reset State
          </Button>
        </div>
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
            logsRef={logsRef}
            onSubscribe={(callback) => {
              logSubscribersRef.current.add(callback)
              return () => logSubscribersRef.current.delete(callback)
            }}
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