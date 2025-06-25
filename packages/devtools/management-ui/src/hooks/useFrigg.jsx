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
    fetchInitialData()

    return () => {
      unsubscribeStatus && unsubscribeStatus()
      unsubscribeIntegrations && unsubscribeIntegrations()
    }
  }, [on])

  const fetchInitialData = async () => {
    try {
      const [statusRes, integrationsRes, envRes, usersRes, connectionsRes] = await Promise.all([
        api.get('/api/frigg/status'),
        api.get('/api/integrations'),
        api.get('/api/environment'),
        api.get('/api/users'),
        api.get('/api/connections'),
      ])

      setStatus(statusRes.data.status)
      setIntegrations(integrationsRes.data.integrations || [])
      setEnvVariables(envRes.data.variables || {})
      setUsers(usersRes.data.users || [])
      setConnections(connectionsRes.data.connections || [])
    } catch (error) {
      console.error('Error fetching initial data:', error)
    }
  }

  const startFrigg = async (options = {}) => {
    try {
      setStatus('starting')
      await api.post('/api/frigg/start', options)
    } catch (error) {
      console.error('Error starting Frigg:', error)
      setStatus('stopped')
    }
  }

  const stopFrigg = async (force = false) => {
    try {
      await api.post('/api/frigg/stop', { force })
      setStatus('stopped')
    } catch (error) {
      console.error('Error stopping Frigg:', error)
    }
  }

  const restartFrigg = async (options = {}) => {
    try {
      await api.post('/api/frigg/restart', options)
    } catch (error) {
      console.error('Error restarting Frigg:', error)
    }
  }

  const getLogs = async (limit = 100) => {
    try {
      const response = await api.get(`/api/frigg/logs?limit=${limit}`)
      return response.data.logs || []
    } catch (error) {
      console.error('Error fetching logs:', error)
      return []
    }
  }

  const getMetrics = async () => {
    try {
      const response = await api.get('/api/frigg/metrics')
      return response.data
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
    refreshData: fetchInitialData,
  }

  return (
    <FriggContext.Provider value={value}>
      {children}
    </FriggContext.Provider>
  )
}