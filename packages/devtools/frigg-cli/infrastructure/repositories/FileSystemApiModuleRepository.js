const path = require('path');
const {ApiModule} = require('../../domain/entities/ApiModule');
const {IApiModuleRepository} = require('../../domain/ports/IApiModuleRepository');

/**
 * FileSystemApiModuleRepository
 *
 * Concrete implementation of IApiModuleRepository for file system storage
 * Creates API module directories with class files, definitions, and configs
 */
class FileSystemApiModuleRepository extends IApiModuleRepository {
    constructor(fileSystemAdapter, projectRoot, schemaValidator) {
        super();
        this.fileSystemAdapter = fileSystemAdapter;
        this.projectRoot = projectRoot;
        this.schemaValidator = schemaValidator;
        this.apiModulesDir = path.join(projectRoot, 'backend/src/api-modules');
    }

    /**
     * Save API module to file system
     */
    async save(apiModule) {
        // 1. Validate domain entity
        const validation = apiModule.validate();
        if (!validation.isValid) {
            throw new Error(`ApiModule validation failed: ${validation.errors.join(', ')}`);
        }

        // 2. Convert to persistence format
        const persistenceData = this._toPersistenceFormat(apiModule);

        // 3. Validate against schema (if schema exists)
        // TODO: Create api-module schema
        // const schemaValidation = await this.schemaValidator.validate('api-module', persistenceData.definition);

        // 4. Create directories
        const modulePath = path.join(this.apiModulesDir, apiModule.name);
        await this.fileSystemAdapter.ensureDirectory(modulePath);

        // 5. Write files atomically
        const files = [
            {
                path: path.join(modulePath, 'Api.js'),
                content: persistenceData.classFile
            },
            {
                path: path.join(modulePath, 'definition.js'),
                content: persistenceData.definitionFile
            },
            {
                path: path.join(modulePath, 'config.json'),
                content: JSON.stringify(persistenceData.config, null, 2)
            },
            {
                path: path.join(modulePath, 'README.md'),
                content: persistenceData.readme
            }
        ];

        // Create Entity.js if module has entities
        if (Object.keys(apiModule.entities).length > 0) {
            files.push({
                path: path.join(modulePath, 'Entity.js'),
                content: this._generateEntityClass(apiModule)
            });
        }

        // Create tests directory
        const testsDir = path.join(modulePath, 'tests');
        await this.fileSystemAdapter.ensureDirectory(testsDir);

        for (const file of files) {
            await this.fileSystemAdapter.writeFile(file.path, file.content);
        }

        return apiModule;
    }

    /**
     * Find API module by name
     */
    async findByName(name) {
        const modulePath = path.join(this.apiModulesDir, name);

        if (!await this.fileSystemAdapter.exists(modulePath)) {
            return null;
        }

        const definitionPath = path.join(modulePath, 'definition.js');
        if (!await this.fileSystemAdapter.exists(definitionPath)) {
            return null;
        }

        // Read definition file (this is a simple implementation)
        const content = await this.fileSystemAdapter.readFile(definitionPath);
        // For now, return a basic ApiModule - full parsing would require more work
        return ApiModule.create({name});
    }

    /**
     * Check if API module exists
     */
    async exists(name) {
        const modulePath = path.join(this.apiModulesDir, name);
        return await this.fileSystemAdapter.exists(modulePath);
    }

    /**
     * List all API modules
     */
    async list() {
        if (!await this.fileSystemAdapter.exists(this.apiModulesDir)) {
            return [];
        }

        const moduleDirs = await this.fileSystemAdapter.listDirectories(this.apiModulesDir);
        const modules = [];

        for (const dirName of moduleDirs) {
            try {
                const module = await this.findByName(dirName);
                if (module) {
                    modules.push(module);
                }
            } catch (error) {
                console.warn(`Failed to load API module ${dirName}:`, error.message);
            }
        }

        return modules;
    }

    /**
     * Delete API module
     */
    async delete(name) {
        const modulePath = path.join(this.apiModulesDir, name);

        if (!await this.fileSystemAdapter.exists(modulePath)) {
            return false;
        }

        await this.fileSystemAdapter.deleteDirectory(modulePath);
        return true;
    }

    /**
     * Convert domain entity to persistence format
     */
    _toPersistenceFormat(apiModule) {
        const obj = apiModule.toObject();
        const json = apiModule.toJSON();

        return {
            classFile: this._generateApiClass(apiModule),
            definitionFile: this._generateDefinitionFile(apiModule),
            definition: json,
            config: {
                name: obj.name,
                version: obj.version,
                authType: obj.apiConfig.authType
            },
            readme: this._generateReadme(apiModule)
        };
    }

