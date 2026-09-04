import React, { useState, useEffect } from 'react'

const EnvironmentSchema = ({ 
  variables = [], 
  onSchemaUpdate,
  environment = 'local' 
}) => {
  const [schema, setSchema] = useState({
    required: [],
    types: {},
    patterns: {},
    defaults: {},
    descriptions: {}
  })
  const [showAddRule, setShowAddRule] = useState(false)
  const [newRule, setNewRule] = useState({
    key: '',
    type: 'string',
    required: false,
    pattern: '',
    default: '',
    description: ''
  })

  // Common validation patterns
  const commonPatterns = {
    url: '^https?://[\\w\\-]+(\\.[\\w\\-]+)+[/#?]?.*$',
    email: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
    port: '^([1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$',
    ipAddress: '^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$',
    uuid: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
    alphanumeric: '^[a-zA-Z0-9]+$',
    boolean: '^(true|false|TRUE|FALSE|True|False|1|0|yes|no|YES|NO|Yes|No)$'
  }

  // Variable type definitions
  const variableTypes = {
    string: { name: 'String', validator: () => true },
    number: { name: 'Number', validator: (v) => !isNaN(v) },
    boolean: { name: 'Boolean', validator: (v) => /^(true|false|1|0)$/i.test(v) },
    url: { name: 'URL', validator: (v) => /^https?:\/\/.+/.test(v) },
    email: { name: 'Email', validator: (v) => /^.+@.+\..+$/.test(v) },
    port: { name: 'Port', validator: (v) => !isNaN(v) && v >= 1 && v <= 65535 },
    json: { name: 'JSON', validator: (v) => { try { JSON.parse(v); return true } catch { return false } } },
    base64: { name: 'Base64', validator: (v) => /^[A-Za-z0-9+/]+=*$/.test(v) }
  }

  // Load saved schema
  useEffect(() => {
    const savedSchema = localStorage.getItem(`env-schema-${environment}`)
    if (savedSchema) {
      setSchema(JSON.parse(savedSchema))
    }
  }, [environment])

  // Save schema changes
  const saveSchema = (newSchema) => {
    setSchema(newSchema)
    localStorage.setItem(`env-schema-${environment}`, JSON.stringify(newSchema))
    if (onSchemaUpdate) {
      onSchemaUpdate(newSchema)
    }
  }

  // Add new validation rule
  const addRule = () => {
    if (!newRule.key) return

    const updatedSchema = { ...schema }
    
    if (newRule.required) {
      updatedSchema.required = [...new Set([...updatedSchema.required, newRule.key])]
    }
    
    if (newRule.type && newRule.type !== 'string') {
      updatedSchema.types[newRule.key] = newRule.type
    }
    
    if (newRule.pattern) {
      updatedSchema.patterns[newRule.key] = newRule.pattern
    }
    
    if (newRule.default) {
      updatedSchema.defaults[newRule.key] = newRule.default
    }
    
    if (newRule.description) {
      updatedSchema.descriptions[newRule.key] = newRule.description
    }
    
    saveSchema(updatedSchema)
    setShowAddRule(false)
    setNewRule({
      key: '',
      type: 'string',
      required: false,
      pattern: '',
      default: '',
      description: ''
    })
  }

  // Remove rule
  const removeRule = (key) => {
    const updatedSchema = {
      required: schema.required.filter(k => k !== key),
      types: { ...schema.types },
      patterns: { ...schema.patterns },
      defaults: { ...schema.defaults },
      descriptions: { ...schema.descriptions }
    }
    
    delete updatedSchema.types[key]
    delete updatedSchema.patterns[key]
    delete updatedSchema.defaults[key]
    delete updatedSchema.descriptions[key]
    
    saveSchema(updatedSchema)
  }

  // Validate all variables against schema
  const validateAll = () => {
    const results = {
      valid: true,
      errors: [],
      warnings: []
    }

    // Check required variables
    schema.required.forEach(key => {
      const variable = variables.find(v => v.key === key)
      if (!variable || !variable.value) {
        results.valid = false
        results.errors.push({
          key,
          type: 'missing',
          message: `Required variable ${key} is missing or empty`
        })
      }
    })

    // Validate existing variables
    variables.forEach(variable => {
      const { key, value } = variable

      // Type validation
      const expectedType = schema.types[key]
      if (expectedType && variableTypes[expectedType]) {
        if (!variableTypes[expectedType].validator(value)) {
          results.valid = false
          results.errors.push({
            key,
            type: 'type',
            message: `${key} should be of type ${expectedType}`
          })
        }
      }

      // Pattern validation
      const pattern = schema.patterns[key]
      if (pattern && value) {
        try {
          const regex = new RegExp(pattern)
          if (!regex.test(value)) {
            results.valid = false
            results.errors.push({
              key,
              type: 'pattern',
              message: `${key} does not match required pattern`
            })
          }
        } catch (e) {
          results.warnings.push({
            key,
            type: 'pattern',
            message: `Invalid pattern for ${key}`
          })
        }
      }

      // Check for variables without schema rules
      if (!schema.required.includes(key) && 
          !schema.types[key] && 
          !schema.patterns[key] &&
          !schema.descriptions[key]) {
        results.warnings.push({
          key,
          type: 'untracked',
          message: `${key} has no validation rules defined`
        })
      }
    })

    return results
  }

  const validationResults = validateAll()

  return (
    <div className="environment-schema bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Environment Schema</h3>
        <p className="mt-1 text-sm text-gray-500">
          Define validation rules and requirements for environment variables
        </p>
      </div>

      {/* Validation Summary */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {validationResults.valid ? (
              <div className="flex items-center text-green-600">
                <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">Schema Valid</span>
              </div>
            ) : (
              <div className="flex items-center text-red-600">
                <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">{validationResults.errors.length} Errors</span>
              </div>
            )}
            
            {validationResults.warnings.length > 0 && (
              <div className="flex items-center text-yellow-600">
                <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">{validationResults.warnings.length} Warnings</span>
              </div>
            )}
          </div>
          
          <button
            onClick={() => setShowAddRule(!showAddRule)}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
          >
            Add Rule
          </button>
        </div>
      </div>

      {/* Add Rule Form */}
      {showAddRule && (
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Variable Name
              </label>
              <input
                type="text"
                value={newRule.key}
                onChange={(e) => setNewRule({ ...newRule, key: e.target.value.toUpperCase() })}
                placeholder="DATABASE_URL"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type
              </label>
              <select
                value={newRule.type}
                onChange={(e) => setNewRule({ ...newRule, type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
              >
                {Object.entries(variableTypes).map(([value, { name }]) => (
                  <option key={value} value={value}>{name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pattern (RegEx)
              </label>
              <div className="flex">
                <input
                  type="text"
                  value={newRule.pattern}
                  onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })}
                  placeholder="^[A-Za-z0-9]+$"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-l focus:outline-none focus:border-blue-500"
                />
                <select
                  onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })}
                  className="px-2 border-t border-r border-b border-gray-300 rounded-r bg-gray-50"
                >
                  <option value="">Presets</option>
                  {Object.entries(commonPatterns).map(([name, pattern]) => (
                    <option key={name} value={pattern}>{name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Value
              </label>
              <input
                type="text"
                value={newRule.default}
                onChange={(e) => setNewRule({ ...newRule, default: e.target.value })}
                placeholder="Default value"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
              />
            </div>
            
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <input
                type="text"
                value={newRule.description}
                onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                placeholder="Describe the purpose of this variable"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
              />
            </div>
            
            <div className="col-span-2 flex items-center justify-between">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={newRule.required}
                  onChange={(e) => setNewRule({ ...newRule, required: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-gray-700">Required Variable</span>
              </label>
              
              <div className="space-x-2">
                <button
                  onClick={() => setShowAddRule(false)}
                  className="px-3 py-1 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={addRule}
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700"
                >
                  Add Rule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schema Rules */}
      <div className="divide-y divide-gray-200">
        {Object.keys({ ...schema.types, ...schema.patterns, ...schema.defaults, ...schema.descriptions })
          .filter((key, index, self) => self.indexOf(key) === index)
          .map(key => (
            <div key={key} className="p-4 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center">
                    <code className="text-sm font-mono font-medium text-gray-900">{key}</code>
                    {schema.required.includes(key) && (
                      <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded">Required</span>
                    )}
                    {schema.types[key] && (
                      <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                        {variableTypes[schema.types[key]]?.name || schema.types[key]}
                      </span>
                    )}
                  </div>
                  
                  {schema.descriptions[key] && (
                    <p className="mt-1 text-sm text-gray-500">{schema.descriptions[key]}</p>
                  )}
                  
                  <div className="mt-2 space-y-1">
                    {schema.patterns[key] && (
                      <div className="text-xs text-gray-500">
                        Pattern: <code className="bg-gray-100 px-1 py-0.5 rounded">{schema.patterns[key]}</code>
                      </div>
                    )}
                    {schema.defaults[key] && (
                      <div className="text-xs text-gray-500">
                        Default: <code className="bg-gray-100 px-1 py-0.5 rounded">{schema.defaults[key]}</code>
                      </div>
                    )}
                  </div>
                  
                  {/* Validation Status */}
                  {(() => {
                    const error = validationResults.errors.find(e => e.key === key)
                    const warning = validationResults.warnings.find(w => w.key === key)
                    const variable = variables.find(v => v.key === key)
                    
                    if (error) {
                      return (
                        <div className="mt-2 text-xs text-red-600 flex items-center">
                          <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          {error.message}
                        </div>
                      )
                    } else if (warning) {
                      return (
                        <div className="mt-2 text-xs text-yellow-600 flex items-center">
                          <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          {warning.message}
                        </div>
                      )
                    } else if (variable) {
                      return (
                        <div className="mt-2 text-xs text-green-600 flex items-center">
                          <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Valid
                        </div>
                      )
                    }
                    return null
                  })()}
                </div>
                
                <button
                  onClick={() => removeRule(key)}
                  className="ml-4 text-gray-400 hover:text-red-600"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
      </div>

      {/* Export/Import Schema */}
      <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-2">
        <button
          onClick={() => {
            const blob = new Blob([JSON.stringify(schema, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${environment}-schema.json`
            a.click()
            URL.revokeObjectURL(url)
          }}
          className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
        >
          Export Schema
        </button>
        <label className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 cursor-pointer">
          Import Schema
          <input
            type="file"
            accept=".json"
            onChange={(e) => {
              const file = e.target.files[0]
              if (file) {
                const reader = new FileReader()
                reader.onload = (e) => {
                  try {
                    const imported = JSON.parse(e.target.result)
                    saveSchema(imported)
                  } catch (error) {
                    alert('Invalid schema file')
                  }
                }
                reader.readAsText(file)
              }
            }}
            className="hidden"
          />
        </label>
      </div>
    </div>
  )
}

export default EnvironmentSchema