import React, { useState, useCallback } from 'react';
import { Card } from '../Card';
import { Button } from '../Button';

const PROJECT_TEMPLATES = {
  'basic-backend': {
    name: 'Basic Backend',
    description: 'Simple Frigg backend with core functionality',
    features: ['Express server', 'MongoDB integration', 'Basic authentication', 'Environment configuration']
  },
  'microservices': {
    name: 'Microservices',
    description: 'Multi-service architecture with API Gateway',
    features: ['API Gateway', 'Service discovery', 'Load balancing', 'Circuit breakers']
  },
  'serverless': {
    name: 'Serverless',
    description: 'AWS Lambda-based serverless backend',
    features: ['Lambda functions', 'API Gateway', 'DynamoDB', 'CloudWatch logging']
  },
  'full-stack': {
    name: 'Full Stack',
    description: 'Complete application with frontend and backend',
    features: ['React frontend', 'Express backend', 'Database integration', 'Authentication']
  }
};

const INTEGRATION_OPTIONS = [
  { id: 'hubspot', name: 'HubSpot', category: 'CRM' },
  { id: 'salesforce', name: 'Salesforce', category: 'CRM' },
  { id: 'slack', name: 'Slack', category: 'Communication' },
  { id: 'mailchimp', name: 'Mailchimp', category: 'Marketing' },
  { id: 'stripe', name: 'Stripe', category: 'Payments' },
  { id: 'twilio', name: 'Twilio', category: 'Communication' },
  { id: 'google-analytics', name: 'Google Analytics', category: 'Analytics' },
  { id: 'microsoft-teams', name: 'Microsoft Teams', category: 'Communication' }
];

const DATABASE_OPTIONS = [
  { value: 'mongodb', label: 'MongoDB', description: 'Document database' },
  { value: 'postgresql', label: 'PostgreSQL', description: 'Relational database' },
  { value: 'mysql', label: 'MySQL', description: 'Relational database' },
  { value: 'dynamodb', label: 'DynamoDB', description: 'AWS NoSQL database' },
  { value: 'redis', label: 'Redis', description: 'In-memory cache' }
];

