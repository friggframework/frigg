import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Filter, Package, Code, GitBranch, ExternalLink, Download, Eye } from 'lucide-react'
import { RefreshCw } from 'lucide-react'
import { Card } from './ui/card'
import { Button } from './ui/button'

/**
 * Visual Integration Explorer using @friggframework/ui-react components
 * Shows available integrations, installed integrations, and code analysis
 */
export default function IntegrationExplorer({ mode = 'browse' }) {
  const [integrations, setIntegrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [viewMode, setViewMode] = useState('grid') // 'grid', 'list', 'code'

  useEffect(() => {
    fetchIntegrations()
  }, [])

  const fetchIntegrations = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/integrations')
      const data = await response.json()
      
      // Combine installed integrations and available API modules
      const allIntegrations = [
        ...data.integrations.map(int => ({ ...int, source: 'installed' })),
        ...data.availableApiModules.map(mod => ({ ...mod, source: 'available' }))
      ]
      
      setIntegrations(allIntegrations)
    } catch (error) {
      console.error('Failed to fetch integrations:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredIntegrations = integrations.filter(integration => {
    const matchesSearch = integration.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         integration.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         integration.description?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesCategory = selectedCategory === 'all' || 
                           integration.category?.toLowerCase() === selectedCategory.toLowerCase()
    
    return matchesSearch && matchesCategory
  })

  const categories = ['all', ...new Set(integrations.map(i => i.category).filter(Boolean))]

  const handleInstall = async (integration) => {
    try {
      const response = await fetch('/api/integrations/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageName: integration.name })
      })
      
      if (response.ok) {
        await fetchIntegrations() // Refresh the list
      }
    } catch (error) {
      console.error('Failed to install integration:', error)
    }
  }

  const handleViewCode = (integration) => {
    // Open code view for this integration
    setViewMode('code')
    // In a real implementation, you'd fetch and display the integration's source code
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-3">Loading integrations...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="text-xl font-semibold">Integration Explorer</h3>
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              Grid
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              List
            </Button>
            <Button
              variant={viewMode === 'code' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('code')}
            >
              Code
            </Button>
          </div>
        </div>
        
        <div className="flex gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search integrations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          
          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {categories.map(category => (
              <option key={category} value={category}>
                {category === 'all' ? 'All Categories' : category}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results Summary */}
      <div className="text-sm text-muted-foreground">
        Found {filteredIntegrations.length} integrations
        {searchTerm && ` matching "${searchTerm}"`}
        {selectedCategory !== 'all' && ` in ${selectedCategory}`}
      </div>

      {/* Integration Views */}
      <AnimatePresence mode="wait">
        {viewMode === 'grid' && (
          <motion.div
            key="grid"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {filteredIntegrations.map((integration, index) => (
              <motion.div
                key={integration.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="p-4 hover:shadow-lg transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        integration.source === 'installed' ? 'bg-green-500' : 'bg-gray-400'
                      }`} />
                      <div>
                        <h4 className="font-semibold">{integration.displayName || integration.name}</h4>
                        <p className="text-sm text-muted-foreground">{integration.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                            {integration.category}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {integration.source === 'installed' ? 'Installed' : 'Available'}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleViewCode(integration)}>
                        <Code className="w-4 h-4" />
                      </Button>
                      {integration.source === 'available' && (
                        <Button size="sm" onClick={() => handleInstall(integration)}>
                          <Download className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}

        {viewMode === 'list' && (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-3"
          >
            {filteredIntegrations.map((integration, index) => (
              <motion.div
                key={integration.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03 }}
              >
                <Card className="p-4 hover:shadow-md transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full ${
                        integration.source === 'installed' ? 'bg-green-500' : 'bg-gray-400'
                      }`} />
                      <div>
                        <h4 className="font-semibold">{integration.displayName || integration.name}</h4>
                        <p className="text-sm text-muted-foreground">{integration.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                            {integration.category}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {integration.source === 'installed' ? 'Installed' : 'Available'}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleViewCode(integration)}>
                        <Eye className="w-4 h-4" />
                        View
                      </Button>
                      {integration.source === 'available' && (
                        <Button size="sm" onClick={() => handleInstall(integration)}>
                          <Download className="w-4 h-4" />
                          Install
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}

        {viewMode === 'code' && (
          <motion.div
            key="code"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <CodeAnalysisView integrations={filteredIntegrations} />
          </motion.div>
        )}
      </AnimatePresence>

      {filteredIntegrations.length === 0 && (
        <div className="text-center py-12">
          <Package className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No integrations found</h3>
          <p className="text-muted-foreground">
            Try adjusting your search terms or category filter
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Code Analysis View showing integration structure and relationships
 */
function CodeAnalysisView({ integrations }) {
  const installedIntegrations = integrations.filter(i => i.source === 'installed')
  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <GitBranch className="w-5 h-5" />
        <h4 className="text-lg font-semibold">Integration Code Structure</h4>
      </div>
      
      {installedIntegrations.length === 0 ? (
        <Card className="p-8 text-center">
          <Code className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">No Installed Integrations</h3>
          <p className="text-muted-foreground">Install some integrations to analyze their code structure</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {installedIntegrations.map(integration => (
            <Card key={integration.name} className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Code className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold">{integration.displayName}</h4>
                  <p className="text-sm text-muted-foreground">{integration.className}</p>
                </div>
              </div>
              
              <div className="space-y-3">
                {integration.constructor && (
                  <div>
                    <h5 className="font-medium text-sm mb-2">Constructor Properties</h5>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Has Config:</span>
                        <span className={integration.constructor.hasConfig ? 'text-green-600' : 'text-gray-500'}>
                          {integration.constructor.hasConfig ? 'Yes' : 'No'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Has Options:</span>
                        <span className={integration.constructor.hasOptions ? 'text-green-600' : 'text-gray-500'}>
                          {integration.constructor.hasOptions ? 'Yes' : 'No'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Has Modules:</span>
                        <span className={integration.constructor.hasModules ? 'text-green-600' : 'text-gray-500'}>
                          {integration.constructor.hasModules ? 'Yes' : 'No'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                
                {integration.apiModules && integration.apiModules.length > 0 && (
                  <div>
                    <h5 className="font-medium text-sm mb-2">API Modules</h5>
                    <div className="space-y-1">
                      {integration.apiModules.map(module => (
                        <div key={module.name} className="text-xs bg-gray-50 p-2 rounded">
                          <div className="font-medium">{module.name}</div>
                          <div className="text-muted-foreground">{module.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {integration.events && integration.events.length > 0 && (
                  <div>
                    <h5 className="font-medium text-sm mb-2">Events</h5>
                    <div className="flex flex-wrap gap-1">
                      {integration.events.map(event => (
                        <span key={event} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          {event}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}