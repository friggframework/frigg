const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { select, confirm } = require('@inquirer/prompts');
const { execSync } = require('child_process');
const spawn = require('cross-spawn');

/**
 * Backend-first template handler that treats frontend as optional demonstration
 */
class BackendFirstHandler {
    constructor(targetPath, options = {}) {
        this.targetPath = targetPath;
        this.appName = path.basename(targetPath);
        this.options = options;
        this.templatesDir = path.join(__dirname, '..', 'templates');
    }

    /**
     * Initialize a new Frigg application
     */
    async initialize() {
        console.log(chalk.blue('🚀 Welcome to Frigg - Integration Framework'));
        console.log(chalk.gray('Creating a new Frigg backend application...\n'));

        // Get deployment mode
        const deploymentMode = await this.selectDeploymentMode();
        
        // Get project configuration
        const config = await this.getProjectConfiguration(deploymentMode);

        // Create project structure
        await this.createProject(deploymentMode, config);

        console.log(chalk.green('\n✅ Frigg application created successfully!'));
        this.displayNextSteps(deploymentMode, config);
    }

    /**
     * Select deployment mode
     */
    async selectDeploymentMode() {
        if (this.options.mode) {
            return this.options.mode;
        }

        const mode = await select({
            message: 'How will you deploy this Frigg application?',
            choices: [
                {
                    name: 'Embedded - Integrate into existing application',
                    value: 'embedded',
                    description: 'Add Frigg as a library to your existing backend'
                },
                {
                    name: 'Standalone - Deploy as separate service',
                    value: 'standalone',
                    description: 'Run Frigg as an independent microservice'
                }
            ],
            default: 'standalone'
        });

        return mode;
    }

    /**
     * Get project configuration based on deployment mode
     */
    async getProjectConfiguration(deploymentMode) {
        const config = { deploymentMode };

        // Ask about demo frontend only if not explicitly disabled
        if (this.options.frontend !== false) {
            config.includeDemoFrontend = await confirm({
                message: 'Include a demo frontend to showcase integration capabilities?',
                default: false
            });

            if (config.includeDemoFrontend) {
                console.log(chalk.yellow('\n📝 Note: The demo frontend is for demonstration purposes only.'));
                console.log(chalk.yellow('   For production, integrate Frigg into your existing application'));
                console.log(chalk.yellow('   or use "frigg ui" for development and management.\n'));

                config.frontendFramework = await select({
                    message: 'Which framework for the demo frontend?',
                    choices: [
                        { name: 'React - Modern React with Vite', value: 'react' },
                        { name: 'Vue 3 - Vue with Composition API', value: 'vue' },
                        { name: 'Svelte - SvelteKit application', value: 'svelte' },
                        { name: 'Angular - Angular with standalone components', value: 'angular' }
                    ]
                });

                config.demoAuthMode = await select({
                    message: 'Demo authentication mode:',
                    choices: [
                        { 
                            name: 'Mock Login - Simple username/password for demo',
                            value: 'mock',
                            description: 'Basic auth for demonstration'
                        },
                        {
                            name: 'API Credentials - Use your app\'s actual auth',
                            value: 'real',
                            description: 'Configure with your authentication system'
                        }
                    ],
                    default: 'mock'
                });
            }
        }

        // Serverless configuration for standalone mode
        if (deploymentMode === 'standalone') {
            config.serverlessProvider = await select({
                message: 'Which cloud provider will you use?',
                choices: [
                    { name: 'AWS Lambda', value: 'aws' },
                    { name: 'Local Development Only', value: 'local' }
                ],
                default: 'aws'
            });
        }

        config.installDependencies = await confirm({
            message: 'Install dependencies now?',
            default: true
        });

        config.initializeGit = await confirm({
            message: 'Initialize Git repository?',
            default: true
        });

        return config;
    }

    /**
     * Create the project structure
     */
    async createProject(deploymentMode, config) {
        console.log(chalk.blue('\n📁 Creating Frigg backend application...'));

        // Ensure target directory exists and is safe
        await this.ensureSafeDirectory();

        if (deploymentMode === 'standalone') {
            await this.createStandaloneProject(config);
        } else {
            await this.createEmbeddedProject(config);
        }

        // Initialize git if requested
        if (config.initializeGit) {
            await this.initializeGit();
        }

        // Install dependencies if requested
        if (config.installDependencies) {
            await this.installDependencies(config);
        }
    }

