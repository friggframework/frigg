import React, { useState, useCallback } from 'react';
import { Card } from '../Card';
import { Button } from '../Button';
import SchemaBuilder from './SchemaBuilder';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

const RESPONSE_TYPES = [
  { value: 'json', label: 'JSON Object' },
  { value: 'array', label: 'JSON Array' },
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'file', label: 'File/Binary' }
];

const APIEndpointGenerator = ({ onGenerate }) => {
  const [endpoints, setEndpoints] = useState([]);
  const [currentEndpoint, setCurrentEndpoint] = useState(null);
  const [apiInfo, setApiInfo] = useState({
    name: '',
    description: '',
    baseURL: '',
    version: '1.0.0',
    authentication: 'bearer'
  });

  const createNewEndpoint = useCallback(() => {
    const newEndpoint = {
      id: Date.now(),
      path: '',
      method: 'GET',
      summary: '',
      description: '',
      tags: [],
      parameters: [],
      requestBody: null,
      responses: {
        200: { description: 'Success', schema: [] }
      },
      security: true
    };
    setEndpoints(prev => [...prev, newEndpoint]);
    setCurrentEndpoint(newEndpoint.id);
  }, []);

  const updateEndpoint = useCallback((id, updates) => {
    setEndpoints(prev => prev.map(endpoint =>
      endpoint.id === id ? { ...endpoint, ...updates } : endpoint
    ));
  }, []);

  const removeEndpoint = useCallback((id) => {
    setEndpoints(prev => prev.filter(endpoint => endpoint.id !== id));
    if (currentEndpoint === id) {
      setCurrentEndpoint(null);
    }
  }, [currentEndpoint]);

  const addParameter = useCallback((endpointId) => {
    const newParam = {
      id: Date.now(),
      name: '',
      in: 'query',
      type: 'string',
      required: false,
      description: ''
    };
    
    updateEndpoint(endpointId, {
      parameters: [...(endpoints.find(e => e.id === endpointId)?.parameters || []), newParam]
    });
  }, [endpoints, updateEndpoint]);

  const updateParameter = useCallback((endpointId, paramId, updates) => {
    const endpoint = endpoints.find(e => e.id === endpointId);
    if (!endpoint) return;

    const updatedParams = endpoint.parameters.map(param =>
      param.id === paramId ? { ...param, ...updates } : param
    );
    
    updateEndpoint(endpointId, { parameters: updatedParams });
  }, [endpoints, updateEndpoint]);

  const removeParameter = useCallback((endpointId, paramId) => {
    const endpoint = endpoints.find(e => e.id === endpointId);
    if (!endpoint) return;

    const updatedParams = endpoint.parameters.filter(param => param.id !== paramId);
    updateEndpoint(endpointId, { parameters: updatedParams });
  }, [endpoints, updateEndpoint]);

  const generateRouterCode = useCallback(() => {
    const routerName = apiInfo.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    
    const imports = `const express = require('express');
const router = express.Router();
const { validateRequest, handleError } = require('../middleware');
const { ${apiInfo.name}Service } = require('../services');`;

    const routes = endpoints.map(endpoint => {
      const methodName = endpoint.path.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() + endpoint.method.toLowerCase();
      const expressPath = endpoint.path.replace(/{([^}]+)}/g, ':$1');
      
      const validationMiddleware = endpoint.parameters.length > 0 ? `validateRequest(${JSON.stringify(endpoint.parameters)}), ` : '';
      const authMiddleware = endpoint.security ? 'requireAuth, ' : '';
      
      return `// ${endpoint.summary || endpoint.description || 'No description'}
router.${endpoint.method.toLowerCase()}('${expressPath}', ${authMiddleware}${validationMiddleware}async (req, res) => {
    try {
        ${generateRouteBody(endpoint)}
        res.json(result);
    } catch (error) {
        handleError(error, res);
    }
});`;
    }).join('\n\n');

    const exports = `module.exports = router;`;

    return `${imports}

${routes}

${exports}`;
  }, [apiInfo, endpoints]);

  const generateRouteBody = (endpoint) => {
    const params = endpoint.parameters.filter(p => p.in === 'path').map(p => `req.params.${p.name}`);
    const query = endpoint.parameters.filter(p => p.in === 'query').length > 0 ? 'req.query' : null;
    const body = endpoint.requestBody ? 'req.body' : null;
    
    const args = [params, query, body].filter(Boolean).flat();
    const methodName = endpoint.path.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() + endpoint.method.toLowerCase();
    
    return `        const result = await ${apiInfo.name}Service.${methodName}(${args.join(', ')});`;
  };

  const generateOpenAPISpec = useCallback(() => {
    const spec = {
      openapi: '3.0.0',
      info: {
        title: apiInfo.name,
        description: apiInfo.description,
        version: apiInfo.version
      },
      servers: [
        {
          url: apiInfo.baseURL,
          description: 'API Server'
        }
      ],
      paths: {},
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      }
    };

    endpoints.forEach(endpoint => {
      if (!spec.paths[endpoint.path]) {
        spec.paths[endpoint.path] = {};
      }
      
      spec.paths[endpoint.path][endpoint.method.toLowerCase()] = {
        summary: endpoint.summary,
        description: endpoint.description,
        tags: endpoint.tags,
        parameters: endpoint.parameters.map(param => ({
          name: param.name,
          in: param.in,
          required: param.required,
          description: param.description,
          schema: { type: param.type }
        })),
        responses: Object.entries(endpoint.responses).reduce((acc, [code, response]) => {
          acc[code] = {
            description: response.description,
            content: {
              'application/json': {
                schema: generateJsonSchema(response.schema)
              }
            }
          };
          return acc;
        }, {}),
        ...(endpoint.security ? { security: [{ bearerAuth: [] }] } : {})
      };

      if (endpoint.requestBody) {
        spec.paths[endpoint.path][endpoint.method.toLowerCase()].requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: generateJsonSchema(endpoint.requestBody.schema)
            }
          }
        };
      }
    });

    return JSON.stringify(spec, null, 2);
  }, [apiInfo, endpoints]);

  const generateJsonSchema = (schemaFields) => {
    if (!schemaFields || schemaFields.length === 0) {
      return { type: 'object' };
    }
    
    const properties = {};
    const required = [];
    
    schemaFields.forEach(field => {
      properties[field.name] = {
        type: field.type,
        description: field.label || field.name
      };
      
      if (field.required) {
        required.push(field.name);
      }
      
      if (field.validation) {
        Object.assign(properties[field.name], field.validation);
      }
    });
    
    return {
      type: 'object',
      properties,
      required
    };
  };

  const generateServiceCode = useCallback(() => {
    const serviceName = apiInfo.name + 'Service';
    
    const methods = endpoints.map(endpoint => {
      const methodName = endpoint.path.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() + endpoint.method.toLowerCase();
      const params = endpoint.parameters.filter(p => p.in === 'path').map(p => p.name);
      const queryParams = endpoint.parameters.filter(p => p.in === 'query').length > 0;
      const hasBody = endpoint.requestBody;
      
      const args = [];
      if (params.length > 0) args.push(params.join(', '));
      if (queryParams) args.push('query');
      if (hasBody) args.push('data');
      
      return `    static async ${methodName}(${args.join(', ')}) {
        // TODO: Implement ${endpoint.summary || endpoint.description || 'endpoint logic'}
        throw new Error('Not implemented');
    }`;
    }).join('\n\n');

    return `class ${serviceName} {
${methods}
}

module.exports = ${serviceName};`;
  }, [apiInfo, endpoints]);

  const handleGenerate = useCallback(() => {
    const routerCode = generateRouterCode();
    const serviceCode = generateServiceCode();
    const openApiSpec = generateOpenAPISpec();
    
    const metadata = {
      name: apiInfo.name,
      type: 'api-endpoints',
      files: [
        { name: 'router.js', content: routerCode },
        { name: 'service.js', content: serviceCode },
        { name: 'openapi.json', content: openApiSpec },
        { name: 'README.md', content: generateReadme() }
      ]
    };

    onGenerate(apiInfo, { router: routerCode, service: serviceCode, openapi: openApiSpec }, metadata);
  }, [apiInfo, generateRouterCode, generateServiceCode, generateOpenAPISpec, onGenerate]);

  const generateReadme = () => {
    return `# ${apiInfo.name} API

${apiInfo.description}

## Endpoints

${endpoints.map(endpoint => `### ${endpoint.method} ${endpoint.path}

${endpoint.description || endpoint.summary || 'No description available'}

${endpoint.parameters.length > 0 ? `**Parameters:**
${endpoint.parameters.map(p => `- \`${p.name}\` (${p.type}${p.required ? ', required' : ''}): ${p.description || 'No description'}`).join('\n')}` : ''}
`).join('\n')}

