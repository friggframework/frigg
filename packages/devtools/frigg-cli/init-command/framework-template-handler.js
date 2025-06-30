const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { select, confirm } = require('@inquirer/prompts');
const { execSync } = require('child_process');

/**
 * Enhanced template handler that supports multiple frameworks
 */
class FrameworkTemplateHandler {
    constructor(targetPath, options = {}) {
        this.targetPath = targetPath;
        this.options = options;
        this.templatesDir = path.join(__dirname, '..', 'templates');
        this.frameworks = {
            react: {
                name: 'React',
                description: 'Modern React application with Vite',
                deps: ['react', 'react-dom', 'react-router-dom'],
                devDeps: ['@vitejs/plugin-react', 'vite', 'vitest'],
                startCommand: 'npm run dev',
                buildCommand: 'npm run build'
            },
            vue: {
                name: 'Vue 3',
                description: 'Vue 3 application with Composition API',
                deps: ['vue', 'vue-router', 'pinia'],
                devDeps: ['@vitejs/plugin-vue', 'vite', 'vitest'],
                startCommand: 'npm run dev',
                buildCommand: 'npm run build'
            },
            svelte: {
                name: 'Svelte/SvelteKit',
                description: 'SvelteKit application with modern features',
                deps: [],
                devDeps: ['@sveltejs/adapter-auto', '@sveltejs/kit', 'svelte'],
                startCommand: 'npm run dev',
                buildCommand: 'npm run build'
            },
            angular: {
                name: 'Angular',
                description: 'Angular application with standalone components',
                deps: ['@angular/core', '@angular/common', '@angular/router'],
                devDeps: ['@angular/cli', '@angular-devkit/build-angular'],
                startCommand: 'npm start',
                buildCommand: 'npm run build'
            }
        };
    }

    /**
     * Initialize a new Frigg application with framework selection
     */
    async initialize() {
        console.log(chalk.blue('🚀 Welcome to Frigg CLI'));
        console.log('Let\'s create a new Frigg application!\n');

        // Get framework choice
        const framework = await this.selectFramework();
        
        // Get project configuration
        const config = await this.getProjectConfiguration(framework);

        // Create project structure
        await this.createProject(framework, config);

        console.log(chalk.green('✅ Frigg application created successfully!'));
        this.displayNextSteps(framework, config);
    }

    /**
     * Framework selection prompt
     */
    async selectFramework() {
        if (this.options.framework) {
            const framework = this.options.framework.toLowerCase();
            if (this.frameworks[framework]) {
                return framework;
            } else {
                console.log(chalk.red(`❌ Unknown framework: ${this.options.framework}`));
                console.log(chalk.yellow('Available frameworks: ' + Object.keys(this.frameworks).join(', ')));
                process.exit(1);
            }
        }

        const framework = await select({
            message: 'Which frontend framework would you like to use?',
            choices: Object.entries(this.frameworks).map(([key, value]) => ({
                name: `${value.name} - ${value.description}`,
                value: key,
                description: value.description
            }))
        });

        return framework;
    }

    /**
     * Get additional project configuration
     */
    async getProjectConfiguration(framework) {
        const config = {};

        config.includeBackend = await confirm({
            message: 'Include a Frigg backend template?',
            default: true
        });

        config.installDependencies = await confirm({
            message: 'Install dependencies automatically?',
            default: true
        });

        config.initializeGit = await confirm({
            message: 'Initialize Git repository?',
            default: true
        });

        // Add framework-specific questions
        if (framework === 'angular') {
            config.useStandalone = await confirm({
                message: 'Use standalone components (recommended)?',
                default: true
            });
        }

        if (framework === 'vue') {
            config.stateManagement = await select({
                message: 'State management solution:',
                choices: [
                    { name: 'Pinia (recommended)', value: 'pinia' },
                    { name: 'Vuex', value: 'vuex' },
                    { name: 'None', value: 'none' }
                ],
                default: 'pinia'
            });
        }

        return config;
    }

    /**
     * Create the project structure
     */
    async createProject(framework, config) {
        console.log(chalk.blue(`📁 Creating ${this.frameworks[framework].name} project...`));

        // Ensure target directory exists and is safe
        await this.ensureSafeDirectory();

        // Create workspace structure if including backend
        if (config.includeBackend) {
            await this.createWorkspaceStructure();
            await this.copyBackendTemplate();
            await this.copyFrontendTemplate(framework);
        } else {
            await this.copyFrontendTemplate(framework);
        }

        // Copy shared configuration files
        await this.copySharedConfiguration();

        // Update project configuration
        await this.updateProjectConfiguration(framework, config);

        // Initialize git if requested
        if (config.initializeGit) {
            await this.initializeGit();
        }

        // Install dependencies if requested
        if (config.installDependencies) {
            await this.installDependencies(framework, config);
        }
    }

