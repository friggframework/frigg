import React, { createContext, useContext, useState, useEffect } from 'react'
import { useSocket } from './useSocket'
import api from '../services/api'

const FriggContext = createContext()

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

  useEffect(() => {
    // Listen for status updates
    const unsubscribeStatus = on('frigg:status', (data) => {
      setStatus(data.status)
    })

    // Listen for integration updates
    const unsubscribeIntegrations = on('integrations:update', (data) => {
      setIntegrations(data.integrations)
    })

    // Initial data fetch
    initializeApp()

    return () => {
      unsubscribeStatus && unsubscribeStatus()
      unsubscribeIntegrations && unsubscribeIntegrations()
    }
  }, [on])

  const initializeApp = async () => {
    try {
      setIsLoading(true)
      // First fetch repositories to see what's available
      const repos = await fetchRepositories()
      // Then check if we have a current repository
      const currentRepo = await fetchCurrentRepository()
      
      if (currentRepo && repos.length > 0) {
        // If we have a current repository, fetch the full data
        await fetchInitialData()
      }
    } catch (error) {
      console.error('Error initializing app:', error)
      setError(error.message || 'Failed to initialize app')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchRepositories = async () => {
    try {
      const response = await api.get('/api/project/repositories')
      const repos = response.data.data?.repositories || response.data.repositories || []
      setRepositories(repos)
      return repos
    } catch (error) {
      console.error('Error fetching repositories:', error)
      setRepositories([])
      return []
    }
  }

  const fetchCurrentRepository = async () => {
    try {
      const response = await api.get('/api/repository/current')
      const repo = response.data.data?.repository || response.data.repository
      setCurrentRepository(repo)
      return repo
    } catch (error) {
      console.error('Error fetching current repository:', error)
      setCurrentRepository(null)
      return null
    }
  }

  const switchRepository = async (repoPath) => {
    try {
      const response = await api.post('/api/project/switch-repository', { path: repoPath })
      const repo = response.data.data?.repository || response.data.repository
      setCurrentRepository(repo)
      // Refresh other data after switching repository
      await fetchInitialData()
      return repo
    } catch (error) {
      console.error('Error switching repository:', error)
      throw error
    }
  }

  const fetchInitialData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const [statusRes, integrationsRes, envRes, usersRes, connectionsRes, repoRes] = await Promise.all([
        api.get('/api/project/status'),
        api.get('/api/integrations'),
        api.get('/api/environment'),
        api.get('/api/users'),
        api.get('/api/connections'),
        fetchCurrentRepository(),
      ])

      setStatus(statusRes.data.data?.status || statusRes.data.status || 'stopped')
      setIntegrations(integrationsRes.data.data?.integrations || integrationsRes.data.integrations || [])
      setEnvVariables(envRes.data.data?.variables || envRes.data.variables || {})
      setUsers(usersRes.data.data?.users || usersRes.data.users || [])
      setConnections(connectionsRes.data.data?.connections || connectionsRes.data.connections || [])
    } catch (error) {
      console.error('Error fetching initial data:', error)
      setError(error.message || 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }

  const startFrigg = async (options = {}) => {
    try {
      setStatus('starting')
      await api.post('/api/project/start', options)
    } catch (error) {
      console.error('Error starting Frigg:', error)
      setStatus('stopped')
    }
  }

  const stopFrigg = async (force = false) => {
    try {
      await api.post('/api/project/stop', { force })
      setStatus('stopped')
    } catch (error) {
      console.error('Error stopping Frigg:', error)
    }
  }

  const restartFrigg = async (options = {}) => {
    try {
      await api.post('/api/project/restart', options)
    } catch (error) {
      console.error('Error restarting Frigg:', error)
    }
  }

  const getLogs = async (limit = 100) => {
    try {
      const response = await api.get(`/api/project/logs?limit=${limit}`)
      return response.data.data?.logs || response.data.logs || []
    } catch (error) {
      console.error('Error fetching logs:', error)
      return []
    }
  }

  const getMetrics = async () => {
    try {
      const response = await api.get('/api/project/metrics')
      return response.data.data || response.data
    } catch (error) {
      console.error('Error fetching metrics:', error)
      return null
    }
  }


  const installIntegration = async (integrationName) => {
    try {
      const response = await api.post('/api/integrations/install', { name: integrationName })
      await fetchInitialData() // Refresh data
      return response.data
    } catch (error) {
      console.error('Error installing integration:', error)
      throw error
    }
  }

  const updateEnvVariable = async (key, value) => {
    try {
      await api.put('/api/environment', { key, value })
      setEnvVariables(prev => ({ ...prev, [key]: value }))
    } catch (error) {
      console.error('Error updating environment variable:', error)
      throw error
    }
  }

  const createUser = async (userData) => {
    try {
      const response = await api.post('/api/users', userData)
      await fetchInitialData() // Refresh data
      return response.data
    } catch (error) {
      console.error('Error creating user:', error)
      throw error
    }
  }

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

  // Load current user from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('frigg_current_user')
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser))
      } catch (error) {
        console.error('Error loading stored user context:', error)
      }
    }
  }, [])

  const value = {
    status,
    environment,
    integrations,
    envVariables,
    users,
    connections,
    currentUser,
    repositories,
    currentRepository,
    isLoading,
    loading,
    error,
    startFrigg,
    stopFrigg,
    restartFrigg,
    getLogs,
    getMetrics,
    installIntegration,
    updateEnvVariable,
    createUser,
    updateUser,
    deleteUser,
    bulkCreateUsers,
    deleteAllUsers,
    switchUserContext,
    createSession,
    getSession,
    getUserSessions,
    trackSessionActivity,
    refreshSession,
    endSession,
    getAllSessions,
    fetchRepositories,
    switchRepository,
    refreshData: fetchInitialData,
  }

  return (
    <FriggContext.Provider value={value}>
      {children}
    </FriggContext.Provider>
  )
}