    /**
     * Create standalone Frigg service
     */
    async createStandaloneProject(config) {
        // Copy backend template
        const backendTemplate = path.join(this.templatesDir, 'backend');
        await fs.copy(backendTemplate, this.targetPath);

        // Create package.json for standalone mode
        const packageJson = {
            name: this.appName,
            version: '0.1.0',
            private: true,
            scripts: {
                "backend-start": "node infrastructure.js start",
                "start": "npm run backend-start",
                "build": "node infrastructure.js package",
                "deploy": "node infrastructure.js deploy",
                "test": "jest"
            },
            dependencies: {
                "@friggframework/core": "^2.0.0"
            }
        };

        // Add demo frontend if requested
        if (config.includeDemoFrontend) {
            packageJson.workspaces = ['backend', 'frontend'];
            packageJson.scripts['dev'] = 'concurrently "npm run backend-start" "npm run frontend:dev"';
            packageJson.scripts['frontend:dev'] = 'cd frontend && npm run dev';
            
            await this.createDemoFrontend(config);
        }

        await fs.writeJSON(
            path.join(this.targetPath, 'package.json'),
            packageJson,
            { spaces: 2 }
        );

        // Update serverless.yml based on provider
        if (config.serverlessProvider === 'aws') {
            await this.configureAWSServerless();
        }
    }

    /**
     * Create embedded Frigg setup
     */
    async createEmbeddedProject(config) {
        console.log(chalk.blue('Creating embedded Frigg setup...'));
        
        // Create a minimal setup for embedding
        const setupDir = path.join(this.targetPath, 'frigg-integration');
        await fs.ensureDir(setupDir);

        // Copy essential files
        const essentialFiles = ['index.js', 'app-definition.js'];
        for (const file of essentialFiles) {
            const src = path.join(this.templatesDir, 'backend', file);
            const dest = path.join(setupDir, file);
            if (await fs.pathExists(src)) {
                await fs.copy(src, dest);
            }
        }

        // Create integration guide
        const integrationGuide = `# Frigg Integration Guide

## Installation

Add Frigg to your existing project:

\`\`\`bash
npm install @friggframework/core
\`\`\`

## Integration Steps

1. Copy the files from \`frigg-integration/\` to your backend
2. Import and initialize Frigg in your application:

\`\`\`javascript
const { createFriggBackend } = require('@friggframework/core');
const appDefinition = require('./app-definition');

// In your Express app or serverless handler
const friggRouter = await createFriggBackend(appDefinition);
app.use('/api/frigg', friggRouter);
\`\`\`

3. Configure your environment variables
4. Deploy your application

## Development

Use \`frigg ui\` to manage your integrations during development.
`;

        await fs.writeFile(
            path.join(this.targetPath, 'FRIGG_INTEGRATION.md'),
            integrationGuide
        );

        // Add package.json with Frigg dependency
        const packageJson = {
            name: `${this.appName}-frigg-integration`,
            version: '0.1.0',
            private: true,
            dependencies: {
                "@friggframework/core": "^2.0.0"
            }
        };

        await fs.writeJSON(
            path.join(setupDir, 'package.json'),
            packageJson,
            { spaces: 2 }
        );
    }

    /**
     * Create demo frontend
     */
    async createDemoFrontend(config) {
        console.log(chalk.blue('Creating demo frontend...'));
        
        const frontendDir = path.join(this.targetPath, 'frontend');
        await fs.ensureDir(frontendDir);

        // Copy framework-specific template
        const frameworkTemplate = path.join(this.templatesDir, config.frontendFramework);
        if (await fs.pathExists(frameworkTemplate)) {
            await fs.copy(frameworkTemplate, frontendDir);
        }

        // Add demo auth configuration
        if (config.demoAuthMode === 'mock') {
            await this.addMockAuth(frontendDir, config.frontendFramework);
        }

        // Add demo notice to README
        const demoNotice = `# Frigg Demo Frontend

> ⚠️ **This is a demonstration frontend only!**
> 
> This frontend showcases how to integrate Frigg into your application.
> For production use, integrate Frigg into your existing application.
>
> For development and management, use \`frigg ui\` instead.

## Purpose

This demo shows:
- How to authenticate with Frigg
- How to display available integrations
- How to handle OAuth flows
- How to manage user connections

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Production Integration

To integrate Frigg into your production application:
1. Review the API calls in \`src/services/frigg.js\`
2. Copy the relevant components to your application
3. Adapt the authentication to your system
4. Style according to your design system
`;

        await fs.writeFile(
            path.join(frontendDir, 'README.md'),
            demoNotice
        );
    }

