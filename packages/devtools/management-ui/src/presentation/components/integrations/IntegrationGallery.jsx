import React, { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import SearchBar from './SearchBar'
import { cn } from '../../../lib/utils'
import {
  Database,
  Cloud,
  Code,
  Zap,
  Shield,
  Globe,
  Download,
  CheckCircle,
  AlertCircle,
  Clock,
  ExternalLink
} from 'lucide-react'

const IntegrationGallery = ({
  integrations = [],
  onInstall,
  onConfigure,
  onView,
  className
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilters, setActiveFilters] = useState([])

  // Define available filters
  const filters = [
    { id: 'database', label: 'Database' },
    { id: 'auth', label: 'Authentication' },
    { id: 'payment', label: 'Payments' },
    { id: 'storage', label: 'Storage' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'communication', label: 'Communication' },
    { id: 'ai', label: 'AI/ML' },
    { id: 'installed', label: 'Installed' },
    { id: 'available', label: 'Available' }
  ]

  // Category icons mapping
  const categoryIcons = {
    database: Database,
    auth: Shield,
    payment: Zap,
    storage: Cloud,
    analytics: Globe,
    communication: Code,
    ai: Code,
    default: Code
  }

  // Status indicators
  const getStatusIcon = (status) => {
    switch (status) {
      case 'installed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'configuring':
        return <Clock className="w-4 h-4 text-yellow-500" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      default:
        return <Download className="w-4 h-4 text-muted-foreground" />
    }
  }

  // Filter integrations based on search and filters
  const filteredIntegrations = useMemo(() => {
    return integrations.filter(integration => {
      const matchesSearch = searchTerm === '' ||
        integration.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        integration.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        integration.category?.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesFilters = activeFilters.length === 0 ||
        activeFilters.some(filter => {
          if (filter === 'installed') return integration.status === 'installed'
          if (filter === 'available') return integration.status !== 'installed'
          return integration.category === filter || integration.tags?.includes(filter)
        })

      return matchesSearch && matchesFilters
    })
  }, [integrations, searchTerm, activeFilters])

  return (
    <div className={cn('space-y-6', className)}>
      {/* Search and Filter Bar */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Integration Gallery</h2>
            <p className="text-muted-foreground">
              Discover and manage integrations for your project
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            {filteredIntegrations.length} of {integrations.length} integrations
          </div>
        </div>

        <SearchBar
          placeholder="Search integrations by name, category, or description..."
          onSearch={setSearchTerm}
          onFilter={setActiveFilters}
          filters={filters}
          activeFilters={activeFilters}
        />
      </div>

      {/* Integration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredIntegrations.map((integration) => {
          const IconComponent = categoryIcons[integration.category] || categoryIcons.default

          return (
            <Card
              key={integration.id}
              className={cn(
                'group hover:shadow-lg transition-all duration-200 cursor-pointer',
                'border-2 hover:border-primary/20',
                integration.status === 'installed' && 'ring-1 ring-green-500/20 bg-green-50/30 dark:bg-green-950/10'
              )}
              onClick={() => onView?.(integration)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'p-2 rounded-lg',
                      integration.status === 'installed'
                        ? 'bg-green-100 dark:bg-green-900/20'
                        : 'bg-muted'
                    )}>
                      <IconComponent className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-base font-semibold leading-none">
                        {integration.name}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusIcon(integration.status)}
                        <Badge
                          variant={integration.status === 'installed' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {integration.status || 'available'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation()
                      window.open(integration.documentationUrl, '_blank')
                    }}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <CardDescription className="text-sm text-muted-foreground mb-3 line-clamp-2">
                  {integration.description}
                </CardDescription>

                <div className="space-y-3">
                  {/* Tags */}
                  {integration.tags && integration.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {integration.tags.slice(0, 3).map((tag, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {integration.tags.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{integration.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {integration.status === 'installed' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          onConfigure?.(integration)
                        }}
                      >
                        Configure
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          onInstall?.(integration)
                        }}
                        disabled={integration.status === 'configuring'}
                      >
                        {integration.status === 'configuring' ? 'Installing...' : 'Install'}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Empty State */}
      {filteredIntegrations.length === 0 && (
        <div className="text-center py-12">
          <Code className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">No integrations found</h3>
          <p className="text-muted-foreground mt-2">
            {searchTerm || activeFilters.length > 0
              ? 'Try adjusting your search or filters'
              : 'No integrations available at the moment'
            }
          </p>
          {(searchTerm || activeFilters.length > 0) && (
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm('')
                setActiveFilters([])
              }}
              className="mt-4"
            >
              Clear filters
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export default IntegrationGallery