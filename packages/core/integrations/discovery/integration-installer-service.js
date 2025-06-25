const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const { debug, error, info } = require('../../logs');

const execAsync = promisify(exec);

class IntegrationInstallerService {
    constructor(projectRoot) {
        this.projectRoot = projectRoot || process.cwd();
        this.packageJsonPath = path.join(this.projectRoot, 'package.json');
    }

    /**
     * Install an integration package
     * @param {string} packageName - NPM package name to install
     * @param {Object} options - Installation options
     * @returns {Promise<Object>} Installation result
     */
    async installIntegration(packageName, options = {}) {
        try {
            info(`Installing integration: ${packageName}`);

            // Validate package name
            if (!this.isValidPackageName(packageName)) {
                throw new Error('Invalid package name');
            }

            // Check if already installed
            const isInstalled = await this.isIntegrationInstalled(packageName);
            if (isInstalled && !options.force) {
                return {
                    success: true,
                    message: 'Integration already installed',
                    packageName,
                    alreadyInstalled: true
                };
            }

            // Run npm install
            const installResult = await this.runNpmInstall(packageName, options);

            // Update integration configuration
            await this.updateIntegrationConfig(packageName, options);

            // Run post-install hooks if any
            await this.runPostInstallHooks(packageName);

            return {
                success: true,
                message: 'Integration installed successfully',
                packageName,
                version: installResult.version,
                dependencies: installResult.dependencies
            };

        } catch (err) {
            error('Integration installation failed:', err);
            throw new Error(`Failed to install integration: ${err.message}`);
        }
    }

    /**
     * Uninstall an integration package
     * @param {string} packageName - NPM package name to uninstall
     * @returns {Promise<Object>} Uninstallation result
     */
    async uninstallIntegration(packageName) {
        try {
            info(`Uninstalling integration: ${packageName}`);

            // Check if installed
            const isInstalled = await this.isIntegrationInstalled(packageName);
            if (!isInstalled) {
                return {
                    success: true,
                    message: 'Integration not installed',
                    packageName
                };
            }

            // Run pre-uninstall hooks
            await this.runPreUninstallHooks(packageName);

            // Run npm uninstall
            const { stdout, stderr } = await execAsync(
                `npm uninstall ${packageName}`,
                { cwd: this.projectRoot }
            );

            if (stderr && !stderr.includes('npm WARN')) {
                throw new Error(stderr);
            }

            // Remove integration configuration
            await this.removeIntegrationConfig(packageName);

            return {
                success: true,
                message: 'Integration uninstalled successfully',
                packageName
            };

        } catch (err) {
            error('Integration uninstallation failed:', err);
            throw new Error(`Failed to uninstall integration: ${err.message}`);
        }
    }

    /**
     * Update an integration package to the latest version
     * @param {string} packageName - NPM package name to update
     * @returns {Promise<Object>} Update result
     */
    async updateIntegration(packageName) {
        try {
            info(`Updating integration: ${packageName}`);

            // Check if installed
            const isInstalled = await this.isIntegrationInstalled(packageName);
            if (!isInstalled) {
                throw new Error('Integration not installed');
            }

            // Get current version
            const currentVersion = await this.getInstalledVersion(packageName);

            // Run npm update
            const { stdout, stderr } = await execAsync(
                `npm update ${packageName}`,
                { cwd: this.projectRoot }
            );

            if (stderr && !stderr.includes('npm WARN')) {
                throw new Error(stderr);
            }

            // Get new version
            const newVersion = await this.getInstalledVersion(packageName);

            return {
                success: true,
                message: 'Integration updated successfully',
                packageName,
                previousVersion: currentVersion,
                currentVersion: newVersion,
                updated: currentVersion !== newVersion
            };

        } catch (err) {
            error('Integration update failed:', err);
            throw new Error(`Failed to update integration: ${err.message}`);
        }
    }

    /**
     * Get list of installed integrations
     * @returns {Promise<Array>} List of installed integrations
     */
    async getInstalledIntegrations() {
        try {
            const packageJson = await this.readPackageJson();
            const dependencies = {
                ...packageJson.dependencies,
                ...packageJson.devDependencies
            };

            const integrations = [];
            for (const [name, version] of Object.entries(dependencies)) {
                if (name.startsWith('@friggframework/api-module-')) {
                    integrations.push({
                        name,
                        version,
                        displayName: this.getDisplayName(name)
                    });
                }
            }

            return integrations;

        } catch (err) {
            error('Failed to get installed integrations:', err);
            throw new Error(`Failed to get installed integrations: ${err.message}`);
        }
    }

    /**
     * Check if an integration is installed
     * @param {string} packageName - Package name to check
     * @returns {Promise<boolean>}
     */
    async isIntegrationInstalled(packageName) {
        try {
            const packageJson = await this.readPackageJson();
            const dependencies = {
                ...packageJson.dependencies,
                ...packageJson.devDependencies
            };

            return packageName in dependencies;
        } catch (err) {
            return false;
        }
    }

    /**
     * Get installed version of a package
     * @param {string} packageName - Package name
     * @returns {Promise<string>} Version string
     */
    async getInstalledVersion(packageName) {
        try {
            const packageJson = await this.readPackageJson();
            const dependencies = {
                ...packageJson.dependencies,
                ...packageJson.devDependencies
            };

            return dependencies[packageName] || null;
        } catch (err) {
            return null;
        }
    }

