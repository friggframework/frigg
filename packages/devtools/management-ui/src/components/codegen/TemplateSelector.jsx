import React, { useState, useCallback } from 'react';
import { Card } from '../Card';
import { Button } from '../Button';

const TEMPLATE_CATEGORIES = {
  INTEGRATION: 'Integration Templates',
  API: 'API Templates',
  UTILITY: 'Utility Templates',
  CUSTOM: 'Custom Templates'
};

const BUILT_IN_TEMPLATES = {
  'api-wrapper': {
    name: 'API Wrapper',
    description: 'Generic API wrapper with authentication and error handling',
    category: 'INTEGRATION',
    variables: ['serviceName', 'baseURL', 'authType'],
    template: `const axios = require('axios');

class {{serviceName}}API {
    constructor(config) {
        this.baseURL = '{{baseURL}}';
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 30000
        });
        
        {{#if authType}}
        this.setupAuthentication('{{authType}}');
        {{/if}}
    }
    
    setupAuthentication(type) {
        switch(type) {
            case 'bearer':
                this.client.defaults.headers.common['Authorization'] = \`Bearer \${this.token}\`;
                break;
            case 'api-key':
                this.client.defaults.headers.common['X-API-Key'] = this.apiKey;
                break;
        }
    }
    
    async request(method, path, data = null) {
        try {
            const response = await this.client.request({
                method,
                url: path,
                data
            });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }
    
    handleError(error) {
        if (error.response) {
            return new Error(\`API Error: \${error.response.status} - \${error.response.data.message || error.response.statusText}\`);
        } else if (error.request) {
            return new Error('Network Error: No response received');
        } else {
            return new Error(\`Request Error: \${error.message}\`);
        }
    }
}

module.exports = {{serviceName}}API;`
  },
  'webhook-handler': {
    name: 'Webhook Handler',
    description: 'Express middleware for handling webhooks with signature verification',
    category: 'API',
    variables: ['serviceName', 'secretHeader', 'signatureAlgorithm'],
    template: `const crypto = require('crypto');
const express = require('express');

class {{serviceName}}WebhookHandler {
    constructor(options = {}) {
        this.secret = options.secret || process.env.{{serviceName.toUpperCase()}}_WEBHOOK_SECRET;
        this.secretHeader = '{{secretHeader}}' || 'x-hub-signature-256';
        this.algorithm = '{{signatureAlgorithm}}' || 'sha256';
        this.router = express.Router();
        this.setupRoutes();
    }
    
    setupRoutes() {
        this.router.use(express.raw({ type: 'application/json' }));
        this.router.post('/webhook', this.verifySignature.bind(this), this.handleWebhook.bind(this));
    }
    
    verifySignature(req, res, next) {
        const signature = req.headers[this.secretHeader];
        if (!signature) {
            return res.status(401).json({ error: 'Missing signature header' });
        }
        
        const expectedSignature = crypto
            .createHmac(this.algorithm, this.secret)
            .update(req.body)
            .digest('hex');
            
        const providedSignature = signature.replace(\`\${this.algorithm}=\`, '');
        
        if (!crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(providedSignature))) {
            return res.status(401).json({ error: 'Invalid signature' });
        }
        
        next();
    }
    
    async handleWebhook(req, res) {
        try {
            const payload = JSON.parse(req.body);
            await this.processWebhook(payload);
            res.status(200).json({ success: true });
        } catch (error) {
            console.error('Webhook processing error:', error);
            res.status(500).json({ error: 'Webhook processing failed' });
        }
    }
    
    async processWebhook(payload) {
        // Override this method in your implementation
        console.log('Received webhook:', payload);
    }
    
    getRouter() {
        return this.router;
    }
}

module.exports = {{serviceName}}WebhookHandler;`
  },
  'data-transformer': {
    name: 'Data Transformer',
    description: 'Utility for transforming data between different schemas',
    category: 'UTILITY',
    variables: ['transformerName', 'sourceSchema', 'targetSchema'],
    template: `class {{transformerName}} {
    constructor(mappingConfig = {}) {
        this.mapping = mappingConfig;
        this.validators = {};
        this.transformers = {};
        this.setupDefaultTransformers();
    }
    
    setupDefaultTransformers() {
        this.transformers = {
            string: (value) => String(value),
            number: (value) => Number(value),
            boolean: (value) => Boolean(value),
            date: (value) => new Date(value),
            array: (value) => Array.isArray(value) ? value : [value]
        };
    }
    
    transform(sourceData, mappingKey = 'default') {
        const mapping = this.mapping[mappingKey];
        if (!mapping) {
            throw new Error(\`Mapping '\${mappingKey}' not found\`);
        }
        
        const result = {};
        
        for (const [targetField, config] of Object.entries(mapping)) {
            try {
                const value = this.extractValue(sourceData, config.source);
                const transformedValue = this.applyTransforms(value, config.transforms || []);
                this.setValue(result, targetField, transformedValue);
            } catch (error) {
                if (config.required) {
                    throw new Error(\`Failed to transform required field '\${targetField}': \${error.message}\`);
                }
                if (config.default !== undefined) {
                    this.setValue(result, targetField, config.default);
                }
            }
        }
        
        return result;
    }
    
    extractValue(data, path) {
        return path.split('.').reduce((obj, key) => {
            if (obj === null || obj === undefined) return undefined;
            return obj[key];
        }, data);
    }
    
    setValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((o, key) => {
            if (!(key in o)) o[key] = {};
            return o[key];
        }, obj);
        target[lastKey] = value;
    }
    
    applyTransforms(value, transforms) {
        return transforms.reduce((val, transform) => {
            if (typeof transform === 'string') {
                return this.transformers[transform](val);
            } else if (typeof transform === 'function') {
                return transform(val);
            } else if (transform.type && this.transformers[transform.type]) {
                return this.transformers[transform.type](val, transform.options);
            }
            return val;
        }, value);
    }
    
    addTransformer(name, transformer) {
        this.transformers[name] = transformer;
    }
    
    addMapping(key, mapping) {
        this.mapping[key] = mapping;
    }
}

module.exports = {{transformerName}};`
  }
};

