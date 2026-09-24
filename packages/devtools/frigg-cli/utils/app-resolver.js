const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class AppResolver {
    constructor() {
        this.cache = new Map();
    }

    async resolveAppPath(options = {}) {
        const cacheKey = JSON.stringify(options);
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        let resolvedPath;

        // Priority 1: Explicit flags (--app-path, --config, --app)
        if (options.appPath || options.config || options.app) {
            const explicitPath = options.appPath || options.config || options.app;
            resolvedPath = await this.validateAndResolvePath(explicitPath);
            if (resolvedPath) {
                this.cache.set(cacheKey, resolvedPath);
                return resolvedPath;
            }
            throw new Error(`Invalid app path specified: ${explicitPath}`);
        }

        // Priority 2: Environment variable
        if (process.env.FRIGG_APP_PATH) {
            resolvedPath = await this.validateAndResolvePath(process.env.FRIGG_APP_PATH);
            if (resolvedPath) {
                this.cache.set(cacheKey, resolvedPath);
                return resolvedPath;
            }
            console.warn(`Warning: FRIGG_APP_PATH environment variable points to invalid path: ${process.env.FRIGG_APP_PATH}`);
        }

        // Priority 3: Current directory auto-detection (backward compatibility)
        resolvedPath = await this.autoDetectFriggApp();
        if (resolvedPath) {
            this.cache.set(cacheKey, resolvedPath);
            return resolvedPath;
        }

        // Priority 4: Search common development directories
        resolvedPath = await this.searchCommonDirectories();
        if (resolvedPath) {
            this.cache.set(cacheKey, resolvedPath);
            return resolvedPath;
        }

        throw new Error('No Frigg application found. Use --app-path to specify the application directory.');
    }

    async validateAndResolvePath(inputPath) {
        if (!inputPath) return null;

        // Handle different path formats
        let resolvedPath;
        if (inputPath.startsWith('~/')) {
            resolvedPath = path.join(os.homedir(), inputPath.slice(2));
        } else if (path.isAbsolute(inputPath)) {
            resolvedPath = inputPath;
        } else {
            resolvedPath = path.resolve(process.cwd(), inputPath);
        }

        try {
            const stats = await fs.stat(resolvedPath);
            if (!stats.isDirectory()) {
                // If it's a file, check if it's a config file and use its directory
                if (await this.isConfigFile(resolvedPath)) {
                    resolvedPath = path.dirname(resolvedPath);
                } else {
                    return null;
                }
            }

            // Validate that this is a Frigg application
            if (await this.isFriggApplication(resolvedPath)) {
                return resolvedPath;
            }
        } catch (error) {
            // Path doesn't exist or is not accessible
            return null;
        }

        return null;
    }

    async isConfigFile(filePath) {
        const basename = path.basename(filePath);
        const configFiles = [
            'frigg.config.js',
            'frigg.config.json',
            '.friggrc',
            '.friggrc.js',
            '.friggrc.json',
            'package.json'
        ];
        
        return configFiles.includes(basename);
    }

    async isFriggApplication(dirPath) {
        try {
            // Check for package.json with Frigg dependencies
            const packageJsonPath = path.join(dirPath, 'package.json');
            try {
                const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
                const packageJson = JSON.parse(packageJsonContent);
                
                // Check for @friggframework dependencies
                const deps = {
                    ...packageJson.dependencies,
                    ...packageJson.devDependencies,
                    ...packageJson.peerDependencies
                };
                
                if (Object.keys(deps).some(dep => dep.startsWith('@friggframework/'))) {
                    return true;
                }

                // Check for frigg scripts
                if (packageJson.scripts) {
                    const scriptNames = Object.keys(packageJson.scripts);
                    if (scriptNames.some(script => script.includes('frigg'))) {
                        return true;
                    }
                }
            } catch (error) {
                // package.json doesn't exist or is invalid, continue checking other indicators
            }

            // Check for Frigg configuration files
            const configFiles = [
                'frigg.config.js',
                'frigg.config.json',
                '.friggrc',
                '.friggrc.js',
                '.friggrc.json'
            ];

            for (const configFile of configFiles) {
                try {
                    await fs.access(path.join(dirPath, configFile));
                    return true;
                } catch (error) {
                    // File doesn't exist, continue
                }
            }

            // Check for Frigg-specific directories
            const friggDirectories = [
                '.frigg',
                'frigg-modules',
                'api-modules'
            ];

            for (const friggDir of friggDirectories) {
                try {
                    const dirStat = await fs.stat(path.join(dirPath, friggDir));
                    if (dirStat.isDirectory()) {
                        return true;
                    }
                } catch (error) {
                    // Directory doesn't exist, continue
                }
            }

            // Check for serverless.yml with Frigg references
            try {
                const serverlessPath = path.join(dirPath, 'serverless.yml');
                const serverlessContent = await fs.readFile(serverlessPath, 'utf8');
                if (serverlessContent.includes('frigg') || serverlessContent.includes('Frigg')) {
                    return true;
                }
            } catch (error) {
                // serverless.yml doesn't exist or can't be read
            }

            // Check for infrastructure.js (common in Frigg apps)
            try {
                await fs.access(path.join(dirPath, 'infrastructure.js'));
                return true;
            } catch (error) {
                // infrastructure.js doesn't exist
            }

            return false;
        } catch (error) {
            return false;
        }
    }

    async autoDetectFriggApp() {
        // Start from current directory and search up to 3 levels
        let currentDir = process.cwd();
        
        for (let i = 0; i < 3; i++) {
            if (await this.isFriggApplication(currentDir)) {
                return currentDir;
            }
            
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) {
                // Reached filesystem root
                break;
            }
            currentDir = parentDir;
        }

        return null;
    }

    async searchCommonDirectories() {
        const commonDirs = [
            path.join(os.homedir(), 'Documents'),
            path.join(os.homedir(), 'Projects'),
            path.join(os.homedir(), 'Development'),
            path.join(os.homedir(), 'dev'),
            path.join(os.homedir(), 'workspace')
        ];

        for (const baseDir of commonDirs) {
            try {
                const friggApp = await this.searchDirectoryRecursively(baseDir, 3);
                if (friggApp) {
                    return friggApp;
                }
            } catch (error) {
                // Directory doesn't exist or can't be accessed, continue
            }
        }

        return null;
    }

    async searchDirectoryRecursively(dirPath, maxDepth) {
        if (maxDepth <= 0) return null;

        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            // First check if current directory is a Frigg app
            if (await this.isFriggApplication(dirPath)) {
                return dirPath;
            }

            // Then search subdirectories
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                
                // Skip common directories that shouldn't contain Frigg apps
                const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];
                if (skipDirs.includes(entry.name)) continue;

                const subDirPath = path.join(dirPath, entry.name);
                const result = await this.searchDirectoryRecursively(subDirPath, maxDepth - 1);
                if (result) {
                    return result;
                }
            }
        } catch (error) {
            // Directory can't be read, skip
        }

        return null;
    }

    async loadAppConfig(appPath) {
        const configPaths = [
            path.join(appPath, 'frigg.config.js'),
            path.join(appPath, 'frigg.config.json'),
            path.join(appPath, '.friggrc.js'),
            path.join(appPath, '.friggrc.json'),
            path.join(appPath, '.friggrc')
        ];

        for (const configPath of configPaths) {
            try {
                const stats = await fs.stat(configPath);
                if (stats.isFile()) {
                    if (configPath.endsWith('.js')) {
                        delete require.cache[require.resolve(configPath)];
                        return require(configPath);
                    } else {
                        const content = await fs.readFile(configPath, 'utf8');
                        return JSON.parse(content);
                    }
                }
            } catch (error) {
                // Config file doesn't exist or can't be read, continue
            }
        }

        // Fallback to package.json frigg configuration
        try {
            const packageJsonPath = path.join(appPath, 'package.json');
            const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
            const packageJson = JSON.parse(packageJsonContent);
            
            if (packageJson.frigg) {
                return packageJson.frigg;
            }
        } catch (error) {
            // package.json doesn't exist or doesn't have frigg config
        }

        return {};
    }

    clearCache() {
        this.cache.clear();
    }
}

module.exports = { AppResolver };