/**
 * Generate API Module Command
 * Creates a new API module for the Frigg API Module Library
 */

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const prompts = require('prompts');
const { execSync } = require('child_process');

const SUPPORTED_AUTH_TYPES = {
  oauth2: 'OAuth 2.0',
  apiKey: 'API Key',
  basic: 'Basic Auth',
  custom: 'Custom Auth'
};

const TEMPLATE_FILES = {
  'index.js': `const {Api} = require('./api');
const {Definition} = require('./definition');
const Config = require('./defaultConfig');

module.exports = { Api, Config, Definition };
`,
  
  'defaultConfig.json': (name, displayName) => JSON.stringify({
    name: displayName,
    moduleName: name,
    version: '0.0.1',
    supportedAuthTypes: ['oauth2'],
    docs: {
      description: `${displayName} API Integration Module`,
      category: 'General',
      apiDocUrl: `https://docs.${name}.com/api`,
      icon: ''
    }
  }, null, 2),
  
  'definition.js': (name, authType, displayName) => {
    if (authType === 'oauth2') {
      return `require('dotenv').config();
const {Api} = require('./api');
const {get} = require('@friggframework/core');
const config = require('./defaultConfig.json');

const Definition = {
    API: Api,
    getName: function () {
        return config.name;
    },
    moduleName: config.name,
    modelName: '${displayName}',
    requiredAuthMethods: {
        getToken: async function (api, params) {
            const code = get(params.data, 'code');
            return api.getTokenFromCode(code);
        },
        getEntityDetails: async function (api, callbackParams, tokenResponse, userId) {
            const userDetails = await api.getCurrentUser();
            return {
                identifiers: {externalId: userDetails.id, user: userId},
                details: {name: userDetails.name || userDetails.email},
            };
        },
        apiPropertiesToPersist: {
            credential: [
                'access_token', 'refresh_token'
            ],
            entity: [],
        },
        getCredentialDetails: async function (api, userId) {
            const userDetails = await api.getCurrentUser();
            return {
                identifiers: {externalId: userDetails.id, user: userId},
                details: {}
            };
        },
        testAuthRequest: async function (api) {
            return api.getCurrentUser();
        },
    },
    env: {
        client_id: process.env.${name.toUpperCase()}_CLIENT_ID,
        client_secret: process.env.${name.toUpperCase()}_CLIENT_SECRET,
        scope: process.env.${name.toUpperCase()}_SCOPE,
        redirect_uri: \`\${process.env.REDIRECT_URI}/${name}\`,
    }
};

module.exports = {Definition};
`;
    } else if (authType === 'apiKey') {
      return `require('dotenv').config();
const {Api} = require('./api');
const {get} = require('@friggframework/core');
const config = require('./defaultConfig.json');

const Definition = {
    API: Api,
    getName: function () {
        return config.name;
    },
    moduleName: config.name,
    modelName: '${displayName}',
    requiredAuthMethods: {
        getEntityDetails: async function (api, callbackParams, tokenResponse, userId) {
            const userDetails = await api.getCurrentUser();
            return {
                identifiers: {externalId: userDetails.id, user: userId},
                details: {name: userDetails.name || userDetails.email},
            };
        },
        apiPropertiesToPersist: {
            credential: [
                'apiKey'
            ],
            entity: [],
        },
        getCredentialDetails: async function (api, userId) {
            const userDetails = await api.getCurrentUser();
            return {
                identifiers: {externalId: userDetails.id, user: userId},
                details: {}
            };
        },
        testAuthRequest: async function (api) {
            return api.getCurrentUser();
        },
    },
    env: {
        api_key: process.env.${name.toUpperCase()}_API_KEY,
    }
};

module.exports = {Definition};
`;
    }
    // Add more auth types as needed
  },

  'api.js': (name, authType, baseUrl) => {
    const baseClass = authType === 'oauth2' ? 'OAuth2Requester' : 'ApiKeyRequester';
    const importPath = authType === 'oauth2' ? '@friggframework/core/oauth2' : '@friggframework/core';
    
    return `const { ${baseClass}, get, FriggError } = require('${importPath}');

class Api extends ${baseClass} {
    constructor(params) {
        super(params);
        this.baseUrl = '${baseUrl}';
        
        this.URLs = {
            me: '/me',
            users: '/users',
            // Add more endpoints here
        };
        
        ${authType === 'oauth2' ? `this.authorizationUri = process.env.${name.toUpperCase()}_AUTH_URI;
        this.tokenUri = process.env.${name.toUpperCase()}_TOKEN_URI;` : ''}
    }

    static Definition = {
        DISPLAY_NAME: '${name}',
        MODULE_NAME: '${name}',
        CATEGORY: 'General',
        USES_OAUTH: ${authType === 'oauth2'}
    };

    async getAuthUri() {
        ${authType === 'oauth2' ? 
        `const { client_id, redirect_uri, scopes } = this.config;
        const params = new URLSearchParams({
            client_id,
            redirect_uri,
            response_type: 'code',
            scope: scopes.join(' '),
            access_type: 'offline',
            prompt: 'consent'
        });
        return \`\${this.authorizationUri}?\${params.toString()}\`;` : 
        'throw new Error("API Key authentication does not use OAuth flow");'}
    }

    async getTokenFromCode(code) {
        ${authType === 'oauth2' ?
        `const { client_id, client_secret, redirect_uri } = this.config;
        const response = await this.post(this.tokenUri, {
            grant_type: 'authorization_code',
            code,
            client_id,
            client_secret,
            redirect_uri
        });
        return response;` :
        'throw new Error("API Key authentication does not use OAuth flow");'}
    }

    async refreshAccessToken(refreshToken) {
        ${authType === 'oauth2' ?
        `const { client_id, client_secret } = this.config;
        const response = await this.post(this.tokenUri, {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id,
            client_secret
        });
        return response;` :
        'throw new Error("API Key authentication does not support token refresh");'}
    }

    // API Methods
    async getCurrentUser() {
        return this.get(this.URLs.me);
    }

    async listUsers(params = {}) {
        return this.get(this.URLs.users, params);
    }

    // Add more API methods here
}

