import React, { useState, useCallback, useEffect } from 'react';
import { Card } from '../Card';
import { Button } from '../Button';
import FormBuilder from './FormBuilder';
import SchemaBuilder from './SchemaBuilder';
import APIModuleSelector from './APIModuleSelector';
import apiModuleService from '../../services/apiModuleService';

const API_MODULE_TYPES = {
  API: 'api',
  OAUTH1: 'oauth1',
  OAUTH2: 'oauth2',
  BASIC_AUTH: 'basic-auth',
  CUSTOM: 'custom'
};

const AUTHENTICATION_FIELDS = {
  [API_MODULE_TYPES.API]: [
    { name: 'apiKey', label: 'API Key', type: 'string', required: true, encrypted: false }
  ],
  [API_MODULE_TYPES.OAUTH2]: [
    { name: 'access_token', label: 'Access Token', type: 'string', required: true, encrypted: false },
    { name: 'refresh_token', label: 'Refresh Token', type: 'string', required: false, encrypted: false },
    { name: 'expires_at', label: 'Expires At', type: 'date', required: false, encrypted: false },
    { name: 'scope', label: 'Scope', type: 'string', required: false, encrypted: false }
  ],
  [API_MODULE_TYPES.BASIC_AUTH]: [
    { name: 'username', label: 'Username', type: 'string', required: true, encrypted: false },
    { name: 'password', label: 'Password', type: 'string', required: true, encrypted: true }
  ],
  [API_MODULE_TYPES.OAUTH1]: [
    { name: 'oauth_token', label: 'OAuth Token', type: 'string', required: true, encrypted: false },
    { name: 'oauth_token_secret', label: 'OAuth Token Secret', type: 'string', required: true, encrypted: true }
  ]
};

