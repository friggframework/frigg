/**
 * useRepositories Hook
 * Custom hook for managing repositories
 */
import { useState, useEffect, useCallback } from 'react'
import api from '../../infrastructure/http/api-client'

export const useRepositories = () => {
    const [repositories, setRepositories] = useState([])
    const [currentRepository, setCurrentRepository] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    /**
     * Fetch all repositories
     */
    const fetchRepositories = useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const response = await api.get('/repositories')
            setRepositories(response.data.repositories || [])
            setCurrentRepository(response.data.currentWorkingDirectory || null)
        } catch (err) {
            setError(err.message || 'Failed to fetch repositories')
            console.error('Error fetching repositories:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    /**
     * Switch to repository
     * @param {string} repositoryPath
     */
    const switchRepository = useCallback(async (repositoryPath) => {
        setLoading(true)
        setError(null)

        try {
            const response = await api.post('/repositories/switch', { path: repositoryPath })

            // Update current repository
            setCurrentRepository(repositoryPath)

            return response.data
        } catch (err) {
            setError(err.message || 'Failed to switch repository')
            console.error('Error switching repository:', err)
            throw err
        } finally {
            setLoading(false)
        }
    }, [])

    /**
     * Get repository status
     * @param {string} repositoryPath
     */
    const getRepositoryStatus = useCallback(async (repositoryPath) => {
        setLoading(true)
        setError(null)

        try {
            const response = await api.get(`/repositories/status?path=${encodeURIComponent(repositoryPath)}`)
            return response.data
        } catch (err) {
            setError(err.message || 'Failed to get repository status')
            console.error('Error getting repository status:', err)
            throw err
        } finally {
            setLoading(false)
        }
    }, [])

    /**
     * Start repository project
     * @param {string} repositoryPath
     * @param {Object} options
     */
    const startProject = useCallback(async (repositoryPath, options = {}) => {
        setLoading(true)
        setError(null)

        try {
            const response = await api.post('/repositories/start', {
                path: repositoryPath,
                ...options
            })

            return response.data
        } catch (err) {
            setError(err.message || 'Failed to start project')
            console.error('Error starting project:', err)
            throw err
        } finally {
            setLoading(false)
        }
    }, [])

    /**
     * Stop repository project
     * @param {string} repositoryPath
     * @param {boolean} force
     */
    const stopProject = useCallback(async (repositoryPath, force = false) => {
        setLoading(true)
        setError(null)

        try {
            const response = await api.post('/repositories/stop', {
                path: repositoryPath,
                force
            })

            return response.data
        } catch (err) {
            setError(err.message || 'Failed to stop project')
            console.error('Error stopping project:', err)
            throw err
        } finally {
            setLoading(false)
        }
    }, [])

    /**
     * Restart repository project
     * @param {string} repositoryPath
     * @param {Object} options
     */
    const restartProject = useCallback(async (repositoryPath, options = {}) => {
        setLoading(true)
        setError(null)

        try {
            const response = await api.post('/repositories/restart', {
                path: repositoryPath,
                ...options
            })

            return response.data
        } catch (err) {
            setError(err.message || 'Failed to restart project')
            console.error('Error restarting project:', err)
            throw err
        } finally {
            setLoading(false)
        }
    }, [])

    /**
     * Get repository logs
     * @param {string} repositoryPath
     * @param {number} limit
     */
    const getRepositoryLogs = useCallback(async (repositoryPath, limit = 100) => {
        setLoading(true)
        setError(null)

        try {
            const response = await api.get(`/repositories/logs?path=${encodeURIComponent(repositoryPath)}&limit=${limit}`)
            return response.data
        } catch (err) {
            setError(err.message || 'Failed to get repository logs')
            console.error('Error getting repository logs:', err)
            throw err
        } finally {
            setLoading(false)
        }
    }, [])

    /**
     * Get repository metrics
     * @param {string} repositoryPath
     */
    const getRepositoryMetrics = useCallback(async (repositoryPath) => {
        setLoading(true)
        setError(null)

        try {
            const response = await api.get(`/repositories/metrics?path=${encodeURIComponent(repositoryPath)}`)
            return response.data
        } catch (err) {
            setError(err.message || 'Failed to get repository metrics')
            console.error('Error getting repository metrics:', err)
            throw err
        } finally {
            setLoading(false)
        }
    }, [])

    /**
     * Add new repository
     * @param {string} repositoryPath
     */
    const addRepository = useCallback(async (repositoryPath) => {
        setLoading(true)
        setError(null)

        try {
            const response = await api.post('/repositories/add', { path: repositoryPath })

            // Refresh repositories list
            await fetchRepositories()

            return response.data
        } catch (err) {
            setError(err.message || 'Failed to add repository')
            console.error('Error adding repository:', err)
            throw err
        } finally {
            setLoading(false)
        }
    }, [fetchRepositories])

    /**
     * Remove repository
     * @param {string} repositoryPath
     */
    const removeRepository = useCallback(async (repositoryPath) => {
        setLoading(true)
        setError(null)

        try {
            await api.delete(`/repositories/remove?path=${encodeURIComponent(repositoryPath)}`)

            // Refresh repositories list
            await fetchRepositories()
        } catch (err) {
            setError(err.message || 'Failed to remove repository')
            console.error('Error removing repository:', err)
            throw err
        } finally {
            setLoading(false)
        }
    }, [fetchRepositories])

    // Fetch repositories on mount
    useEffect(() => {
        fetchRepositories()
    }, [fetchRepositories])

    return {
        repositories,
        currentRepository,
        loading,
        error,
        fetchRepositories,
        switchRepository,
        getRepositoryStatus,
        startProject,
        stopProject,
        restartProject,
        getRepositoryLogs,
        getRepositoryMetrics,
        addRepository,
        removeRepository
    }
}
