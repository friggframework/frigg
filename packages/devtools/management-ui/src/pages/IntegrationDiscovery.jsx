import React, { useState, useEffect, useMemo } from 'react'
import { Search, Filter, Grid3X3, List, Package, RefreshCw, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { useFrigg } from '../hooks/useFrigg'
import { useSocket } from '../hooks/useSocket'
import IntegrationCard from '../components/IntegrationCard'
import { Button } from '../components/Button'
import { cn } from '../lib/utils'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'

const IntegrationDiscovery = () => {
  const { refreshData } = useFrigg()
  const { on, emit } = useSocket()
  
  // State management
  const [loading, setLoading] = useState(true)
  const [availableIntegrations, setAvailableIntegrations] = useState([])
  const [installedIntegrations, setInstalledIntegrations] = useState([])
  const [categories, setCategories] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [viewMode, setViewMode] = useState('grid')
  const [installProgress, setInstallProgress] = useState({})
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  // Fetch integration categories
  useEffect(() => {
    fetchCategories()
  }, [])

  // Fetch integrations on mount and when search/filter changes
  useEffect(() => {
    fetchIntegrations()
  }, [searchQuery, selectedCategory])

  // Listen for installation progress updates via WebSocket
  useEffect(() => {
    const unsubscribeProgress = on('integration:install:progress', (data) => {
      setInstallProgress(prev => ({
        ...prev,
        [data.packageName]: {
          status: data.status,
          progress: data.progress,
          message: data.message
        }
      }))
    })

    const unsubscribeComplete = on('integration:install:complete', (data) => {
      setInstallProgress(prev => {
        const newProgress = { ...prev }
        delete newProgress[data.packageName]
        return newProgress
      })
      // Refresh integrations list
      fetchIntegrations()
      refreshData()
    })

    const unsubscribeError = on('integration:install:error', (data) => {
      setInstallProgress(prev => ({
        ...prev,
        [data.packageName]: {
          status: 'error',
          message: data.error
        }
      }))
    })

    return () => {
      unsubscribeProgress && unsubscribeProgress()
      unsubscribeComplete && unsubscribeComplete()
      unsubscribeError && unsubscribeError()
    }
  }, [on, refreshData])

  const fetchCategories = async () => {
    try {
      const response = await api.get('/api/discovery/categories')
      setCategories([
        { id: 'all', name: 'All', icon: 'grid' },
        ...response.data.data
      ])
    } catch (err) {
      console.error('Failed to fetch categories:', err)
    }
  }

  const fetchIntegrations = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Fetch both available and installed integrations in parallel
      const [availableRes, installedRes] = await Promise.all([
        searchQuery
          ? api.get(`/api/discovery/search?query=${encodeURIComponent(searchQuery)}&limit=100`)
          : api.get('/api/discovery/integrations'),
        api.get('/api/discovery/installed')
      ])

      // Process available integrations
      let available = availableRes.data.data.integrations || availableRes.data.data.all || []
      
      // Filter by category if needed
      if (selectedCategory && selectedCategory !== 'all') {
        available = available.filter(int =>
          int.category?.toLowerCase() === selectedCategory.toLowerCase()
        )
      }

      // Mark installed integrations
      const installedNames = installedRes.data.data.map(i => i.name)
      available = available.map(integration => ({
        ...integration,
        installed: installedNames.includes(integration.name),
        status: installProgress[integration.name]?.status || 
                (installedNames.includes(integration.name) ? 'installed' : 'available')
      }))

      setAvailableIntegrations(available)
      setInstalledIntegrations(installedRes.data.data)
      
    } catch (err) {
      console.error('Failed to fetch integrations:', err)
      setError('Failed to load integrations. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleInstall = async (packageName) => {
    try {
      setInstallProgress(prev => ({
        ...prev,
        [packageName]: {
          status: 'installing',
          progress: 0,
          message: 'Starting installation...'
        }
      }))

      await api.post('/api/discovery/install', { packageName })
      
    } catch (err) {
      console.error('Installation failed:', err)
      setInstallProgress(prev => ({
        ...prev,
        [packageName]: {
          status: 'error',
          message: err.response?.data?.message || 'Installation failed'
        }
      }))
    }
  }

  const handleUninstall = async (packageName) => {
    try {
      const confirmed = window.confirm(
        `Are you sure you want to uninstall ${packageName}? This action cannot be undone.`
      )
      
      if (!confirmed) return

      setInstallProgress(prev => ({
        ...prev,
        [packageName]: {
          status: 'uninstalling',
          message: 'Removing integration...'
        }
      }))

      await api.delete(`/api/discovery/uninstall/${packageName}`)
      
      setInstallProgress(prev => {
        const newProgress = { ...prev }
        delete newProgress[packageName]
        return newProgress
      })
      
      // Refresh lists
      await fetchIntegrations()
      refreshData()
      
    } catch (err) {
      console.error('Uninstall failed:', err)
      setInstallProgress(prev => ({
        ...prev,
        [packageName]: {
          status: 'error',
          message: err.response?.data?.message || 'Uninstall failed'
        }
      }))
    }
  }

  const handleUpdate = async (packageName) => {
    try {
      setInstallProgress(prev => ({
        ...prev,
        [packageName]: {
          status: 'updating',
          message: 'Checking for updates...'
        }
      }))

      await api.post('/api/discovery/update', { packageName })
      
      // Refresh after update
      await fetchIntegrations()
      refreshData()
      
    } catch (err) {
      console.error('Update failed:', err)
      setInstallProgress(prev => ({
        ...prev,
        [packageName]: {
          status: 'error',
          message: err.response?.data?.message || 'Update failed'
        }
      }))
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      // Clear discovery cache
      await api.post('/api/discovery/cache/clear')
      // Refetch integrations
      await fetchIntegrations()
    } catch (err) {
      console.error('Refresh failed:', err)
    } finally {
      setRefreshing(false)
    }
  }

  const handleConfigure = (integrationName) => {
    // Navigate to configuration page
    window.location.href = `/integrations/${integrationName}/configure`
  }

  const handleTest = (integrationName) => {
    // Navigate to testing interface
    window.location.href = `/integrations/${integrationName}/test`
  }

  // Filter integrations for display
  const displayIntegrations = useMemo(() => {
    return availableIntegrations.map(integration => ({
      ...integration,
      installing: installProgress[integration.name]?.status === 'installing',
      uninstalling: installProgress[integration.name]?.status === 'uninstalling',
      updating: installProgress[integration.name]?.status === 'updating',
      installError: installProgress[integration.name]?.status === 'error',
      installMessage: installProgress[integration.name]?.message,
      installProgress: installProgress[integration.name]?.progress
    }))
  }, [availableIntegrations, installProgress])

  const installedCount = displayIntegrations.filter(i => i.installed).length
  const availableCount = displayIntegrations.filter(i => !i.installed).length

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Loading integrations...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
<<<<<<< HEAD
          <h2 className="text-3xl font-bold text-gray-900">Integration Library</h2>
          <p className="mt-2 text-gray-600">
            Discover and add integrations to your Frigg app
=======
<<<<<<< HEAD
<<<<<<< HEAD
          <h2 className="text-3xl font-bold text-gray-900">Integration Library</h2>
          <p className="mt-2 text-gray-600">
            Discover and add integrations to your Frigg app
=======
          <h2 className="text-3xl font-bold text-gray-900">Integration Marketplace</h2>
          <p className="mt-2 text-gray-600">
            Discover and install Frigg integrations to extend your capabilities
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
          <h2 className="text-3xl font-bold text-gray-900">Integration Library</h2>
          <p className="mt-2 text-gray-600">
            Discover and add integrations to your Frigg app
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center"
        >
          <RefreshCw size={16} className={cn("mr-2", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
          <AlertCircle size={20} className="text-red-500 mr-2 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-red-800">Error</h4>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Search integrations by name, description, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
<<<<<<< HEAD
        
=======
<<<<<<< HEAD

=======
        
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
        <div className="flex items-center gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
<<<<<<< HEAD
          
=======
<<<<<<< HEAD

=======
          
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
          <div className="flex border border-gray-300 rounded-lg">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="rounded-r-none"
            >
              <Grid3X3 size={16} />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-l-none border-l"
            >
              <List size={16} />
            </Button>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center">
            <Package size={20} className="text-blue-500 mr-2" />
            <div>
              <p className="text-sm text-gray-600">Total Available</p>
              <p className="text-xl font-semibold">{displayIntegrations.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center">
            <CheckCircle2 size={20} className="text-green-500 mr-2" />
            <div>
              <p className="text-sm text-gray-600">Installed</p>
              <p className="text-xl font-semibold">{installedCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center">
            <Clock size={20} className="text-orange-500 mr-2" />
            <div>
              <p className="text-sm text-gray-600">Available to Install</p>
              <p className="text-xl font-semibold">{availableCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Installed Integrations Section */}
      {installedCount > 0 && (
        <div>
          <div className="flex items-center mb-4">
            <CheckCircle2 size={20} className="mr-2 text-green-600" />
            <h3 className="text-lg font-medium text-gray-900">
              Installed Integrations ({installedCount})
            </h3>
          </div>
          <div className={cn(
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
              : 'space-y-4'
          )}>
            {displayIntegrations
              .filter(integration => integration.installed)
              .map((integration) => (
                <IntegrationCard
                  key={integration.name}
                  integration={integration}
                  onInstall={() => handleInstall(integration.name)}
                  onUninstall={() => handleUninstall(integration.name)}
                  onUpdate={() => handleUpdate(integration.name)}
                  onConfigure={() => handleConfigure(integration.name)}
                  onTest={() => handleTest(integration.name)}
                  installing={integration.installing}
                  uninstalling={integration.uninstalling}
                  updating={integration.updating}
                  error={integration.installError}
                  message={integration.installMessage}
                  progress={integration.installProgress}
                  className={viewMode === 'list' ? 'max-w-none' : ''}
                />
              ))}
          </div>
        </div>
      )}

      {/* Available Integrations Section */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Available Integrations ({availableCount})
        </h3>
<<<<<<< HEAD
        
=======
<<<<<<< HEAD

=======
        
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
        {availableCount === 0 ? (
          <div className="text-center py-12">
            <Package size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">
<<<<<<< HEAD
              {searchQuery || selectedCategory !== 'all' 
=======
<<<<<<< HEAD
              {searchQuery || selectedCategory !== 'all'
=======
              {searchQuery || selectedCategory !== 'all' 
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
                ? 'No integrations found matching your criteria'
                : 'All available integrations are already installed'}
            </p>
            {(searchQuery || selectedCategory !== 'all') && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery('')
                  setSelectedCategory('all')
                }}
                className="mt-4"
              >
                Clear Filters
              </Button>
            )}
          </div>
        ) : (
          <div className={cn(
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
              : 'space-y-4'
          )}>
            {displayIntegrations
              .filter(integration => !integration.installed)
              .map((integration) => (
                <IntegrationCard
                  key={integration.name}
                  integration={integration}
                  onInstall={() => handleInstall(integration.name)}
                  installing={integration.installing}
                  error={integration.installError}
                  message={integration.installMessage}
                  progress={integration.installProgress}
                  className={viewMode === 'list' ? 'max-w-none' : ''}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default IntegrationDiscovery