const IntegrationGenerator = ({ onGenerate }) => {
  const [formData, setFormData] = useState({
    name: '',
    displayName: '',
    description: '',
    category: 'API Module',
    type: API_MODULE_TYPES.API,
    baseURL: '',
    authorizationURL: '',
    tokenURL: '',
    scope: '',
    apiEndpoints: [],
    entitySchema: [],
    useExistingModule: false,
    selectedModule: null,
    moduleDetails: null
  });

  const [currentTab, setCurrentTab] = useState('basic');
  const [moduleDetailsLoading, setModuleDetailsLoading] = useState(false);

  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const handleModuleSelect = useCallback(async (moduleName) => {
    setFormData(prev => ({
      ...prev,
      selectedModule: moduleName
    }));
    
    if (moduleName) {
      setModuleDetailsLoading(true);
      try {
        const details = await apiModuleService.getModuleDetails(moduleName);
        setFormData(prev => ({
          ...prev,
          moduleDetails: details,
          // Auto-fill form fields based on module
          name: details.name.replace('@friggframework/api-module-', ''),
          displayName: details.displayName,
          description: details.description || prev.description,
          type: details.authType === 'oauth2' ? INTEGRATION_TYPES.OAUTH2 : 
                details.authType === 'api-key' ? INTEGRATION_TYPES.API : 
                details.authType === 'basic-auth' ? INTEGRATION_TYPES.BASIC_AUTH :
                INTEGRATION_TYPES.CUSTOM
        }));
      } catch (error) {
        console.error('Error loading module details:', error);
      } finally {
        setModuleDetailsLoading(false);
      }
    }
  }, []);

  const handleEndpointAdd = useCallback(() => {
    setFormData(prev => ({
      ...prev,
      apiEndpoints: [
        ...prev.apiEndpoints,
        {
          id: Date.now(),
          name: '',
          method: 'GET',
          path: '',
          description: '',
          parameters: [],
          responseSchema: {}
        }
      ]
    }));
  }, []);

  const handleEndpointUpdate = useCallback((id, updates) => {
    setFormData(prev => ({
      ...prev,
      apiEndpoints: prev.apiEndpoints.map(endpoint =>
        endpoint.id === id ? { ...endpoint, ...updates } : endpoint
      )
    }));
  }, []);

  const handleEndpointRemove = useCallback((id) => {
    setFormData(prev => ({
      ...prev,
      apiEndpoints: prev.apiEndpoints.filter(endpoint => endpoint.id !== id)
    }));
  }, []);

  const generateIntegrationCode = useCallback(() => {
    const className = formData.name.replace(/-/g, '_').replace(/(?:^|_)(\w)/g, (_, c) => c.toUpperCase());
    
    // If using existing module, generate wrapper code
    if (formData.useExistingModule && formData.selectedModule) {
      return generateModuleWrapperCode();
    }
    
    // Otherwise generate full custom integration
    const authFields = AUTHENTICATION_FIELDS[formData.type] || [];
    const allEntityFields = [...authFields, ...formData.entitySchema, { name: 'user_id', label: 'User ID', type: 'string', required: true }];

    // Generate Entity class
    const entityCode = `class ${className}Entity extends Entity {
    static tableName = '${formData.name}';
    
    static getSchema() {
        return {
${allEntityFields.map(field => 
    `            ${field.name}: { type: '${field.type}', required: ${field.required}${field.encrypted ? ', encrypted: true' : ''}${field.default ? `, default: '${field.default}'` : ''} }`
).join(',\n')}
        };
    }
}`;

    // Generate API class
    const apiMethods = formData.apiEndpoints.map(endpoint => {
        const methodName = endpoint.name || `${endpoint.method.toLowerCase()}${endpoint.path.replace(/[^a-zA-Z0-9]/g, '')}`;
        const hasParams = endpoint.parameters && endpoint.parameters.length > 0;
        
        return `    async ${methodName}(${hasParams ? 'params = {}' : ''}) {
        const response = await this.${endpoint.method.toLowerCase()}('${endpoint.path}'${hasParams ? ', params' : ''});
        return response.data;
    }`;
    }).join('\n\n');

    const apiCode = `class ${className}Api extends Api {
    constructor(config) {
        super(config);
        this.baseURL = '${formData.baseURL || 'https://api.example.com'}';
        this.headers = {
            'Content-Type': 'application/json'
        };
    }

${formData.type === INTEGRATION_TYPES.API ? `    setApiKey(apiKey) {
        this.headers['Authorization'] = \`Bearer \${apiKey}\`;
    }` : ''}

${formData.type === INTEGRATION_TYPES.BASIC_AUTH ? `    setCredentials(username, password) {
        const credentials = Buffer.from(\`\${username}:\${password}\`).toString('base64');
        this.headers['Authorization'] = \`Basic \${credentials}\`;
    }` : ''}

${formData.type === INTEGRATION_TYPES.OAUTH2 ? `    setAccessToken(token) {
        this.headers['Authorization'] = \`Bearer \${token}\`;
    }` : ''}

    async testConnection() {
        const response = await this.get('/ping');
        return response.data;
    }

${apiMethods || '    // Add your API methods here'}
}`;

    // Generate Integration class
    const integrationCode = `class ${className}Integration extends IntegrationBase {
    static Entity = ${className}Entity;
    static Api = ${className}Api;
    static type = '${formData.name}';

    static Config = {
        name: '${formData.name}',
        displayName: '${formData.displayName}',
        description: '${formData.description}',
        category: '${formData.category}',
        version: '1.0.0',
        supportedVersions: ['1.0.0']
    };

    async connect(params) {
        const api = new ${className}Api();
        
        // Set authentication
${formData.type === INTEGRATION_TYPES.API ? `        api.setApiKey(params.apiKey);` : ''}
${formData.type === INTEGRATION_TYPES.BASIC_AUTH ? `        api.setCredentials(params.username, params.password);` : ''}
${formData.type === INTEGRATION_TYPES.OAUTH2 ? `        api.setAccessToken(params.access_token);` : ''}
        
        try {
            await api.testConnection();
        } catch (error) {
            throw new Error('Connection failed: ' + error.message);
        }

        const entity = await ${className}Entity.create({
${authFields.map(field => `            ${field.name}: params.${field.name}`).join(',\n')},
            user_id: params.userId
        });

        return entity;
    }

    static async checkConnection(entity) {
        const api = new ${className}Api();
        
${formData.type === INTEGRATION_TYPES.API ? `        api.setApiKey(entity.apiKey);` : ''}
${formData.type === INTEGRATION_TYPES.BASIC_AUTH ? `        api.setCredentials(entity.username, entity.password);` : ''}
${formData.type === INTEGRATION_TYPES.OAUTH2 ? `        api.setAccessToken(entity.access_token);` : ''}
        
        try {
            await api.testConnection();
            return true;
        } catch (error) {
            return false;
        }
    }
}`;

    const fullCode = `const { Api, Entity, IntegrationBase } = require('@friggframework/core');
${formData.type === INTEGRATION_TYPES.OAUTH2 ? "const { OAuth2AuthorizationCode } = require('@friggframework/oauth2');" : ''}

${entityCode}

${apiCode}

${integrationCode}

module.exports = ${className}Integration;`;

    const metadata = {
      name: formData.name,
      className,
      type: formData.type,
      files: [
        { name: 'index.js', content: fullCode },
        { name: 'package.json', content: generatePackageJson() },
        { name: 'README.md', content: generateReadme() },
        { name: '__tests__/index.test.js', content: generateTestFile() }
      ]
    };

    onGenerate(formData, fullCode, metadata);
  }, [formData, onGenerate]);

  const generateModuleWrapperCode = () => {
    const className = formData.name.replace(/-/g, '_').replace(/(?:^|_)(\w)/g, (_, c) => c.toUpperCase());
    const moduleName = formData.selectedModule;
    const moduleDetails = formData.moduleDetails || {};
    
    // Generate wrapper code that extends the npm module
    const wrapperCode = `const ${className}Module = require('${moduleName}');
const { IntegrationBase } = require('@friggframework/core');

// Wrapper class that extends the npm module with custom functionality
class ${className}Integration extends IntegrationBase {
    static Api = ${className}Module.Api;
    static Entity = ${className}Module.Entity;
    static Config = {
        ...${className}Module.Config,
        // Override or extend configuration
        displayName: '${formData.displayName || moduleDetails.displayName}',
        description: '${formData.description || moduleDetails.description}'
    };

    constructor(config) {
        super(config);
        // Initialize the base module
        this.module = new ${className}Module(config);
    }

    async connect(params) {
        // Delegate to the module's connect method
        return this.module.connect(params);
    }

    static async checkConnection(entity) {
        // Delegate to the module's checkConnection method
        return ${className}Module.checkConnection(entity);
    }

    // Add custom methods here
${formData.apiEndpoints.map(endpoint => {
        const methodName = endpoint.name || `${endpoint.method.toLowerCase()}${endpoint.path.replace(/[^a-zA-Z0-9]/g, '')}`;
        return `    async ${methodName}(params = {}) {
        const api = new ${className}Module.Api(this.entity);
        return api.${endpoint.method.toLowerCase()}('${endpoint.path}', params);
    }`;
    }).join('\n\n')}
}

module.exports = ${className}Integration;`;

    const packageJson = {
      name: `@your-org/${formData.name}-integration`,
      version: '0.1.0',
      description: formData.description || `Integration wrapper for ${moduleName}`,
      main: 'index.js',
      scripts: {
        test: 'jest',
        'test:watch': 'jest --watch'
      },
      keywords: ['frigg', 'integration', formData.name],
      dependencies: {
        '@friggframework/core': '^1.0.0',
        [moduleName]: `^${moduleDetails.version || 'latest'}`
      },
      devDependencies: {
        '@jest/globals': '^29.0.0',
        'jest': '^29.0.0'
      }
    };

    const readme = `# ${formData.displayName || moduleDetails.displayName} Integration

${formData.description || moduleDetails.description}

This integration extends the [${moduleName}](https://www.npmjs.com/package/${moduleName}) module.

## Installation

\`\`\`bash
npm install ${moduleName}
\`\`\`

## Configuration

${moduleDetails.requiredFields?.map(field => `- **${field.label}**: ${field.type}${field.required ? ' (required)' : ''}`).join('\n') || 'See module documentation for required configuration.'}

## Usage

\`\`\`javascript
const ${className}Integration = require('./index');

const integration = new ${className}Integration(config);

// Connect
const entity = await integration.connect({
${moduleDetails.requiredFields?.map(field => `    ${field.name}: 'your-${field.name}'`).join(',\n') || '    // Add required parameters'}
});
\`\`\`

## API Methods

${formData.apiEndpoints.map(endpoint => `- \`${endpoint.name || 'endpoint'}\`: ${endpoint.description || 'No description'}`).join('\n') || 'See module documentation for available methods.'}
`;

    const metadata = {
      name: formData.name,
      className,
      type: 'module-wrapper',
      baseModule: moduleName,
      files: [
        { name: 'index.js', content: wrapperCode },
        { name: 'package.json', content: JSON.stringify(packageJson, null, 2) },
        { name: 'README.md', content: readme }
      ]
    };

    onGenerate(formData, wrapperCode, metadata);
  };

  const generatePackageJson = () => {
    const className = formData.name.replace(/-/g, '_').replace(/(?:^|_)(\w)/g, (_, c) => c.toUpperCase());
    return JSON.stringify({
      name: `@friggframework/${formData.name}`,
      version: '0.1.0',
      description: formData.description,
      main: 'index.js',
      scripts: {
        test: 'jest',
        'test:watch': 'jest --watch'
      },
      keywords: ['frigg', 'integration', formData.name],
      dependencies: {
        '@friggframework/core': '^1.0.0',
        ...(formData.type === INTEGRATION_TYPES.OAUTH2 ? { '@friggframework/oauth2': '^1.0.0' } : {})
      },
      devDependencies: {
        '@jest/globals': '^29.0.0',
        'jest': '^29.0.0'
      }
    }, null, 2);
  };

  const generateReadme = () => {
    const className = formData.name.replace(/-/g, '_').replace(/(?:^|_)(\w)/g, (_, c) => c.toUpperCase());
    return `# ${formData.displayName} Integration

${formData.description}

## Installation

\`\`\`bash
npm install @friggframework/${formData.name}
\`\`\`

## Usage

\`\`\`javascript
const ${className}Integration = require('@friggframework/${formData.name}');

const integration = new ${className}Integration();

// Connect
const entity = await integration.connect({
${AUTHENTICATION_FIELDS[formData.type]?.map(field => `    ${field.name}: 'your-${field.name.replace(/_/g, '-')}'`).join(',\n') || '    // Add your authentication parameters'}
    userId: 'user-123'
});

// Check connection
const isConnected = await ${className}Integration.checkConnection(entity);
\`\`\`

## API Methods

${formData.apiEndpoints.map(endpoint => `- \`${endpoint.name || 'endpoint'}\`: ${endpoint.description || 'No description'}`).join('\n') || '- Add your API methods here'}

