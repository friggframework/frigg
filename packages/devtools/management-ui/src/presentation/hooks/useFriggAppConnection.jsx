import { useState, useCallback, useEffect, useRef } from 'react'
import api from '../../infrastructure/http/api-client.js'

export function useFriggAppConnection({ friggBaseUrl = null, repositoryPath = null, autoConnect = true } = {}) {
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connection, setConnection] = useState(null)
  const [userManagementMode, setUserManagementMode] = useState(null)
  const [appDefinition, setAppDefinition] = useState(null)
  const [error, setError] = useState(null)
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false)
  const autoConnectRef = useRef(false)
  const autoConnectPathRef = useRef(null)

  useEffect(() => {
    checkConnectionStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!autoConnect || isConnected || isConnecting) return
    if (!friggBaseUrl) return

    let isLocalhost = false
    try {
      const url = new URL(friggBaseUrl)
      isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    } catch {
      return
    }
    if (!isLocalhost) return

    if (autoConnectRef.current && autoConnectPathRef.current) return

    const shouldRetry = autoConnectRef.current && !autoConnectPathRef.current && repositoryPath
    if (!autoConnectRef.current || shouldRetry) {
      autoConnectRef.current = true
      autoConnectPathRef.current = repositoryPath || null
      setAutoConnectAttempted(true)
      tryAutoConnect(friggBaseUrl, repositoryPath)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friggBaseUrl, repositoryPath, autoConnect, isConnected, isConnecting])

  const checkConnectionStatus = useCallback(async () => {
    try {
      const response = await api.get('/api/frigg-app/connection-status')
      const data = response.data

      setIsConnected(data.isConnected || false)
      setConnection(data.isConnected ? {
        baseUrl: data.baseUrl,
        state: data.state
      } : null)

      if (data.isConnected) {
        const modeResponse = await api.get('/api/frigg-app/user-management-mode')
        if (modeResponse.data.success) {
          setUserManagementMode(modeResponse.data.mode)
        }
      }
    } catch (err) {
      setIsConnected(false)
      setConnection(null)
    }
  }, [])

  const tryAutoConnect = useCallback(async (url, repoPath = null) => {
    setIsConnecting(true)
    setError(null)

    try {
      const response = await api.post('/api/frigg-app/auto-connect', {
        friggAppUrl: url,
        repositoryPath: repoPath
      })
      const data = response.data

      if (data.success) {
        setIsConnected(true)
        setConnection(data.connection)
        setUserManagementMode(data.userManagementMode)
        setAppDefinition(data.appDefinition)
        if (data.keySource) {
          console.debug(`Auto-connected using admin key from ${data.keySource}`)
        }
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message
      console.debug('Auto-connect failed:', errorMessage)
      // Don't set error state for auto-connect failures - user can still connect manually
    } finally {
      setIsConnecting(false)
    }
  }, [])

  const connect = useCallback(async ({ friggAppUrl, adminApiKey }) => {
    setIsConnecting(true)
    setError(null)

    try {
      const response = await api.post('/api/frigg-app/connect', {
        friggAppUrl,
        adminApiKey
      })

      const data = response.data

      if (data.success) {
        setIsConnected(true)
        setConnection(data.connection)
        setUserManagementMode(data.userManagementMode)
        setAppDefinition(data.appDefinition)
        return { success: true }
      } else {
        setError(data.error || 'Failed to connect')
        return { success: false, error: data.error }
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Connection failed'
      setError(errorMessage)
      return { success: false, error: errorMessage }
    } finally {
      setIsConnecting(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    try {
      await api.post('/api/frigg-app/disconnect')
    } finally {
      setIsConnected(false)
      setConnection(null)
      setUserManagementMode(null)
      setAppDefinition(null)
      setError(null)
    }
  }, [])

  const getAuthMethods = useCallback(async () => {
    try {
      const response = await api.get('/api/frigg-app/auth-methods')
      return response.data.methods || []
    } catch (err) {
      console.error('Failed to get auth methods:', err)
      return []
    }
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    isConnected,
    isConnecting,
    connection,
    userManagementMode,
    appDefinition,
    error,
    autoConnectAttempted,
    connect,
    disconnect,
    checkConnectionStatus,
    getAuthMethods,
    clearError,
    tryAutoConnect
  }
}

export default useFriggAppConnection
