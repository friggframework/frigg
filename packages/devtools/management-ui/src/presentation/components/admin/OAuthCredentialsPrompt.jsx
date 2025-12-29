import React, { useState, useEffect } from 'react'
import { Key, AlertCircle, CheckCircle, ExternalLink, RefreshCw } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input } from '../ui/input'
import api from '../../../infrastructure/http/api-client.js'

/**
 * OAuthCredentialsPrompt
 * Component for prompting users to enter OAuth credentials when they're missing
 *
 * This component:
 * 1. Checks if OAuth credentials are configured for a module
 * 2. If missing, shows a form to enter CLIENT_ID, CLIENT_SECRET, and optionally SCOPE
 * 3. Writes the credentials to the .env file
 * 4. Shows a notification that the backend needs to be restarted
 *
 * @param {object} props
 * @param {string} props.moduleName - Name of the module (e.g., 'hubspot', 'salesforce')
 * @param {string} props.repositoryPath - Path to the Frigg app repository
 * @param {object} props.authRequirements - Auth requirements from the API (contains oauth URL if configured)
 * @param {function} props.onCredentialsSaved - Callback when credentials are saved successfully
 * @param {function} props.onCancel - Callback when user cancels
 * @param {function} props.onProceedToOAuth - Callback to proceed to OAuth flow
 */
const OAuthCredentialsPrompt = ({
  moduleName,
  repositoryPath,
  authRequirements,
  onCredentialsSaved,
  onCancel,
  onProceedToOAuth
}) => {
  const [credentialsStatus, setCredentialsStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  // Form state
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [scope, setScope] = useState('')

  // Check credentials on mount
  useEffect(() => {
    checkCredentials()
  }, [moduleName, repositoryPath])

  const checkCredentials = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await api.get('/api/frigg-app/oauth-credentials/check', {
        params: { repositoryPath, moduleName }
      })

      if (response.data?.success) {
        setCredentialsStatus(response.data)

        // If credentials are complete, proceed to OAuth
        if (response.data.complete && onProceedToOAuth) {
          onProceedToOAuth()
        }
      } else {
        setError(response.data?.error || 'Failed to check credentials')
      }
    } catch (err) {
      console.error('Failed to check OAuth credentials:', err)
      setError(err.response?.data?.error || err.message || 'Failed to check credentials')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveCredentials = async (e) => {
    e.preventDefault()

    try {
      setSaving(true)
      setError(null)

      const response = await api.post('/api/frigg-app/oauth-credentials', {
        repositoryPath,
        moduleName,
        credentials: {
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          scope: scope.trim() || undefined
        }
      })

      if (response.data?.success) {
        setSuccess(true)

        // Notify parent
        if (onCredentialsSaved) {
          onCredentialsSaved({
            path: response.data.path,
            requiresReload: response.data.requiresReload
          })
        }
      } else {
        setError(response.data?.error || 'Failed to save credentials')
      }
    } catch (err) {
      console.error('Failed to save OAuth credentials:', err)
      setError(err.response?.data?.error || err.message || 'Failed to save credentials')
    } finally {
      setSaving(false)
    }
  }

  const handleProceedToOAuth = () => {
    if (onProceedToOAuth) {
      onProceedToOAuth()
    } else if (authRequirements?.url) {
      const urlWithGlobal = `${authRequirements.url}${authRequirements.url.includes('?') ? '&' : '?'}isGlobal=true`
      window.location.href = urlWithGlobal
    }
  }

  const LoadingSpinner = ({ size = 'md' }) => (
    <div className={`animate-spin rounded-full border-2 border-current border-t-transparent ${
      size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'
    }`} />
  )

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
        <LoadingSpinner size="sm" />
        Checking OAuth credentials...
      </div>
    )
  }

  // Credentials are complete - show success and proceed button
  if (credentialsStatus?.complete && !success) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">
          <CheckCircle className="w-5 h-5" />
          <span>OAuth credentials are configured</span>
        </div>
        <Button onClick={handleProceedToOAuth}>
          <ExternalLink className="w-4 h-4 mr-2" />
          Connect via OAuth
        </Button>
      </div>
    )
  }

  // Success state after saving
  if (success) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">
          <CheckCircle className="w-5 h-5" />
          <div className="space-y-1">
            <p className="font-medium">Credentials saved successfully!</p>
            <p className="text-sm opacity-80">
              The backend needs to be restarted to pick up the new environment variables.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleProceedToOAuth}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Proceed to OAuth
          </Button>
          <Button variant="outline" onClick={checkCredentials}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Recheck
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          After restarting, the OAuth connection flow should work correctly.
        </p>
      </div>
    )
  }

  // Missing credentials - show form
  return (
    <div className="space-y-4">
      {/* Info message */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
        <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">OAuth credentials not configured</p>
          <p className="text-sm opacity-80">
            To connect via OAuth, you need to configure the following environment variables:
          </p>
          <ul className="text-xs space-y-0.5 mt-2 font-mono">
            {credentialsStatus?.envVarNames && (
              <>
                <li className={credentialsStatus.hasClientId ? 'line-through opacity-50' : ''}>
                  {credentialsStatus.envVarNames.clientId}
                </li>
                <li className={credentialsStatus.hasClientSecret ? 'line-through opacity-50' : ''}>
                  {credentialsStatus.envVarNames.clientSecret}
                </li>
                <li className="opacity-60">
                  {credentialsStatus.envVarNames.scope} (optional)
                </li>
              </>
            )}
          </ul>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Credentials form */}
      <form onSubmit={handleSaveCredentials} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="clientId" className="text-sm font-medium">
            Client ID <span className="text-destructive">*</span>
          </label>
          <Input
            id="clientId"
            type="text"
            placeholder={credentialsStatus?.envVarNames?.clientId || 'OAuth Client ID'}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
            disabled={saving}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="clientSecret" className="text-sm font-medium">
            Client Secret <span className="text-destructive">*</span>
          </label>
          <Input
            id="clientSecret"
            type="password"
            placeholder={credentialsStatus?.envVarNames?.clientSecret || 'OAuth Client Secret'}
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            required
            disabled={saving}
          />
          <p className="text-xs text-muted-foreground">
            This will be stored in your local .env file
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="scope" className="text-sm font-medium">
            Scope <span className="text-muted-foreground text-xs">(optional)</span>
          </label>
          <Input
            id="scope"
            type="text"
            placeholder={credentialsStatus?.envVarNames?.scope || 'OAuth Scope (space-separated)'}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            disabled={saving}
          />
          <p className="text-xs text-muted-foreground">
            Space-separated list of OAuth scopes (e.g., "read write contacts")
          </p>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" disabled={saving || !clientId.trim() || !clientSecret.trim()}>
            {saving ? (
              <>
                <LoadingSpinner size="sm" />
                <span className="ml-2">Saving...</span>
              </>
            ) : (
              <>
                <Key className="w-4 h-4 mr-2" />
                Save Credentials
              </>
            )}
          </Button>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          )}
        </div>
      </form>

      <p className="text-xs text-muted-foreground">
        These credentials will be written to your project's .env file.
        You'll need to restart the backend after saving.
      </p>
    </div>
  )
}

export default OAuthCredentialsPrompt
