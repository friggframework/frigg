import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import handlebars from 'handlebars';

/**
 * Template Engine Service for Code Generation
 * Handles template processing, file generation, and CLI integration
 */
class TemplateEngine {
    constructor() {
        this.templates = new Map();
        this.helpers = new Map();
        this.setupDefaultHelpers();
    }

    /**
     * Setup default Handlebars helpers
     */
    setupDefaultHelpers() {
        // String manipulation helpers
        handlebars.registerHelper('capitalize', (str) => {
            return str.charAt(0).toUpperCase() + str.slice(1);
        });

        handlebars.registerHelper('camelCase', (str) => {
            return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
        });

        handlebars.registerHelper('pascalCase', (str) => {
            return str.replace(/(^|-)([a-z])/g, (g) => g.replace('-', '').toUpperCase());
        });

        handlebars.registerHelper('kebabCase', (str) => {
            return str.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
        });

        handlebars.registerHelper('snakeCase', (str) => {
            return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
        });

        handlebars.registerHelper('upperCase', (str) => {
            return str.toUpperCase();
        });

        // Array helpers
        handlebars.registerHelper('each', handlebars.helpers.each);
        handlebars.registerHelper('join', (array, separator) => {
            return Array.isArray(array) ? array.join(separator || ', ') : '';
        });

        // Conditional helpers
        handlebars.registerHelper('if', handlebars.helpers.if);
        handlebars.registerHelper('unless', handlebars.helpers.unless);
        handlebars.registerHelper('eq', (a, b) => a === b);
        handlebars.registerHelper('ne', (a, b) => a !== b);
        handlebars.registerHelper('gt', (a, b) => a > b);
        handlebars.registerHelper('lt', (a, b) => a < b);

        // JSON helpers
        handlebars.registerHelper('json', (obj) => {
            return JSON.stringify(obj, null, 2);
        });

        handlebars.registerHelper('jsonInline', (obj) => {
            return JSON.stringify(obj);
        });

        // Date helpers
        handlebars.registerHelper('now', () => {
            return new Date().toISOString();
        });

        handlebars.registerHelper('year', () => {
            return new Date().getFullYear();
        });

        // Code generation specific helpers
        handlebars.registerHelper('indent', (text, spaces = 2) => {
            const indent = ' '.repeat(spaces);
            return text.split('\n').map(line => line.trim() ? indent + line : line).join('\n');
        });

        handlebars.registerHelper('comment', (text, style = 'js') => {
            switch (style) {
                case 'js':
                    return `// ${text}`;
                case 'block':
                    return `/*\n * ${text}\n */`;
                case 'jsx':
                    return `{/* ${text} */}`;
                case 'html':
                    return `<!-- ${text} -->`;
                default:
                    return `// ${text}`;
            }
        });
    }

    /**
     * Register a custom template
     */
    registerTemplate(name, template, metadata = {}) {
        this.templates.set(name, {
            template: handlebars.compile(template),
            raw: template,
            metadata
        });
    }

    /**
     * Register a custom helper
     */
    registerHelper(name, helper) {
        this.helpers.set(name, helper);
        handlebars.registerHelper(name, helper);
    }

    /**
     * Process template with data
     */
    processTemplate(templateName, data) {
        const template = this.templates.get(templateName);
        if (!template) {
            throw new Error(`Template '${templateName}' not found`);
        }

        try {
            return template.template(data);
        } catch (error) {
            throw new Error(`Template processing error: ${error.message}`);
        }
    }

    /**
     * Generate integration module
     */
    generateIntegration(config) {
        const {
            name,
            displayName,
            description,
            type,
            baseURL,
            authorizationURL,
            tokenURL,
            scope,
            apiEndpoints = [],
            entitySchema = []
        } = config;

        const className = this.pascalCase(name);
        const authFields = this.getAuthFields(type);
        const allEntityFields = [...authFields, ...entitySchema, { 
            name: 'user_id', 
            label: 'User ID', 
            type: 'string', 
            required: true 
        }];

        const data = {
            name,
            displayName,
            description,
            type,
            className,
            baseURL,
            authorizationURL,
            tokenURL,
            scope,
            apiEndpoints,
            entitySchema: allEntityFields,
            authFields,
            hasOAuth2: type === 'oauth2',
            hasApiKey: type === 'api',
            hasBasicAuth: type === 'basic-auth'
        };

        const integrationCode = this.generateIntegrationCode(data);
        const testCode = this.generateTestCode(data);
        const packageJson = this.generatePackageJson(data);
        const readme = this.generateReadme(data);

        return {
            files: [
                { name: 'index.js', content: integrationCode },
                { name: '__tests__/index.test.js', content: testCode },
                { name: 'package.json', content: packageJson },
                { name: 'README.md', content: readme }
            ],
            metadata: {
                name,
                className,
                type,
                generatedAt: new Date().toISOString()
            }
        };
    }

