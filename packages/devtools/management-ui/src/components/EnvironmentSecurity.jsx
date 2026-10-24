import React, { useState, useEffect } from 'react'
import api from '../services/api'

const EnvironmentSecurity = ({ environment = 'local' }) => {
  const [securitySettings, setSecuritySettings] = useState({
    maskingEnabled: true,
    encryptionEnabled: false,
    auditLoggingEnabled: true,
    accessControl: {
      enabled: false,
      defaultPermission: 'read',
      rules: []
    }
  })
  const [maskingPatterns, setMaskingPatterns] = useState([
    { pattern: 'PASSWORD', enabled: true },
    { pattern: 'SECRET', enabled: true },
    { pattern: 'KEY', enabled: true },
    { pattern: 'TOKEN', enabled: true },
    { pattern: 'PRIVATE', enabled: true },
    { pattern: 'CREDENTIAL', enabled: true },
    { pattern: 'AUTH', enabled: true },
    { pattern: 'API_KEY', enabled: true }
  ])
  const [customPattern, setCustomPattern] = useState('')
  const [auditLogs, setAuditLogs] = useState([])
  const [showAuditLogs, setShowAuditLogs] = useState(false)
  const [accessRules, setAccessRules] = useState([])
  const [newRule, setNewRule] = useState({
    user: '',
    pattern: '',
    permission: 'read'
  })

  // Load security settings
  useEffect(() => {
    loadSecuritySettings()
    loadAuditLogs()
  }, [environment])

  const loadSecuritySettings = () => {
    // Load from localStorage for now
    const saved = localStorage.getItem(`security-settings-${environment}`)
    if (saved) {
      const parsed = JSON.parse(saved)
      setSecuritySettings(parsed.settings || securitySettings)
      setMaskingPatterns(parsed.patterns || maskingPatterns)
      setAccessRules(parsed.rules || [])
    }
  }

  const saveSecuritySettings = () => {
    const toSave = {
      settings: securitySettings,
      patterns: maskingPatterns,
      rules: accessRules
    }
    localStorage.setItem(`security-settings-${environment}`, JSON.stringify(toSave))
  }

  const loadAuditLogs = async () => {
    // Simulate loading audit logs
    const mockLogs = [
      {
        id: 1,
        timestamp: new Date().toISOString(),
        user: 'admin@example.com',
        action: 'update',
        variable: 'DATABASE_URL',
        environment,
        details: 'Updated variable value'
      },
      {
        id: 2,
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        user: 'dev@example.com',
        action: 'create',
        variable: 'API_KEY',
        environment,
        details: 'Created new variable'
      },
      {
        id: 3,
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        user: 'admin@example.com',
        action: 'delete',
        variable: 'OLD_SECRET',
        environment,
        details: 'Deleted variable'
      }
    ]
    setAuditLogs(mockLogs)
  }

  const toggleSetting = (setting) => {
    const updated = { ...securitySettings, [setting]: !securitySettings[setting] }
    setSecuritySettings(updated)
    saveSecuritySettings()
  }

  const togglePattern = (index) => {
    const updated = [...maskingPatterns]
    updated[index].enabled = !updated[index].enabled
    setMaskingPatterns(updated)
    saveSecuritySettings()
  }

  const addCustomPattern = () => {
    if (customPattern && !maskingPatterns.find(p => p.pattern === customPattern)) {
      const updated = [...maskingPatterns, { pattern: customPattern.toUpperCase(), enabled: true }]
      setMaskingPatterns(updated)
      setCustomPattern('')
      saveSecuritySettings()
    }
  }

  const removePattern = (index) => {
    const updated = maskingPatterns.filter((_, i) => i !== index)
    setMaskingPatterns(updated)
    saveSecuritySettings()
  }

  const addAccessRule = () => {
    if (newRule.user && newRule.pattern) {
      const updated = [...accessRules, { ...newRule, id: Date.now() }]
      setAccessRules(updated)
      setNewRule({ user: '', pattern: '', permission: 'read' })
      saveSecuritySettings()
    }
  }

  const removeAccessRule = (id) => {
    const updated = accessRules.filter(rule => rule.id !== id)
    setAccessRules(updated)
    saveSecuritySettings()
  }

  const exportAuditLogs = () => {
    const csv = [
      ['Timestamp', 'User', 'Action', 'Variable', 'Environment', 'Details'].join(','),
      ...auditLogs.map(log => [
        log.timestamp,
        log.user,
        log.action,
        log.variable,
        log.environment,
        log.details
      ].join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-logs-${environment}-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="environment-security space-y-6">
      {/* Security Overview */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Security Settings</h3>
        
        <div className="space-y-4">
          {/* Masking Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Variable Masking</h4>
              <p className="text-sm text-gray-500">Hide sensitive variable values in the UI</p>
            </div>
            <button
              onClick={() => toggleSetting('maskingEnabled')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                securitySettings.maskingEnabled ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  securitySettings.maskingEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Encryption Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Value Encryption</h4>
              <p className="text-sm text-gray-500">Encrypt sensitive values at rest</p>
            </div>
            <button
              onClick={() => toggleSetting('encryptionEnabled')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                securitySettings.encryptionEnabled ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  securitySettings.encryptionEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Audit Logging Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Audit Logging</h4>
              <p className="text-sm text-gray-500">Track all changes to environment variables</p>
            </div>
            <button
              onClick={() => toggleSetting('auditLoggingEnabled')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                securitySettings.auditLoggingEnabled ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  securitySettings.auditLoggingEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Access Control Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Access Control</h4>
              <p className="text-sm text-gray-500">Enable role-based access control</p>
            </div>
            <button
              onClick={() => {
                const updated = { ...securitySettings }
                updated.accessControl.enabled = !updated.accessControl.enabled
                setSecuritySettings(updated)
                saveSecuritySettings()
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                securitySettings.accessControl.enabled ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  securitySettings.accessControl.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Masking Patterns */}
      {securitySettings.maskingEnabled && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Masking Patterns</h3>
          <p className="text-sm text-gray-500 mb-4">
            Variables containing these patterns will be automatically masked
          </p>
          
          <div className="space-y-2 mb-4">
            {maskingPatterns.map((pattern, index) => (
              <div key={index} className="flex items-center justify-between py-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={pattern.enabled}
                    onChange={() => togglePattern(index)}
                    className="mr-3"
                  />
                  <code className="text-sm font-mono text-gray-700">{pattern.pattern}</code>
                </div>
                {index >= 8 && ( // Allow removing custom patterns only
                  <button
                    onClick={() => removePattern(index)}
                    className="text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={customPattern}
              onChange={(e) => setCustomPattern(e.target.value.toUpperCase())}
              placeholder="Add custom pattern"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={addCustomPattern}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Add Pattern
            </button>
          </div>
        </div>
      )}

      {/* Access Control Rules */}
      {securitySettings.accessControl.enabled && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Access Control Rules</h3>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Permission
            </label>
            <select
              value={securitySettings.accessControl.defaultPermission}
              onChange={(e) => {
                const updated = { ...securitySettings }
                updated.accessControl.defaultPermission = e.target.value
                setSecuritySettings(updated)
                saveSecuritySettings()
              }}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
            >
              <option value="none">No Access</option>
              <option value="read">Read Only</option>
              <option value="write">Read & Write</option>
            </select>
          </div>
          
          {/* Access Rules Table */}
          {accessRules.length > 0 && (
            <div className="mb-4">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">User/Role</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Variable Pattern</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Permission</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {accessRules.map(rule => (
                    <tr key={rule.id}>
                      <td className="px-4 py-2 text-sm">{rule.user}</td>
                      <td className="px-4 py-2 text-sm font-mono">{rule.pattern}</td>
                      <td className="px-4 py-2 text-sm">{rule.permission}</td>
                      <td className="px-4 py-2 text-sm text-right">
                        <button
                          onClick={() => removeAccessRule(rule.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Add Rule Form */}
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              value={newRule.user}
              onChange={(e) => setNewRule({ ...newRule, user: e.target.value })}
              placeholder="User or role"
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
            />
            <input
              type="text"
              value={newRule.pattern}
              onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })}
              placeholder="Variable pattern (e.g., API_*)"
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
            />
            <div className="flex space-x-2">
              <select
                value={newRule.permission}
                onChange={(e) => setNewRule({ ...newRule, permission: e.target.value })}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
              >
                <option value="none">No Access</option>
                <option value="read">Read Only</option>
                <option value="write">Read & Write</option>
              </select>
              <button
                onClick={addAccessRule}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Logs */}
      {securitySettings.auditLoggingEnabled && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Audit Logs</h3>
            <div className="space-x-2">
              <button
                onClick={() => setShowAuditLogs(!showAuditLogs)}
                className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                {showAuditLogs ? 'Hide' : 'Show'} Logs
              </button>
              <button
                onClick={exportAuditLogs}
                className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Export CSV
              </button>
            </div>
          </div>
          
          {showAuditLogs && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Variable</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {auditLogs.map(log => (
                    <tr key={log.id}>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-sm">{log.user}</td>
                      <td className="px-4 py-2 text-sm">
                        <span className={`px-2 py-1 text-xs rounded ${
                          log.action === 'create' ? 'bg-green-100 text-green-800' :
                          log.action === 'update' ? 'bg-blue-100 text-blue-800' :
                          log.action === 'delete' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm font-mono">{log.variable}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default EnvironmentSecurity