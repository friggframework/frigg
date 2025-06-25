const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Handles template initialization for the frigg init command
 */
class TemplateHandler {
    constructor(targetPath, options = {}) {
        this.targetPath = targetPath;
        this.options = options;
        this.templatesDir = path.join(__dirname, '..', 'templates');
    }

    /**
     * Initialize a new Frigg backend project from template
     */
    async initializeBackendTemplate() {
        const templatePath = path.join(this.templatesDir, 'backend');
        
        if (!fs.existsSync(templatePath)) {
            throw new Error('Backend template not found. Please ensure the CLI is properly installed.');
        }

        // Create target directory if it doesn't exist
        await fs.ensureDir(this.targetPath);

        // Check if directory is empty
        const files = await fs.readdir(this.targetPath);
        if (files.length > 0 && !this.options.force) {
            throw new Error('Target directory is not empty. Use --force to override.');
        }

        console.log('🚀 Initializing new Frigg backend project...');

        // Copy template files
        await this.copyTemplateFiles(templatePath, this.targetPath);

        // Update package.json with project name
        await this.updatePackageJson();

        // Update serverless.yml with project name
        await this.updateServerlessConfig();

        // Initialize git if requested
        if (this.options.git !== false) {
            await this.initializeGit();
        }

        // Install dependencies if requested
        if (this.options.install !== false) {
            await this.installDependencies();
        }

        console.log('✅ Frigg backend project initialized successfully!');
        console.log('\nNext steps:');
        console.log(`  cd ${path.basename(this.targetPath)}`);
        if (this.options.install === false) {
            console.log('  npm install');
        }
        console.log('  npm run docker:start');
        console.log('  npm run backend-start');
        console.log('\nFor more information, check the README.md file.');
    }

    /**
     * Copy template files to target directory
     */
    async copyTemplateFiles(source, target) {
        await fs.copy(source, target, {
            overwrite: this.options.force || false,
            filter: (src) => {
                // Skip node_modules and other build artifacts
                const basename = path.basename(src);
                return !['node_modules', '.serverless', 'dist', 'build'].includes(basename);
            }
        });
    }

    /**
     * Update package.json with project-specific details
     */
    async updatePackageJson() {
        const packageJsonPath = path.join(this.targetPath, 'package.json');
        const packageJson = await fs.readJson(packageJsonPath);
        
        // Update package name based on directory name
        const projectName = path.basename(this.targetPath);
        packageJson.name = projectName;
        
        // Remove private flag for new projects
        delete packageJson.private;
        
        await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
    }

    /**
     * Update serverless.yml with project-specific details
     */
    async updateServerlessConfig() {
        const serverlessPath = path.join(this.targetPath, 'serverless.yml');
        let serverlessContent = await fs.readFile(serverlessPath, 'utf8');
        
        // Update service name based on directory name
        const projectName = path.basename(this.targetPath);
        serverlessContent = serverlessContent.replace(
            /^service: create-frigg-app$/m,
            `service: ${projectName}`
        );
        
        await fs.writeFile(serverlessPath, serverlessContent);
    }

    /**
     * Initialize git repository
     */
    async initializeGit() {
        try {
            console.log('📦 Initializing git repository...');
            execSync('git init', { cwd: this.targetPath, stdio: 'ignore' });
            execSync('git add .', { cwd: this.targetPath, stdio: 'ignore' });
            execSync('git commit -m "Initial commit from Frigg CLI"', { 
                cwd: this.targetPath, 
                stdio: 'ignore' 
            });
        } catch (error) {
            console.warn('⚠️  Git initialization failed. You can initialize git manually later.');
        }
    }

    /**
     * Install npm dependencies
     */
    async installDependencies() {
        console.log('📦 Installing dependencies...');
        execSync('npm install', { 
            cwd: this.targetPath, 
            stdio: 'inherit' 
        });
    }
}

module.exports = TemplateHandler;