    /**
     * Generate API endpoints
     */
    generateAPIEndpoints(config) {
        const { name, description, baseURL, version, authentication, endpoints = [] } = config;

        const data = {
            name,
            description,
            baseURL,
            version,
            authentication,
            endpoints,
            serviceName: this.pascalCase(name) + 'Service',
            routerName: this.camelCase(name) + 'Router'
        };

        const routerCode = this.generateRouterCode(data);
        const serviceCode = this.generateServiceCode(data);
        const openApiSpec = this.generateOpenAPISpec(data);
        const readme = this.generateAPIReadme(data);

        return {
            files: [
                { name: 'router.js', content: routerCode },
                { name: 'service.js', content: serviceCode },
                { name: 'openapi.json', content: openApiSpec },
                { name: 'README.md', content: readme }
            ],
            metadata: {
                name,
                type: 'api-endpoints',
                endpointCount: endpoints.length,
                generatedAt: new Date().toISOString()
            }
        };
    }

    /**
     * Generate project scaffold
     */
    generateProjectScaffold(config) {
        const {
            name,
            description,
            template,
            database,
            integrations = [],
            features = {},
            deployment = {}
        } = config;

        const data = {
            name,
            description,
            template,
            database,
            integrations,
            features,
            deployment,
            year: new Date().getFullYear()
        };

        const files = [];

        // Generate package.json
        files.push({
            name: 'package.json',
            content: this.generateScaffoldPackageJson(data)
        });

        // Generate main app file
        files.push({
            name: 'app.js',
            content: this.generateAppJs(data)
        });

        // Generate README
        files.push({
            name: 'README.md',
            content: this.generateScaffoldReadme(data)
        });

        // Generate environment files
        files.push({
            name: '.env.example',
            content: this.generateEnvExample(data)
        });

        // Generate serverless.yml if serverless template
        if (template === 'serverless') {
            files.push({
                name: 'serverless.yml',
                content: this.generateServerlessYml(data)
            });
        }

        // Generate Docker files if enabled
        if (features.docker) {
            files.push({
                name: 'Dockerfile',
                content: this.generateDockerfile(data)
            });
            files.push({
                name: 'docker-compose.yml',
                content: this.generateDockerCompose(data)
            });
        }

        // Generate CI configuration if enabled
        if (features.ci) {
            files.push({
                name: '.github/workflows/ci.yml',
                content: this.generateCIConfig(data)
            });
        }

        return {
            files,
            metadata: {
                name,
                template,
                type: 'project-scaffold',
                integrationCount: integrations.length,
                generatedAt: new Date().toISOString()
            }
        };
    }

    /**
     * Write generated files to filesystem
     */
    async writeFiles(files, outputDir) {
        await fs.ensureDir(outputDir);
        const writtenFiles = [];

        for (const file of files) {
            const filePath = path.join(outputDir, file.name);
            await fs.ensureDir(path.dirname(filePath));
            await fs.writeFile(filePath, file.content, 'utf8');
            writtenFiles.push(filePath);
        }

        return writtenFiles;
    }

    /**
     * Execute Frigg CLI commands
     */
    async executeFriggCommand(command, args = [], cwd = process.cwd()) {
        return new Promise((resolve, reject) => {
            const friggCli = path.join(__dirname, '../../../frigg-cli/index.js');
            const child = spawn('node', [friggCli, command, ...args], {
                cwd,
                stdio: 'pipe'
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                if (code === 0) {
                    resolve({ stdout, stderr, code });
                } else {
                    reject(new Error(`Frigg CLI command failed: ${stderr || stdout}`));
                }
            });

            child.on('error', reject);
        });
    }

