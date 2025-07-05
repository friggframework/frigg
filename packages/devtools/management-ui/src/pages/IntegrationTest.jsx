import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Play, Send, Copy, Check, AlertCircle, Code, Database, Clock, Activity } from 'lucide-react'
import { Button } from '../components/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'
import api from '../services/api'
<<<<<<< HEAD
<<<<<<< HEAD
import { cn } from '../lib/utils'
=======
import { cn } from '../utils/cn'
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
import { cn } from '../lib/utils'
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)

const IntegrationTest = () => {
  const { integrationName } = useParams()
  const navigate = useNavigate()
<<<<<<< HEAD

=======
  
>>>>>>> 652520a5 (Claude Flow RFC related development)
  const [loading, setLoading] = useState(true)
  const [integration, setIntegration] = useState(null)
  const [endpoints, setEndpoints] = useState([])
  const [selectedEndpoint, setSelectedEndpoint] = useState(null)
  const [testParams, setTestParams] = useState({})
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [testHistory, setTestHistory] = useState([])
  const [useMockData, setUseMockData] = useState(false)

  useEffect(() => {
    fetchIntegrationData()
  }, [integrationName])

  const fetchIntegrationData = async () => {
    try {
      setLoading(true)
<<<<<<< HEAD

=======
      
>>>>>>> 652520a5 (Claude Flow RFC related development)
      // Fetch integration details and available endpoints
      const [detailsRes, endpointsRes, historyRes] = await Promise.all([
        api.get(`/api/discovery/integrations/${integrationName}`),
        api.get(`/api/integrations/${integrationName}/endpoints`),
        api.get(`/api/integrations/${integrationName}/test-history`)
      ])
<<<<<<< HEAD

      setIntegration(detailsRes.data.data)
      setEndpoints(endpointsRes.data.endpoints || [])
      setTestHistory(historyRes.data.history || [])

=======
      
      setIntegration(detailsRes.data.data)
      setEndpoints(endpointsRes.data.endpoints || [])
      setTestHistory(historyRes.data.history || [])
      
>>>>>>> 652520a5 (Claude Flow RFC related development)
      // Select first endpoint by default
      if (endpointsRes.data.endpoints?.length > 0) {
        setSelectedEndpoint(endpointsRes.data.endpoints[0])
        initializeParams(endpointsRes.data.endpoints[0])
      }
<<<<<<< HEAD

=======
      
>>>>>>> 652520a5 (Claude Flow RFC related development)
    } catch (err) {
      console.error('Failed to fetch integration data:', err)
    } finally {
      setLoading(false)
    }
  }

  const initializeParams = (endpoint) => {
    const params = {}
<<<<<<< HEAD

=======
    
>>>>>>> 652520a5 (Claude Flow RFC related development)
    // Initialize required parameters
    endpoint.parameters?.forEach(param => {
      if (param.required) {
        params[param.name] = param.default || ''
      }
    })
<<<<<<< HEAD

=======
    
>>>>>>> 652520a5 (Claude Flow RFC related development)
    setTestParams(params)
  }

  const handleEndpointChange = (endpointId) => {
    const endpoint = endpoints.find(e => e.id === endpointId)
    if (endpoint) {
      setSelectedEndpoint(endpoint)
      initializeParams(endpoint)
      setTestResult(null)
    }
  }

  const handleParamChange = (paramName, value) => {
    setTestParams(prev => ({ ...prev, [paramName]: value }))
  }

  const handleTest = async () => {
    if (!selectedEndpoint) return

    try {
      setTesting(true)
      setTestResult(null)
<<<<<<< HEAD

=======
      
>>>>>>> 652520a5 (Claude Flow RFC related development)
      const response = await api.post(`/api/integrations/${integrationName}/test-endpoint`, {
        endpoint: selectedEndpoint.id,
        parameters: testParams,
        useMockData
      })
<<<<<<< HEAD

=======
      
>>>>>>> 652520a5 (Claude Flow RFC related development)
      setTestResult({
        success: true,
        data: response.data.result,
        timing: response.data.timing,
        timestamp: new Date().toISOString()
      })
<<<<<<< HEAD

=======
      
>>>>>>> 652520a5 (Claude Flow RFC related development)
      // Add to history
      setTestHistory(prev => [{
        endpoint: selectedEndpoint.name,
        timestamp: new Date().toISOString(),
        success: true,
        timing: response.data.timing
      }, ...prev.slice(0, 9)])
<<<<<<< HEAD

=======
      
>>>>>>> 652520a5 (Claude Flow RFC related development)
    } catch (err) {
      console.error('Test failed:', err)
      setTestResult({
        success: false,
        error: err.response?.data?.message || 'Test failed',
        details: err.response?.data?.details,
        timestamp: new Date().toISOString()
      })
<<<<<<< HEAD

=======
      
>>>>>>> 652520a5 (Claude Flow RFC related development)
      // Add failure to history
      setTestHistory(prev => [{
        endpoint: selectedEndpoint.name,
        timestamp: new Date().toISOString(),
        success: false,
        error: err.response?.data?.message
      }, ...prev.slice(0, 9)])
    } finally {
      setTesting(false)
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const generateCodeSnippet = () => {
    if (!selectedEndpoint) return ''
<<<<<<< HEAD

    const params = Object.entries(testParams)
      .map(([key, value]) => `  ${key}: '${value}'`)
      .join(',\n')

=======
    
    const params = Object.entries(testParams)
      .map(([key, value]) => `  ${key}: '${value}'`)
      .join(',\n')
    
>>>>>>> 652520a5 (Claude Flow RFC related development)
    return `// ${selectedEndpoint.name}
const result = await frigg.integration('${integrationName}')
  .${selectedEndpoint.method}('${selectedEndpoint.path}', {
${params}
  });

console.log(result);`
  }

  const renderParameterInput = (param) => {
    const value = testParams[param.name] || ''
<<<<<<< HEAD

=======
    
>>>>>>> 652520a5 (Claude Flow RFC related development)
    switch (param.type) {
      case 'boolean':
        return (
          <select
            value={value}
            onChange={(e) => handleParamChange(param.name, e.target.value === 'true')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="false">false</option>
            <option value="true">true</option>
          </select>
        )
<<<<<<< HEAD

=======
      
>>>>>>> 652520a5 (Claude Flow RFC related development)
      case 'number':
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => handleParamChange(param.name, parseInt(e.target.value, 10))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={param.placeholder || `Enter ${param.name}`}
          />
        )
<<<<<<< HEAD

=======
      
>>>>>>> 652520a5 (Claude Flow RFC related development)
      case 'select':
        return (
          <select
            value={value}
            onChange={(e) => handleParamChange(param.name, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select {param.name}</option>
            {param.options?.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )
<<<<<<< HEAD

=======
      
>>>>>>> 652520a5 (Claude Flow RFC related development)
      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleParamChange(param.name, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={param.placeholder || `Enter ${param.name}`}
          />
        )
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Loading test interface...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
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
              Test {integration?.displayName}
            </h2>
            <p className="text-gray-600 mt-1">
              Test API endpoints and validate responses
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={useMockData}
              onChange={(e) => setUseMockData(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="ml-2 text-sm text-gray-700">Use Mock Data</span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Test Configuration */}
        <div className="space-y-6">
          {/* Endpoint Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Database size={20} className="mr-2" />
                Select Endpoint
              </CardTitle>
            </CardHeader>
            <CardContent>
              <select
                value={selectedEndpoint?.id || ''}
                onChange={(e) => handleEndpointChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select an endpoint to test</option>
                {endpoints.map(endpoint => (
                  <option key={endpoint.id} value={endpoint.id}>
                    {endpoint.method.toUpperCase()} {endpoint.path} - {endpoint.name}
                  </option>
                ))}
              </select>
<<<<<<< HEAD

=======
              
>>>>>>> 652520a5 (Claude Flow RFC related development)
              {selectedEndpoint && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">{selectedEndpoint.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span className={cn(
                      "px-2 py-1 rounded font-medium",
                      selectedEndpoint.method === 'get' && "bg-blue-100 text-blue-700",
                      selectedEndpoint.method === 'post' && "bg-green-100 text-green-700",
                      selectedEndpoint.method === 'put' && "bg-yellow-100 text-yellow-700",
                      selectedEndpoint.method === 'delete' && "bg-red-100 text-red-700"
                    )}>
                      {selectedEndpoint.method.toUpperCase()}
                    </span>
                    <span className="font-mono">{selectedEndpoint.path}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Parameters */}
          {selectedEndpoint && selectedEndpoint.parameters?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Settings size={20} className="mr-2" />
                  Parameters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedEndpoint.parameters.map(param => (
                  <div key={param.name}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {param.label || param.name}
                      {param.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {renderParameterInput(param)}
                    {param.description && (
                      <p className="mt-1 text-xs text-gray-500">{param.description}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Code Snippet */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center">
                  <Code size={20} className="mr-2" />
                  Code Example
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(generateCodeSnippet())}
                  className="text-xs"
                >
                  {copied ? (
                    <>
                      <Check size={14} className="mr-1" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy size={14} className="mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
                <code>{generateCodeSnippet()}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Test Results */}
        <div className="space-y-6">
          {/* Run Test Button */}
          <Card>
            <CardContent className="p-4">
              <Button
                onClick={handleTest}
                disabled={!selectedEndpoint || testing}
                className="w-full inline-flex items-center justify-center"
              >
                {testing ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Running Test...
                  </>
                ) : (
                  <>
                    <Play size={16} className="mr-2" />
                    Run Test
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Test Result */}
          {testResult && (
            <Card className={testResult.success ? 'border-green-300' : 'border-red-300'}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center">
                    {testResult.success ? (
                      <>
                        <CheckCircle size={20} className="text-green-500 mr-2" />
                        Test Passed
                      </>
                    ) : (
                      <>
                        <AlertCircle size={20} className="text-red-500 mr-2" />
                        Test Failed
                      </>
                    )}
                  </span>
                  {testResult.timing && (
                    <span className="text-sm text-gray-500">
                      {testResult.timing}ms
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {testResult.error && (
                  <div className="mb-4 p-3 bg-red-50 rounded-lg">
                    <p className="text-sm text-red-700">{testResult.error}</p>
                    {testResult.details && (
                      <pre className="mt-2 text-xs text-red-600 overflow-x-auto">
                        {JSON.stringify(testResult.details, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
<<<<<<< HEAD

=======
                
>>>>>>> 652520a5 (Claude Flow RFC related development)
                {testResult.data && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-gray-700">Response Data</h4>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(JSON.stringify(testResult.data, null, 2))}
                        className="text-xs"
                      >
                        <Copy size={12} className="mr-1" />
                        Copy
                      </Button>
                    </div>
                    <pre className="text-xs bg-gray-100 p-3 rounded-lg overflow-x-auto max-h-96">
                      {JSON.stringify(testResult.data, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Test History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock size={20} className="mr-2" />
                Recent Tests
              </CardTitle>
            </CardHeader>
            <CardContent>
              {testHistory.length === 0 ? (
                <p className="text-sm text-gray-500">No test history yet</p>
              ) : (
                <div className="space-y-2">
                  {testHistory.map((test, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded"
                    >
                      <div className="flex items-center">
                        {test.success ? (
                          <CheckCircle size={16} className="text-green-500 mr-2" />
                        ) : (
                          <AlertCircle size={16} className="text-red-500 mr-2" />
                        )}
                        <div>
                          <p className="text-sm font-medium">{test.endpoint}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(test.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      {test.timing && (
                        <span className="text-xs text-gray-500">{test.timing}ms</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default IntegrationTest