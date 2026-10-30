import React, { useState, useEffect } from 'react'
import { Button } from '../Button'
import LoadingSpinner from '../LoadingSpinner'
import api from '../../services/api'

const OAuthFlow = ({ integration, onSuccess, onCancel }) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [authUrl, setAuthUrl] = useState(null)
  const [pollingForToken, setPollingForToken] = useState(false)

  // OAuth configuration for different providers
  const oauthConfigs = {
    slack: {
      authEndpoint: 'https://slack.com/oauth/v2/authorize',
      scopes: ['channels:read', 'chat:write', 'users:read'],
      responseType: 'code'
    },
    google: {
      authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      scopes: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/drive.readonly'],
      responseType: 'code'
    },
    salesforce: {
      authEndpoint: 'https://login.salesforce.com/services/oauth2/authorize',
      scopes: ['api', 'refresh_token'],
      responseType: 'code'
    },
    hubspot: {
      authEndpoint: 'https://app.hubspot.com/oauth/authorize',
      scopes: ['contacts', 'oauth'],
      responseType: 'code'
    }
  }

  const startOAuthFlow = async () => {
    setLoading(true)
    setError(null)

    try {
      // Get OAuth initialization data from server
      const response = await api.post(`/api/connections/oauth/init`, {
        integration: integration.name,
        provider: integration.provider || integration.name.toLowerCase()
      })

      const { authUrl: serverAuthUrl, state, codeVerifier } = response.data

      // Store state and code verifier for later verification
      sessionStorage.setItem('oauth_state', state)
      if (codeVerifier) {
        sessionStorage.setItem('oauth_verifier', codeVerifier)
      }

      // Open OAuth window
      const authWindow = window.open(
        serverAuthUrl,
        'OAuth Authorization',
        'width=600,height=700,left=200,top=100'
      )

      // Start polling for completion
      setPollingForToken(true)
      pollForAuthCompletion(state, authWindow)

    } catch (err) {
      setError(err.response?.data?.error || 'Failed to initialize OAuth flow')
      setLoading(false)
    }
  }

  const pollForAuthCompletion = async (state, authWindow) => {
    const pollInterval = setInterval(async () => {
      // Check if window was closed
      if (authWindow && authWindow.closed) {
        clearInterval(pollInterval)
        setPollingForToken(false)
        setLoading(false)
        setError('Authorization window was closed')
        return
      }

      try {
        // Check if auth is complete
        const response = await api.get(`/api/connections/oauth/status/${state}`)
        
        if (response.data.status === 'completed') {
          clearInterval(pollInterval)
          setPollingForToken(false)
          setLoading(false)
          
          if (authWindow && !authWindow.closed) {
            authWindow.close()
          }

          // Clean up session storage
          sessionStorage.removeItem('oauth_state')
          sessionStorage.removeItem('oauth_verifier')

          onSuccess(response.data.connection)
        } else if (response.data.status === 'error') {
          clearInterval(pollInterval)
          setPollingForToken(false)
          setLoading(false)
          setError(response.data.error || 'OAuth authorization failed')
          
          if (authWindow && !authWindow.closed) {
            authWindow.close()
          }
        }
      } catch (err) {
        // Continue polling on network errors
        console.error('Polling error:', err)
      }
    }, 1500)

    // Stop polling after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval)
      setPollingForToken(false)
      setLoading(false)
      setError('OAuth authorization timed out')
      
      if (authWindow && !authWindow.closed) {
        authWindow.close()
      }
    }, 300000)
  }

  const handleManualEntry = () => {
    // TODO: Implement manual credential entry
    console.log('Manual entry not yet implemented')
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg max-w-md mx-auto">
      <h3 className="text-lg font-semibold mb-4">
        Connect to {integration.displayName || integration.name}
      </h3>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {!loading && !pollingForToken && (
        <>
          <p className="text-sm text-gray-600 mb-6">
            Click the button below to authorize access to your {integration.displayName || integration.name} account.
            You'll be redirected to {integration.displayName || integration.name} to complete the authorization.
          </p>

          <div className="space-y-3">
            <Button
              onClick={startOAuthFlow}
              className="w-full"
              variant="primary"
            >
              Authorize with {integration.displayName || integration.name}
            </Button>

            <Button
              onClick={onCancel}
              className="w-full"
              variant="secondary"
            >
              Cancel
            </Button>

            {integration.supportsApiKey && (
              <button
                onClick={handleManualEntry}
                className="w-full text-sm text-gray-600 hover:text-gray-800 underline"
              >
                Enter credentials manually
              </button>
            )}
          </div>
        </>
      )}

      {(loading || pollingForToken) && (
        <div className="text-center py-8">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-sm text-gray-600">
            {pollingForToken 
              ? 'Waiting for authorization... Please complete the process in the popup window.'
              : 'Initializing OAuth flow...'}
          </p>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          By connecting, you agree to share the requested permissions with this application.
          Your credentials are securely stored and can be revoked at any time.
        </p>
      </div>
    </div>
  )
}

export default OAuthFlow