## Authentication

${apiInfo.authentication === 'bearer' ? 'This API uses Bearer token authentication.' : 'Authentication method not specified.'}

## Usage

1. Import the router in your Express app
2. Mount the router at your desired path
3. Implement the service methods
4. Test the endpoints

\`\`\`javascript
const app = require('express')();
const ${apiInfo.name.toLowerCase()}Router = require('./router');

app.use('/api/${apiInfo.name.toLowerCase()}', ${apiInfo.name.toLowerCase()}Router);
\`\`\`
`;
  };

  const selectedEndpoint = endpoints.find(e => e.id === currentEndpoint);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">API Endpoint Generator</h2>
      
      {/* API Info */}
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4">API Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">API Name *</label>
            <input
              type="text"
              value={apiInfo.name}
              onChange={(e) => setApiInfo(prev => ({ ...prev, name: e.target.value }))}
              placeholder="UserAPI"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Version</label>
            <input
              type="text"
              value={apiInfo.version}
              onChange={(e) => setApiInfo(prev => ({ ...prev, version: e.target.value }))}
              placeholder="1.0.0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              value={apiInfo.description}
              onChange={(e) => setApiInfo(prev => ({ ...prev, description: e.target.value }))}
              placeholder="API description"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Base URL</label>
            <input
              type="url"
              value={apiInfo.baseURL}
              onChange={(e) => setApiInfo(prev => ({ ...prev, baseURL: e.target.value }))}
              placeholder="https://api.example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Authentication</label>
            <select
              value={apiInfo.authentication}
              onChange={(e) => setApiInfo(prev => ({ ...prev, authentication: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="bearer">Bearer Token</option>
              <option value="api-key">API Key</option>
              <option value="basic">Basic Auth</option>
              <option value="none">None</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Endpoints List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Endpoints</h3>
              <Button onClick={createNewEndpoint} size="sm">Add</Button>
            </div>
            
            {endpoints.length === 0 && (
              <div className="text-center py-4 text-gray-500">
                No endpoints yet. Click "Add" to create one.
              </div>
            )}
            
            <div className="space-y-2">
              {endpoints.map(endpoint => (
                <div
                  key={endpoint.id}
                  onClick={() => setCurrentEndpoint(endpoint.id)}
                  className={`p-3 rounded border cursor-pointer transition-colors ${
                    currentEndpoint === endpoint.id 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className={`inline-block px-2 py-1 text-xs rounded font-medium ${
                        endpoint.method === 'GET' ? 'bg-green-100 text-green-800' :
                        endpoint.method === 'POST' ? 'bg-blue-100 text-blue-800' :
                        endpoint.method === 'PUT' ? 'bg-yellow-100 text-yellow-800' :
                        endpoint.method === 'DELETE' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {endpoint.method}
                      </span>
                      <div className="text-sm font-medium mt-1">
                        {endpoint.path || '/path'}
                      </div>
                      {endpoint.summary && (
                        <div className="text-xs text-gray-500 mt-1">
                          {endpoint.summary}
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeEndpoint(endpoint.id);
                      }}
                      className="text-red-600 hover:text-red-700"
                    >
                      ×
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Endpoint Editor */}
        <div className="lg:col-span-2">
          {selectedEndpoint ? (
            <Card className="p-6">
              <h3 className="text-lg font-medium mb-4">Edit Endpoint</h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Method</label>
                    <select
                      value={selectedEndpoint.method}
                      onChange={(e) => updateEndpoint(selectedEndpoint.id, { method: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {HTTP_METHODS.map(method => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Path</label>
                    <input
                      type="text"
                      value={selectedEndpoint.path}
                      onChange={(e) => updateEndpoint(selectedEndpoint.id, { path: e.target.value })}
                      placeholder="/users/{id}"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Summary</label>
                  <input
                    type="text"
                    value={selectedEndpoint.summary}
                    onChange={(e) => updateEndpoint(selectedEndpoint.id, { summary: e.target.value })}
                    placeholder="Brief summary"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={selectedEndpoint.description}
                    onChange={(e) => updateEndpoint(selectedEndpoint.id, { description: e.target.value })}
                    placeholder="Detailed description"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id={`security-${selectedEndpoint.id}`}
                    checked={selectedEndpoint.security}
                    onChange={(e) => updateEndpoint(selectedEndpoint.id, { security: e.target.checked })}
                    className="mr-2"
                  />
                  <label htmlFor={`security-${selectedEndpoint.id}`} className="text-sm">
                    Requires Authentication
                  </label>
                </div>

                {/* Parameters */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-medium">Parameters</h4>
                    <Button
                      size="sm"
                      onClick={() => addParameter(selectedEndpoint.id)}
                    >
                      Add Parameter
                    </Button>
                  </div>
                  
                  {selectedEndpoint.parameters?.length === 0 && (
                    <div className="text-sm text-gray-500 py-2">No parameters defined</div>
                  )}
                  
                  {selectedEndpoint.parameters?.map(param => (
                    <div key={param.id} className="border rounded p-3 mb-2">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
                        <input
                          type="text"
                          value={param.name}
                          onChange={(e) => updateParameter(selectedEndpoint.id, param.id, { name: e.target.value })}
                          placeholder="Parameter name"
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                        <select
                          value={param.in}
                          onChange={(e) => updateParameter(selectedEndpoint.id, param.id, { in: e.target.value })}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          <option value="query">Query</option>
                          <option value="path">Path</option>
                          <option value="header">Header</option>
                        </select>
                        <select
                          value={param.type}
                          onChange={(e) => updateParameter(selectedEndpoint.id, param.id, { type: e.target.value })}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          <option value="string">String</option>
                          <option value="number">Number</option>
                          <option value="boolean">Boolean</option>
                          <option value="array">Array</option>
                        </select>
                        <div className="flex items-center space-x-2">
                          <label className="flex items-center text-sm">
                            <input
                              type="checkbox"
                              checked={param.required}
                              onChange={(e) => updateParameter(selectedEndpoint.id, param.id, { required: e.target.checked })}
                              className="mr-1"
                            />
                            Required
                          </label>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeParameter(selectedEndpoint.id, param.id)}
                            className="text-red-600"
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={param.description}
                        onChange={(e) => updateParameter(selectedEndpoint.id, param.id, { description: e.target.value })}
                        placeholder="Parameter description"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                  ))}
                </div>

                {/* Response Schema */}
                <div>
                  <h4 className="font-medium mb-3">Response Schema (200 OK)</h4>
                  <SchemaBuilder
                    schema={selectedEndpoint.responses?.[200]?.schema || []}
                    onChange={(schema) => updateEndpoint(selectedEndpoint.id, {
                      responses: {
                        ...selectedEndpoint.responses,
                        200: { description: 'Success', schema }
                      }
                    })}
                  />
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-8">
              <div className="text-center text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                </svg>
                <p>Select an endpoint to edit its configuration</p>
                <p className="text-sm mt-1">Or create a new endpoint to get started</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button 
          onClick={handleGenerate}
          disabled={!apiInfo.name || endpoints.length === 0}
          className="bg-green-600 hover:bg-green-700"
        >
          Generate API Code
        </Button>
      </div>
    </div>
  );
};

export default APIEndpointGenerator;