    /**
     * Ensure target directory is safe to use
     */
    async ensureSafeDirectory() {
        await fs.ensureDir(this.targetPath);
        
        const files = await fs.readdir(this.targetPath);
        if (files.length > 0 && !this.options.force) {
            throw new Error('Target directory is not empty. Use --force to override.');
        }
    }

    /**
     * Create workspace structure for full-stack projects
     */
    async createWorkspaceStructure() {
        const workspacePackageJson = {
            name: path.basename(this.targetPath),
            version: '0.1.0',
            private: true,
            workspaces: ['frontend', 'backend'],
            scripts: {
                'dev': 'concurrently "npm run dev --workspace=frontend" "npm run backend-start --workspace=backend"',
                'build': 'npm run build --workspaces',
                'test': 'npm test --workspaces',
                'lint': 'npm run lint --workspaces'
            },
            devDependencies: {
                'concurrently': '^8.2.2'
            }
        };

        await fs.writeJson(path.join(this.targetPath, 'package.json'), workspacePackageJson, { spaces: 2 });
    }

    /**
     * Copy frontend template
     */
    async copyFrontendTemplate(framework) {
        const templatePath = path.join(this.templatesDir, framework);
        const targetPath = this.targetPath;

        if (!await fs.pathExists(templatePath)) {
            throw new Error(`Template for ${framework} not found at ${templatePath}`);
        }

        console.log(chalk.blue(`📦 Copying ${framework} template...`));
        
        // For workspace projects, copy to frontend directory
        const frontendPath = this.options.includeBackend 
            ? path.join(targetPath, 'frontend')
            : targetPath;

        await this.copyTemplateFiles(templatePath, frontendPath);
    }

    /**
     * Copy backend template
     */
    async copyBackendTemplate() {
        const templatePath = path.join(this.templatesDir, 'backend');
        const backendPath = path.join(this.targetPath, 'backend');

        if (!await fs.pathExists(templatePath)) {
            throw new Error('Backend template not found');
        }

        console.log(chalk.blue('📦 Copying backend template...'));
        await this.copyTemplateFiles(templatePath, backendPath);
    }

    /**
     * Copy shared configuration files
     */
    async copySharedConfiguration() {
        const sharedPath = path.join(this.templatesDir, 'shared');
        
        if (await fs.pathExists(sharedPath)) {
            console.log(chalk.blue('⚙️  Copying shared configuration...'));
            
            // Copy gitignore
            const gitignorePath = path.join(sharedPath, 'gitignore');
            if (await fs.pathExists(gitignorePath)) {
                await fs.copy(gitignorePath, path.join(this.targetPath, '.gitignore'));
            }

            // Copy prettier config
            const prettierPath = path.join(sharedPath, 'prettier.config.js');
            if (await fs.pathExists(prettierPath)) {
                await fs.copy(prettierPath, path.join(this.targetPath, 'prettier.config.js'));
            }
        }
    }

    /**
     * Copy template files with filtering
     */
    async copyTemplateFiles(source, target) {
        await fs.copy(source, target, {
            overwrite: this.options.force || false,
            filter: (src) => {
                const basename = path.basename(src);
                const excluded = ['node_modules', '.git', 'dist', 'build', '.svelte-kit', '.angular'];
                return !excluded.includes(basename);
            }
        });
    }

    /**
     * Update project configuration based on selections
     */
    async updateProjectConfiguration(framework, config) {
        console.log(chalk.blue('⚙️  Updating project configuration...'));

        const projectName = path.basename(this.targetPath);

        // Update package.json files
        if (config.includeBackend) {
            // Update frontend package.json
            await this.updatePackageJson(
                path.join(this.targetPath, 'frontend', 'package.json'),
                `${projectName}-frontend`
            );
            
            // Update backend package.json
            await this.updatePackageJson(
                path.join(this.targetPath, 'backend', 'package.json'),
                `${projectName}-backend`
            );
        } else {
            // Update single package.json
            await this.updatePackageJson(
                path.join(this.targetPath, 'package.json'),
                projectName
            );
        }

        // Framework-specific updates
        await this.updateFrameworkSpecificConfiguration(framework, config);
    }

    /**
     * Update package.json with project name
     */
    async updatePackageJson(packageJsonPath, projectName) {
        if (await fs.pathExists(packageJsonPath)) {
            const packageJson = await fs.readJson(packageJsonPath);
            packageJson.name = projectName;
            await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
        }
    }