module.exports = { Api };
`;
  },

  'jest.config.js': `module.exports = {
    testEnvironment: 'node',
    coverageDirectory: 'coverage',
    collectCoverageFrom: [
        '**/*.js',
        '!**/node_modules/**',
        '!**/coverage/**',
        '!**/jest.config.js',
        '!**/jest-*.js'
    ],
    setupFilesAfterEnv: ['./jest-setup.js'],
    globalTeardown: './jest-teardown.js'
};
`,

  'jest-setup.js': `require('dotenv').config();
`,

  'jest-teardown.js': `module.exports = async () => {
    // Global teardown
};
`,

  'package.json': (name, displayName) => JSON.stringify({
    name: `@friggframework/${name}`,
    version: "0.0.1",
    description: `${displayName} API Module for Frigg`,
    main: "index.js",
    scripts: {
      test: "jest",
      "test:watch": "jest --watch",
      "test:coverage": "jest --coverage",
      lint: "eslint .",
      "lint:fix": "eslint . --fix"
    },
    keywords: ["frigg", name, "api", "integration"],
    author: "Frigg",
    license: "MIT",
    dependencies: {
      "@friggframework/core": "^1.0.0"
    },
    devDependencies: {
      "@friggframework/test": "^1.0.0",
      "jest": "^27.0.0",
      "eslint": "^8.0.0",
      "dotenv": "^16.0.0"
    }
  }, null, 2),

  '.eslintrc.json': JSON.stringify({
    extends: ["@friggframework/eslint-config"],
    rules: {
      "no-console": "warn"
    }
  }, null, 2),

  '.env.example': (name) => `# ${name.toUpperCase()} API Configuration
${name.toUpperCase()}_CLIENT_ID=your_client_id_here
${name.toUpperCase()}_CLIENT_SECRET=your_client_secret_here
${name.toUpperCase()}_REDIRECT_URI=http://localhost:3000/oauth/callback
${name.toUpperCase()}_AUTH_URI=https://api.${name}.com/oauth/authorize
${name.toUpperCase()}_TOKEN_URI=https://api.${name}.com/oauth/token
${name.toUpperCase()}_API_KEY=your_api_key_here
`,

  'README.md': (name, displayName) => `# ${displayName} API Module

A Frigg API Module for ${displayName} integration.

## Installation

