import React, { useState, useMemo } from 'react'
import { Search, Filter, Grid3X3, List, Package } from 'lucide-react'
import { useFrigg } from '../hooks/useFrigg'
import IntegrationCard from '../components/IntegrationCard'
import { Button } from '../components/Button'
import { cn } from '../lib/utils'

const Integrations = () => {
  const { integrations, installIntegration, uninstallIntegration } = useFrigg()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [viewMode, setViewMode] = useState('grid') // 'grid' or 'list'
  const [installing, setInstalling] = useState(false)
  const [selectedIntegration, setSelectedIntegration] = useState(null)

  // Mock available integrations - in real app, this would come from API
  const availableIntegrations = [
    { 
      name: 'slack', 
      displayName: 'Slack', 
      description: 'Team communication and collaboration platform',
      category: 'communication',
      tags: ['messaging', 'team', 'notifications'],
      version: '2.1.0',
      docsUrl: 'https://docs.frigg.dev/integrations/slack'
    },
    { 
      name: 'salesforce', 
      displayName: 'Salesforce', 
      description: 'Customer relationship management and sales platform',
      category: 'crm',
      tags: ['sales', 'crm', 'leads'],
      version: '1.8.2',
      docsUrl: 'https://docs.frigg.dev/integrations/salesforce'
    },
    { 
      name: 'hubspot', 
      displayName: 'HubSpot', 
      description: 'Inbound marketing, sales, and service software',
      category: 'marketing',
      tags: ['marketing', 'automation', 'analytics'],
      version: '3.0.1',
      docsUrl: 'https://docs.frigg.dev/integrations/hubspot'
    },
    { 
      name: 'google-sheets', 
      displayName: 'Google Sheets', 
      description: 'Online spreadsheet collaboration and data management',
      category: 'productivity',
      tags: ['spreadsheet', 'data', 'collaboration'],
      version: '1.5.0',
      docsUrl: 'https://docs.frigg.dev/integrations/google-sheets'
    },
    { 
      name: 'stripe', 
      displayName: 'Stripe', 
      description: 'Online payment processing and financial services',
      category: 'payments',
      tags: ['payments', 'ecommerce', 'billing'],
      version: '2.3.1',
      docsUrl: 'https://docs.frigg.dev/integrations/stripe'
    },
    { 
      name: 'mailchimp', 
      displayName: 'Mailchimp', 
      description: 'Email marketing and automation platform',
      category: 'marketing',
      tags: ['email', 'marketing', 'campaigns'],
      version: '1.9.0',
      docsUrl: 'https://docs.frigg.dev/integrations/mailchimp'
    },
  ].map(integration => ({
    ...integration,
    installed: integrations.some(i => i.name === integration.name),
    connections: Math.floor(Math.random() * 10), // Mock data
    lastUpdated: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
  }))

  const categories = ['all', 'communication', 'crm', 'marketing', 'productivity', 'payments']

  const filteredIntegrations = useMemo(() => {
    return availableIntegrations.filter(integration => {
      const matchesSearch = integration.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        integration.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        integration.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      
      const matchesCategory = selectedCategory === 'all' || integration.category === selectedCategory
      
      return matchesSearch && matchesCategory
    })
  }, [availableIntegrations, searchQuery, selectedCategory])

  const installedIntegrations = useMemo(() => {
    return availableIntegrations.filter(integration => integration.installed)
  }, [availableIntegrations])

  const availableForInstall = useMemo(() => {
    return filteredIntegrations.filter(integration => !integration.installed)
  }, [filteredIntegrations])

  const handleInstall = async (integrationName) => {
    setInstalling(true)
    setSelectedIntegration(integrationName)
    try {
      await installIntegration(integrationName)
    } catch (error) {
      console.error('Installation failed:', error)
    } finally {
      setInstalling(false)
      setSelectedIntegration(null)
    }
  }

  const handleUninstall = async (integrationName) => {
    try {
      if (uninstallIntegration) {
        await uninstallIntegration(integrationName)
      }
    } catch (error) {
      console.error('Uninstall failed:', error)
    }
  }

  const handleConfigure = (integrationName) => {
    // Navigate to configuration page or open modal
    console.log('Configure integration:', integrationName)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Integration Discovery</h2>
        <p className="mt-2 text-gray-600">Browse and manage Frigg integrations</p>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {categories.map(category => (
              <option key={category} value={category}>
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </option>
            ))}
          </select>
          
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

      {/* Installed Integrations */}
      {installedIntegrations.length > 0 && (
        <div>
          <div className="flex items-center mb-4">
            <Package size={20} className="mr-2 text-green-600" />
            <h3 className="text-lg font-medium text-gray-900">
              Installed Integrations ({installedIntegrations.length})
            </h3>
          </div>
          <div className={cn(
            viewMode === 'grid' 
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
              : 'space-y-4'
          )}>
            {installedIntegrations.map((integration) => (
              <IntegrationCard
                key={integration.name}
                integration={integration}
                onConfigure={handleConfigure}
                onUninstall={handleUninstall}
                className={viewMode === 'list' ? 'max-w-none' : ''}
              />
            ))}
          </div>
        </div>
      )}

      {/* Available Integrations */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Available Integrations ({availableForInstall.length})
        </h3>
        
        {availableForInstall.length === 0 ? (
          <div className="text-center py-12">
            <Package size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">No integrations found matching your criteria</p>
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
          </div>
        ) : (
          <div className={cn(
            viewMode === 'grid' 
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
              : 'space-y-4'
          )}>
            {availableForInstall.map((integration) => (
              <IntegrationCard
                key={integration.name}
                integration={integration}
                onInstall={handleInstall}
                installing={installing && selectedIntegration === integration.name}
                className={viewMode === 'list' ? 'max-w-none' : ''}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Integrations