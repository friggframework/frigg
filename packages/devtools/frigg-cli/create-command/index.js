/**
 * Copyright (c) 2024 Frigg Integration Framework
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const chalk = require('chalk');
const prompts = require('prompts');
const spawn = require('cross-spawn');
const validateProjectName = require('validate-npm-package-name');

const INTEGRATION_TYPES = {
    API: 'api',
    OAUTH1: 'oauth1',
    OAUTH2: 'oauth2',
    BASIC_AUTH: 'basic-auth',
    CUSTOM: 'custom'
};

const INTEGRATION_TEMPLATES = {
    [INTEGRATION_TYPES.API]: {
        name: 'Basic API Integration',
        description: 'Simple API integration with API key authentication',
        template: 'api-template'
    },
    [INTEGRATION_TYPES.OAUTH1]: {
        name: 'OAuth 1.0 Integration',
        description: 'Integration using OAuth 1.0 authentication flow',
        template: 'oauth1-template'
    },
    [INTEGRATION_TYPES.OAUTH2]: {
        name: 'OAuth 2.0 Integration',
        description: 'Integration using OAuth 2.0 authentication flow',
        template: 'oauth2-template'
    },
    [INTEGRATION_TYPES.BASIC_AUTH]: {
        name: 'Basic Auth Integration',
        description: 'Integration using basic username/password authentication',
        template: 'basic-auth-template'
    },
    [INTEGRATION_TYPES.CUSTOM]: {
        name: 'Custom Integration',
        description: 'Custom integration with your own authentication logic',
        template: 'custom-template'
    }
};

function validateIntegrationName(name) {
    const validationResult = validateProjectName(name);
    if (!validationResult.validForNewPackages) {
        console.error(
            chalk.red(
                `Cannot create an integration named ${chalk.green(
                    `"${name}"`
                )} because of npm naming restrictions:\n`
            )
        );
        [
            ...(validationResult.errors || []),
            ...(validationResult.warnings || []),
        ].forEach(error => {
            console.error(chalk.red(`  * ${error}`));
        });
        console.error(chalk.red('\nPlease choose a different integration name.'));
        return false;
    }
    return true;
}

function getIntegrationPath() {
    // Check if we're in a Frigg project
    let currentPath = process.cwd();
    let foundPath = null;
    
    while (currentPath !== path.parse(currentPath).root) {
        if (fs.existsSync(path.join(currentPath, 'backend', 'src', 'integrations'))) {
            foundPath = path.join(currentPath, 'backend', 'src', 'integrations');
            break;
        }
        currentPath = path.dirname(currentPath);
    }
    
    return foundPath;
}

function generateIntegrationCode(integrationName, integrationType, config) {
    const className = integrationName.replace(/-/g, '_').replace(/(?:^|_)(\w)/g, (_, c) => c.toUpperCase());
    
    if (integrationType === INTEGRATION_TYPES.OAUTH2) {
        return `const { Api, Entity, IntegrationBase } = require('@friggframework/core');
const { OAuth2AuthorizationCode } = require('@friggframework/oauth2');

class ${className}Entity extends Entity {
    static tableName = '${integrationName}';
    
    static getSchema() {
        return {
            access_token: { type: 'string', required: true },
            refresh_token: { type: 'string', required: false },
            expires_at: { type: 'date', required: false },
            scope: { type: 'string', required: false },
            user_id: { type: 'string', required: true }
        };
    }
}

class ${className}Api extends Api {
    constructor(config) {
        super(config);
        this.baseURL = '${config.baseURL || 'https://api.example.com'}';
        this.authorizationURL = '${config.authorizationURL || 'https://example.com/oauth/authorize'}';
        this.tokenURL = '${config.tokenURL || 'https://example.com/oauth/token'}';
        this.clientId = process.env.${integrationName.toUpperCase().replace(/-/g, '_')}_CLIENT_ID;
        this.clientSecret = process.env.${integrationName.toUpperCase().replace(/-/g, '_')}_CLIENT_SECRET;
        this.redirectUri = process.env.${integrationName.toUpperCase().replace(/-/g, '_')}_REDIRECT_URI;
        this.scope = '${config.scope || 'read write'}';
    }

    async refreshAccessToken(refreshToken) {
        const oauth2 = new OAuth2AuthorizationCode({
            client: {
                id: this.clientId,
                secret: this.clientSecret
            },
            auth: {
                tokenHost: this.baseURL,
                tokenPath: new URL(this.tokenURL).pathname
            }
        });

        try {
            const tokenObject = await oauth2.createToken({ refresh_token: refreshToken });
            return await tokenObject.refresh();
        } catch (error) {
            throw new Error(\`Failed to refresh token: \${error.message}\`);
        }
    }

    async getAuthorizationUrl(state) {
        const oauth2 = new OAuth2AuthorizationCode({
            client: {
                id: this.clientId,
                secret: this.clientSecret
            },
            auth: {
                tokenHost: this.baseURL,
                tokenPath: new URL(this.tokenURL).pathname,
                authorizePath: new URL(this.authorizationURL).pathname
            }
        });

        return oauth2.authorizeURL({
            redirect_uri: this.redirectUri,
            scope: this.scope,
            state: state
        });
    }

    async handleAuthorizationCallback(code) {
        const oauth2 = new OAuth2AuthorizationCode({
            client: {
                id: this.clientId,
                secret: this.clientSecret
            },
            auth: {
                tokenHost: this.baseURL,
                tokenPath: new URL(this.tokenURL).pathname
            }
        });

        const tokenParams = {
            code,
            redirect_uri: this.redirectUri,
            scope: this.scope
        };

        try {
            const accessToken = await oauth2.getToken(tokenParams);
            return accessToken.token;
        } catch (error) {
            throw new Error(\`Failed to get access token: \${error.message}\`);
        }
    }

    async getUser() {
        const response = await this.get('/user');
        return response.data;
    }

    // Add more API methods here
}

class ${className}Integration extends IntegrationBase {
    static Entity = ${className}Entity;
    static Api = ${className}Api;
    static type = '${integrationName}';

    async processAuthorizationCallback(params) {
        const { code } = params;
        const api = new ${className}Api();
        const tokenData = await api.handleAuthorizationCallback(code);
        
        const entity = await ${className}Entity.create({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: tokenData.expires_at,
            scope: tokenData.scope,
            user_id: params.userId
        });

        return entity;
    }

    async getAuthorizationUrl(params) {
        const api = new ${className}Api();
        return api.getAuthorizationUrl(params.state);
    }

    static async checkConnection(entity) {
        const api = new ${className}Api();
        api.setAccessToken(entity.access_token);
        
        try {
            await api.getUser();
            return true;
        } catch (error) {
            if (error.response && error.response.status === 401 && entity.refresh_token) {
                // Try to refresh the token
                const newTokenData = await api.refreshAccessToken(entity.refresh_token);
                await entity.update({
                    access_token: newTokenData.access_token,
                    refresh_token: newTokenData.refresh_token,
                    expires_at: newTokenData.expires_at
                });
                return true;
            }
            return false;
        }
    }
}

module.exports = ${className}Integration;
`;
    } else if (integrationType === INTEGRATION_TYPES.API) {
        return `const { Api, Entity, IntegrationBase } = require('@friggframework/core');

class ${className}Entity extends Entity {
    static tableName = '${integrationName}';
    
    static getSchema() {
        return {
            api_key: { type: 'string', required: true },
            user_id: { type: 'string', required: true },
            environment: { type: 'string', required: false, default: 'production' }
        };
    }
}

class ${className}Api extends Api {
    constructor(config) {
        super(config);
        this.baseURL = '${config.baseURL || 'https://api.example.com'}';
        this.headers = {
            'Content-Type': 'application/json'
        };
    }

    setApiKey(apiKey) {
        this.headers['Authorization'] = \`Bearer \${apiKey}\`;
    }

    async testConnection() {
        const response = await this.get('/ping');
        return response.data;
    }

    async getUser() {
        const response = await this.get('/user');
        return response.data;
    }

    // Add more API methods here
}

class ${className}Integration extends IntegrationBase {
    static Entity = ${className}Entity;
    static Api = ${className}Api;
    static type = '${integrationName}';

    async connect(params) {
        const { apiKey, userId } = params;
        
        // Test the API key
        const api = new ${className}Api();
        api.setApiKey(apiKey);
        
        try {
            await api.testConnection();
        } catch (error) {
            throw new Error('Invalid API key');
        }

        const entity = await ${className}Entity.create({
            api_key: apiKey,
            user_id: userId
        });

        return entity;
    }

    static async checkConnection(entity) {
        const api = new ${className}Api();
        api.setApiKey(entity.api_key);
        
        try {
            await api.testConnection();
            return true;
        } catch (error) {
            return false;
        }
    }
}

module.exports = ${className}Integration;
`;
    } else if (integrationType === INTEGRATION_TYPES.BASIC_AUTH) {
        return `const { Api, Entity, IntegrationBase } = require('@friggframework/core');

class ${className}Entity extends Entity {
    static tableName = '${integrationName}';
    
    static getSchema() {
        return {
            username: { type: 'string', required: true },
            password: { type: 'string', required: true, encrypted: true },
            user_id: { type: 'string', required: true }
        };
    }
}

class ${className}Api extends Api {
    constructor(config) {
        super(config);
        this.baseURL = '${config.baseURL || 'https://api.example.com'}';
        this.headers = {
            'Content-Type': 'application/json'
        };
    }

    setCredentials(username, password) {
        const credentials = Buffer.from(\`\${username}:\${password}\`).toString('base64');
        this.headers['Authorization'] = \`Basic \${credentials}\`;
    }

    async testConnection() {
        const response = await this.get('/ping');
        return response.data;
    }

    async getUser() {
        const response = await this.get('/user');
        return response.data;
    }

    // Add more API methods here
}

class ${className}Integration extends IntegrationBase {
    static Entity = ${className}Entity;
    static Api = ${className}Api;
    static type = '${integrationName}';

    async connect(params) {
        const { username, password, userId } = params;
        
        // Test the credentials
        const api = new ${className}Api();
        api.setCredentials(username, password);
        
        try {
            await api.testConnection();
        } catch (error) {
            throw new Error('Invalid credentials');
        }

        const entity = await ${className}Entity.create({
            username,
            password,
            user_id: userId
        });

        return entity;
    }

    static async checkConnection(entity) {
        const api = new ${className}Api();
        api.setCredentials(entity.username, entity.password);
        
        try {
            await api.testConnection();
            return true;
        } catch (error) {
            return false;
        }
    }
}

module.exports = ${className}Integration;
`;
    } else {
        // Custom template
        return `const { Api, Entity, IntegrationBase } = require('@friggframework/core');

class ${className}Entity extends Entity {
    static tableName = '${integrationName}';
    
    static getSchema() {
        return {
            // Define your entity schema here
            custom_field: { type: 'string', required: true },
            user_id: { type: 'string', required: true }
        };
    }
}

class ${className}Api extends Api {
    constructor(config) {
        super(config);
        this.baseURL = '${config.baseURL || 'https://api.example.com'}';
        this.headers = {
            'Content-Type': 'application/json'
        };
    }

    // Add your API methods here
    async customMethod() {
        const response = await this.get('/custom-endpoint');
        return response.data;
    }
}

class ${className}Integration extends IntegrationBase {
    static Entity = ${className}Entity;
    static Api = ${className}Api;
    static type = '${integrationName}';

    // Implement your integration logic here
    async connect(params) {
        // Custom connection logic
        const entity = await ${className}Entity.create({
            custom_field: params.customField,
            user_id: params.userId
        });

        return entity;
    }

    static async checkConnection(entity) {
        // Implement connection check logic
        return true;
    }
}

module.exports = ${className}Integration;
`;
    }
}

function generateTestCode(integrationName, integrationType) {
    const className = integrationName.replace(/-/g, '_').replace(/(?:^|_)(\w)/g, (_, c) => c.toUpperCase());
    
    return `const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const ${className}Integration = require('../index');

describe('${className}Integration', () => {
    let integration;

    beforeEach(() => {
        integration = new ${className}Integration();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Entity', () => {
        it('should have correct table name', () => {
            expect(${className}Integration.Entity.tableName).toBe('${integrationName}');
        });

        it('should have correct schema', () => {
            const schema = ${className}Integration.Entity.getSchema();
            expect(schema).toBeDefined();
            expect(schema.user_id).toBeDefined();
        });
    });

    describe('Api', () => {
        it('should initialize with correct baseURL', () => {
            const api = new ${className}Integration.Api();
            expect(api.baseURL).toBeDefined();
        });

        // Add more API tests here
    });

    describe('Integration', () => {
        it('should have correct type', () => {
            expect(${className}Integration.type).toBe('${integrationName}');
        });

        describe('checkConnection', () => {
            it('should return true for valid connection', async () => {
                // Mock entity and API calls
                const mockEntity = {
                    ${integrationType === INTEGRATION_TYPES.API ? 'api_key: "test-key"' : 
                      integrationType === INTEGRATION_TYPES.BASIC_AUTH ? 'username: "test", password: "pass"' :
                      integrationType === INTEGRATION_TYPES.OAUTH2 ? 'access_token: "test-token"' :
                      'custom_field: "test"'}
                };

                // Add your mock implementation here
                const result = await ${className}Integration.checkConnection(mockEntity);
                expect(result).toBeDefined();
            });
        });

        // Add more integration tests here
    });
});
`;
}

function generatePackageJson(integrationName, integrationType) {
    return {
        name: `@friggframework/${integrationName}`,
        version: '0.1.0',
        description: `Frigg integration for ${integrationName}`,
        main: 'index.js',
        scripts: {
            test: 'jest',
            'test:watch': 'jest --watch',
            'test:coverage': 'jest --coverage'
        },
        keywords: [
            'frigg',
            'integration',
            integrationName,
            integrationType
        ],
        dependencies: {
            '@friggframework/core': '^1.0.0',
            ...(integrationType === INTEGRATION_TYPES.OAUTH2 ? { '@friggframework/oauth2': '^1.0.0' } : {})
        },
        devDependencies: {
            '@jest/globals': '^29.0.0',
            'jest': '^29.0.0'
        }
    };
}

function generateReadme(integrationName, integrationType) {
    const className = integrationName.replace(/-/g, '_').replace(/(?:^|_)(\w)/g, (_, c) => c.toUpperCase());
    
    return `# ${integrationName} Integration

Frigg integration module for ${integrationName}.

## Installation

\`\`\`bash
npm install @friggframework/${integrationName}
\`\`\`

## Configuration

${integrationType === INTEGRATION_TYPES.OAUTH2 ? `### OAuth 2.0 Configuration

Set the following environment variables:

- \`${integrationName.toUpperCase().replace(/-/g, '_')}_CLIENT_ID\`: Your OAuth client ID
- \`${integrationName.toUpperCase().replace(/-/g, '_')}_CLIENT_SECRET\`: Your OAuth client secret
- \`${integrationName.toUpperCase().replace(/-/g, '_')}_REDIRECT_URI\`: Your OAuth redirect URI
` : integrationType === INTEGRATION_TYPES.API ? `### API Key Configuration

The API key is provided during the connection process.
` : integrationType === INTEGRATION_TYPES.BASIC_AUTH ? `### Basic Auth Configuration

Username and password are provided during the connection process.
` : `### Custom Configuration

Configure according to your integration requirements.
`}

## Usage

\`\`\`javascript
const ${className}Integration = require('@friggframework/${integrationName}');

// Create a new integration instance
const integration = new ${className}Integration();

${integrationType === INTEGRATION_TYPES.OAUTH2 ? `// Get authorization URL
const authUrl = await integration.getAuthorizationUrl({
    state: 'your-state-parameter'
});

// Handle OAuth callback
const entity = await integration.processAuthorizationCallback({
    code: 'authorization-code',
    userId: 'user-123'
});` : integrationType === INTEGRATION_TYPES.API ? `// Connect with API key
const entity = await integration.connect({
    apiKey: 'your-api-key',
    userId: 'user-123'
});` : integrationType === INTEGRATION_TYPES.BASIC_AUTH ? `// Connect with credentials
const entity = await integration.connect({
    username: 'your-username',
    password: 'your-password',
    userId: 'user-123'
});` : `// Connect with custom parameters
const entity = await integration.connect({
    customField: 'your-value',
    userId: 'user-123'
});`}

// Check connection
const isConnected = await ${className}Integration.checkConnection(entity);
\`\`\`

## API Methods

${integrationType === INTEGRATION_TYPES.OAUTH2 || integrationType === INTEGRATION_TYPES.API || integrationType === INTEGRATION_TYPES.BASIC_AUTH ? `- \`getUser()\`: Get user information
- \`testConnection()\`: Test the connection` : `- \`customMethod()\`: Your custom method`}

## Testing

\`\`\`bash
npm test
\`\`\`

## License

MIT
`;
}

async function createCommand(integrationName, options) {
    console.log(chalk.blue('\nFrigg Integration Creator'));
    console.log(chalk.gray('========================\n'));

    // If no integration name provided, prompt for it
    if (!integrationName) {
        const nameResponse = await prompts({
            type: 'text',
            name: 'integrationName',
            message: 'What is the name of your integration?',
            validate: value => validateIntegrationName(value) || 'Invalid integration name'
        });
        
        if (!nameResponse.integrationName) {
            console.log(chalk.red('\nIntegration creation cancelled.'));
            process.exit(1);
        }
        
        integrationName = nameResponse.integrationName;
    } else if (!validateIntegrationName(integrationName)) {
        process.exit(1);
    }

    // Check if we're in a Frigg project
    const integrationsPath = getIntegrationPath();
    if (!integrationsPath) {
        console.error(chalk.red('\nError: Not in a Frigg project directory.'));
        console.error(chalk.yellow('Please run this command from within a Frigg project.'));
        process.exit(1);
    }

    // Check if integration already exists
    const integrationPath = path.join(integrationsPath, integrationName);
    if (fs.existsSync(integrationPath)) {
        console.error(chalk.red(`\nError: Integration "${integrationName}" already exists.`));
        process.exit(1);
    }

    // Prompt for integration type
    const typeResponse = await prompts({
        type: 'select',
        name: 'integrationType',
        message: 'What type of integration would you like to create?',
        choices: Object.entries(INTEGRATION_TEMPLATES).map(([key, value]) => ({
            title: value.name,
            description: value.description,
            value: key
        }))
    });

    if (!typeResponse.integrationType) {
        console.log(chalk.red('\nIntegration creation cancelled.'));
        process.exit(1);
    }

    const integrationType = typeResponse.integrationType;

    // Prompt for additional configuration based on type
    let config = {};
    
    if (integrationType !== INTEGRATION_TYPES.CUSTOM) {
        const configResponse = await prompts([
            {
                type: 'text',
                name: 'baseURL',
                message: 'What is the base URL for the API?',
                initial: 'https://api.example.com'
            },
            ...(integrationType === INTEGRATION_TYPES.OAUTH2 ? [
                {
                    type: 'text',
                    name: 'authorizationURL',
                    message: 'What is the OAuth authorization URL?',
                    initial: 'https://example.com/oauth/authorize'
                },
                {
                    type: 'text',
                    name: 'tokenURL',
                    message: 'What is the OAuth token URL?',
                    initial: 'https://example.com/oauth/token'
                },
                {
                    type: 'text',
                    name: 'scope',
                    message: 'What OAuth scopes does your integration need?',
                    initial: 'read write'
                }
            ] : [])
        ]);
        
        config = configResponse;
    }

    console.log(chalk.green(`\nCreating ${integrationName} integration...`));

    // Create integration directory structure
    const testPath = path.join(integrationPath, '__tests__');
    fs.ensureDirSync(testPath);

    // Generate and write files
    const integrationCode = generateIntegrationCode(integrationName, integrationType, config);
    const testCode = generateTestCode(integrationName, integrationType);
    const packageJson = generatePackageJson(integrationName, integrationType);
    const readme = generateReadme(integrationName, integrationType);

    fs.writeFileSync(path.join(integrationPath, 'index.js'), integrationCode);
    fs.writeFileSync(path.join(testPath, 'index.test.js'), testCode);
    fs.writeFileSync(path.join(integrationPath, 'package.json'), JSON.stringify(packageJson, null, 2) + os.EOL);
    fs.writeFileSync(path.join(integrationPath, 'README.md'), readme);

    // Create .env.example file if OAuth2
    if (integrationType === INTEGRATION_TYPES.OAUTH2) {
        const envExample = `# ${integrationName.toUpperCase()} OAuth Configuration
${integrationName.toUpperCase().replace(/-/g, '_')}_CLIENT_ID=your_client_id_here
${integrationName.toUpperCase().replace(/-/g, '_')}_CLIENT_SECRET=your_client_secret_here
${integrationName.toUpperCase().replace(/-/g, '_')}_REDIRECT_URI=http://localhost:3000/auth/${integrationName}/callback
`;
        fs.writeFileSync(path.join(integrationPath, '.env.example'), envExample);
    }

    console.log(chalk.green('\n✓ Integration created successfully!'));
    console.log(chalk.gray(`\nLocation: ${integrationPath}`));
    console.log(chalk.gray('\nNext steps:'));
    console.log(chalk.cyan(`  1. cd ${path.relative(process.cwd(), integrationPath)}`));
    console.log(chalk.cyan('  2. npm install'));
    console.log(chalk.cyan('  3. Update the integration code with your specific implementation'));
    console.log(chalk.cyan('  4. npm test'));
    
    if (integrationType === INTEGRATION_TYPES.OAUTH2) {
        console.log(chalk.yellow('\n⚠️  Don\'t forget to:'));
        console.log(chalk.yellow('  - Set up your OAuth environment variables'));
        console.log(chalk.yellow('  - Register your redirect URI with the OAuth provider'));
    }
}

module.exports = { createCommand };