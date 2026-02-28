import React, { useState, useEffect } from 'react'
import { Link2, Link2Off, AlertCircle, CheckCircle, Loader2, Eye, EyeOff, Info } from 'lucide-react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

/**
 * AdminConnectionPanel
 * Panel for connecting to a running Frigg app with admin API credentials
 *
 * The connection is proxied through the Management UI server, which handles
 * the X-API-Key authentication to the Frigg app's admin router.
 */
const AdminConnectionPanel = ({
  isConnected,
  isConnecting,
  connection,
  userManagementMode,
  error,
  onConnect,
  onDisconnect,
  onClearError
}) => {
  const [friggAppUrl, setFriggAppUrl] = useState('')
  const [adminApiKey, setAdminApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [validationError, setValidationError] = useState(null)

  // Load saved URL from localStorage (not the API key for security)
  useEffect(() => {
    try {
      const savedUrl = localStorage.getItem('frigg_admin_url')
      if (savedUrl) {
        setFriggAppUrl(savedUrl)
      }
    } catch {
      // localStorage may not be available in some contexts (private browsing, SSR)
    }
  }, [])

  const handleConnect = async (e) => {
    e.preventDefault()
    setValidationError(null)

    // Basic validation
    if (!friggAppUrl.trim()) {
      setValidationError('Frigg app URL is required')
      return
    }

    if (!adminApiKey.trim()) {
      setValidationError('Admin API key is required')
      return
    }

    // Validate URL format
    try {
      new URL(friggAppUrl)
    } catch {
      setValidationError('Invalid URL format')
      return
    }

    // Save URL for convenience (but not API key)
    try {
      localStorage.setItem('frigg_admin_url', friggAppUrl.trim())
    } catch {
      // localStorage may not be available
    }

    const result = await onConnect({
      friggAppUrl: friggAppUrl.trim(),
      adminApiKey: adminApiKey.trim()
    })

    if (result.success) {
      // Clear API key from form after successful connection
      setAdminApiKey('')
    }
  }

  const handleDisconnect = async () => {
    await onDisconnect()
    try {
      localStorage.removeItem('frigg_admin_url')
    } catch {
      // localStorage may not be available
    }
  }

  if (isConnected) {
    return (
      <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              <span className="font-medium text-green-900 dark:text-green-100">
                Connected to Frigg App
              </span>
            </div>
            <Button
              onClick={handleDisconnect}
              variant="outline"
              size="sm"
              className="text-green-700 border-green-300 hover:bg-green-100 dark:text-green-300 dark:border-green-700 dark:hover:bg-green-900"
            >
              <Link2Off className="w-4 h-4 mr-1" />
              Disconnect
            </Button>
          </div>

          {connection?.baseUrl && (
            <div className="text-sm text-green-700 dark:text-green-300">
              <span className="font-mono">{connection.baseUrl}</span>
            </div>
          )}

          {userManagementMode && (
            <div className="pt-2 border-t border-green-200 dark:border-green-800 space-y-1">
              <div className="text-xs font-medium text-green-800 dark:text-green-200">
                User Management Mode:
              </div>
              <div className="flex flex-wrap gap-2">
                {userManagementMode.friggTokenEnabled && (
                  <span className="text-xs px-2 py-1 rounded-full bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200">
                    Frigg Token {userManagementMode.usePassword && '(with password)'}
                  </span>
                )}
                {userManagementMode.sharedSecretEnabled && (
                  <span className="text-xs px-2 py-1 rounded-full bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200">
                    Shared Secret
                  </span>
                )}
                {userManagementMode.adopterJwtEnabled && (
                  <span className="text-xs px-2 py-1 rounded-full bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200">
                    Adopter JWT
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
    )
  }

  return (
    <Card className="border-muted">
      <div className="p-4 space-y-4">
        <div className="flex items-start gap-3">
          <Link2 className="w-5 h-5 text-muted-foreground mt-0.5" />
          <div className="space-y-1 flex-1">
            <h3 className="font-medium">Connect to Frigg App</h3>
            <p className="text-sm text-muted-foreground">
              Enter the URL of your running Frigg app and the admin API key to manage users and global entities.
            </p>
          </div>
        </div>

        {/* Info about admin API key */}
        <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-blue-700 dark:text-blue-300">
            The admin API key is set in your Frigg app&apos;s environment as{' '}
            <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded">FRIGG_ADMIN_API_KEY</code>
          </div>
        </div>

        <form onSubmit={handleConnect} className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="frigg-url">
              Frigg App URL
            </label>
            <input
              id="frigg-url"
              type="url"
              value={friggAppUrl}
              onChange={(e) => setFriggAppUrl(e.target.value)}
              placeholder="http://localhost:3000"
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={isConnecting}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="admin-key">
              Admin API Key
            </label>
            <div className="relative">
              <input
                id="admin-key"
                type={showApiKey ? 'text' : 'password'}
                value={adminApiKey}
                onChange={(e) => setAdminApiKey(e.target.value)}
                placeholder="Enter admin API key"
                className="w-full px-3 py-2 pr-10 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={isConnecting}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Validation error */}
          {validationError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4" />
              {validationError}
            </div>
          )}

          {/* Connection error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-md">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              <span className="text-sm text-destructive flex-1">{error}</span>
              <button
                type="button"
                onClick={onClearError}
                className="text-xs text-destructive hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          <Button
            type="submit"
            disabled={isConnecting}
            className="w-full"
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4 mr-2" />
                Connect
              </>
            )}
          </Button>
        </form>
      </div>
    </Card>
  )
}

export default AdminConnectionPanel
