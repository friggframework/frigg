import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useSocket } from '../hooks/useSocket'

const EnvironmentEditor = ({ 
  variables = [], 
  environment = 'local',
  onSave,
  onVariableUpdate,
  onVariableDelete,
  readOnly = false
}) => {
  const [editorContent, setEditorContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [errors, setErrors] = useState([])
  const [showMaskedValues, setShowMaskedValues] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedLines, setSelectedLines] = useState(new Set())
  const editorRef = useRef(null)
  const { on } = useSocket()

  // Convert variables to editor content
  const variablesToContent = useCallback((vars) => {
    let content = `# Environment: ${environment}\n`
    content += `# Generated at: ${new Date().toISOString()}\n\n`

    const sorted = [...vars].sort((a, b) => a.key.localeCompare(b.key))
    
    sorted.forEach(variable => {
      if (variable.description) {
        content += `# ${variable.description}\n`
      }
      
      let value = variable.value
      if (variable.isSecret && !showMaskedValues) {
        value = '***MASKED***'
      }
      
      content += `${variable.key}=${value}\n\n`
    })
    
    return content.trim()
  }, [environment, showMaskedValues])

  // Parse content back to variables
  const contentToVariables = useCallback((content) => {
    const lines = content.split('\n')
    const vars = []
    let currentDescription = ''
    const errors = []
    
    lines.forEach((line, index) => {
      const trimmed = line.trim()
      
      // Skip empty lines
      if (!trimmed) return
      
      // Handle comments
      if (trimmed.startsWith('#')) {
        // Skip generated headers
        if (trimmed.includes('Environment:') || trimmed.includes('Generated at:')) return
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
            message: `Invalid variable name format: ${key}`
          })
        }
        
        // Don't update masked values
        if (value === '***MASKED***') {
          const existing = variables.find(v => v.key === key)
          if (existing) {
            value = existing.value
          }
        }
        
        vars.push({
          key,
          value,
          description: currentDescription,
          isSecret: isSecretVariable(key),
          line: index + 1
        })
        
        currentDescription = ''
      } else if (trimmed) {
        errors.push({
          line: index + 1,
          message: `Invalid line format: ${trimmed}`
        })
      }
    })
    
    return { variables: vars, errors }
  }, [variables])

  // Check if variable name suggests it's sensitive
  const isSecretVariable = (key) => {
    const patterns = ['PASSWORD', 'SECRET', 'KEY', 'TOKEN', 'PRIVATE', 'CREDENTIAL']
    return patterns.some(pattern => key.toUpperCase().includes(pattern))
  }

  // Initialize editor content
  useEffect(() => {
    setEditorContent(variablesToContent(variables))
    setIsDirty(false)
  }, [variables, variablesToContent])

  // Listen for real-time updates
  useEffect(() => {
    const unsubscribe = on('env-update', (data) => {
      if (data.environment === environment) {
        // Refresh content if not dirty
        if (!isDirty) {
          setEditorContent(variablesToContent(variables))
        }
      }
    })
    
    return unsubscribe
  }, [on, environment, isDirty, variables, variablesToContent])

  // Handle content changes
  const handleContentChange = (e) => {
    const newContent = e.target.value
    setEditorContent(newContent)
    setIsDirty(true)
    
    // Real-time validation
    const { errors: validationErrors } = contentToVariables(newContent)
    setErrors(validationErrors)
  }

  // Save changes
  const handleSave = async () => {
    const { variables: parsedVars, errors: validationErrors } = contentToVariables(editorContent)
    
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      return
    }
    
    try {
      await onSave(parsedVars)
      setIsDirty(false)
      setErrors([])
    } catch (error) {
      setErrors([{ message: error.message }])
    }
  }

  // Handle line selection for bulk operations
  const handleLineClick = (lineNumber, event) => {
    if (event.ctrlKey || event.metaKey) {
      const newSelected = new Set(selectedLines)
      if (newSelected.has(lineNumber)) {
        newSelected.delete(lineNumber)
      } else {
        newSelected.add(lineNumber)
      }
      setSelectedLines(newSelected)
    }
  }

  // Filter content based on search
  const getFilteredContent = () => {
    if (!searchTerm) return editorContent
    
    const lines = editorContent.split('\n')
    const filtered = lines.filter(line => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return true
      return trimmed.toLowerCase().includes(searchTerm.toLowerCase())
    })
    
    return filtered.join('\n')
  }

  // Copy selected variables to clipboard
  const copySelectedVariables = () => {
    const lines = editorContent.split('\n')
    const selected = lines.filter((_, index) => selectedLines.has(index + 1))
    navigator.clipboard.writeText(selected.join('\n'))
  }

  // Insert template variables
  const insertTemplate = (template) => {
    const templates = {
      database: `# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
DATABASE_POOL_SIZE=20
DATABASE_SSL=true`,
      redis: `# Redis Configuration  
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=
REDIS_DB=0`,
      aws: `# AWS Configuration
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
AWS_BUCKET_NAME=`,
      api: `# API Configuration
API_BASE_URL=https://api.example.com
API_KEY=
API_SECRET=
API_TIMEOUT=30000`
    }
    
    const templateContent = templates[template]
    if (templateContent) {
      setEditorContent(editorContent + '\n\n' + templateContent)
      setIsDirty(true)
    }
  }

  return (
    <div className="environment-editor">
      {/* Toolbar */}
      <div className="bg-gray-100 border-b border-gray-300 p-2 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={!isDirty || readOnly}
            className={`px-3 py-1 rounded text-sm font-medium ${
              isDirty && !readOnly
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isDirty ? 'Save Changes' : 'Saved'}
          </button>
          
          {/* Revert Button */}
          {isDirty && (
            <button
              onClick={() => {
                setEditorContent(variablesToContent(variables))
                setIsDirty(false)
                setErrors([])
              }}
              className="px-3 py-1 rounded text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              Revert
            </button>
          )}
          
          {/* Toggle Secrets */}
          <button
            onClick={() => setShowMaskedValues(!showMaskedValues)}
            className="px-3 py-1 rounded text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 flex items-center"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {showMaskedValues ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              )}
            </svg>
            {showMaskedValues ? 'Hide' : 'Show'} Secrets
          </button>
          
          {/* Templates Dropdown */}
          <div className="relative group">
            <button className="px-3 py-1 rounded text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300">
              Insert Template ▼
            </button>
            <div className="absolute left-0 mt-1 w-48 bg-white border border-gray-300 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
              <button onClick={() => insertTemplate('database')} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100">Database Config</button>
              <button onClick={() => insertTemplate('redis')} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100">Redis Config</button>
              <button onClick={() => insertTemplate('aws')} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100">AWS Config</button>
              <button onClick={() => insertTemplate('api')} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100">API Config</button>
            </div>
          </div>
          
          {/* Copy Selected */}
          {selectedLines.size > 0 && (
            <button
              onClick={copySelectedVariables}
              className="px-3 py-1 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
            >
              Copy {selectedLines.size} Selected
            </button>
          )}
        </div>
        
        {/* Search */}
        <div className="flex items-center">
          <input
            type="text"
            placeholder="Search variables..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>
      
      {/* Editor */}
      <div className="relative">
        {/* Line Numbers */}
        <div className="absolute left-0 top-0 bottom-0 w-12 bg-gray-50 border-r border-gray-300 select-none">
          {editorContent.split('\n').map((_, index) => (
            <div
              key={index}
              onClick={(e) => handleLineClick(index + 1, e)}
              className={`px-2 text-right text-xs text-gray-500 leading-6 cursor-pointer hover:bg-gray-100 ${
                selectedLines.has(index + 1) ? 'bg-blue-100' : ''
              }`}
            >
              {index + 1}
            </div>
          ))}
        </div>
        
        {/* Text Area */}
        <textarea
          ref={editorRef}
          value={searchTerm ? getFilteredContent() : editorContent}
          onChange={handleContentChange}
          readOnly={readOnly || searchTerm}
          className="w-full h-96 pl-14 pr-4 py-2 font-mono text-sm leading-6 resize-none focus:outline-none"
          spellCheck={false}
          style={{ tabSize: 2 }}
        />
        
        {/* Error Indicators */}
        {errors.length > 0 && (
          <div className="absolute right-2 top-2 bg-red-50 border border-red-200 rounded p-2 max-w-xs">
            <h4 className="text-sm font-medium text-red-800 mb-1">Validation Errors:</h4>
            <ul className="text-xs text-red-600 space-y-1">
              {errors.map((error, index) => (
                <li key={index}>
                  {error.line && `Line ${error.line}: `}{error.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      
      {/* Status Bar */}
      <div className="bg-gray-100 border-t border-gray-300 px-3 py-1 flex items-center justify-between text-xs text-gray-600">
        <div>
          {variables.length} variables • {environment} environment
        </div>
        <div className="flex items-center space-x-4">
          {isDirty && <span className="text-orange-600">● Modified</span>}
          {errors.length > 0 && <span className="text-red-600">{errors.length} errors</span>}
        </div>
      </div>
    </div>
  )
}

export default EnvironmentEditor