\`\`\`bash
npm install @friggframework/${name}
\`\`\`

## Configuration

### Environment Variables

\`\`\`bash
${name.toUpperCase()}_CLIENT_ID=your_client_id
${name.toUpperCase()}_CLIENT_SECRET=your_client_secret
${name.toUpperCase()}_REDIRECT_URI=your_redirect_uri
\`\`\`

## Usage

\`\`\`javascript
const { Api, Definition } = require('@friggframework/${name}');

// Initialize API client
const api = new Api({
    access_token: 'your_access_token'
});

// Get current user
const user = await api.getCurrentUser();
\`\`\`

## API Methods

- \`getCurrentUser()\` - Get current authenticated user
- \`listUsers(params)\` - List users

## Testing

\`\`\`bash
npm test
\`\`\`

## License

MIT
`,

  'test/api.test.js': (name, displayName) => `const { Api } = require('../api');
const { Authenticator } = require('@friggframework/test');

describe('${displayName} API Tests', () => {
    let api;
    let authenticator;

    beforeAll(async () => {
        authenticator = new Authenticator({
            definition: Definition,
            userId: 'test-user-id'
        });
        
        const credential = await authenticator.authorize();
        api = new Api({
            access_token: credential.access_token
        });
    });

    afterAll(async () => {
        await authenticator.disconnect();
    });

    describe('User Operations', () => {
        test('should get current user', async () => {
            const user = await api.getCurrentUser();
            expect(user).toBeDefined();
            expect(user.id).toBeDefined();
        });

        test('should list users', async () => {
            const users = await api.listUsers();
            expect(Array.isArray(users)).toBe(true);
        });
    });
});
`,

  'test/definition.test.js': (name) => `const { Definition } = require('../definition');

describe('${name} Definition Tests', () => {
    test('should create definition with required fields', () => {
        const params = {
            id: 'test-id',
            userId: 'test-user',
            access_token: 'test-token',
            refresh_token: 'refresh-token'
        };
        
        const definition = new Definition(params);
        
        expect(definition.id).toBe(params.id);
        expect(definition.userId).toBe(params.userId);
        expect(definition.access_token).toBe(params.access_token);
        expect(definition.refresh_token).toBe(params.refresh_token);
    });

    test('should have correct config', () => {
        expect(Definition.Config.name).toBe('${name}');
        expect(Definition.Config.authType).toBeDefined();
    });
});
`
};

