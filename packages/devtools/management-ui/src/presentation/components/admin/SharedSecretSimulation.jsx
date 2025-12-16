import React, { useState, useCallback } from 'react'
import { UserCog, Play, AlertCircle, CheckCircle, Info, Loader2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

const MAX_HEADER_LENGTH = 100
const VALID_HEADER_PATTERN = /^[a-zA-Z0-9_@.\-]+$/

function validateId(value, fieldName) {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${fieldName} is required`)
  }
  if (trimmed.length > MAX_HEADER_LENGTH) {
    throw new Error(`${fieldName} too long (max ${MAX_HEADER_LENGTH} characters)`)
  }
  if (!VALID_HEADER_PATTERN.test(trimmed)) {
    throw new Error(`Invalid characters in ${fieldName}. Use alphanumeric, underscores, hyphens, @, or dots.`)
  }
  return trimmed
}

/**
 * SharedSecretSimulation
 * Allows developers to simulate requests as any user using shared secret headers.
 * This is only available when the Frigg app has sharedSecretEnabled in user config.
 *
 * Uses the server proxy to keep FRIGG_API_KEY server-side.
 * Sends requests through /api/frigg-app/proxy/shared-secret with:
 * - appOrgId: Arbitrary organization/tenant identifier
 * - appUserId: Arbitrary user identifier within the org
 */
const SharedSecretSimulation = ({ repositoryPath, friggAppUrl, onUserSelect }) => {
  const [appOrgId, setAppOrgId] = useState('')
  const [appUserId, setAppUserId] = useState('')
  const [isSimulating, setIsSimulating] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleSimulate = useCallback(async () => {
    // Validate input values
    let validOrgId, validUserId
    try {
      validOrgId = validateId(appOrgId, 'App Org ID')
      validUserId = validateId(appUserId, 'App User ID')
    } catch (err) {
      setError(err.message)
      return
    }

    setIsSimulating(true)
    setError(null)
    setResult(null)

    try {
      // Use the server proxy to keep FRIGG_API_KEY server-side
      const response = await fetch('/api/frigg-app/proxy/shared-secret', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          appOrgId: validOrgId,
          appUserId: validUserId,
          path: '/api/integrations',
          method: 'GET',
          repositoryPath,
          friggAppUrl
        })
      })

      const responseData = await response.json()

      if (response.ok && responseData.success) {
        setResult({
          success: true,
          message: 'Successfully authenticated as simulated user',
          userContext: {
            appOrgId: validOrgId,
            appUserId: validUserId
          },
          integrations: responseData.data
        })

        if (onUserSelect) {
          onUserSelect({
            type: 'shared-secret',
            appOrgId: validOrgId,
            appUserId: validUserId,
            // No headers exposed - proxy handles auth server-side
            repositoryPath
          })
        }
      } else {
        setError(responseData.error || `Request failed with status ${response.status}`)
      }
    } catch (err) {
      setError(err.message || 'Failed to connect to server')
    } finally {
      setIsSimulating(false)
    }
  }, [appOrgId, appUserId, repositoryPath, onUserSelect])

  const handleClear = useCallback(() => {
    setAppOrgId('')
    setAppUserId('')
    setResult(null)
    setError(null)
  }, [])

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Info Banner */}
      <Card className="bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800">
        <div className="flex items-start gap-3 p-4">
          <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
              Shared Secret User Simulation
            </h3>
            <p className="text-sm text-indigo-700 dark:text-indigo-300">
              Simulate requests as any user by providing arbitrary <code className="px-1 py-0.5 bg-indigo-100 dark:bg-indigo-900 rounded text-xs">X-Frigg-AppOrgId</code> and{' '}
              <code className="px-1 py-0.5 bg-indigo-100 dark:bg-indigo-900 rounded text-xs">X-Frigg-AppUserId</code> headers.
              This feature is only available in shared secret authentication mode.
            </p>
          </div>
        </div>
      </Card>

      {/* Input Form */}
      <Card>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <UserCog className="w-5 h-5 text-muted-foreground" />
            <h3 className="font-medium">Simulate User Context</h3>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="app-org-id">
                X-Frigg-AppOrgId
                <span className="text-muted-foreground font-normal ml-1">(Organization/Tenant ID)</span>
              </label>
              <input
                id="app-org-id"
                type="text"
                value={appOrgId}
                onChange={(e) => setAppOrgId(e.target.value)}
                placeholder="e.g., org_123, tenant-abc, company-xyz"
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                disabled={isSimulating}
              />
              <p className="text-xs text-muted-foreground">
                The organization or tenant identifier that groups users together
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="app-user-id">
                X-Frigg-AppUserId
                <span className="text-muted-foreground font-normal ml-1">(User ID within Org)</span>
              </label>
              <input
                id="app-user-id"
                type="text"
                value={appUserId}
                onChange={(e) => setAppUserId(e.target.value)}
                placeholder="e.g., user_456, john@example.com, usr-def"
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                disabled={isSimulating}
              />
              <p className="text-xs text-muted-foreground">
                The unique user identifier within the organization
              </p>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-md">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSimulate}
              disabled={isSimulating || !appOrgId.trim() || !appUserId.trim()}
              className="flex-1"
            >
              {isSimulating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Simulating...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Simulate User
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleClear}
              disabled={isSimulating}
            >
              Clear
            </Button>
          </div>
        </div>
      </Card>

      {/* Success Result */}
      {result?.success && (
        <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              <h3 className="font-medium text-green-900 dark:text-green-100">
                {result.message}
              </h3>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 p-2 bg-green-100 dark:bg-green-900/50 rounded font-mono text-xs">
                <span className="text-green-700 dark:text-green-300">X-Frigg-AppOrgId:</span>
                <span className="text-green-900 dark:text-green-100">{result.userContext.appOrgId}</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-green-100 dark:bg-green-900/50 rounded font-mono text-xs">
                <span className="text-green-700 dark:text-green-300">X-Frigg-AppUserId:</span>
                <span className="text-green-900 dark:text-green-100">{result.userContext.appUserId}</span>
              </div>
            </div>

            {Array.isArray(result.integrations) && (
              <div className="pt-2 border-t border-green-200 dark:border-green-800">
                <p className="text-sm text-green-700 dark:text-green-300">
                  Found {result.integrations.length} integration(s) for this user context
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Usage Tips */}
      <Card className="bg-muted/30">
        <div className="p-4 space-y-2">
          <h4 className="text-sm font-medium">Usage Tips</h4>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>Use any string values for testing - Frigg will create/lookup users automatically</li>
            <li>The AppOrgId typically maps to your customer/tenant identifier</li>
            <li>The AppUserId should be unique within each organization</li>
            <li>Requests are proxied through the server to keep the API key secure</li>
          </ul>
        </div>
      </Card>
    </div>
  )
}

export default SharedSecretSimulation
