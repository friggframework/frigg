/**
 * useIntegrations Hook
 * Custom hook for managing integrations
 */
import { useState, useEffect, useCallback } from 'react'
import api from '../../infrastructure/http/api-client'

export const useIntegrations = () => {
    const [integrations, setIntegrations] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    /**
     * Fetch all integrations
     */
    const fetchIntegrations = useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const response = await api.get('/integrations')
            setIntegrations(response.data)
        } catch (err) {
            setError(err.message || 'Failed to fetch integrations')
            console.error('Error fetching integrations:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    /**
     * Install integration
     * @param {string} integrationName
     */
    const installIntegration = useCallback(async (integrationName) => {
        setLoading(true)
        setError(null)

        try {
            const response = await api.post('/integrations/install', { name: integrationName })

            // Update local state
            setIntegrations(prev => [...prev, response.data])

            return response.data
        } catch (err) {
            setError(err.message || 'Failed to install integration')
            console.error('Error installing integration:', err)
            throw err
        } finally {
            setLoading(false)
        }
    }, [])

    /**
     * Uninstall integration
     * @param {string} integrationId
     */
    const uninstallIntegration = useCallback(async (integrationId) => {
        setLoading(true)
        setError(null)

        try {
            await api.delete(`/integrations/${integrationId}`)

            // Update local state
            setIntegrations(prev => prev.filter(integration => integration.id !== integrationId))
        } catch (err) {
            setError(err.message || 'Failed to uninstall integration')
            console.error('Error uninstalling integration:', err)
            throw err
        } finally {
            setLoading(false)
        }
    }, [])

    /**
     * Update integration
     * @param {string} integrationId
     * @param {Object} updates
     */
    const updateIntegration = useCallback(async (integrationId, updates) => {
        setLoading(true)
        setError(null)

        try {
            const response = await api.put(`/integrations/${integrationId}`, updates)

            // Update local state
            setIntegrations(prev =>
                prev.map(integration =>
                    integration.id === integrationId ? response.data : integration
                )
            )

            return response.data
        } catch (err) {
            setError(err.message || 'Failed to update integration')
            console.error('Error updating integration:', err)
            throw err
        } finally {
            setLoading(false)
        }
    }, [])

    /**
     * Get integration by ID
     * @param {string} integrationId
     */
    const getIntegrationById = useCallback(async (integrationId) => {
        setLoading(true)
        setError(null)

        try {
            const response = await api.get(`/integrations/${integrationId}`)
            return response.data
        } catch (err) {
            setError(err.message || 'Failed to get integration')
            console.error('Error getting integration:', err)
            throw err
        } finally {
            setLoading(false)
        }
    }, [])

    /**
     * Test integration
     * @param {string} integrationId
     */
    const testIntegration = useCallback(async (integrationId) => {
        setLoading(true)
        setError(null)

        try {
            const response = await api.post(`/integrations/${integrationId}/test`)
            return response.data
        } catch (err) {
            setError(err.message || 'Failed to test integration')
            console.error('Error testing integration:', err)
            throw err
        } finally {
            setLoading(false)
        }
    }, [])

    // Fetch integrations on mount
    useEffect(() => {
        fetchIntegrations()
    }, [fetchIntegrations])

    return {
        integrations,
        loading,
        error,
        fetchIntegrations,
        installIntegration,
        uninstallIntegration,
        updateIntegration,
        getIntegrationById,
        testIntegration
    }
}