## License

MIT`;
  };

  const generateTestFile = () => {
    const className = formData.name.replace(/-/g, '_').replace(/(?:^|_)(\w)/g, (_, c) => c.toUpperCase());
    return `const { describe, it, expect } = require('@jest/globals');
const ${className}Integration = require('../index');

describe('${className}Integration', () => {
    it('should have correct configuration', () => {
        expect(${className}Integration.Config.name).toBe('${formData.name}');
        expect(${className}Integration.type).toBe('${formData.name}');
    });

    it('should have Entity and Api classes', () => {
        expect(${className}Integration.Entity).toBeDefined();
        expect(${className}Integration.Api).toBeDefined();
    });

    describe('Entity', () => {
        it('should have correct table name', () => {
            expect(${className}Integration.Entity.tableName).toBe('${formData.name}');
        });

        it('should have valid schema', () => {
            const schema = ${className}Integration.Entity.getSchema();
            expect(schema).toBeDefined();
            expect(schema.user_id).toBeDefined();
        });
    });

    describe('Api', () => {
        it('should initialize with correct baseURL', () => {
            const api = new ${className}Integration.Api();
            expect(api.baseURL).toBe('${formData.baseURL || 'https://api.example.com'}');
        });
    });
});`;
  };

  const tabs = [
    { id: 'module', label: 'Module Selection', icon: '📦' },
    { id: 'basic', label: 'Basic Info', icon: '📝' },
    { id: 'auth', label: 'Authentication', icon: '🔐' },
    { id: 'endpoints', label: 'API Endpoints', icon: '🔗' },
    { id: 'schema', label: 'Entity Schema', icon: '📊' }
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Integration Generator</h2>
      
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                currentTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <Card className="p-6">
        {currentTab === 'module' && (
          <div className="space-y-4">
            <div className="mb-6">
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={formData.useExistingModule}
                  onChange={(e) => handleInputChange('useExistingModule', e.target.checked)}
                  className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Use existing Frigg API module from npm
                </span>
              </label>
              <p className="text-sm text-gray-500 mt-1 ml-7">
                Select from pre-built API modules or create a custom integration from scratch
              </p>
            </div>
            
            {formData.useExistingModule && (
              <APIModuleSelector
                selectedModule={formData.selectedModule}
                onSelect={handleModuleSelect}
              />
            )}
            
            {!formData.useExistingModule && (
              <div className="bg-gray-50 rounded-lg p-6 text-center">
                <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Custom Integration</h3>
                <p className="text-sm text-gray-600">
                  Build a custom integration from scratch with full control over the implementation
                </p>
              </div>
            )}
          </div>
        )}
        
        {currentTab === 'basic' && (
          <div className="space-y-4">
            {formData.useExistingModule && formData.selectedModule && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-sm text-blue-800">
                      Using <strong>{formData.moduleDetails?.displayName || formData.selectedModule}</strong> as base module.
                      Some fields have been auto-filled from the module configuration.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Integration Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="e.g., salesforce, hubspot"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={formData.useExistingModule && moduleDetailsLoading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => handleInputChange('displayName', e.target.value)}
                  placeholder="e.g., Salesforce, HubSpot"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Brief description of the integration"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => handleInputChange('category', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="API Integration">API Integration</option>
                  <option value="CRM">CRM</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Sales">Sales</option>
                  <option value="Support">Support</option>
                  <option value="Analytics">Analytics</option>
                  <option value="Communication">Communication</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Base URL *
                </label>
                <input
                  type="url"
                  value={formData.baseURL}
                  onChange={(e) => handleInputChange('baseURL', e.target.value)}
                  placeholder="https://api.example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {currentTab === 'auth' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Authentication Type
              </label>
              <select
                value={formData.type}
                onChange={(e) => handleInputChange('type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={INTEGRATION_TYPES.API}>API Key</option>
                <option value={INTEGRATION_TYPES.OAUTH2}>OAuth 2.0</option>
                <option value={INTEGRATION_TYPES.BASIC_AUTH}>Basic Auth</option>
                <option value={INTEGRATION_TYPES.OAUTH1}>OAuth 1.0</option>
                <option value={INTEGRATION_TYPES.CUSTOM}>Custom</option>
              </select>
            </div>

            {formData.type === INTEGRATION_TYPES.OAUTH2 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Authorization URL
                  </label>
                  <input
                    type="url"
                    value={formData.authorizationURL}
                    onChange={(e) => handleInputChange('authorizationURL', e.target.value)}
                    placeholder="https://example.com/oauth/authorize"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Token URL
                  </label>
                  <input
                    type="url"
                    value={formData.tokenURL}
                    onChange={(e) => handleInputChange('tokenURL', e.target.value)}
                    placeholder="https://example.com/oauth/token"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    OAuth Scope
                  </label>
                  <input
                    type="text"
                    value={formData.scope}
                    onChange={(e) => handleInputChange('scope', e.target.value)}
                    placeholder="read write"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            <div className="bg-gray-50 p-4 rounded-md">
              <h4 className="font-medium text-gray-900 mb-2">Authentication Fields</h4>
              <p className="text-sm text-gray-600 mb-3">
                The following fields will be included in the Entity schema based on your authentication type:
              </p>
              <div className="space-y-2">
                {AUTHENTICATION_FIELDS[formData.type]?.map((field, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{field.label}</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-gray-500">{field.type}</span>
                      {field.required && <span className="text-red-500">Required</span>}
                      {field.encrypted && <span className="text-blue-500">Encrypted</span>}
                    </div>
                  </div>
                )) || <span className="text-gray-500">No standard fields for custom authentication</span>}
              </div>
            </div>
          </div>
        )}

        {currentTab === 'endpoints' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">API Endpoints</h3>
              <Button onClick={handleEndpointAdd}>Add Endpoint</Button>
            </div>

            {formData.apiEndpoints.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No endpoints defined. Click "Add Endpoint" to get started.
              </div>
            )}

            {formData.apiEndpoints.map((endpoint) => (
              <Card key={endpoint.id} className="p-4">
                <div className="flex justify-between items-start mb-4">
                  <h4 className="font-medium">Endpoint {endpoint.id}</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEndpointRemove(endpoint.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    Remove
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Method
                    </label>
                    <select
                      value={endpoint.method}
                      onChange={(e) => handleEndpointUpdate(endpoint.id, { method: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="DELETE">DELETE</option>
                      <option value="PATCH">PATCH</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Path
                    </label>
                    <input
                      type="text"
                      value={endpoint.path}
                      onChange={(e) => handleEndpointUpdate(endpoint.id, { path: e.target.value })}
                      placeholder="/users"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Method Name
                    </label>
                    <input
                      type="text"
                      value={endpoint.name}
                      onChange={(e) => handleEndpointUpdate(endpoint.id, { name: e.target.value })}
                      placeholder="getUsers"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <input
                    type="text"
                    value={endpoint.description}
                    onChange={(e) => handleEndpointUpdate(endpoint.id, { description: e.target.value })}
                    placeholder="Retrieves a list of users"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </Card>
            ))}
          </div>
        )}

        {currentTab === 'schema' && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Custom Entity Fields</h3>
            <p className="text-sm text-gray-600">
              Add custom fields to store additional data in your integration entity.
              Authentication fields are automatically included.
            </p>
            
            <SchemaBuilder
              schema={formData.entitySchema}
              onChange={(schema) => handleInputChange('entitySchema', schema)}
            />
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <Button 
          onClick={generateIntegrationCode}
          disabled={!formData.name || (!formData.baseURL && !formData.useExistingModule) || (formData.useExistingModule && !formData.selectedModule)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          Generate Integration Code
        </Button>
      </div>
    </div>
  );
};

export default IntegrationGenerator;