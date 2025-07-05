import React, { useState, useEffect } from 'react'
import api from '../services/api'

const EnvironmentCompare = ({ onSync }) => {
  const [environments, setEnvironments] = useState({
    local: [],
    staging: [],
    production: []
  })
  const [loading, setLoading] = useState(true)
  const [compareMode, setCompareMode] = useState('side-by-side') // side-by-side, diff, missing
  const [selectedEnvs, setSelectedEnvs] = useState(['local', 'staging'])
  const [syncDirection, setSyncDirection] = useState(null)
  const [selectedVariables, setSelectedVariables] = useState(new Set())
  const [showOnlyDifferences, setShowOnlyDifferences] = useState(false)

  // Load all environments
  useEffect(() => {
    loadAllEnvironments()
  }, [])

  const loadAllEnvironments = async () => {
    setLoading(true)
    try {
      const [localRes, stagingRes, prodRes] = await Promise.all([
        api.get('/api/environment/variables/local'),
        api.get('/api/environment/variables/staging'),
        api.get('/api/environment/variables/production')
      ])

      setEnvironments({
        local: localRes.data.variables || [],
        staging: stagingRes.data.variables || [],
        production: prodRes.data.variables || []
      })
    } catch (error) {
      console.error('Error loading environments:', error)
    } finally {
      setLoading(false)
    }
  }

  // Get all unique variable keys across selected environments
  const getAllKeys = () => {
    const keys = new Set()
    selectedEnvs.forEach(env => {
      environments[env].forEach(variable => {
        keys.add(variable.key)
      })
    })
    return Array.from(keys).sort()
  }

  // Check if variable values differ across environments
  const isDifferent = (key) => {
    const values = selectedEnvs.map(env => {
      const variable = environments[env].find(v => v.key === key)
      return variable ? variable.value : undefined
    })
    return new Set(values).size > 1
  }

  // Get value for a specific environment and key
  const getValue = (env, key) => {
    const variable = environments[env].find(v => v.key === key)
    return variable ? variable.value : null
  }

  // Handle variable selection for sync
  const toggleVariableSelection = (key) => {
    const newSelected = new Set(selectedVariables)
    if (newSelected.has(key)) {
      newSelected.delete(key)
    } else {
      newSelected.add(key)
    }
    setSelectedVariables(newSelected)
  }

  // Sync selected variables
  const handleSync = async () => {
    if (!syncDirection || selectedVariables.size === 0) return

    const [source, target] = syncDirection.split('->')
    const variablesToSync = []

    selectedVariables.forEach(key => {
      const sourceVar = environments[source].find(v => v.key === key)
      if (sourceVar) {
        variablesToSync.push({
          key: sourceVar.key,
          value: sourceVar.value,
          description: sourceVar.description || ''
        })
      }
    })

    try {
      await api.put(`/api/environment/variables/${target}`, {
        variables: variablesToSync
      })

      if (onSync) {
        onSync({
          source,
          target,
          count: variablesToSync.length
        })
      }

      // Reload environments
      await loadAllEnvironments()
      setSelectedVariables(new Set())
      setSyncDirection(null)
    } catch (error) {
      console.error('Error syncing variables:', error)
    }
  }

  // Copy environment
  const handleCopyEnvironment = async (source, target) => {
    try {
      const confirm = window.confirm(
        `Are you sure you want to copy all variables from ${source} to ${target}? This will overwrite existing values.`
      )
      
      if (!confirm) return

      await api.post('/api/environment/copy', {
        source,
        target,
        excludeSecrets: false
      })

      await loadAllEnvironments()
    } catch (error) {
      console.error('Error copying environment:', error)
    }
  }

  // Export comparison report
  const exportComparison = () => {
    const allKeys = getAllKeys()
    const report = {
      timestamp: new Date().toISOString(),
      environments: selectedEnvs,
      variables: {}
    }

    allKeys.forEach(key => {
      report.variables[key] = {}
      selectedEnvs.forEach(env => {
        const variable = environments[env].find(v => v.key === key)
        report.variables[key][env] = variable ? {
          value: variable.value,
          exists: true
        } : {
          value: null,
          exists: false
        }
      })
    })

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `environment-comparison-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading environments...</div>
      </div>
    )
  }

  const allKeys = getAllKeys()
  const filteredKeys = showOnlyDifferences 
    ? allKeys.filter(key => isDifferent(key))
    : allKeys

  return (
    <div className="environment-compare">
      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Environment Selection */}
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-700">Compare:</span>
              {['local', 'staging', 'production'].map(env => (
                <label key={env} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedEnvs.includes(env)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedEnvs([...selectedEnvs, env])
                      } else {
                        setSelectedEnvs(selectedEnvs.filter(e => e !== env))
                      }
                    }}
                    disabled={selectedEnvs.length === 1 && selectedEnvs.includes(env)}
                    className="mr-1"
                  />
                  <span className="text-sm capitalize">{env}</span>
                </label>
              ))}
            </div>

            {/* View Mode */}
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-700">View:</span>
              <select
                value={compareMode}
                onChange={(e) => setCompareMode(e.target.value)}
                className="text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value="side-by-side">Side by Side</option>
                <option value="diff">Differences Only</option>
                <option value="missing">Missing Variables</option>
              </select>
            </div>

            {/* Show Only Differences */}
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={showOnlyDifferences}
                onChange={(e) => setShowOnlyDifferences(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm">Show only differences</span>
            </label>
          </div>

          <button
            onClick={exportComparison}
            className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Export Report
          </button>
        </div>

        {/* Sync Controls */}
        {selectedEnvs.length === 2 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-sm font-medium text-gray-700">Sync Direction:</span>
                <select
                  value={syncDirection || ''}
                  onChange={(e) => setSyncDirection(e.target.value)}
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                >
                  <option value="">Select direction</option>
                  <option value={`${selectedEnvs[0]}->${selectedEnvs[1]}`}>
                    {selectedEnvs[0]} → {selectedEnvs[1]}
                  </option>
                  <option value={`${selectedEnvs[1]}->${selectedEnvs[0]}`}>
                    {selectedEnvs[1]} → {selectedEnvs[0]}
                  </option>
                </select>
                
                {selectedVariables.size > 0 && (
                  <span className="text-sm text-gray-500">
                    {selectedVariables.size} variable{selectedVariables.size > 1 ? 's' : ''} selected
                  </span>
                )}
              </div>

              <div className="space-x-2">
                <button
                  onClick={() => handleCopyEnvironment(...syncDirection.split('->'))}
                  disabled={!syncDirection}
                  className="px-3 py-1 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Copy All
                </button>
                <button
                  onClick={handleSync}
                  disabled={!syncDirection || selectedVariables.size === 0}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Sync Selected
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Comparison Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {syncDirection && (
                <th className="px-3 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedVariables.size === filteredKeys.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedVariables(new Set(filteredKeys))
                      } else {
                        setSelectedVariables(new Set())
                      }
                    }}
                  />
                </th>
              )}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Variable
              </th>
              {selectedEnvs.map(env => (
                <th key={env} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {env}
                </th>
              ))}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredKeys.map(key => {
              const isDiff = isDifferent(key)
              const values = selectedEnvs.map(env => getValue(env, key))
              const missingCount = values.filter(v => v === null).length

              // Filter based on compare mode
              if (compareMode === 'diff' && !isDiff) return null
              if (compareMode === 'missing' && missingCount === 0) return null

              return (
                <tr key={key} className={isDiff ? 'bg-yellow-50' : ''}>
                  {syncDirection && (
                    <td className="px-3 py-4">
                      <input
                        type="checkbox"
                        checked={selectedVariables.has(key)}
                        onChange={() => toggleVariableSelection(key)}
                      />
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <code className="text-sm font-mono text-gray-900">{key}</code>
                  </td>
                  {selectedEnvs.map((env, index) => {
                    const value = values[index]
                    const variable = environments[env].find(v => v.key === key)
                    const isSecret = variable?.isSecret

                    return (
                      <td key={env} className="px-6 py-4">
                        {value === null ? (
                          <span className="text-gray-400 italic">Not set</span>
                        ) : (
                          <code className={`text-sm font-mono ${
                            isSecret ? 'text-gray-400' : 'text-gray-600'
                          } break-all`}>
                            {isSecret ? '•••••••' : value}
                          </code>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-6 py-4 whitespace-nowrap">
                    {isDiff && (
                      <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded">
                        Different
                      </span>
                    )}
                    {missingCount > 0 && (
                      <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded ml-1">
                        Missing in {missingCount}
                      </span>
                    )}
                    {!isDiff && missingCount === 0 && (
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                        Synchronized
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default EnvironmentCompare