    /**
     * Add mock authentication to demo
     */
    async addMockAuth(frontendDir, framework) {
        const mockAuthConfig = {
            users: [
                { username: 'demo', password: 'demo', name: 'Demo User' }
            ],
            message: 'Use demo/demo to login'
        };

        await fs.writeJSON(
            path.join(frontendDir, 'mock-auth.json'),
            mockAuthConfig,
            { spaces: 2 }
        );
    }

    /**
     * Ensure target directory is safe
     */
    async ensureSafeDirectory() {
        await fs.ensureDir(this.targetPath);
        
        const files = await fs.readdir(this.targetPath);
        const allowedFiles = ['.git', '.gitignore', 'README.md', '.DS_Store'];
        const conflictingFiles = files.filter(f => !allowedFiles.includes(f));
        
        if (conflictingFiles.length > 0 && !this.options.force) {
            console.log(chalk.red('\n❌ Directory is not empty!'));
            console.log(chalk.yellow('Found files:'), conflictingFiles.join(', '));
            console.log(chalk.gray('Use --force to override\n'));
            throw new Error('Directory not empty');
        }
    }

    /**
     * Configure AWS serverless
     */
    async configureAWSServerless() {
        // Update serverless.yml for AWS
        const serverlessPath = path.join(this.targetPath, 'serverless.yml');
        if (await fs.pathExists(serverlessPath)) {
            // Keep existing AWS configuration
            console.log(chalk.gray('AWS Lambda configuration ready'));
        }
    }

    /**
     * Initialize git repository
     */
    async initializeGit() {
        try {
            execSync('git init', { cwd: this.targetPath, stdio: 'ignore' });
            execSync('git add -A', { cwd: this.targetPath, stdio: 'ignore' });
            execSync('git commit -m "Initial commit from Frigg CLI"', {
                cwd: this.targetPath,
                stdio: 'ignore'
            });
            console.log(chalk.gray('Git repository initialized'));
        } catch (e) {
            // Git init failed, not critical
        }
    }

    /**
     * Install dependencies
     */
    async installDependencies(config) {
        console.log(chalk.blue('\n📦 Installing dependencies...'));
        
        const useYarn = this.isUsingYarn();
        const command = useYarn ? 'yarn' : 'npm';
        const args = useYarn ? [] : ['install'];

        const proc = spawn.sync(command, args, {
            cwd: this.targetPath,
            stdio: 'inherit'
        });

        if (proc.status !== 0) {
            console.log(chalk.yellow('\n⚠️  Dependency installation failed'));
            console.log(chalk.gray(`You can install manually with: ${command} install`));
        }
    }

    /**
     * Check if yarn is being used
     */
    isUsingYarn() {
        return (process.env.npm_config_user_agent || '').indexOf('yarn') === 0;
    }

    /**
     * Display next steps
     */
    displayNextSteps(deploymentMode, config) {
        const relativePath = path.relative(process.cwd(), this.targetPath);
        const cdPath = relativePath || '.';

        console.log(chalk.bold('\n📋 Next Steps:\n'));

        console.log(`1. Navigate to your project:`);
        console.log(chalk.cyan(`   cd ${cdPath}\n`));

        if (deploymentMode === 'standalone') {
            console.log(`2. Start the development server:`);
            console.log(chalk.cyan(`   npm start\n`));

            console.log(`3. Open the Frigg UI for development:`);
            console.log(chalk.cyan(`   frigg ui\n`));

            if (config.serverlessProvider === 'aws') {
                console.log(`4. Deploy to AWS Lambda:`);
                console.log(chalk.cyan(`   npm run deploy\n`));
            }
        } else {
            console.log(`2. Follow the integration guide:`);
            console.log(chalk.cyan(`   cat FRIGG_INTEGRATION.md\n`));

            console.log(`3. Install Frigg in your main project:`);
            console.log(chalk.cyan(`   npm install @friggframework/core\n`));

            console.log(`4. Use Frigg UI for development:`);
            console.log(chalk.cyan(`   frigg ui\n`));
        }

        if (config.includeDemoFrontend) {
            console.log(chalk.yellow('\n⚠️  Demo Frontend:'));
            console.log(chalk.gray('   The included frontend is for demonstration only.'));
            console.log(chalk.gray('   See frontend/README.md for integration guidance.'));
        }

        console.log(chalk.green('\n🎉 Happy integrating with Frigg!\n'));
        console.log(chalk.gray('Documentation: https://docs.frigg.dev'));
        console.log(chalk.gray('Support: https://github.com/friggframework/frigg/issues'));
    }
}

module.exports = BackendFirstHandler;