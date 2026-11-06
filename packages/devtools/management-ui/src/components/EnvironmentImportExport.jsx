import React, { useState, useRef } from 'react'
import api from '../services/api'

const EnvironmentImportExport = ({ environment = 'local', onImport, onExport }) => {
  const [importData, setImportData] = useState('')
  const [importFormat, setImportFormat] = useState('env') // env, json
  const [importPreview, setImportPreview] = useState(null)
  const [importErrors, setImportErrors] = useState([])
  const [exportOptions, setExportOptions] = useState({
    format: 'env', // env, json
    excludeSecrets: false,
    includeDescriptions: true
  })
  const [isImporting, setIsImporting] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef(null)

  // Parse import data
  const parseImportData = (data, format) => {
    const errors = []
    const variables = []

    try {
      if (format === 'json') {
        // Parse JSON format
        const parsed = typeof data === 'string' ? JSON.parse(data) : data
        
        if (typeof parsed !== 'object') {
          errors.push({ message: 'Invalid JSON format' })
          return { variables, errors }
        }

        Object.entries(parsed).forEach(([key, value]) => {
          if (typeof key !== 'string') {
            errors.push({ message: `Invalid key: ${key}` })
            return
          }

          variables.push({
            key: key.toUpperCase(),
            value: String(value),
            isSecret: isSecretVariable(key)
          })
        })
      } else {
        // Parse .env format
        const lines = data.split('\n')
        let currentDescription = ''

        lines.forEach((line, index) => {
          const trimmed = line.trim()

          // Skip empty lines
          if (!trimmed) return

          // Handle comments
          if (trimmed.startsWith('#')) {
            currentDescription = trimmed.substring(1).trim()
            return
          }

          // Parse variable
          const equalIndex = trimmed.indexOf('=')
          if (equalIndex > 0) {
            const key = trimmed.substring(0, equalIndex).trim()
            let value = trimmed.substring(equalIndex + 1).trim()

            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) || 
                (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1)
            }

            // Validate key format
            if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
              errors.push({
                line: index + 1,
                message: `Invalid variable name: ${key}`
              })
              return
            }

            variables.push({
              key: key.toUpperCase(),
              value,
              description: currentDescription,
              isSecret: isSecretVariable(key),
              line: index + 1
            })

            currentDescription = ''
          } else {
            errors.push({
              line: index + 1,
              message: `Invalid line format: ${trimmed}`
            })
          }
        })
      }
    } catch (error) {
      errors.push({ message: error.message })
    }

    return { variables, errors }
  }

  // Check if variable is sensitive
  const isSecretVariable = (key) => {
    const patterns = ['PASSWORD', 'SECRET', 'KEY', 'TOKEN', 'PRIVATE', 'CREDENTIAL']
    return patterns.some(pattern => key.toUpperCase().includes(pattern))
  }

  // Handle file drop
  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  // Handle file select
  const handleFileSelect = (file) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      const content = e.target.result
      setImportData(content)
      
      // Auto-detect format
      const detectedFormat = file.name.endsWith('.json') ? 'json' : 'env'
      setImportFormat(detectedFormat)
      
      // Generate preview
      const { variables, errors } = parseImportData(content, detectedFormat)
      setImportPreview(variables)
      setImportErrors(errors)
    }
    
    reader.readAsText(file)
  }

  // Handle manual input change
  const handleImportDataChange = (e) => {
    const data = e.target.value
    setImportData(data)
    
    if (data) {
      const { variables, errors } = parseImportData(data, importFormat)
      setImportPreview(variables)
      setImportErrors(errors)
    } else {
      setImportPreview(null)
      setImportErrors([])
    }
  }

  // Perform import
  const handleImport = async () => {
    if (!importPreview || importPreview.length === 0) return

    setIsImporting(true)
    try {
      const response = await api.post(`/api/environment/import/${environment}`, {
        data: importData,
        format: importFormat,
        merge: true
      })

      if (onImport) {
        onImport({
          imported: response.data.imported,
          total: response.data.total
        })
      }

      // Reset form
      setImportData('')
      setImportPreview(null)
      setImportErrors([])
    } catch (error) {
      console.error('Import error:', error)
      setImportErrors([{ message: error.response?.data?.message || error.message }])
    } finally {
      setIsImporting(false)
    }
  }

  // Perform export
  const handleExport = async () => {
    try {
      const params = new URLSearchParams({
        format: exportOptions.format,
        excludeSecrets: exportOptions.excludeSecrets
      })

      const response = await api.get(
        `/api/environment/export/${environment}?${params}`,
        { responseType: 'blob' }
      )

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      
      const filename = exportOptions.format === 'json' 
        ? `${environment}-env.json`
        : environment === 'local' ? '.env' : `.env.${environment}`
      
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()

      if (onExport) {
        onExport({ format: exportOptions.format })
      }
    } catch (error) {
      console.error('Export error:', error)
    }
  }

  return (
    <div className="environment-import-export">
      {/* Import Section */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Import Variables</h3>
          <p className="mt-1 text-sm text-gray-500">
            Import environment variables from .env or JSON files
          </p>
        </div>

        <div className="p-4">
          {/* Format Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Import Format
            </label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="env"
                  checked={importFormat === 'env'}
                  onChange={(e) => setImportFormat(e.target.value)}
                  className="mr-2"
                />
                <span className="text-sm">.env format</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="json"
                  checked={importFormat === 'json'}
                  onChange={(e) => setImportFormat(e.target.value)}
                  className="mr-2"
                />
                <span className="text-sm">JSON format</span>
              </label>
            </div>
          </div>

          {/* File Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={() => setDragActive(false)}
            className={`border-2 border-dashed rounded-lg p-6 text-center mb-4 transition-colors ${
              dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 48 48">
              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="mt-2 text-sm text-gray-600">
              Drop a file here, or{' '}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-blue-600 hover:text-blue-500"
              >
                browse
              </button>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Supports .env and .json files
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".env,.json"
              onChange={(e) => e.target.files[0] && handleFileSelect(e.target.files[0])}
              className="hidden"
            />
          </div>

          {/* Manual Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Or paste content directly:
            </label>
            <textarea
              value={importData}
              onChange={handleImportDataChange}
              placeholder={importFormat === 'json' 
                ? '{\n  "API_KEY": "your-api-key",\n  "DATABASE_URL": "postgresql://..."\n}'
                : '# Database configuration\nDATABASE_URL=postgresql://...\n\n# API settings\nAPI_KEY=your-api-key'
              }
              className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md font-mono text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Import Errors */}
          {importErrors.length > 0 && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded p-3">
              <h4 className="text-sm font-medium text-red-800 mb-2">Import Errors:</h4>
              <ul className="text-sm text-red-600 space-y-1">
                {importErrors.map((error, index) => (
                  <li key={index}>
                    {error.line && `Line ${error.line}: `}{error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Import Preview */}
          {importPreview && importPreview.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Preview ({importPreview.length} variables)
              </h4>
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Key</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {importPreview.map((variable, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2 font-mono text-gray-900">{variable.key}</td>
                        <td className="px-3 py-2 font-mono text-gray-600 truncate max-w-xs">
                          {variable.isSecret ? '•••••••' : variable.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import Button */}
          <button
            onClick={handleImport}
            disabled={!importPreview || importPreview.length === 0 || importErrors.length > 0 || isImporting}
            className={`w-full py-2 px-4 rounded font-medium ${
              importPreview && importPreview.length > 0 && importErrors.length === 0
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isImporting ? 'Importing...' : `Import ${importPreview?.length || 0} Variables`}
          </button>
        </div>
      </div>

      {/* Export Section */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Export Variables</h3>
          <p className="mt-1 text-sm text-gray-500">
            Export current environment variables to a file
          </p>
        </div>

        <div className="p-4">
          {/* Export Options */}
          <div className="space-y-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Export Format
              </label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="env"
                    checked={exportOptions.format === 'env'}
                    onChange={(e) => setExportOptions({ ...exportOptions, format: e.target.value })}
                    className="mr-2"
                  />
                  <span className="text-sm">.env format</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="json"
                    checked={exportOptions.format === 'json'}
                    onChange={(e) => setExportOptions({ ...exportOptions, format: e.target.value })}
                    className="mr-2"
                  />
                  <span className="text-sm">JSON format</span>
                </label>
              </div>
            </div>

            <label className="flex items-center">
              <input
                type="checkbox"
                checked={exportOptions.excludeSecrets}
                onChange={(e) => setExportOptions({ ...exportOptions, excludeSecrets: e.target.checked })}
                className="mr-2"
              />
              <span className="text-sm">Exclude secret values (replace with **REDACTED**)</span>
            </label>

            {exportOptions.format === 'env' && (
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={exportOptions.includeDescriptions}
                  onChange={(e) => setExportOptions({ ...exportOptions, includeDescriptions: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm">Include variable descriptions as comments</span>
              </label>
            )}
          </div>

          {/* Export Info */}
          <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
            <div className="flex">
              <svg className="h-5 w-5 text-blue-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="text-sm text-blue-700">
                <p>Export will create a file named:</p>
                <code className="font-mono">
                  {exportOptions.format === 'json' 
                    ? `${environment}-env.json`
                    : environment === 'local' ? '.env' : `.env.${environment}`
                  }
                </code>
              </div>
            </div>
          </div>

          {/* Export Button */}
          <button
            onClick={handleExport}
            className="w-full py-2 px-4 bg-green-600 text-white rounded font-medium hover:bg-green-700"
          >
            Export Variables
          </button>
        </div>
      </div>
    </div>
  )
}

export default EnvironmentImportExport