async function generateApiModule(moduleName, options = {}) {
  console.log(chalk.blue('\n🚀 Frigg API Module Generator\n'));

  // Validate module name
  const validation = validateModuleName(moduleName);
  if (!validation.valid) {
    console.error(chalk.red(`❌ Invalid module name: ${validation.errors.join(', ')}`));
    process.exit(1);
  }

  // Get module details through prompts
  const answers = await prompts([
    {
      type: 'text',
      name: 'displayName',
      message: 'Display name for the module:',
      initial: moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
    },
    {
      type: 'text',
      name: 'baseUrl',
      message: 'Base API URL:',
      initial: `https://api.${moduleName}.com`
    },
    {
      type: 'select',
      name: 'authType',
      message: 'Authentication type:',
      choices: Object.entries(SUPPORTED_AUTH_TYPES).map(([value, title]) => ({
        title,
        value
      })),
      initial: 0
    },
    {
      type: 'text',
      name: 'category',
      message: 'API category:',
      initial: 'General'
    },
    {
      type: 'confirm',
      name: 'openApi',
      message: 'Do you have an OpenAPI/Swagger spec URL?',
      initial: false
    }
  ]);

  if (!answers.displayName) {
    console.log(chalk.yellow('Generation cancelled.'));
    return;
  }

  // If they have OpenAPI spec, get the URL
  if (answers.openApi) {
    const { openApiUrl } = await prompts({
      type: 'text',
      name: 'openApiUrl',
      message: 'OpenAPI/Swagger spec URL:'
    });
    
    if (openApiUrl) {
      answers.openApiUrl = openApiUrl;
    }
  }

  // Determine target directory
  const targetDir = options.path || path.join(process.cwd(), '../../api-module-library/packages', moduleName);
  
  // Check if directory already exists
  if (fs.existsSync(targetDir)) {
    const { overwrite } = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: `Directory ${targetDir} already exists. Overwrite?`,
      initial: false
    });

    if (!overwrite) {
      console.log(chalk.yellow('Generation cancelled.'));
      return;
    }
  }

  // Create module structure
  console.log(chalk.blue(`\n📁 Creating module structure at ${targetDir}...\n`));
  
  try {
    // Create directories
    await fs.ensureDir(targetDir);
    await fs.ensureDir(path.join(targetDir, 'test'));
    
    // Generate files
    await generateFile(targetDir, 'index.js', TEMPLATE_FILES['index.js']);
    await generateFile(targetDir, 'defaultConfig.json', TEMPLATE_FILES['defaultConfig.json'](moduleName, answers.displayName));
    await generateFile(targetDir, 'definition.js', TEMPLATE_FILES['definition.js'](moduleName, answers.authType, answers.displayName));
    await generateFile(targetDir, 'api.js', TEMPLATE_FILES['api.js'](moduleName, answers.authType, answers.baseUrl));
    await generateFile(targetDir, 'jest.config.js', TEMPLATE_FILES['jest.config.js']);
    await generateFile(targetDir, 'jest-setup.js', TEMPLATE_FILES['jest-setup.js']);
    await generateFile(targetDir, 'jest-teardown.js', TEMPLATE_FILES['jest-teardown.js']);
    await generateFile(targetDir, 'package.json', TEMPLATE_FILES['package.json'](moduleName, answers.displayName));
    await generateFile(targetDir, '.eslintrc.json', TEMPLATE_FILES['.eslintrc.json']);
    await generateFile(targetDir, '.env.example', TEMPLATE_FILES['.env.example'](moduleName));
    await generateFile(targetDir, 'README.md', TEMPLATE_FILES['README.md'](moduleName, answers.displayName));
    await generateFile(path.join(targetDir, 'test'), 'api.test.js', TEMPLATE_FILES['test/api.test.js'](moduleName, answers.displayName));
    await generateFile(path.join(targetDir, 'test'), 'definition.test.js', TEMPLATE_FILES['test/definition.test.js'](moduleName));

    // If OpenAPI URL provided, attempt to generate endpoints
    if (answers.openApiUrl) {
      console.log(chalk.blue('\n🔄 Fetching OpenAPI specification...'));
      await generateFromOpenApi(targetDir, moduleName, answers.openApiUrl);
    }

    // Success message
    console.log(chalk.green(`\n✅ Successfully created ${answers.displayName} API module!\n`));
    console.log(chalk.cyan('Next steps:'));
    console.log(chalk.white(`  1. cd ${targetDir}`));
    console.log(chalk.white(`  2. npm install`));
    console.log(chalk.white(`  3. Update .env with your API credentials`));
    console.log(chalk.white(`  4. Implement API methods in api.js`));
    console.log(chalk.white(`  5. npm test\n`));

  } catch (error) {
    console.error(chalk.red(`\n❌ Error generating module: ${error.message}`));
    process.exit(1);
  }
}

function validateModuleName(name) {
  const errors = [];
  
  if (!name) {
    errors.push('Module name is required');
  }
  
  if (!/^[a-z0-9-]+$/.test(name)) {
    errors.push('Module name must be lowercase alphanumeric with hyphens');
  }
  
  if (name.startsWith('-') || name.endsWith('-')) {
    errors.push('Module name cannot start or end with a hyphen');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

async function generateFile(dir, filename, content) {
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, content);
  console.log(chalk.gray(`  Created: ${filename}`));
}

async function generateFromOpenApi(targetDir, moduleName, openApiUrl) {
  try {
    // This would fetch and parse the OpenAPI spec
    // For now, we'll add a TODO comment
    const apiPath = path.join(targetDir, 'api.js');
    let apiContent = await fs.readFile(apiPath, 'utf8');
    
    const todoComment = `
    // TODO: Auto-generate methods from OpenAPI spec
    // OpenAPI URL: ${openApiUrl}
    // Run: npx @openapitools/openapi-generator-cli generate -i ${openApiUrl}
`;
    
    apiContent = apiContent.replace('// Add more API methods here', todoComment + '    // Add more API methods here');
    await fs.writeFile(apiPath, apiContent);
    
    console.log(chalk.yellow('  ⚠️  OpenAPI endpoint generation is pending implementation'));
    console.log(chalk.gray(`  OpenAPI spec URL saved: ${openApiUrl}`));
  } catch (error) {
    console.error(chalk.yellow(`  ⚠️  Could not fetch OpenAPI spec: ${error.message}`));
  }
}

module.exports = { generateApiModule };