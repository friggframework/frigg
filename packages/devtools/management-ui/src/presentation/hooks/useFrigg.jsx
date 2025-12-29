import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useSocket } from './useSocket'
import api from '../../infrastructure/http/api-client'

const FriggContext = createContext()

// Helper function to find the closest repository to the current working directory
const findClosestRepository = (repositories, cwd) => {
  if (!repositories || repositories.length === 0 || !cwd) {
    return null
  }

  // First, check if we're directly in a repository
  const directMatch = repositories.find(repo => repo.path === cwd)
  if (directMatch) {
    return directMatch
  }

  // Find the repository that contains the current working directory
  const containingRepos = repositories.filter(repo => cwd.startsWith(repo.path))

  if (containingRepos.length > 0) {
    // Return the most specific (deepest) containing repository
    return containingRepos.reduce((closest, current) =>
      current.path.length > closest.path.length ? current : closest
    )
  }

  // If no containing repository, find the closest by path similarity
  const pathParts = cwd.split('/')
  let bestMatch = null
  let bestScore = 0

  for (const repo of repositories) {
    const repoPathParts = repo.path.split('/')
    let score = 0

    // Count common path segments
    for (let i = 0; i < Math.min(pathParts.length, repoPathParts.length); i++) {
      if (pathParts[i] === repoPathParts[i]) {
        score++
      } else {
        break
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestMatch = repo
    }
  }

  return bestMatch
}

export const useFrigg = () => {
  const context = useContext(FriggContext)
  if (!context) {
    throw new Error('useFrigg must be used within FriggProvider')
  }
  return context
}

export const FriggProvider = ({ children }) => {
  const { on, emit } = useSocket()
  const [status, setStatus] = useState('stopped') // running, stopped, starting
  const [environment, setEnvironment] = useState('local')
  const [integrations, setIntegrations] = useState([])
  const [envVariables, setEnvVariables] = useState({})
  const [users, setUsers] = useState([])
  const [connections, setConnections] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [repositories, setRepositories] = useState([])
  const [currentRepository, setCurrentRepository] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Zone-specific state management
  const [activeZone, setActiveZone] = useState('definitions') // 'definitions' or 'testing'
  const [selectedIntegration, setSelectedIntegration] = useState(null)
  const [testEnvironment, setTestEnvironment] = useState({
    isRunning: false,
    testUrl: null,
    logs: [],
    status: 'stopped'
  })

  // Use refs to track initialization state and prevent duplicate calls
  const initializationRef = useRef({
    isInitializing: false,
    hasInitialized: false,
    repositoriesFetchCount: 0,
    fetchPromise: null // Store ongoing fetch promise to deduplicate calls
  })

  useEffect(() => {
    // Listen for status updates
    const unsubscribeStatus = on('frigg:status', (data) => {
      setStatus(data.status)
    })

    // Listen for integration updates
    const unsubscribeIntegrations = on('integrations:update', (data) => {
      setIntegrations(data.integrations)
    })

    // Initial data fetch - only if not already initialized or initializing
    if (!initializationRef.current.hasInitialized && !initializationRef.current.isInitializing) {
      initializeApp()
    }

    return () => {
      unsubscribeStatus && unsubscribeStatus()
      unsubscribeIntegrations && unsubscribeIntegrations()
      // Note: We don't reset initialization state here to prevent re-fetching
      // when components unmount/remount during development
    }
  }, [on])

  const initializeApp = async () => {
    // Prevent duplicate initialization
    if (initializationRef.current.isInitializing || initializationRef.current.hasInitialized) {
      console.log('Skipping duplicate initialization')
      return
    }

    initializationRef.current.isInitializing = true

    try {
      setIsLoading(true)
      // First fetch repositories to see what's available
      const { repositories: repos, currentWorkingDirectory: cwd } = await fetchRepositories()

      // First check for saved state in localStorage
      const savedState = localStorage.getItem('frigg_ui_state')
      let repoToSelect = null

      if (savedState) {
        try {
          const { currentRepository: savedRepo, lastUsed } = JSON.parse(savedState)
          // Check if saved repository still exists in current repos
          const repoExists = repos.find(repo => repo.path === savedRepo?.path)
          if (repoExists && lastUsed && (Date.now() - lastUsed) < 7 * 24 * 60 * 60 * 1000) { // 7 days
            repoToSelect = repoExists
            console.log('Restoring previous session:', repoExists.name)
          }
        } catch (error) {
          console.error('Failed to restore saved state:', error)
          localStorage.removeItem('frigg_ui_state')
        }
      }

      // If no saved state, auto-select the closest repository from cwd
      if (!repoToSelect) {
        const closestRepo = findClosestRepository(repos, cwd)
        if (closestRepo) {
          repoToSelect = closestRepo
          console.log('Auto-selecting closest repository:', closestRepo.name)
        }
      }

      // If we have a repo to select, fetch its full details
      if (repoToSelect) {
        // Validate that repo has an ID - if only path exists, we're in a bad state
        if (!repoToSelect.id) {
          console.error('Repository missing ID - invalid state. Clearing localStorage.')
          localStorage.removeItem('frigg_ui_state')
          throw new Error('Repository state is invalid. Please refresh the page to reinitialize.')
        }

        try {
          console.log('Fetching full details for repository:', repoToSelect.name, repoToSelect.id)
          // Pass the full repo object to avoid state timing issues
          await switchRepository(repoToSelect.id, repoToSelect)
        } catch (error) {
          console.error('Failed to load repository details:', error)
          // Don't set incomplete data - throw to show error state
          throw new Error(`Failed to load project details: ${error.message}`)
        }
      }
    } catch (error) {
      console.error('Error initializing app:', error)
      setError(error.message || 'Failed to initialize app')
    } finally {
      setIsLoading(false)
      initializationRef.current.isInitializing = false
      initializationRef.current.hasInitialized = true
    }
  }

  const fetchRepositories = async () => {
    // If there's already an ongoing fetch, return the existing promise
    if (initializationRef.current.fetchPromise) {
      console.log('Returning existing fetch promise')
      return initializationRef.current.fetchPromise
    }

    // Track how many times repositories are fetched
    initializationRef.current.repositoriesFetchCount++
    console.log(`Fetching repositories (call #${initializationRef.current.repositoriesFetchCount})`)

    // Create and store the promise
    initializationRef.current.fetchPromise = (async () => {
      try {
        // Use new API endpoint: GET /api/projects
        const response = await api.get('/api/projects')
        const data = response.data.data || response.data
        const repos = data.repositories || []
        const cwd = data.currentWorkingDirectory

        // Repositories now have deterministic IDs from the backend
        setRepositories(repos)
        return { repositories: repos, currentWorkingDirectory: cwd }
      } catch (error) {
        console.error('Error fetching repositories:', error)
        setRepositories([])
        return { repositories: [], currentWorkingDirectory: null }
      } finally {
        // Clear the promise after completion
        initializationRef.current.fetchPromise = null
      }
    })()

    return initializationRef.current.fetchPromise
  }

  const fetchCurrentRepository = async () => {
    // For the new welcome flow, we never auto-fetch a current repository
    // The user must always make an explicit selection
    setCurrentRepository(null)
    return null
  }

  const switchRepository = async (repoId, repoObj = null) => {
    try {
      // Use provided repo object (from initializeApp) or find by ID (from UI selection)
      let repo = repoObj

      if (!repo) {
        // Find the repository by ID from state (for UI-triggered switches)
        repo = repositories.find(r => r.id === repoId)

        if (!repo) {
          throw new Error(`Repository with ID "${repoId}" not found in available repositories`)
        }
      }

      // Validate repo has required fields
      if (!repo.id) {
        throw new Error('Repository missing ID - invalid state')
      }

      // Use new API endpoint: GET /api/projects/{id}
      const response = await api.get(`/api/projects/${repo.id}`)
      const projectData = response.data.data || response.data

      // Update current repository with full project data
      const fullRepo = {
        ...repo,
        appDefinition: projectData.appDefinition,
        apiModules: projectData.apiModules,
        git: projectData.git,
        friggStatus: projectData.friggStatus
      }

      setCurrentRepository(fullRepo)

      // Save state to localStorage
      const stateToSave = {
        currentRepository: fullRepo,
        lastUsed: Date.now()
      }
      localStorage.setItem('frigg_ui_state', JSON.stringify(stateToSave))

      // Extract integrations from appDefinition (nested structure)
      if (projectData.appDefinition?.integrations) {
        setIntegrations(Array.isArray(projectData.appDefinition.integrations)
          ? projectData.appDefinition.integrations
          : Object.values(projectData.appDefinition.integrations))
      }

      return fullRepo
    } catch (error) {
      console.error('Error switching repository:', error)
      throw error
    }
  }

  const fetchInitialData = async () => {
    try {
      setLoading(true)
      setError(null)

      if (!currentRepository?.id) {
        // No repository selected yet
        setIntegrations([])
        setStatus('stopped')
        return
      }

      // Use new API endpoint: GET /api/projects/{id}
      const response = await api.get(`/api/projects/${currentRepository.id}`)
      const projectData = response.data.data || response.data

      // Extract integrations from appDefinition (nested structure)
      if (projectData.appDefinition?.integrations) {
        setIntegrations(Array.isArray(projectData.appDefinition.integrations)
          ? projectData.appDefinition.integrations
          : Object.values(projectData.appDefinition.integrations))
      } else {
        setIntegrations([])
      }

      // Set status from frigg execution status
      setStatus(projectData.friggStatus?.running ? 'running' : 'stopped')

      // These are Frigg app concerns, not management UI concerns
      setEnvVariables({})
      setUsers([])
      setConnections([])
    } catch (error) {
      console.error('Error fetching initial data:', error)
      setError(error.message || 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }

  const startFrigg = async (options = {}) => {
    try {
      if (!currentRepository?.id) {
        throw new Error('No repository selected')
      }

      setStatus('starting')

      // Use new API endpoint: POST /api/projects/{id}/frigg/executions
      const response = await api.post(`/api/projects/${currentRepository.id}/frigg/executions`, {
        port: options.port || 3000,
        env: options.env || {}
      })

      const executionData = response.data.data || response.data

      // Store execution info for later use
      setCurrentRepository(prev => ({
        ...prev,
        friggStatus: {
          running: true,
          executionId: executionData.executionId,
          port: executionData.port,
          friggBaseUrl: executionData.friggBaseUrl,
          websocketUrl: executionData.websocketUrl
        }
      }))

      setStatus('running')
      return executionData
    } catch (error) {
      console.error('Error starting Frigg:', error)
      setStatus('stopped')
      throw error
    }
  }

  const stopFrigg = async (force = false) => {
    try {
      if (!currentRepository?.id) {
        throw new Error('No repository selected')
      }

      const executionId = currentRepository.friggStatus?.executionId

      if (executionId) {
        // Use new API endpoint: DELETE /api/projects/{id}/frigg/executions/{execution-id}
        await api.delete(`/api/projects/${currentRepository.id}/frigg/executions/${executionId}`)
      } else {
        // Use convenience endpoint: DELETE /api/projects/{id}/frigg/executions/current
        await api.delete(`/api/projects/${currentRepository.id}/frigg/executions/current`)
      }

      setStatus('stopped')
      setCurrentRepository(prev => ({
        ...prev,
        friggStatus: {
          running: false,
          executionId: null,
          port: null
        }
      }))
    } catch (error) {
      console.error('Error stopping Frigg:', error)
      throw error
    }
  }

  const restartFrigg = async (options = {}) => {
    try {
      await stopFrigg()
      await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1s
      return await startFrigg(options)
    } catch (error) {
      console.error('Error restarting Frigg:', error)
      throw error
    }
  }

  const getFriggStatus = async () => {
    try {
      if (!currentRepository?.id || !currentRepository?.friggStatus?.executionId) {
        return { running: false }
      }

      // Use new API endpoint: GET /api/projects/{id}/frigg/executions/{execution-id}/status
      const response = await api.get(
        `/api/projects/${currentRepository.id}/frigg/executions/${currentRepository.friggStatus.executionId}/status`
      )
      return response.data.data || response.data
    } catch (error) {
      console.error('Error fetching Frigg status:', error)
      return { running: false }
    }
  }

  // Note: Logs are now streamed via WebSocket, not REST endpoint
  // getLogs removed - use WebSocket connection instead

  const getMetrics = async () => {
    try {
      if (!currentRepository?.id) {
        return null
      }

      // Metrics can come from the project status
      const status = await getFriggStatus()
      return {
        uptime: status.uptimeSeconds,
        port: status.port,
        running: status.running
      }
    } catch (error) {
      console.error('Error fetching metrics:', error)
      return null
    }
  }


  // Note: installIntegration, updateEnvVariable, createUser removed
  // These are Frigg app runtime concerns, not management UI concerns
  // Test Area interacts with Frigg app directly for these features

  const updateUser = async (userId, userData) => {
    try {
      const response = await api.put(`/api/users/${userId}`, userData)
      await fetchInitialData() // Refresh data
      return response.data
    } catch (error) {
      console.error('Error updating user:', error)
      throw error
    }
  }

  const deleteUser = async (userId) => {
    try {
      const response = await api.delete(`/api/users/${userId}`)
      await fetchInitialData() // Refresh data
      return response.data
    } catch (error) {
      console.error('Error deleting user:', error)
      throw error
    }
  }

  const bulkCreateUsers = async (count) => {
    try {
      const response = await api.post('/api/users/bulk', { count })
      await fetchInitialData() // Refresh data
      return response.data
    } catch (error) {
      console.error('Error creating bulk users:', error)
      throw error
    }
  }

  const deleteAllUsers = async () => {
    try {
      const response = await api.delete('/api/users')
      await fetchInitialData() // Refresh data
      return response.data
    } catch (error) {
      console.error('Error deleting all users:', error)
      throw error
    }
  }

  const switchUserContext = (user) => {
    setCurrentUser(user)
    // Store in localStorage for persistence
    if (user) {
      localStorage.setItem('frigg_current_user', JSON.stringify(user))
    } else {
      localStorage.removeItem('frigg_current_user')
    }
    // Emit event for other components to react
    emit('user:context-switched', { user })
  }

  // Session management functions
  const createSession = async (userId, metadata = {}) => {
    try {
      const response = await api.post('/api/users/sessions/create', { userId, metadata })
      return response.data.session
    } catch (error) {
      console.error('Error creating session:', error)
      throw error
    }
  }

  const getSession = async (sessionId) => {
    try {
      const response = await api.get(`/api/users/sessions/${sessionId}`)
      return response.data.session
    } catch (error) {
      console.error('Error fetching session:', error)
      throw error
    }
  }

  const getUserSessions = async (userId) => {
    try {
      const response = await api.get(`/api/users/sessions/user/${userId}`)
      return response.data.sessions
    } catch (error) {
      console.error('Error fetching user sessions:', error)
      throw error
    }
  }

  const trackSessionActivity = async (sessionId, action, data = {}) => {
    try {
      const response = await api.post(`/api/users/sessions/${sessionId}/activity`, { action, data })
      return response.data.activity
    } catch (error) {
      console.error('Error tracking session activity:', error)
      throw error
    }
  }

  const refreshSession = async (sessionId) => {
    try {
      const response = await api.post(`/api/users/sessions/${sessionId}/refresh`)
      return response.data.session
    } catch (error) {
      console.error('Error refreshing session:', error)
      throw error
    }
  }

  const endSession = async (sessionId) => {
    try {
      const response = await api.delete(`/api/users/sessions/${sessionId}`)
      return response.data
    } catch (error) {
      console.error('Error ending session:', error)
      throw error
    }
  }

  const getAllSessions = async () => {
    try {
      const response = await api.get('/api/users/sessions')
      return response.data
    } catch (error) {
      console.error('Error fetching all sessions:', error)
      throw error
    }
  }

  // Zone management functions
  const switchZone = (zoneId) => {
    setActiveZone(zoneId)
    // Store zone preference in localStorage
    localStorage.setItem('frigg_active_zone', zoneId)
  }

  const selectIntegration = (integration) => {
    setSelectedIntegration(integration)
    // Auto-switch to testing zone when an integration is selected for testing
    if (integration && activeZone === 'definitions') {
      // Don't auto-switch, let user decide
    }
  }

  // Test environment management
  const startTestEnvironment = async (integration = selectedIntegration) => {
    if (!integration) return

    try {
      setTestEnvironment(prev => ({ ...prev, isRunning: true, status: 'starting' }))

      // Call API to start test environment
      const response = await api.post('/api/test/start', {
        integrationId: integration.id,
        repositoryPath: currentRepository?.path
      })

      const testUrl = response.data.data?.testUrl || response.data.testUrl

      setTestEnvironment(prev => ({
        ...prev,
        testUrl,
        status: 'running'
      }))

      return testUrl
    } catch (error) {
      console.error('Error starting test environment:', error)
      setTestEnvironment(prev => ({ ...prev, isRunning: false, status: 'error' }))
      throw error
    }
  }

  const stopTestEnvironment = async () => {
    try {
      await api.post('/api/test/stop')
      setTestEnvironment({
        isRunning: false,
        testUrl: null,
        logs: [],
        status: 'stopped'
      })
    } catch (error) {
      console.error('Error stopping test environment:', error)
    }
  }

  const restartTestEnvironment = async () => {
    await stopTestEnvironment()
    if (selectedIntegration) {
      await startTestEnvironment(selectedIntegration)
    }
  }

  const addTestLog = (log) => {
    setTestEnvironment(prev => ({
      ...prev,
      logs: [...prev.logs, { ...log, timestamp: new Date().toISOString() }]
    }))
  }

  const clearTestLogs = () => {
    setTestEnvironment(prev => ({ ...prev, logs: [] }))
  }

  // Load current user and zone preference from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('frigg_current_user')
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser))
      } catch (error) {
        console.error('Error loading stored user context:', error)
      }
    }

    const storedZone = localStorage.getItem('frigg_active_zone')
    if (storedZone && ['definitions', 'testing'].includes(storedZone)) {
      setActiveZone(storedZone)
    }
  }, [])

  const value = {
    // State
    status,
    environment,
    integrations,
    envVariables,
    users,
    connections,
    currentUser,
    repositories,
    currentRepository,
    appDefinition: currentRepository?.appDefinition || null,
    isLoading,
    error,
    loading,
    // Repository/Project management
    fetchRepositories,
    switchRepository,
    refreshData: fetchInitialData,
    // Zone management
    activeZone,
    switchZone,
    selectedIntegration,
    selectIntegration,
    // Frigg process management
    startFrigg,
    stopFrigg,
    restartFrigg,
    getFriggStatus,
    getMetrics
    // Note: Removed user/session/environment management functions
    // These are Frigg app concerns, handled by Test Area calling Frigg directly
  }

  return (
    <FriggContext.Provider value={value}>
      {children}
    </FriggContext.Provider>
  )
}