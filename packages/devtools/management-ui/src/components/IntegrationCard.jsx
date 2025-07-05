import React, { useState } from 'react'
import { Download, CheckCircle, ExternalLink, Settings, AlertCircle } from 'lucide-react'
<<<<<<< HEAD
<<<<<<< HEAD
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import LoadingSpinner from './LoadingSpinner'
import { cn } from '../lib/utils'

const IntegrationCard = ({
  integration,
  onInstall,
  onConfigure,
  onUninstall,
  installing = false,
  className,
  ...props
}) => {
  const [showDetails, setShowDetails] = useState(false)

=======
import { Card, CardContent } from './Card'
import { Button } from './Button'
=======
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
import LoadingSpinner from './LoadingSpinner'
import { cn } from '../lib/utils'

const IntegrationCard = ({ 
  integration, 
  onInstall, 
  onConfigure, 
  onUninstall,
  installing = false,
  className,
  ...props 
}) => {
  const [showDetails, setShowDetails] = useState(false)
  
>>>>>>> 652520a5 (Claude Flow RFC related development)
  const isInstalled = integration.installed || integration.status === 'installed'
  const isInstalling = installing || integration.status === 'installing'
  const hasError = integration.status === 'error'

  const handleInstall = async () => {
    if (onInstall && !isInstalled && !isInstalling) {
      await onInstall(integration.name)
    }
  }

  const handleConfigure = () => {
    if (onConfigure && isInstalled) {
      onConfigure(integration.name)
    }
  }

  const handleUninstall = async () => {
    if (onUninstall && isInstalled) {
      await onUninstall(integration.name)
    }
  }

<<<<<<< HEAD
<<<<<<< HEAD
  // Filter out invalid DOM props
  const { onUpdate, onTest, uninstalling, updating, error, ...cardProps } = props

  return (
    <Card className={cn('hover:shadow-lg industrial-transition', className)} {...cardProps}>
=======
  return (
    <Card className={cn('hover:shadow-md transition-shadow', className)} {...props}>
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
  // Filter out invalid DOM props
  const { onUpdate, onTest, uninstalling, updating, error, ...cardProps } = props
  
  return (
    <Card className={cn('hover:shadow-lg industrial-transition', className)} {...cardProps}>
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center mb-2">
<<<<<<< HEAD
<<<<<<< HEAD
              <h4 className="font-semibold text-foreground text-lg">
                {integration.displayName || integration.name}
              </h4>
              {integration.version && (
                <span className="ml-2 text-xs bg-muted text-muted-foreground px-2 py-1 sharp-badge">
=======
              <h4 className="font-semibold text-gray-900 text-lg">
                {integration.displayName || integration.name}
              </h4>
              {integration.version && (
                <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
              <h4 className="font-semibold text-foreground text-lg">
                {integration.displayName || integration.name}
              </h4>
              {integration.version && (
                <span className="ml-2 text-xs bg-muted text-muted-foreground px-2 py-1 sharp-badge">
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
                  v{integration.version}
                </span>
              )}
            </div>
<<<<<<< HEAD
<<<<<<< HEAD
            <p className="text-sm text-muted-foreground mb-3">
              {integration.description || 'No description available'}
            </p>

=======
            <p className="text-sm text-gray-600 mb-3">
=======
            <p className="text-sm text-muted-foreground mb-3">
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
              {integration.description || 'No description available'}
            </p>
            
>>>>>>> 652520a5 (Claude Flow RFC related development)
            {integration.tags && integration.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {integration.tags.map((tag, index) => (
                  <span
                    key={index}
<<<<<<< HEAD
<<<<<<< HEAD
                    className="text-xs bg-primary/10 text-primary px-2 py-1 sharp-badge"
=======
                    className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full"
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
                    className="text-xs bg-primary/10 text-primary px-2 py-1 sharp-badge"
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
<<<<<<< HEAD

=======
          
>>>>>>> 652520a5 (Claude Flow RFC related development)
          <div className="flex items-center ml-4">
            {hasError && (
              <AlertCircle size={20} className="text-red-500 mr-2" />
            )}
            {isInstalled && !hasError && (
              <CheckCircle size={20} className="text-green-500 mr-2" />
            )}
            {isInstalling && (
              <LoadingSpinner size="sm" className="mr-2" />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {!isInstalled && !isInstalling && (
              <Button
                size="sm"
                onClick={handleInstall}
                disabled={isInstalling}
                className="inline-flex items-center"
              >
                <Download size={16} className="mr-1" />
                Install
              </Button>
            )}
<<<<<<< HEAD

=======
            
>>>>>>> 652520a5 (Claude Flow RFC related development)
            {isInstalled && !hasError && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleConfigure}
                className="inline-flex items-center"
              >
                <Settings size={16} className="mr-1" />
                Configure
              </Button>
            )}
<<<<<<< HEAD

=======
            
>>>>>>> 652520a5 (Claude Flow RFC related development)
            {isInstalling && (
              <Button size="sm" disabled className="inline-flex items-center">
                <LoadingSpinner size="sm" className="mr-1" />
                Installing...
              </Button>
            )}
<<<<<<< HEAD

=======
            
>>>>>>> 652520a5 (Claude Flow RFC related development)
            {hasError && (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleInstall}
                className="inline-flex items-center"
              >
                <AlertCircle size={16} className="mr-1" />
                Retry
              </Button>
            )}
          </div>
<<<<<<< HEAD

=======
          
>>>>>>> 652520a5 (Claude Flow RFC related development)
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
<<<<<<< HEAD

=======
            
>>>>>>> 652520a5 (Claude Flow RFC related development)
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
<<<<<<< HEAD
<<<<<<< HEAD
          <div className="mt-4 pt-4 border-t border-border">
            <div className="space-y-2 text-sm">
              {integration.endpoints && (
                <div>
                  <span className="font-medium text-foreground">Endpoints:</span>
                  <span className="ml-2 text-muted-foreground">{integration.endpoints.length}</span>
=======
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="space-y-2 text-sm">
              {integration.endpoints && (
                <div>
                  <span className="font-medium text-gray-700">Endpoints:</span>
                  <span className="ml-2 text-gray-600">{integration.endpoints.length}</span>
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
          <div className="mt-4 pt-4 border-t border-border">
            <div className="space-y-2 text-sm">
              {integration.endpoints && (
                <div>
                  <span className="font-medium text-foreground">Endpoints:</span>
                  <span className="ml-2 text-muted-foreground">{integration.endpoints.length}</span>
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
                </div>
              )}
              {integration.lastUpdated && (
                <div>
<<<<<<< HEAD
<<<<<<< HEAD
                  <span className="font-medium text-foreground">Last Updated:</span>
                  <span className="ml-2 text-muted-foreground">
=======
                  <span className="font-medium text-gray-700">Last Updated:</span>
                  <span className="ml-2 text-gray-600">
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
                  <span className="font-medium text-foreground">Last Updated:</span>
                  <span className="ml-2 text-muted-foreground">
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
                    {new Date(integration.lastUpdated).toLocaleDateString()}
                  </span>
                </div>
              )}
              {integration.connections && (
                <div>
<<<<<<< HEAD
<<<<<<< HEAD
                  <span className="font-medium text-foreground">Active Connections:</span>
                  <span className="ml-2 text-muted-foreground">{integration.connections}</span>
                </div>
              )}
            </div>

=======
                  <span className="font-medium text-gray-700">Active Connections:</span>
                  <span className="ml-2 text-gray-600">{integration.connections}</span>
=======
                  <span className="font-medium text-foreground">Active Connections:</span>
                  <span className="ml-2 text-muted-foreground">{integration.connections}</span>
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
                </div>
              )}
            </div>
            
>>>>>>> 652520a5 (Claude Flow RFC related development)
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                variant="destructive"
                onClick={handleUninstall}
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

export default IntegrationCard