import React, { useState } from 'react'
import { 
  Download, CheckCircle, ExternalLink, Settings, AlertCircle, 
  RefreshCw, TestTube, Info, Clock, TrendingUp, Shield,
  ChevronDown, ChevronUp
} from 'lucide-react'
import { Card, CardContent } from './Card'
import { Button } from './Button'
import LoadingSpinner from './LoadingSpinner'
import { cn } from '../lib/utils'

const IntegrationCardEnhanced = ({ 
  integration, 
  onInstall, 
  onUninstall,
  onUpdate,
  onConfigure, 
  onTest,
  onViewDetails,
  installing = false,
  uninstalling = false,
  updating = false,
  error = false,
  message = '',
  progress = 0,
  className,
  viewMode = 'grid',
  ...props 
}) => {
  const [expanded, setExpanded] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  
  const isInstalled = integration.installed || integration.status === 'installed'
  const isProcessing = installing || uninstalling || updating
  const hasUpdate = integration.updateAvailable
  const isOfficial = integration.isOfficial

  const getStatusIcon = () => {
    if (error) return <AlertCircle size={20} className="text-red-500" />
    if (isProcessing) return <LoadingSpinner size="sm" />
    if (isInstalled) return <CheckCircle size={20} className="text-green-500" />
    return null
  }

  const getProgressBarColor = () => {
    if (error) return 'bg-red-500'
    if (uninstalling) return 'bg-orange-500'
    if (updating) return 'bg-blue-500'
    return 'bg-green-500'
  }

  const formatCategory = (category) => {
    return category?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Other'
  }

  const handleAction = async (action, handler) => {
    if (handler && !isProcessing) {
      await handler(integration.name)
    }
  }

  // List view layout
  if (viewMode === 'list') {
    return (
      <Card className={cn('hover:shadow-md transition-shadow', className)} {...props}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            {/* Left side - Integration info */}
            <div className="flex items-center flex-1">
              <div className="flex-shrink-0 mr-4">
                {getStatusIcon()}
              </div>
              
              <div className="flex-1">
                <div className="flex items-center mb-1">
                  <h4 className="font-semibold text-gray-900">
                    {integration.displayName || integration.name}
                  </h4>
                  {integration.version && (
                    <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      v{integration.version}
                    </span>
                  )}
                  {hasUpdate && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded flex items-center">
                      <TrendingUp size={10} className="mr-1" />
                      Update available
                    </span>
                  )}
                  {isOfficial && (
                    <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded flex items-center">
                      <Shield size={10} className="mr-1" />
                      Official
                    </span>
                  )}
                </div>
                
                <p className="text-sm text-gray-600 mb-2">
                  {integration.description || 'No description available'}
                </p>
                
                {/* Tags and category */}
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">
                    {formatCategory(integration.category)}
                  </span>
                  {integration.tags?.slice(0, 3).map((tag, index) => (
                    <span
                      key={index}
                      className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                  {integration.tags?.length > 3 && (
                    <span className="text-xs text-gray-500">
                      +{integration.tags.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right side - Actions */}
            <div className="flex items-center gap-2 ml-4">
              {!isInstalled && !isProcessing && (
                <Button
                  size="sm"
                  onClick={() => handleAction('install', onInstall)}
                  className="inline-flex items-center"
                >
                  <Download size={16} className="mr-1" />
                  Install
                </Button>
              )}
              
              {isInstalled && !isProcessing && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction('configure', onConfigure)}
                    className="inline-flex items-center"
                  >
                    <Settings size={16} className="mr-1" />
                    Configure
                  </Button>
                  {hasUpdate && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction('update', onUpdate)}
                      className="inline-flex items-center text-blue-600 hover:text-blue-700"
                    >
                      <RefreshCw size={16} className="mr-1" />
                      Update
                    </Button>
                  )}
                </>
              )}
              
              {isProcessing && (
                <Button size="sm" disabled className="inline-flex items-center min-w-[100px]">
                  <LoadingSpinner size="sm" className="mr-1" />
                  {installing && 'Installing'}
                  {uninstalling && 'Uninstalling'}
                  {updating && 'Updating'}
                </Button>
              )}

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setExpanded(!expanded)}
                className="ml-2"
              >
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </Button>
            </div>
          </div>

          {/* Progress bar */}
          {isProcessing && progress > 0 && (
            <div className="mt-3">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={cn("h-2 rounded-full transition-all", getProgressBarColor())}
                  style={{ width: `${progress}%` }}
                />
              </div>
              {message && (
                <p className="text-xs text-gray-600 mt-1">{message}</p>
              )}
            </div>
          )}

          {/* Error message */}
          {error && message && (
            <div className="mt-3 text-sm text-red-600 flex items-start">
              <AlertCircle size={16} className="mr-1 flex-shrink-0 mt-0.5" />
              {message}
            </div>
          )}

          {/* Expanded details */}
          {expanded && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Package:</span>
                  <span className="ml-2 text-gray-600 font-mono text-xs">{integration.name}</span>
                </div>
                {integration.author && (
                  <div>
                    <span className="font-medium text-gray-700">Author:</span>
                    <span className="ml-2 text-gray-600">{integration.author}</span>
                  </div>
                )}
                {integration.lastUpdated && (
                  <div>
                    <span className="font-medium text-gray-700">Last Updated:</span>
                    <span className="ml-2 text-gray-600">
                      {new Date(integration.lastUpdated).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {integration.connections !== undefined && (
                  <div>
                    <span className="font-medium text-gray-700">Active Connections:</span>
                    <span className="ml-2 text-gray-600">{integration.connections}</span>
                  </div>
                )}
              </div>
              
              {isInstalled && (
                <div className="mt-4 flex justify-end gap-2">
                  {onTest && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction('test', onTest)}
                      className="inline-flex items-center text-xs"
                    >
                      <TestTube size={14} className="mr-1" />
                      Test
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleAction('uninstall', onUninstall)}
                    className="inline-flex items-center text-xs"
                  >
                    Uninstall
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // Grid view layout (default)
  return (
    <Card className={cn('hover:shadow-md transition-shadow', className)} {...props}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center mb-2">
              <h4 className="font-semibold text-gray-900 text-lg">
                {integration.displayName || integration.name}
              </h4>
              {integration.version && (
                <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                  v{integration.version}
                </span>
              )}
            </div>
            
            {/* Badges */}
            <div className="flex items-center gap-2 mb-3">
              {hasUpdate && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded flex items-center">
                  <TrendingUp size={10} className="mr-1" />
                  Update available
                </span>
              )}
              {isOfficial && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded flex items-center">
                  <Shield size={10} className="mr-1" />
                  Official
                </span>
              )}
              <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">
                {formatCategory(integration.category)}
              </span>
            </div>
            
            <p className="text-sm text-gray-600 mb-3">
              {integration.description || 'No description available'}
            </p>
            
            {integration.tags && integration.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {integration.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex items-center ml-4">
            {getStatusIcon()}
          </div>
        </div>

        {/* Progress bar */}
        {isProcessing && progress > 0 && (
          <div className="mb-4">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={cn("h-2 rounded-full transition-all", getProgressBarColor())}
                style={{ width: `${progress}%` }}
              />
            </div>
            {message && (
              <p className="text-xs text-gray-600 mt-1">{message}</p>
            )}
          </div>
        )}

        {/* Error message */}
        {error && message && (
          <div className="mb-4 text-sm text-red-600 flex items-start">
            <AlertCircle size={16} className="mr-1 flex-shrink-0 mt-0.5" />
            {message}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {!isInstalled && !isProcessing && (
              <Button
                size="sm"
                onClick={() => handleAction('install', onInstall)}
                className="inline-flex items-center"
              >
                <Download size={16} className="mr-1" />
                Install
              </Button>
            )}
            
            {isInstalled && !isProcessing && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction('configure', onConfigure)}
                  className="inline-flex items-center"
                >
                  <Settings size={16} className="mr-1" />
                  Configure
                </Button>
                {hasUpdate && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction('update', onUpdate)}
                    className="inline-flex items-center text-blue-600 hover:text-blue-700"
                  >
                    <RefreshCw size={16} className="mr-1" />
                    Update
                  </Button>
                )}
              </>
            )}
            
            {isProcessing && (
              <Button size="sm" disabled className="inline-flex items-center">
                <LoadingSpinner size="sm" className="mr-1" />
                {installing && 'Installing...'}
                {uninstalling && 'Uninstalling...'}
                {updating && 'Updating...'}
              </Button>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            {integration.docsUrl && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.open(integration.docsUrl, '_blank')}
                className="inline-flex items-center text-xs"
              >
                <ExternalLink size={14} className="mr-1" />
                Docs
              </Button>
            )}
            
            {onViewDetails && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onViewDetails(integration.name)}
                className="inline-flex items-center text-xs"
              >
                <Info size={14} className="mr-1" />
                Details
              </Button>
            )}
            
            {isInstalled && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs"
              >
                {showDetails ? 'Less' : 'More'}
              </Button>
            )}
          </div>
        </div>

        {showDetails && isInstalled && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium text-gray-700">Package:</span>
                <span className="ml-2 text-gray-600 font-mono text-xs">{integration.name}</span>
              </div>
              {integration.endpoints && (
                <div>
                  <span className="font-medium text-gray-700">Endpoints:</span>
                  <span className="ml-2 text-gray-600">{integration.endpoints.length}</span>
                </div>
              )}
              {integration.lastUpdated && (
                <div>
                  <span className="font-medium text-gray-700">Last Updated:</span>
                  <span className="ml-2 text-gray-600">
                    {new Date(integration.lastUpdated).toLocaleDateString()}
                  </span>
                </div>
              )}
              {integration.connections !== undefined && (
                <div>
                  <span className="font-medium text-gray-700">Active Connections:</span>
                  <span className="ml-2 text-gray-600">{integration.connections}</span>
                </div>
              )}
            </div>
            
            <div className="mt-3 flex justify-between">
              {onTest && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction('test', onTest)}
                  className="inline-flex items-center text-xs"
                >
                  <TestTube size={14} className="mr-1" />
                  Test Integration
                </Button>
              )}
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleAction('uninstall', onUninstall)}
                className="inline-flex items-center text-xs"
              >
                Uninstall
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default IntegrationCardEnhanced