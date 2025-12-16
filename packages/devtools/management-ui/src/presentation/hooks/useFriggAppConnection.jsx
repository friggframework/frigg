import { useState, useCallback, useEffect, useRef } from 'react'
import api from '../../infrastructure/http/api-client.js'

/**
 * useFriggAppConnection
 * Hook for managing connection to a running Frigg app via the Management UI server
 *
 * The Management UI server acts as a proxy to the Frigg app's admin API,
 * using the FRIGG_ADMIN_API_KEY for authentication.
 *
 * Supports auto-connect for local development when friggBaseUrl is localhost.
 * When repositoryPath is provided, auto-connect will read the admin API key
 * from that repository's .env file.
 */
export function useFriggAppConnection({ friggBaseUrl = null, repositoryPath = null, autoConnect = true } = {}) {
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connection, setConnection] = useState(null)
  const [userManagementMode, setUserManagementMode] = useState(null)
  const [appDefinition, setAppDefinition] = useState(null)
  const [error, setError] = useState(null)
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false)
  const autoConnectRef = useRef(false)

  /**
   * Check connection status on mount
   */
  useEffect(() => {
    checkConnectionStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Intentionally run only on mount

  /**
   * Auto-connect to local Frigg app when friggBaseUrl is localhost
   * Passes repositoryPath so the server can read FRIGG_ADMIN_API_KEY from .env
   *
   * Note: We track the repositoryPath we used for auto-connect. If it was null/undefined
   * initially but becomes available later, we retry once with the path.
   */
  const autoConnectPathRef = useRef(null)

  useEffect(() => {
    if (!autoConnect || isConnected || isConnecting) return
    if (!friggBaseUrl) return

    const isLocalhost = friggBaseUrl.includes('localhost') || friggBaseUrl.includes('127.0.0.1')
    if (!isLocalhost) return

    // If we already tried with a path, don't retry
    if (autoConnectRef.current && autoConnectPathRef.current) return

    // If we tried without a path and now have one, retry
    const shouldRetry = autoConnectRef.current && !autoConnectPathRef.current && repositoryPath

    if (!autoConnectRef.current || shouldRetry) {
      autoConnectRef.current = true
      autoConnectPathRef.current = repositoryPath || null
      setAutoConnectAttempted(true)
      tryAutoConnect(friggBaseUrl, repositoryPath)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friggBaseUrl, repositoryPath, autoConnect, isConnected, isConnecting])

  /**
   * Check current connection status
   */
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

  /**
   * Try auto-connect to local Frigg using API key from repository .env
   * @param {string} url - Frigg app URL
   * @param {string} repoPath - Repository path to read .env from
   */
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
      // Auto-connect failed silently - user can still manually connect
      console.debug('Auto-connect failed, manual connection required:', err.message)
    } finally {
      setIsConnecting(false)
    }
  }, [])

  /**
   * Connect to a running Frigg app
   * @param {object} params
   * @param {string} params.friggAppUrl - URL of the running Frigg app
   * @param {string} params.adminApiKey - Admin API key for authentication
   */
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

  /**
   * Disconnect from the Frigg app
   */
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

  /**
   * Get available authentication methods
   */
  const getAuthMethods = useCallback(async () => {
    try {
      const response = await api.get('/api/frigg-app/auth-methods')
      return response.data.methods || []
    } catch (err) {
      console.error('Failed to get auth methods:', err)
      return []
    }
  }, [])

  /**
   * Clear any connection errors
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    // Connection state
    isConnected,
    isConnecting,
    connection,
    userManagementMode,
    appDefinition,
    error,
    autoConnectAttempted,

    // Actions
    connect,
    disconnect,
    checkConnectionStatus,
    getAuthMethods,
    clearError,
    tryAutoConnect
  }
}

export default useFriggAppConnection
