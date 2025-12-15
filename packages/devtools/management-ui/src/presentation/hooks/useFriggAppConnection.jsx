import { useState, useCallback, useEffect } from 'react'
import api from '../../infrastructure/http/api-client.js'

/**
 * useFriggAppConnection
 * Hook for managing connection to a running Frigg app via the Management UI server
 *
 * The Management UI server acts as a proxy to the Frigg app's admin API,
 * using the FRIGG_ADMIN_API_KEY for authentication.
 */
export function useFriggAppConnection() {
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connection, setConnection] = useState(null)
  const [userManagementMode, setUserManagementMode] = useState(null)
  const [appDefinition, setAppDefinition] = useState(null)
  const [error, setError] = useState(null)

  /**
   * Check connection status on mount
   */
  useEffect(() => {
    checkConnectionStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Intentionally run only on mount

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
        // Also fetch user management mode
        const modeResponse = await api.get('/api/frigg-app/user-management-mode')
        if (modeResponse.data.success) {
          setUserManagementMode(modeResponse.data.mode)
        }
      }
    } catch (err) {
      // Connection check failed - probably not connected
      setIsConnected(false)
      setConnection(null)
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

    // Actions
    connect,
    disconnect,
    checkConnectionStatus,
    getAuthMethods,
    clearError
  }
}

export default useFriggAppConnection