    /**
     * Generate and install integration using CLI
     */
    async generateAndInstallIntegration(config, projectPath) {
        try {
            // Generate integration files
            const result = this.generateIntegration(config);
            
            // Create integration directory
            const integrationDir = path.join(projectPath, 'src', 'integrations', config.name);
            const writtenFiles = await this.writeFiles(result.files, integrationDir);

            // Use CLI to install the integration
            await this.executeFriggCommand('install', [config.name], projectPath);

            return {
                success: true,
                files: writtenFiles,
                metadata: result.metadata
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Helper methods for code generation
    getAuthFields(type) {
        const authFields = {
            api: [
                { name: 'api_key', label: 'API Key', type: 'string', required: true, encrypted: false }
            ],
            oauth2: [
                { name: 'access_token', label: 'Access Token', type: 'string', required: true, encrypted: false },
                { name: 'refresh_token', label: 'Refresh Token', type: 'string', required: false, encrypted: false },
                { name: 'expires_at', label: 'Expires At', type: 'date', required: false, encrypted: false },
                { name: 'scope', label: 'Scope', type: 'string', required: false, encrypted: false }
            ],
            'basic-auth': [
                { name: 'username', label: 'Username', type: 'string', required: true, encrypted: false },
                { name: 'password', label: 'Password', type: 'string', required: true, encrypted: true }
            ],
            oauth1: [
                { name: 'oauth_token', label: 'OAuth Token', type: 'string', required: true, encrypted: false },
                { name: 'oauth_token_secret', label: 'OAuth Token Secret', type: 'string', required: true, encrypted: true }
            ]
        };

        return authFields[type] || [];
    }

    pascalCase(str) {
        return str.replace(/(^|-)([a-z])/g, (g) => g.replace('-', '').toUpperCase());
    }

    camelCase(str) {
        return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    }

    // Code generation methods (implementations would go here)
    generateIntegrationCode(data) {
        // Implementation for integration code generation
        // This would use the template patterns from the CLI
        return `// Generated integration code for ${data.name}`;
    }

    generateTestCode(data) {
        // Implementation for test code generation
        return `// Generated test code for ${data.name}`;
    }

    generatePackageJson(data) {
        // Implementation for package.json generation
        return JSON.stringify({
            name: `@friggframework/${data.name}`,
            version: '0.1.0',
            description: data.description
        }, null, 2);
    }

    generateReadme(data) {
        // Implementation for README generation
        return `# ${data.displayName}\n\n${data.description}`;
    }

    generateRouterCode(data) {
        // Implementation for router code generation
        return `// Generated router code for ${data.name}`;
    }

    generateServiceCode(data) {
        // Implementation for service code generation
        return `// Generated service code for ${data.name}`;
    }

    generateOpenAPISpec(data) {
        // Implementation for OpenAPI spec generation
        return JSON.stringify({
            openapi: '3.0.0',
            info: {
                title: data.name,
                version: data.version
            }
        }, null, 2);
    }

    generateAPIReadme(data) {
        // Implementation for API README generation
        return `# ${data.name} API\n\n${data.description}`;
    }

    generateScaffoldPackageJson(data) {
        // Implementation for scaffold package.json generation
        return JSON.stringify({
            name: data.name,
            version: '1.0.0',
            description: data.description
        }, null, 2);
    }

    generateAppJs(data) {
        // Implementation for app.js generation
        return `// Generated app.js for ${data.name}`;
    }

    generateScaffoldReadme(data) {
        // Implementation for scaffold README generation
        return `# ${data.name}\n\n${data.description}`;
    }

    generateEnvExample(data) {
        // Implementation for .env.example generation
        return `# Environment variables for ${data.name}`;
    }

    generateServerlessYml(data) {
        // Implementation for serverless.yml generation
        return `service: ${data.name}`;
    }

    generateDockerfile(data) {
        // Implementation for Dockerfile generation
        return `FROM node:18-alpine`;
    }

    generateDockerCompose(data) {
        // Implementation for docker-compose.yml generation
        return `version: '3.8'`;
    }

    generateCIConfig(data) {
        // Implementation for CI configuration generation
        return `name: CI`;
    }
}

export default TemplateEngine;