    /**
     * Generate Api.js class file
     */
    _generateApiClass(apiModule) {
        const className = apiModule.name
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('');

        const obj = apiModule.toObject();

        return `const { ApiBase } = require('@friggframework/core');

/**
 * ${apiModule.displayName} API Client
 * ${apiModule.description || 'No description provided'}
 *
 * Base URL: ${obj.apiConfig.baseUrl || 'Not configured'}
 * Auth Type: ${obj.apiConfig.authType}
 */
class ${className}Api extends ApiBase {
    constructor(params) {
        super(params);
        this.baseUrl = '${obj.apiConfig.baseUrl || ''}';
        this.authType = '${obj.apiConfig.authType}';
${obj.entities.credential ? `        this.credential = params.credential;\n` : ''}    }

    static get Definition() {
        return require('./definition');
    }

    /**
     * Get authorization URL for OAuth2 flow
     */
    async getAuthorizationUri() {
        // TODO: Implement OAuth authorization URL
        return \`\${this.baseUrl}/oauth/authorize\`;
    }

    /**
     * Exchange authorization code for access token
     */
    async getTokenFromCode(code) {
        // TODO: Implement token exchange
        return await this.api.post('/oauth/token', {
            code,
            grant_type: 'authorization_code'
        });
    }

    /**
     * Set API credentials
     */
    async setCredential(credential) {
        this.credential = credential;

        // Set auth headers based on auth type
        if (this.authType === 'oauth2' && credential.accessToken) {
            this.setHeader('Authorization', \`Bearer \${credential.accessToken}\`);
        } else if (this.authType === 'api-key' && credential.apiKey) {
            this.setHeader('X-API-Key', credential.apiKey);
        }
    }

    /**
     * Test API connection
     */
    async testAuth() {
        // TODO: Implement connection test
        return await this.get('/user/me');
    }

${this._generateEndpointMethods(apiModule)}
    // TODO: Add your API methods here
}

module.exports = ${className}Api;
`;
    }

    /**
     * Generate endpoint methods
     */
    _generateEndpointMethods(apiModule) {
        if (Object.keys(apiModule.endpoints).length === 0) {
            return '';
        }

        return Object.entries(apiModule.endpoints).map(([name, config]) => {
            const method = config.method.toLowerCase();
            const params = config.parameters || [];
            const paramList = params.map(p => p.name).join(', ');

            return `    /**
     * ${config.description || name}
     */
    async ${name}(${paramList}) {
        return await this.${method}('${config.path}'${paramList ? `, {${paramList}}` : ''});
    }
`;
        }).join('\n');
    }

    /**
     * Generate Entity.js class file
     */
    _generateEntityClass(apiModule) {
        const className = apiModule.name
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('');

        const entities = Object.entries(apiModule.entities);
        const primaryEntity = entities[0]; // Use first entity as primary

        return `const { EntityBase } = require('@friggframework/core');

/**
 * ${apiModule.displayName} Entity
 * Database entity for storing ${apiModule.displayName} credentials and state
 */
class ${className}Entity extends EntityBase {
    static getName() {
        return '${primaryEntity[0]}';
    }

    static get Definition() {
        return {
            type: '${primaryEntity[0]}',
            fields: ${JSON.stringify(primaryEntity[1].fields || [], null, 12)}
        };
    }
}

module.exports = ${className}Entity;
`;
    }

    /**
     * Generate definition.js file
     */
    _generateDefinitionFile(apiModule) {
        const json = apiModule.toJSON();

        return `module.exports = ${JSON.stringify(json, null, 2)};
`;
    }

    /**
     * Generate README.md
     */
    _generateReadme(apiModule) {
        const obj = apiModule.toObject();

        return `# ${apiModule.displayName}

${apiModule.description || 'No description provided'}

## Configuration

**Base URL:** ${obj.apiConfig.baseUrl || 'Not configured'}
**Auth Type:** ${obj.apiConfig.authType}
**API Version:** ${obj.apiConfig.version || 'v1'}

## Required Credentials

${obj.credentials.length > 0 ? obj.credentials.map(c =>
`- **${c.name}** (\`${c.type}\`): ${c.description || 'No description'}${c.required ? ' (Required)' : ''}`
).join('\n') : 'No credentials required'}

## OAuth Scopes

${obj.scopes.length > 0 ? obj.scopes.map(s => `- ${s}`).join('\n') : 'No scopes required'}

## Entities

${Object.keys(obj.entities).length > 0 ? Object.entries(obj.entities).map(([name, config]) =>
`### ${config.label || name}

- Type: \`${config.type}\`
- Required: ${config.required ? 'Yes' : 'No'}
`).join('\n') : 'No entities defined'}

## Usage

\`\`\`javascript
const ${apiModule.name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}Api = require('./${apiModule.name}/Api');

const api = new ${apiModule.name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}Api({
    credential: myCredential
});

// Test authentication
await api.testAuth();
\`\`\`

## Development

1. Implement the API methods in \`Api.js\`
2. Add entity configuration in \`Entity.js\` if needed
3. Test with \`frigg start\`
`;
    }
}

module.exports = {FileSystemApiModuleRepository};