    /**
     * Framework-specific configuration updates
     */
    async updateFrameworkSpecificConfiguration(framework, config) {
        switch (framework) {
            case 'angular':
                await this.updateAngularConfiguration(config);
                break;
            case 'vue':
                await this.updateVueConfiguration(config);
                break;
            // Add other framework-specific updates as needed
        }
    }

    /**
     * Update Angular-specific configuration
     */
    async updateAngularConfiguration(config) {
        const angularJsonPath = path.join(this.targetPath, 'frontend', 'angular.json');
        
        if (await fs.pathExists(angularJsonPath)) {
            const angularJson = await fs.readJson(angularJsonPath);
            const projectName = path.basename(this.targetPath) + '-frontend';
            
            // Update project name in angular.json
            if (angularJson.projects['frigg-angular-app']) {
                angularJson.projects[projectName] = angularJson.projects['frigg-angular-app'];
                delete angularJson.projects['frigg-angular-app'];
            }
            
            await fs.writeJson(angularJsonPath, angularJson, { spaces: 2 });
        }
    }

    /**
     * Update Vue-specific configuration
     */
    async updateVueConfiguration(config) {
        // Add Vue-specific configuration updates
        // For example, updating state management setup based on config.stateManagement
    }

    /**
     * Initialize Git repository
     */
    async initializeGit() {
        try {
            console.log(chalk.blue('📦 Initializing Git repository...'));
            execSync('git init', { cwd: this.targetPath, stdio: 'ignore' });
            execSync('git add .', { cwd: this.targetPath, stdio: 'ignore' });
            execSync('git commit -m "Initial commit from Frigg CLI"', { 
                cwd: this.targetPath, 
                stdio: 'ignore' 
            });
        } catch (error) {
            console.warn(chalk.yellow('⚠️  Git initialization failed. You can initialize git manually later.'));
        }
    }

    /**
     * Install dependencies
     */
    async installDependencies(framework, config) {
        console.log(chalk.blue('📦 Installing dependencies...'));
        
        try {
            if (config.includeBackend) {
                // Install workspace dependencies
                execSync('npm install', { cwd: this.targetPath, stdio: 'inherit' });
            } else {
                // Install single project dependencies
                execSync('npm install', { cwd: this.targetPath, stdio: 'inherit' });
            }
        } catch (error) {
            console.warn(chalk.yellow('⚠️  Dependency installation failed. Run npm install manually.'));
        }
    }

    /**
     * Display next steps to the user
     */
    displayNextSteps(framework, config) {
        const projectName = path.basename(this.targetPath);
        const frameworkInfo = this.frameworks[framework];
        
        console.log('\n' + chalk.green('🎉 Success! Your Frigg application is ready.'));
        console.log('\nNext steps:');
        console.log(chalk.cyan(`  cd ${projectName}`));
        
        if (!config.installDependencies) {
            console.log(chalk.cyan('  npm install'));
        }
        
        if (config.includeBackend) {
            console.log('\nTo start development:');
            console.log(chalk.cyan('  npm run dev') + ' (starts both frontend and backend)');
            console.log('\nOr start them separately:');
            console.log(chalk.cyan('  npm run dev --workspace=frontend') + ' (frontend only)');
            console.log(chalk.cyan('  npm run backend-start --workspace=backend') + ' (backend only)');
        } else {
            console.log(chalk.cyan(`  ${frameworkInfo.startCommand}`) + ' (start development server)');
        }
        
        console.log('\nOther commands:');
        console.log(chalk.cyan('  npm run build') + ' (build for production)');
        console.log(chalk.cyan('  npm test') + ' (run tests)');
        console.log(chalk.cyan('  npm run lint') + ' (lint code)');
        
        console.log('\n' + chalk.blue('📚 Learn more:'));
        console.log('  Frigg Documentation: https://docs.frigg.so');
        console.log(`  ${frameworkInfo.name} Documentation: ${this.getFrameworkDocsUrl(framework)}`);
        
        console.log('\n' + chalk.green('Happy coding with Frigg! 🚀'));
    }

    /**
     * Get documentation URL for framework
     */
    getFrameworkDocsUrl(framework) {
        const urls = {
            react: 'https://react.dev',
            vue: 'https://vuejs.org',
            svelte: 'https://kit.svelte.dev',
            angular: 'https://angular.io'
        };
        return urls[framework] || 'https://docs.frigg.so';
    }
}

module.exports = FrameworkTemplateHandler;