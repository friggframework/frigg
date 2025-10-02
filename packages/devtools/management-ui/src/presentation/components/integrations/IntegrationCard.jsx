import React, { useState } from 'react'
import { Download, CheckCircle, ExternalLink, Settings, AlertCircle } from 'lucide-react'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import LoadingSpinner from './LoadingSpinner'
import { cn } from '../lib/utils'

const IntegrationCard = ({
  integration,
  onInstall,
  onConfigure,
  onUninstall,
  onTest,
  className,
  ...cardProps
}) => {
  const [isInstalling, setIsInstalling] = useState(false)
  const [isTesting, setIsTesting] = useState(false)

  const handleInstall = async () => {
    if (onInstall) {
      setIsInstalling(true)
      try {
        await onInstall(integration)
      } finally {
        setIsInstalling(false)
      }
    }
  }

  const handleTest = async () => {
    if (onTest) {
      setIsTesting(true)
      try {
        await onTest(integration)
      } finally {
        setIsTesting(false)
      }
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'installed': return 'text-green-600'
      case 'running': return 'text-blue-600'
      case 'error': return 'text-red-600'
      case 'stopped': return 'text-gray-600'
      default: return 'text-gray-600'
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'installed':
      case 'running':
        return <CheckCircle className="w-4 h-4" />
      case 'error':
        return <AlertCircle className="w-4 h-4" />
      default:
        return <div className="w-4 h-4 rounded-full bg-gray-300" />
    }
  }

  return (
    <Card className={cn('hover:shadow-lg transition-shadow', className)} {...cardProps}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center mb-2">
              <h4 className="font-semibold text-foreground text-lg">
                {integration.displayName || integration.name}
              </h4>
              {integration.version && (
                <span className="ml-2 text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                  v{integration.version}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {integration.description || 'No description available'}
            </p>

            {integration.tags && integration.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {integration.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="text-xs bg-primary/10 text-primary px-2 py-1 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 mb-4">
              <div className={cn('flex items-center gap-1', getStatusColor(integration.status))}>
                {getStatusIcon(integration.status)}
                <span className="text-sm font-medium capitalize">
                  {integration.status || 'Not Installed'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {integration.status === 'installed' || integration.status === 'running' ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onConfigure?.(integration)}
                className="flex-1"
              >
                <Settings className="w-4 h-4 mr-2" />
                Configure
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTest}
                disabled={isTesting}
                className="flex-1"
              >
                {isTesting ? (
                  <LoadingSpinner size="sm" className="mr-2" />
                ) : (
                  <ExternalLink className="w-4 h-4 mr-2" />
                )}
                Test
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onUninstall?.(integration)}
                className="flex-1"
              >
                Uninstall
              </Button>
            </>
          ) : (
            <Button
              onClick={handleInstall}
              disabled={isInstalling}
              className="flex-1"
            >
              {isInstalling ? (
                <LoadingSpinner size="sm" className="mr-2" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Install
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default IntegrationCard