const TemplateSelector = ({ onGenerate }) => {
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateVariables, setTemplateVariables] = useState({});
  const [customTemplate, setCustomTemplate] = useState('');
  const [customVariables, setCustomVariables] = useState([]);
  const [useCustomTemplate, setUseCustomTemplate] = useState(false);

  const handleTemplateSelect = useCallback((templateKey) => {
    setSelectedTemplate(templateKey);
    const template = BUILT_IN_TEMPLATES[templateKey];
    if (template) {
      const variables = {};
      template.variables.forEach(variable => {
        variables[variable] = '';
      });
      setTemplateVariables(variables);
    }
  }, []);

  const handleVariableChange = useCallback((variable, value) => {
    setTemplateVariables(prev => ({
      ...prev,
      [variable]: value
    }));
  }, []);

  const addCustomVariable = useCallback(() => {
    setCustomVariables(prev => [
      ...prev,
      { name: '', description: '', defaultValue: '' }
    ]);
  }, []);

  const updateCustomVariable = useCallback((index, field, value) => {
    setCustomVariables(prev => prev.map((variable, i) => 
      i === index ? { ...variable, [field]: value } : variable
    ));
  }, []);

  const removeCustomVariable = useCallback((index) => {
    setCustomVariables(prev => prev.filter((_, i) => i !== index));
  }, []);

  const processTemplate = useCallback((template, variables) => {
    let processed = template;
    
    // Simple template processing (replace {{variable}} with values)
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      processed = processed.replace(regex, value);
      
      // Handle uppercase version
      const upperRegex = new RegExp(`{{${key}\\.toUpperCase\\(\\)}}`, 'g');
      processed = processed.replace(upperRegex, value.toUpperCase());
      
      // Handle conditional blocks {{#if variable}}...{{/if}}
      const ifRegex = new RegExp(`{{#if ${key}}}([\\s\\S]*?){{/if}}`, 'g');
      processed = processed.replace(ifRegex, value ? '$1' : '');
    });
    
    // Clean up any remaining template syntax
    processed = processed.replace(/{{[^}]+}}/g, '');
    
    return processed;
  }, []);

  const handleGenerate = useCallback(() => {
    let template, variables, metadata;
    
    if (useCustomTemplate) {
      template = customTemplate;
      variables = customVariables.reduce((acc, variable) => {
        acc[variable.name] = variable.defaultValue;
        return acc;
      }, {});
      
      metadata = {
        name: 'custom-template',
        type: 'custom',
        files: [
          { name: 'index.js', content: processTemplate(template, variables) },
          { name: 'README.md', content: generateCustomReadme() }
        ]
      };
    } else {
      const templateData = BUILT_IN_TEMPLATES[selectedTemplate];
      if (!templateData) return;
      
      const processedTemplate = processTemplate(templateData.template, templateVariables);
      
      metadata = {
        name: selectedTemplate,
        type: 'template',
        files: [
          { name: 'index.js', content: processedTemplate },
          { name: 'package.json', content: generatePackageJson(templateData) },
          { name: 'README.md', content: generateReadme(templateData) }
        ]
      };
    }
    
    onGenerate(useCustomTemplate ? { customTemplate, customVariables } : templateVariables, 
               useCustomTemplate ? template : processTemplate(BUILT_IN_TEMPLATES[selectedTemplate].template, templateVariables), 
               metadata);
  }, [useCustomTemplate, customTemplate, customVariables, selectedTemplate, templateVariables, processTemplate, onGenerate]);

  const generatePackageJson = (templateData) => {
    return JSON.stringify({
      name: `frigg-${selectedTemplate}`,
      version: '1.0.0',
      description: templateData.description,
      main: 'index.js',
      scripts: {
        test: 'echo "No tests yet" && exit 0'
      },
      dependencies: {
        '@friggframework/core': '^1.0.0'
      }
    }, null, 2);
  };

  const generateReadme = (templateData) => {
    return `# ${templateData.name}

${templateData.description}

## Variables Used

${templateData.variables.map(variable => `- **${variable}**: ${templateVariables[variable] || 'Not set'}`).join('\n')}

## Usage

\`\`\`javascript
const ${templateVariables.serviceName || 'Service'} = require('./index');

// Your implementation here
\`\`\`

## Customization

This code was generated from a template. Modify it according to your specific needs.
`;
  };

  const generateCustomReadme = () => {
    return `# Custom Template

Generated from a custom template.

## Variables

${customVariables.map(variable => `- **${variable.name}**: ${variable.description || 'No description'}`).join('\n')}

## Usage

This is a custom template. Refer to the generated code for usage instructions.
`;
  };

  const canGenerate = () => {
    if (useCustomTemplate) {
      return customTemplate.trim().length > 0;
    }
    
    if (!selectedTemplate) return false;
    
    const template = BUILT_IN_TEMPLATES[selectedTemplate];
    return template && template.variables.every(variable => templateVariables[variable]?.trim());
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Template Selector</h2>
      
      {/* Template Type Toggle */}
      <Card className="p-4">
        <div className="flex space-x-4">
          <label className="flex items-center">
            <input
              type="radio"
              checked={!useCustomTemplate}
              onChange={() => setUseCustomTemplate(false)}
              className="mr-2"
            />
            Built-in Templates
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              checked={useCustomTemplate}
              onChange={() => setUseCustomTemplate(true)}
              className="mr-2"
            />
            Custom Template
          </label>
        </div>
      </Card>

      {!useCustomTemplate ? (
        <>
          {/* Built-in Templates */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Choose a Template</h3>
            
            {Object.entries(TEMPLATE_CATEGORIES).map(([categoryKey, categoryName]) => {
              const templatesInCategory = Object.entries(BUILT_IN_TEMPLATES).filter(
                ([, template]) => template.category === categoryKey
              );
              
              if (templatesInCategory.length === 0) return null;
              
              return (
                <div key={categoryKey}>
                  <h4 className="font-medium text-gray-900 mb-3">{categoryName}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {templatesInCategory.map(([key, template]) => (
                      <Card
                        key={key}
                        className={`cursor-pointer transition-all p-4 ${
                          selectedTemplate === key
                            ? 'border-blue-500 bg-blue-50'
                            : 'hover:border-gray-300'
                        }`}
                        onClick={() => handleTemplateSelect(key)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h5 className="font-medium">{template.name}</h5>
                          <input
                            type="radio"
                            checked={selectedTemplate === key}
                            onChange={() => handleTemplateSelect(key)}
                            className="mt-1"
                          />
                        </div>
                        <p className="text-sm text-gray-600 mb-3">{template.description}</p>
                        <div className="text-xs text-gray-500">
                          Variables: {template.variables.join(', ')}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Template Variables */}
          {selectedTemplate && (
            <Card className="p-6">
              <h3 className="text-lg font-medium mb-4">Configure Template Variables</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {BUILT_IN_TEMPLATES[selectedTemplate].variables.map((variable) => (
                  <div key={variable}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {variable.charAt(0).toUpperCase() + variable.slice(1)}
                    </label>
                    <input
                      type="text"
                      value={templateVariables[variable] || ''}
                      onChange={(e) => handleVariableChange(variable, e.target.value)}
                      placeholder={`Enter ${variable}`}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      ) : (
        <>
          {/* Custom Template */}
          <div className="space-y-4">
            <Card className="p-6">
              <h3 className="text-lg font-medium mb-4">Custom Template</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Template Code
                  </label>
                  <textarea
                    value={customTemplate}
                    onChange={(e) => setCustomTemplate(e.target.value)}
                    placeholder="Enter your template code here. Use {{variableName}} for variables."
                    rows={12}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Use {"{{variableName}}"} syntax for variables. Supports {"{{#if variable}}...{{/if}}"} for conditionals.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Template Variables</h3>
                <Button onClick={addCustomVariable} size="sm">Add Variable</Button>
              </div>
              
              {customVariables.length === 0 && (
                <div className="text-center py-4 text-gray-500">
                  No variables defined. Add variables to make your template dynamic.
                </div>
              )}
              
              <div className="space-y-3">
                {customVariables.map((variable, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 border rounded">
                    <input
                      type="text"
                      value={variable.name}
                      onChange={(e) => updateCustomVariable(index, 'name', e.target.value)}
                      placeholder="Variable name"
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <input
                      type="text"
                      value={variable.description}
                      onChange={(e) => updateCustomVariable(index, 'description', e.target.value)}
                      placeholder="Description"
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <input
                      type="text"
                      value={variable.defaultValue}
                      onChange={(e) => updateCustomVariable(index, 'defaultValue', e.target.value)}
                      placeholder="Default value"
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => removeCustomVariable(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      <div className="flex justify-end">
        <Button 
          onClick={handleGenerate}
          disabled={!canGenerate()}
          className="bg-purple-600 hover:bg-purple-700"
        >
          Generate from Template
        </Button>
      </div>
    </div>
  );
};

export default TemplateSelector;