const ProjectScaffoldWizard = ({ onGenerate }) => {
  const [projectData, setProjectData] = useState({
    name: '',
    description: '',
    template: 'basic-backend',
    database: 'mongodb',
    integrations: [],
    features: {
      authentication: true,
      logging: true,
      monitoring: true,
      testing: true,
      docker: true,
      ci: false
    },
    deployment: {
      platform: 'aws',
      environment: 'development'
    }
  });

  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    { title: 'Project Info', description: 'Basic project configuration' },
    { title: 'Template', description: 'Choose project template' },
    { title: 'Database', description: 'Select database options' },
    { title: 'Integrations', description: 'Choose integrations' },
    { title: 'Features', description: 'Enable additional features' },
    { title: 'Deployment', description: 'Deployment configuration' }
  ];

  const handleInputChange = useCallback((field, value) => {
    setProjectData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const handleFeatureToggle = useCallback((feature) => {
    setProjectData(prev => ({
      ...prev,
      features: {
        ...prev.features,
        [feature]: !prev.features[feature]
      }
    }));
  }, []);

  const handleIntegrationToggle = useCallback((integrationId) => {
    setProjectData(prev => ({
      ...prev,
      integrations: prev.integrations.includes(integrationId)
        ? prev.integrations.filter(id => id !== integrationId)
        : [...prev.integrations, integrationId]
    }));
  }, []);

  const generateProjectFiles = useCallback(() => {
    const template = PROJECT_TEMPLATES[projectData.template];
    
    // Generate package.json
    const packageJson = {
      name: projectData.name,
      version: '1.0.0',
      description: projectData.description,
      main: 'app.js',
      scripts: {
        start: 'node app.js',
        dev: 'nodemon app.js',
        test: projectData.features.testing ? 'jest' : undefined,
        build: projectData.template === 'serverless' ? 'serverless package' : undefined,
        deploy: projectData.template === 'serverless' ? 'serverless deploy' : undefined
      },
      dependencies: {
        '@friggframework/core': '^1.0.0',
        express: '^4.18.0',
        ...(projectData.database === 'mongodb' ? { mongoose: '^7.0.0' } : {}),
        ...(projectData.database === 'postgresql' ? { pg: '^8.8.0', 'pg-hstore': '^2.3.4' } : {}),
        ...(projectData.database === 'mysql' ? { mysql2: '^3.0.0' } : {}),
        ...(projectData.features.authentication ? { passport: '^0.6.0', 'passport-jwt': '^4.0.0' } : {}),
        ...(projectData.features.logging ? { winston: '^3.8.0' } : {}),
        ...(projectData.integrations.map(id => ({ [`@friggframework/api-module-${id}`]: '^1.0.0' })).reduce((acc, obj) => ({ ...acc, ...obj }), {}))
      },
      devDependencies: {
        nodemon: '^2.0.0',
        ...(projectData.features.testing ? { jest: '^29.0.0', supertest: '^6.3.0' } : {})
      }
    };

    // Generate app.js
    const appJs = generateAppJs();

    // Generate serverless.yml (if serverless template)
    const serverlessYml = projectData.template === 'serverless' ? generateServerlessYml() : null;

    // Generate docker files (if docker enabled)
    const dockerfile = projectData.features.docker ? generateDockerfile() : null;
    const dockerCompose = projectData.features.docker ? generateDockerCompose() : null;

    // Generate README
    const readme = generateReadme();

    // Generate environment files
    const envExample = generateEnvExample();

    const files = [
      { name: 'package.json', content: JSON.stringify(packageJson, null, 2) },
      { name: 'app.js', content: appJs },
      { name: 'README.md', content: readme },
      { name: '.env.example', content: envExample },
      ...(serverlessYml ? [{ name: 'serverless.yml', content: serverlessYml }] : []),
      ...(dockerfile ? [{ name: 'Dockerfile', content: dockerfile }] : []),
      ...(dockerCompose ? [{ name: 'docker-compose.yml', content: dockerCompose }] : []),
      ...(projectData.features.ci ? [{ name: '.github/workflows/ci.yml', content: generateCIConfig() }] : [])
    ];

    const metadata = {
      name: projectData.name,
      template: projectData.template,
      type: 'project-scaffold',
      files
    };

    onGenerate(projectData, { files }, metadata);
  }, [projectData, onGenerate]);

  const generateAppJs = () => {
    return `const express = require('express');
const { FriggManager } = require('@friggframework/core');
${projectData.features.logging ? "const winston = require('winston');" : ''}
${projectData.database === 'mongodb' ? "const mongoose = require('mongoose');" : ''}

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

${projectData.features.logging ? `
// Logging configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'app.log' })
  ]
});
` : ''}

${projectData.database === 'mongodb' ? `
// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/${projectData.name}', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
` : ''}

// Frigg Manager initialization
const friggManager = new FriggManager({
  database: '${projectData.database}',
  integrations: [
${projectData.integrations.map(id => `    require('@friggframework/api-module-${id}')`).join(',\n')}
  ]
});

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to ${projectData.name}',
    status: 'running',
    integrations: [${projectData.integrations.map(id => `'${id}'`).join(', ')}]
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server
app.listen(port, () => {
  ${projectData.features.logging ? 'logger.info' : 'console.log'}(\`Server running on port \${port}\`);
});

module.exports = app;`;
  };

  const generateServerlessYml = () => {
    return `service: ${projectData.name}

frameworkVersion: '3'

provider:
  name: aws
  runtime: nodejs18.x
  stage: \${opt:stage, 'dev'}
  region: \${opt:region, 'us-east-1'}
  environment:
    NODE_ENV: \${self:provider.stage}
    ${projectData.integrations.map(id => `${id.toUpperCase()}_API_KEY: \${env:${id.toUpperCase()}_API_KEY}`).join('\n    ')}

functions:
  app:
    handler: app.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY
          cors: true
      - http:
          path: /
          method: ANY
          cors: true

${projectData.database === 'dynamodb' ? `
resources:
  Resources:
    ${projectData.name}Table:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: \${self:provider.stage}-${projectData.name}
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
        BillingMode: PAY_PER_REQUEST
` : ''}

plugins:
  - serverless-offline`;
  };

  const generateDockerfile = () => {
    return `FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]`;
  };

  const generateDockerCompose = () => {
    return `version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      ${projectData.database === 'mongodb' ? '- MONGODB_URI=mongodb://mongo:27017/' + projectData.name : ''}
    depends_on:
      ${projectData.database === 'mongodb' ? '- mongo' : ''}
    volumes:
      - .:/app
      - /app/node_modules

${projectData.database === 'mongodb' ? `  mongo:
    image: mongo:5
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db

volumes:
  mongo_data:` : ''}`;
  };

  const generateReadme = () => {
    const template = PROJECT_TEMPLATES[projectData.template];
    
    return `# ${projectData.name}

${projectData.description}

## Project Template: ${template.name}

${template.description}

### Features

${template.features.map(feature => `- ${feature}`).join('\n')}

### Integrations

${projectData.integrations.length > 0 
  ? projectData.integrations.map(id => {
      const integration = INTEGRATION_OPTIONS.find(i => i.id === id);
      return `- ${integration?.name} (${integration?.category})`;
    }).join('\n')
  : 'No integrations configured'
}

### Database

- ${DATABASE_OPTIONS.find(db => db.value === projectData.database)?.label}

### Additional Features

${Object.entries(projectData.features)
  .filter(([, enabled]) => enabled)
  .map(([feature]) => `- ${feature.charAt(0).toUpperCase() + feature.slice(1)}`)
  .join('\n')}

## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Copy environment variables:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

3. Update environment variables in \`.env\`

${projectData.features.docker ? `4. Start with Docker:
   \`\`\`bash
   docker-compose up
   \`\`\`

   Or start locally:` : '4. Start the application:'}
   \`\`\`bash
   npm run dev
   \`\`\`

## API Endpoints

- \`GET /\` - Welcome message and status
- \`GET /health\` - Health check

## Deployment

${projectData.template === 'serverless' 
  ? `This project uses Serverless Framework for deployment:

\`\`\`bash
npm run deploy
\`\`\``
  : `Configure your deployment platform (${projectData.deployment.platform}) according to your needs.`
}

## License

MIT`;
  };

  const generateEnvExample = () => {
    return `# Environment Configuration
NODE_ENV=development
PORT=3000

# Database
${projectData.database === 'mongodb' ? `MONGODB_URI=mongodb://localhost:27017/${projectData.name}` : ''}
${projectData.database === 'postgresql' ? `DATABASE_URL=postgresql://user:password@localhost:5432/${projectData.name}` : ''}
${projectData.database === 'mysql' ? `DATABASE_URL=mysql://user:password@localhost:3306/${projectData.name}` : ''}

# Integration API Keys
${projectData.integrations.map(id => `${id.toUpperCase()}_API_KEY=your_${id}_api_key_here`).join('\n')}

# Authentication (if enabled)
${projectData.features.authentication ? `JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=24h` : ''}

# AWS Configuration (if using AWS services)
${projectData.deployment.platform === 'aws' ? `AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1` : ''}`;
  };

  const generateCIConfig = () => {
    return `name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [16.x, 18.x]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Use Node.js \${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: \${{ matrix.node-version }}
        cache: 'npm'
    
    - run: npm ci
    
    ${projectData.features.testing ? '- run: npm test' : ''}
    
    - run: npm run lint

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Use Node.js 18.x
      uses: actions/setup-node@v3
      with:
        node-version: 18.x
        cache: 'npm'
    
    - run: npm ci
    
    ${projectData.template === 'serverless' ? '- run: npm run deploy' : '# Add your deployment steps here'}`;
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return projectData.name && projectData.description;
      case 1:
        return projectData.template;
      case 2:
        return projectData.database;
      default:
        return true;
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Project Information</h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Project Name *
                </label>
                <input
                  type="text"
                  value={projectData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="my-frigg-project"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description *
                </label>
                <textarea
                  value={projectData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Brief description of your project"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Choose Project Template</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(PROJECT_TEMPLATES).map(([key, template]) => (
                <Card
                  key={key}
                  className={`cursor-pointer transition-all p-4 ${
                    projectData.template === key
                      ? 'border-blue-500 bg-blue-50'
                      : 'hover:border-gray-300'
                  }`}
                  onClick={() => handleInputChange('template', key)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium">{template.name}</h4>
                    <input
                      type="radio"
                      checked={projectData.template === key}
                      onChange={() => handleInputChange('template', key)}
                      className="mt-1"
                    />
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{template.description}</p>
                  <div className="space-y-1">
                    {template.features.map((feature, index) => (
                      <div key={index} className="text-xs text-gray-500 flex items-center">
                        <span className="w-1 h-1 bg-gray-400 rounded-full mr-2"></span>
                        {feature}
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Database Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {DATABASE_OPTIONS.map((db) => (
                <Card
                  key={db.value}
                  className={`cursor-pointer transition-all p-4 ${
                    projectData.database === db.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'hover:border-gray-300'
                  }`}
                  onClick={() => handleInputChange('database', db.value)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium">{db.label}</h4>
                    <input
                      type="radio"
                      checked={projectData.database === db.value}
                      onChange={() => handleInputChange('database', db.value)}
                      className="mt-1"
                    />
                  </div>
                  <p className="text-sm text-gray-600">{db.description}</p>
                </Card>
              ))}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Select Integrations</h3>
            <p className="text-sm text-gray-600">Choose the integrations you want to include in your project.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {INTEGRATION_OPTIONS.map((integration) => (
                <div
                  key={integration.id}
                  className={`border rounded p-3 cursor-pointer transition-all ${
                    projectData.integrations.includes(integration.id)
                      ? 'border-blue-500 bg-blue-50'
                      : 'hover:border-gray-300'
                  }`}
                  onClick={() => handleIntegrationToggle(integration.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-sm">{integration.name}</h4>
                      <p className="text-xs text-gray-500">{integration.category}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={projectData.integrations.includes(integration.id)}
                      onChange={() => handleIntegrationToggle(integration.id)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Additional Features</h3>
            <p className="text-sm text-gray-600">Enable additional features for your project.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(projectData.features).map(([feature, enabled]) => (
                <div key={feature} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <h4 className="font-medium capitalize">{feature.replace(/([A-Z])/g, ' $1')}</h4>
                    <p className="text-sm text-gray-500">
                      {feature === 'authentication' && 'JWT-based authentication system'}
                      {feature === 'logging' && 'Winston logging configuration'}
                      {feature === 'monitoring' && 'Health checks and metrics'}
                      {feature === 'testing' && 'Jest testing framework'}
                      {feature === 'docker' && 'Docker and docker-compose files'}
                      {feature === 'ci' && 'GitHub Actions CI/CD pipeline'}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => handleFeatureToggle(feature)}
                  />
                </div>
              ))}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Deployment Configuration</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Platform
                </label>
                <select
                  value={projectData.deployment.platform}
                  onChange={(e) => handleInputChange('deployment', { ...projectData.deployment, platform: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="aws">AWS</option>
                  <option value="gcp">Google Cloud</option>
                  <option value="azure">Microsoft Azure</option>
                  <option value="heroku">Heroku</option>
                  <option value="vercel">Vercel</option>
                  <option value="netlify">Netlify</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Environment
                </label>
                <select
                  value={projectData.deployment.environment}
                  onChange={(e) => handleInputChange('deployment', { ...projectData.deployment, environment: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="development">Development</option>
                  <option value="staging">Staging</option>
                  <option value="production">Production</option>
                </select>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-md">
              <h4 className="font-medium text-blue-900 mb-2">Project Summary</h4>
              <div className="text-sm text-blue-800 space-y-1">
                <p><strong>Name:</strong> {projectData.name}</p>
                <p><strong>Template:</strong> {PROJECT_TEMPLATES[projectData.template].name}</p>
                <p><strong>Database:</strong> {DATABASE_OPTIONS.find(db => db.value === projectData.database)?.label}</p>
                <p><strong>Integrations:</strong> {projectData.integrations.length > 0 ? projectData.integrations.join(', ') : 'None'}</p>
                <p><strong>Features:</strong> {Object.entries(projectData.features).filter(([, enabled]) => enabled).map(([feature]) => feature).join(', ')}</p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Project Scaffold Wizard</h2>
      
      {/* Progress indicator */}
      <div className="flex items-center justify-between mb-8">
        {steps.map((step, index) => (
          <div key={index} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              index <= currentStep 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-500'
            }`}>
              {index + 1}
            </div>
            <div className="ml-2 text-sm">
              <div className={`font-medium ${index <= currentStep ? 'text-blue-600' : 'text-gray-500'}`}>
                {step.title}
              </div>
              <div className="text-gray-400 text-xs">{step.description}</div>
            </div>
            {index < steps.length - 1 && (
              <div className={`w-16 h-px mx-4 ${index < currentStep ? 'bg-blue-600' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      <Card className="p-6">
        {renderStep()}
      </Card>

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={prevStep}
          disabled={currentStep === 0}
        >
          Previous
        </Button>
        
        {currentStep === steps.length - 1 ? (
          <Button
            onClick={generateProjectFiles}
            className="bg-green-600 hover:bg-green-700"
          >
            Generate Project
          </Button>
        ) : (
          <Button
            onClick={nextStep}
            disabled={!canProceed()}
          >
            Next
          </Button>
        )}
      </div>
    </div>
  );
};

export default ProjectScaffoldWizard;