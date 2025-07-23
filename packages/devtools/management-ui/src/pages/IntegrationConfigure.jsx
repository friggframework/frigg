import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, AlertCircle, CheckCircle, Info, TestTube, Key, Link2, Settings } from 'lucide-react'
import { Button } from '../components/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'
import api from '../services/api'
<<<<<<< HEAD
import { cn } from '../lib/utils'
=======
<<<<<<< HEAD
<<<<<<< HEAD
import { cn } from '../lib/utils'
=======
import { cn } from '../utils/cn'
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
import { cn } from '../lib/utils'
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)

const IntegrationConfigure = () => {
  const { integrationName } = useParams()
  const navigate = useNavigate()
<<<<<<< HEAD
  
=======
<<<<<<< HEAD

=======
  
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [integration, setIntegration] = useState(null)
  const [config, setConfig] = useState({})
  const [errors, setErrors] = useState({})
  const [testResult, setTestResult] = useState(null)
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    fetchIntegrationDetails()
  }, [integrationName])

  const fetchIntegrationDetails = async () => {
    try {
      setLoading(true)
<<<<<<< HEAD
      
=======
<<<<<<< HEAD

=======
      
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
      // Fetch integration details and current configuration
      const [detailsRes, configRes] = await Promise.all([
        api.get(`/api/discovery/integrations/${integrationName}`),
        api.get(`/api/integrations/${integrationName}/config`)
      ])
<<<<<<< HEAD
=======
<<<<<<< HEAD

      setIntegration(detailsRes.data.data)
      setConfig(configRes.data.config || {})

=======
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
      
      setIntegration(detailsRes.data.data)
      setConfig(configRes.data.config || {})
      
<<<<<<< HEAD
=======
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
    } catch (err) {
      console.error('Failed to fetch integration details:', err)
      setErrors({ general: 'Failed to load integration configuration' })
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: '' }))
    setSuccessMessage('')
  }

  const validateConfig = () => {
    const newErrors = {}
    const authType = integration?.integrationMetadata?.authType

    if (authType === 'oauth2') {
      if (!config.clientId) newErrors.clientId = 'Client ID is required'
      if (!config.clientSecret) newErrors.clientSecret = 'Client Secret is required'
      if (!config.redirectUri) newErrors.redirectUri = 'Redirect URI is required'
    } else if (authType === 'api-key') {
      if (!config.apiKey) newErrors.apiKey = 'API Key is required'
    } else if (authType === 'basic') {
      if (!config.username) newErrors.username = 'Username is required'
      if (!config.password) newErrors.password = 'Password is required'
    }

    // Validate required scopes
    const requiredScopes = integration?.integrationMetadata?.requiredScopes || []
    if (requiredScopes.length > 0 && (!config.scopes || config.scopes.length === 0)) {
      newErrors.scopes = 'Please select at least one scope'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validateConfig()) return

    try {
      setSaving(true)
      setSuccessMessage('')
<<<<<<< HEAD
=======
<<<<<<< HEAD

      await api.post(`/api/integrations/${integrationName}/config`, {
        config
      })

      setSuccessMessage('Configuration saved successfully!')

=======
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
      
      await api.post(`/api/integrations/${integrationName}/config`, {
        config
      })
      
      setSuccessMessage('Configuration saved successfully!')
      
<<<<<<< HEAD
=======
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
      // Redirect after a delay
      setTimeout(() => {
        navigate('/integrations')
      }, 2000)
<<<<<<< HEAD
      
=======
<<<<<<< HEAD

=======
      
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
    } catch (err) {
      console.error('Failed to save configuration:', err)
      setErrors({ general: err.response?.data?.message || 'Failed to save configuration' })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!validateConfig()) return

    try {
      setTesting(true)
      setTestResult(null)
<<<<<<< HEAD
=======
<<<<<<< HEAD

      const response = await api.post(`/api/integrations/${integrationName}/test`, {
        config
      })

=======
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
      
      const response = await api.post(`/api/integrations/${integrationName}/test`, {
        config
      })
      
<<<<<<< HEAD
=======
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
      setTestResult({
        success: response.data.success,
        message: response.data.message,
        details: response.data.details
      })
<<<<<<< HEAD
      
=======
<<<<<<< HEAD

=======
      
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
    } catch (err) {
      console.error('Test failed:', err)
      setTestResult({
        success: false,
        message: err.response?.data?.message || 'Connection test failed',
        details: err.response?.data?.details
      })
    } finally {
      setTesting(false)
    }
  }

  const renderAuthFields = () => {
    const authType = integration?.integrationMetadata?.authType

    switch (authType) {
      case 'oauth2':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client ID
              </label>
              <input
                type="text"
                value={config.clientId || ''}
                onChange={(e) => handleInputChange('clientId', e.target.value)}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500",
                  errors.clientId ? "border-red-300" : "border-gray-300"
                )}
                placeholder="Enter your OAuth2 Client ID"
              />
              {errors.clientId && (
                <p className="mt-1 text-sm text-red-600">{errors.clientId}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client Secret
              </label>
              <input
                type="password"
                value={config.clientSecret || ''}
                onChange={(e) => handleInputChange('clientSecret', e.target.value)}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500",
                  errors.clientSecret ? "border-red-300" : "border-gray-300"
                )}
                placeholder="Enter your OAuth2 Client Secret"
              />
              {errors.clientSecret && (
                <p className="mt-1 text-sm text-red-600">{errors.clientSecret}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Redirect URI
              </label>
              <input
                type="url"
                value={config.redirectUri || ''}
                onChange={(e) => handleInputChange('redirectUri', e.target.value)}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500",
                  errors.redirectUri ? "border-red-300" : "border-gray-300"
                )}
                placeholder="https://your-app.com/auth/callback"
              />
              {errors.redirectUri && (
                <p className="mt-1 text-sm text-red-600">{errors.redirectUri}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Add this URL to your OAuth app's allowed redirect URIs
              </p>
            </div>
          </>
        )

      case 'api-key':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              API Key
            </label>
            <input
              type="password"
              value={config.apiKey || ''}
              onChange={(e) => handleInputChange('apiKey', e.target.value)}
              className={cn(
                "w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500",
                errors.apiKey ? "border-red-300" : "border-gray-300"
              )}
              placeholder="Enter your API key"
            />
            {errors.apiKey && (
              <p className="mt-1 text-sm text-red-600">{errors.apiKey}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Keep your API key secure and never share it publicly
            </p>
          </div>
        )

      case 'basic':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                type="text"
                value={config.username || ''}
                onChange={(e) => handleInputChange('username', e.target.value)}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500",
                  errors.username ? "border-red-300" : "border-gray-300"
                )}
                placeholder="Enter username"
              />
              {errors.username && (
                <p className="mt-1 text-sm text-red-600">{errors.username}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={config.password || ''}
                onChange={(e) => handleInputChange('password', e.target.value)}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500",
                  errors.password ? "border-red-300" : "border-gray-300"
                )}
                placeholder="Enter password"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password}</p>
              )}
            </div>
          </>
        )

      default:
        return (
          <div className="text-gray-500">
            <Info size={20} className="inline mr-2" />
            No authentication configuration required for this integration.
          </div>
        )
    }
  }

  const renderScopesSelection = () => {
    const requiredScopes = integration?.integrationMetadata?.requiredScopes || []
    if (requiredScopes.length === 0) return null

    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Required Scopes
        </label>
        <div className="space-y-2">
          {requiredScopes.map((scope) => (
            <label key={scope} className="flex items-center">
              <input
                type="checkbox"
                checked={config.scopes?.includes(scope) || false}
                onChange={(e) => {
                  const newScopes = e.target.checked
                    ? [...(config.scopes || []), scope]
                    : (config.scopes || []).filter(s => s !== scope)
                  handleInputChange('scopes', newScopes)
                }}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">{scope}</span>
            </label>
          ))}
        </div>
        {errors.scopes && (
          <p className="mt-1 text-sm text-red-600">{errors.scopes}</p>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Loading configuration...</p>
        </div>
      </div>
    )
  }

  if (!integration) {
    return (
      <div className="text-center py-12">
        <AlertCircle size={48} className="mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Integration Not Found</h3>
        <p className="text-gray-600 mb-4">The requested integration could not be found.</p>
        <Button onClick={() => navigate('/integrations')}>
          Back to Integrations
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Button
            variant="ghost"
            onClick={() => navigate('/integrations')}
            className="mr-4"
          >
            <ArrowLeft size={20} className="mr-2" />
            Back
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Configure {integration.displayName}
            </h2>
            <p className="text-gray-600 mt-1">
              Set up authentication and connection settings
            </p>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {errors.general && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
          <AlertCircle size={20} className="text-red-500 mr-2 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-red-800">Error</h4>
            <p className="text-sm text-red-700 mt-1">{errors.general}</p>
          </div>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start">
          <CheckCircle size={20} className="text-green-500 mr-2 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-green-800">Success</h4>
            <p className="text-sm text-green-700 mt-1">{successMessage}</p>
          </div>
        </div>
      )}

      {/* Authentication Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Key size={20} className="mr-2" />
            Authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderAuthFields()}
        </CardContent>
      </Card>

      {/* Scopes Configuration */}
      {renderScopesSelection() && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Settings size={20} className="mr-2" />
              Permissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {renderScopesSelection()}
          </CardContent>
        </Card>
      )}

      {/* Additional Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Link2 size={20} className="mr-2" />
            Connection Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Environment
            </label>
            <select
              value={config.environment || 'production'}
              onChange={(e) => handleInputChange('environment', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="production">Production</option>
              <option value="sandbox">Sandbox</option>
              <option value="development">Development</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Select the environment to connect to
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Webhook URL (Optional)
            </label>
            <input
              type="url"
              value={config.webhookUrl || ''}
              onChange={(e) => handleInputChange('webhookUrl', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://your-app.com/webhooks/integration"
            />
            <p className="mt-1 text-xs text-gray-500">
              Endpoint to receive webhook events from this integration
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Test Results */}
      {testResult && (
        <Card className={testResult.success ? 'border-green-300' : 'border-red-300'}>
          <CardContent className="p-4">
            <div className="flex items-start">
              {testResult.success ? (
                <CheckCircle size={20} className="text-green-500 mr-2 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={20} className="text-red-500 mr-2 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <h4 className={cn(
                  "text-sm font-medium",
                  testResult.success ? "text-green-800" : "text-red-800"
                )}>
                  {testResult.success ? 'Connection Test Passed' : 'Connection Test Failed'}
                </h4>
                <p className={cn(
                  "text-sm mt-1",
                  testResult.success ? "text-green-700" : "text-red-700"
                )}>
                  {testResult.message}
                </p>
                {testResult.details && (
                  <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                    {JSON.stringify(testResult.details, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={saving || testing}
          className="inline-flex items-center"
        >
          {testing ? (
            <>
              <LoadingSpinner size="sm" className="mr-2" />
              Testing...
            </>
          ) : (
            <>
              <TestTube size={16} className="mr-2" />
              Test Connection
            </>
          )}
        </Button>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => navigate('/integrations')}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || testing}
            className="inline-flex items-center"
          >
            {saving ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} className="mr-2" />
                Save Configuration
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default IntegrationConfigure