    /**
     * Run npm install for a package
     * @param {string} packageName - Package name
     * @param {Object} options - Installation options
     * @returns {Promise<Object>} Installation details
     */
    async runNpmInstall(packageName, options = {}) {
        const saveFlag = options.saveDev ? '--save-dev' : '--save';
        const exactFlag = options.exact ? '--save-exact' : '';
        
        const command = `npm install ${packageName} ${saveFlag} ${exactFlag}`.trim();
        debug(`Running: ${command}`);

        const { stdout, stderr } = await execAsync(command, {
            cwd: this.projectRoot
        });

        if (stderr && !stderr.includes('npm WARN')) {
            throw new Error(stderr);
        }

        // Parse installation output for details
        const version = await this.getInstalledVersion(packageName);
        const dependencies = this.parseInstallOutput(stdout);

        return { version, dependencies };
    }

    /**
     * Update integration configuration after installation
     * @param {string} packageName - Package name
     * @param {Object} options - Configuration options
     */
    async updateIntegrationConfig(packageName, options = {}) {
        const configPath = path.join(this.projectRoot, 'frigg.config.json');
        
        try {
            let config = {};
            
            // Read existing config if it exists
            try {
                const configContent = await fs.readFile(configPath, 'utf8');
                config = JSON.parse(configContent);
            } catch (err) {
                // Config doesn't exist yet
            }

            // Initialize integrations array if needed
            if (!config.integrations) {
                config.integrations = [];
            }

            // Add integration if not already present
            const integrationName = packageName.replace('@friggframework/api-module-', '');
            if (!config.integrations.includes(integrationName)) {
                config.integrations.push(integrationName);
            }

            // Write updated config
            await fs.writeFile(
                configPath,
                JSON.stringify(config, null, 2),
                'utf8'
            );

            debug(`Updated frigg.config.json with ${integrationName}`);

        } catch (err) {
            error('Failed to update integration config:', err);
            // Non-fatal error, continue
        }
    }

    /**
     * Remove integration from configuration
     * @param {string} packageName - Package name
     */
    async removeIntegrationConfig(packageName) {
        const configPath = path.join(this.projectRoot, 'frigg.config.json');
        
        try {
            const configContent = await fs.readFile(configPath, 'utf8');
            const config = JSON.parse(configContent);

            if (config.integrations) {
                const integrationName = packageName.replace('@friggframework/api-module-', '');
                config.integrations = config.integrations.filter(
                    name => name !== integrationName
                );

                await fs.writeFile(
                    configPath,
                    JSON.stringify(config, null, 2),
                    'utf8'
                );

                debug(`Removed ${integrationName} from frigg.config.json`);
            }

        } catch (err) {
            // Config doesn't exist or is invalid, ignore
        }
    }

    /**
     * Run post-install hooks for an integration
     * @param {string} packageName - Package name
     */
    async runPostInstallHooks(packageName) {
        try {
            // Try to load the installed package
            const packagePath = require.resolve(packageName, {
                paths: [this.projectRoot]
            });
            
            const integration = require(packagePath);
            
            // Check if integration has post-install hook
            if (integration.postInstall && typeof integration.postInstall === 'function') {
                debug(`Running post-install hook for ${packageName}`);
                await integration.postInstall();
            }

        } catch (err) {
            // Package doesn't have post-install hook or couldn't be loaded
            debug(`No post-install hook for ${packageName}`);
        }
    }

    /**
     * Run pre-uninstall hooks for an integration
     * @param {string} packageName - Package name
     */
    async runPreUninstallHooks(packageName) {
        try {
            const packagePath = require.resolve(packageName, {
                paths: [this.projectRoot]
            });
            
            const integration = require(packagePath);
            
            if (integration.preUninstall && typeof integration.preUninstall === 'function') {
                debug(`Running pre-uninstall hook for ${packageName}`);
                await integration.preUninstall();
            }

        } catch (err) {
            debug(`No pre-uninstall hook for ${packageName}`);
        }
    }

    /**
     * Read package.json file
     * @returns {Promise<Object>} Package.json contents
     */
    async readPackageJson() {
        const content = await fs.readFile(this.packageJsonPath, 'utf8');
        return JSON.parse(content);
    }

    /**
     * Validate package name
     * @param {string} packageName - Package name to validate
     * @returns {boolean}
     */
    isValidPackageName(packageName) {
        // Basic validation for @friggframework packages
        const pattern = /^@friggframework\/api-module-[\w-]+$/;
        return pattern.test(packageName);
    }

    /**
     * Get display name from package name
     * @param {string} packageName - Package name
     * @returns {string} Display name
     */
    getDisplayName(packageName) {
        return packageName
            .replace('@friggframework/api-module-', '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    /**
     * Parse npm install output for dependency information
     * @param {string} output - NPM install output
     * @returns {Array} List of installed dependencies
     */
    parseInstallOutput(output) {
        const dependencies = [];
        const lines = output.split('\n');
        
        for (const line of lines) {
            if (line.includes('added') || line.includes('updated')) {
                // Extract dependency information from npm output
                // This is a simplified parser
                const match = line.match(/(\d+) packages?/);
                if (match) {
                    debug(`Installed/updated ${match[1]} packages`);
                }
            }
        }

        return dependencies;
    }
}

module.exports = IntegrationInstallerService;