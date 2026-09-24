import React, { useState } from 'react'
import { Button } from '../Button'
import LoadingSpinner from '../LoadingSpinner'
import StatusBadge from '../StatusBadge'
import api from '../../services/api'

const ConnectionTester = ({ connection, onTestComplete }) => {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testDetails, setTestDetails] = useState([])

  const runConnectionTest = async () => {
    setTesting(true)
    setTestResult(null)
    setTestDetails([])

    const steps = [
      { id: 'auth', name: 'Validating authentication', status: 'pending' },
      { id: 'api', name: 'Testing API connectivity', status: 'pending' },
      { id: 'permissions', name: 'Checking permissions', status: 'pending' },
      { id: 'data', name: 'Fetching sample data', status: 'pending' }
    ]

    setTestDetails(steps)

    try {
      // Run comprehensive connection test
      const response = await api.post(`/api/connections/${connection.id}/test`, {
        comprehensive: true
      })

      const { results, summary } = response.data

      // Update test details with results
      const updatedSteps = steps.map(step => {
        const result = results[step.id]
        return {
          ...step,
          status: result?.success ? 'success' : 'failed',
          message: result?.message,
          latency: result?.latency,
          error: result?.error
        }
      })

      setTestDetails(updatedSteps)
      setTestResult(summary)

      if (onTestComplete) {
        onTestComplete(summary)
      }

    } catch (error) {
      setTestResult({
        success: false,
        error: error.response?.data?.error || 'Connection test failed'
      })

      // Mark all steps as failed
      setTestDetails(steps.map(step => ({
        ...step,
        status: 'failed',
        error: 'Test aborted due to error'
      })))
    } finally {
      setTesting(false)
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'success':
        return 'text-green-600'
      case 'failed':
        return 'text-red-600'
      case 'pending':
        return 'text-gray-400'
      default:
        return 'text-gray-600'
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        )
      case 'failed':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        )
      case 'pending':
        return <LoadingSpinner size="sm" />
      default:
        return null
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Connection Test</h3>
        {testResult && (
          <StatusBadge 
            status={testResult.success ? 'success' : 'error'}
            text={testResult.success ? 'Passed' : 'Failed'}
          />
        )}
      </div>

      {!testing && !testResult && (
        <div>
          <p className="text-sm text-gray-600 mb-4">
            Run a comprehensive test to validate this connection's authentication,
            API access, and permissions.
          </p>
          <Button onClick={runConnectionTest} variant="primary">
            Run Connection Test
          </Button>
        </div>
      )}

      {(testing || testDetails.length > 0) && (
        <div className="space-y-3">
          {testDetails.map((step) => (
            <div key={step.id} className="flex items-start space-x-3">
              <div className={`flex-shrink-0 ${getStatusColor(step.status)}`}>
                {getStatusIcon(step.status)}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{step.name}</p>
                {step.message && (
                  <p className="text-sm text-gray-600 mt-1">{step.message}</p>
                )}
                {step.error && (
                  <p className="text-sm text-red-600 mt-1">{step.error}</p>
                )}
                {step.latency && (
                  <p className="text-xs text-gray-500 mt-1">
                    Response time: {step.latency}ms
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {testResult && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Test Summary</h4>
          
          {testResult.success ? (
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <p className="text-sm text-green-800">
                All tests passed successfully. The connection is working properly.
              </p>
              {testResult.avgLatency && (
                <p className="text-xs text-green-700 mt-2">
                  Average response time: {testResult.avgLatency}ms
                </p>
              )}
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-sm text-red-800">
                {testResult.error || 'One or more tests failed. Please check the connection configuration.'}
              </p>
              {testResult.suggestion && (
                <p className="text-xs text-red-700 mt-2">
                  Suggestion: {testResult.suggestion}
                </p>
              )}
            </div>
          )}

          {!testing && (
            <div className="mt-4 flex space-x-3">
              <Button onClick={runConnectionTest} variant="secondary" size="sm">
                Run Again
              </Button>
              {testResult.success && testResult.canRefreshToken && (
                <Button variant="secondary" size="sm">
                  Refresh Token
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ConnectionTester