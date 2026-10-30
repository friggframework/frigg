/**
 * Copyright (c) 2024 Frigg Integration Framework
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const chalk = require('chalk');

/**
 * Checks if a directory is a Frigg repository
 * @param {string} directory - Path to check
 * @returns {Promise<{isFriggRepo: boolean, repoInfo: object|null}>}
 */
async function isFriggRepository(directory) {
    try {
        const packageJsonPath = path.join(directory, 'package.json');
        
        // Check if package.json exists
        if (!fs.existsSync(packageJsonPath)) {
            return { isFriggRepo: false, repoInfo: null };
        }

        const packageJson = await fs.readJson(packageJsonPath);
        
        // Primary indicators of a Frigg repository
        const indicators = {
            hasFriggDependencies: false,
            hasBackendWorkspace: false,
            hasFrontendWorkspace: false,
            hasServerlessConfig: false,
            friggDependencies: []
        };

        // Check for @friggframework dependencies
        const allDeps = {
            ...packageJson.dependencies,
            ...packageJson.devDependencies,
            ...packageJson.peerDependencies
        };

        for (const dep in allDeps) {
            if (dep.startsWith('@friggframework/')) {
                indicators.hasFriggDependencies = true;
                indicators.friggDependencies.push(dep);
            }
        }

        // Check for Frigg-specific files
        const friggConfigFiles = [
            'frigg.config.js',
            'frigg.config.json',
            '.friggrc',
            '.friggrc.json',
            '.friggrc.js'
        ];
        
        indicators.hasFriggConfig = friggConfigFiles.some(file => 
            fs.existsSync(path.join(directory, file))
        );

        // Check for Frigg-specific directories
        const friggDirs = [
            '.frigg',
            'frigg-modules',
            'api-modules'
        ];
        
        indicators.hasFriggDirectories = friggDirs.some(dir => 
            fs.existsSync(path.join(directory, dir))
        );

        // Check for Frigg-specific scripts in package.json
        indicators.hasFriggScripts = false;
        if (packageJson.scripts) {
            const friggScriptPatterns = ['frigg', 'frigg-dev', 'frigg-build', 'frigg-deploy'];
            indicators.hasFriggScripts = Object.keys(packageJson.scripts).some(script =>
                friggScriptPatterns.some(pattern => script.includes(pattern)) ||
                Object.values(packageJson.scripts).some(cmd => 
                    typeof cmd === 'string' && cmd.includes('frigg ')
                )
            );
        }

        // Check for workspace structure
        if (packageJson.workspaces) {
            const workspaces = Array.isArray(packageJson.workspaces) 
                ? packageJson.workspaces 
                : packageJson.workspaces.packages || [];
            
            indicators.hasBackendWorkspace = workspaces.some(ws => 
                ws.includes('backend') || ws === 'backend'
            );
            indicators.hasFrontendWorkspace = workspaces.some(ws => 
                ws.includes('frontend') || ws === 'frontend'
            );
        }

        // Check for backend/serverless.yml
        const serverlessPath = path.join(directory, 'backend', 'serverless.yml');
        indicators.hasServerlessConfig = fs.existsSync(serverlessPath);

        // Check for individual frontend directories (React, Vue, etc.)
        const frontendDirs = ['frontend', 'react', 'vue', 'svelte', 'angular'];
        const existingFrontendDirs = frontendDirs.filter(dir => 
            fs.existsSync(path.join(directory, dir))
        );

        // Skip @friggframework packages (they're framework packages, not Frigg apps)
        if (packageJson.name && packageJson.name.startsWith('@friggframework/')) {
            return { isFriggRepo: false, repoInfo: null };
        }

        // Additional check for Zapier apps that shouldn't be detected as Frigg repos
        const isZapierApp = packageJson.name && (
            packageJson.name.includes('zapier-public') ||
            packageJson.name.includes('zapier-app') ||
            (packageJson.scripts && packageJson.scripts.zapier)
        );

        // Check for specific Frigg indicators in serverless.yml
        let hasFriggServerlessIndicators = false;
        if (indicators.hasServerlessConfig) {
            try {
                const serverlessContent = fs.readFileSync(serverlessPath, 'utf8');
                hasFriggServerlessIndicators = serverlessContent.includes('frigg') || 
                                               serverlessContent.includes('FriggHandler') ||
                                               serverlessContent.includes('@friggframework');
            } catch (error) {
                // Ignore read errors
            }
        }

        // A directory is considered a Frigg repo if it has:
        // 1. Frigg dependencies (MANDATORY - most reliable indicator) OR
        // 2. Frigg-specific configuration files OR
        // 3. Frigg-specific directories OR
        // 4. Frigg-specific scripts in package.json OR
        // 5. Serverless config with explicit Frigg references AND proper structure
        // 
        // For Zapier apps, we require explicit Frigg indicators
        const hasFriggIndicators = indicators.hasFriggDependencies || 
                                  indicators.hasFriggConfig || 
                                  indicators.hasFriggDirectories ||
                                  indicators.hasFriggScripts ||
                                  hasFriggServerlessIndicators;

        // Determine if it's a Frigg repository
        let isFriggRepo = false;
        
        if (isZapierApp) {
            // For Zapier apps, require explicit Frigg dependencies or config
            isFriggRepo = indicators.hasFriggDependencies || indicators.hasFriggConfig;
        } else {
            // For non-Zapier apps, any Frigg indicator is sufficient
            isFriggRepo = hasFriggIndicators;
        }

        // Additional validation for edge cases
        if (isZapierApp && !indicators.hasFriggDependencies && !indicators.hasFriggConfig) {
            return { isFriggRepo: false, repoInfo: null };
        }

        if (isFriggRepo) {
            return {
                isFriggRepo: true,
                repoInfo: {
                    name: packageJson.name || path.basename(directory),
                    path: directory,
                    version: packageJson.version,
                    framework: detectFramework(directory, existingFrontendDirs),
                    hasBackend: fs.existsSync(path.join(directory, 'backend')),
                    friggDependencies: indicators.friggDependencies,
                    workspaces: packageJson.workspaces,
                    hasFriggConfig: indicators.hasFriggConfig,
                    hasFriggDirectories: indicators.hasFriggDirectories,
                    isZapierApp: isZapierApp,
                    ...indicators
                }
            };
        }

        return { isFriggRepo: false, repoInfo: null };

    } catch (error) {
        return { isFriggRepo: false, repoInfo: null };
    }
}

/**
 * Detects the frontend framework used in the Frigg repository
 * @param {string} directory - Repository directory
 * @param {string[]} existingFrontendDirs - List of existing frontend directories
 * @returns {string} Framework name
 */
function detectFramework(directory, existingFrontendDirs) {
    // Check for framework-specific directories
    const frameworkDirs = {
        'react': 'React',
        'vue': 'Vue',
        'svelte': 'Svelte',
        'angular': 'Angular'
    };

    for (const dir of existingFrontendDirs) {
        if (frameworkDirs[dir]) {
            return frameworkDirs[dir];
        }
    }

    // Check frontend directory for framework indicators
    const frontendPath = path.join(directory, 'frontend');
    if (fs.existsSync(frontendPath)) {
        try {
            const frontendPackageJson = path.join(frontendPath, 'package.json');
            if (fs.existsSync(frontendPackageJson)) {
                const frontendPkg = fs.readJsonSync(frontendPackageJson);
                const deps = { ...frontendPkg.dependencies, ...frontendPkg.devDependencies };
                
                if (deps.react) return 'React';
                if (deps.vue) return 'Vue';
                if (deps.svelte) return 'Svelte';
                if (deps['@angular/core']) return 'Angular';
            }
        } catch (error) {
            // Ignore errors
        }
    }

    return 'Unknown';
}

/**
 * Searches for Frigg repositories in common locations
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Array of discovered repositories
 */
async function discoverFriggRepositories(options = {}) {
    const {
        searchPaths = [
            process.cwd(),
            path.join(os.homedir(), 'Documents'),
            path.join(os.homedir(), 'Projects'),
            path.join(os.homedir(), 'Development'),
            path.join(os.homedir(), 'dev'),
            path.join(os.homedir(), 'Code')
        ],
        maxDepth = 3,
        excludePatterns = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage']
    } = options;

    const discoveredRepos = [];
    const visited = new Set();

    for (const searchPath of searchPaths) {
        if (fs.existsSync(searchPath)) {
            await searchDirectory(searchPath, 0, maxDepth, excludePatterns, discoveredRepos, visited);
        }
    }

    // Remove duplicates and sort by name
    const uniqueRepos = Array.from(
        new Map(discoveredRepos.map(repo => [repo.path, repo])).values()
    );
    
    return uniqueRepos.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Recursively searches a directory for Frigg repositories
 */
async function searchDirectory(dirPath, currentDepth, maxDepth, excludePatterns, results, visited) {
    // Avoid infinite loops from symlinks
    const realPath = fs.realpathSync(dirPath);
    if (visited.has(realPath)) return;
    visited.add(realPath);

    if (currentDepth > maxDepth) return;

    try {
        // Check if current directory is a Frigg repo
        const { isFriggRepo, repoInfo } = await isFriggRepository(dirPath);
        if (isFriggRepo) {
            results.push(repoInfo);
            return; // Don't search inside Frigg repos
        }

        // Continue searching subdirectories
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const entryName = entry.name;
                
                // Skip excluded patterns
                if (excludePatterns.some(pattern => entryName.includes(pattern))) {
                    continue;
                }

                // Skip hidden directories except .git for workspace detection
                if (entryName.startsWith('.') && entryName !== '.git') {
                    continue;
                }

                const entryPath = path.join(dirPath, entryName);
                await searchDirectory(entryPath, currentDepth + 1, maxDepth, excludePatterns, results, visited);
            }
        }
    } catch (error) {
        // Silently skip directories we can't access
    }
}

/**
 * Gets the current directory's Frigg repository status
 * @returns {Promise<Object>} Current repository info
 */
async function getCurrentRepositoryInfo() {
    const currentDir = process.cwd();
    
    // Check current directory
    let { isFriggRepo, repoInfo } = await isFriggRepository(currentDir);
    
    if (isFriggRepo) {
        return { ...repoInfo, isCurrent: true };
    }

    // Check parent directories up to 3 levels
    let checkDir = currentDir;
    for (let i = 0; i < 3; i++) {
        const parentDir = path.dirname(checkDir);
        if (parentDir === checkDir) break; // Reached root
        
        const result = await isFriggRepository(parentDir);
        if (result.isFriggRepo) {
            return { ...result.repoInfo, isCurrent: false, currentSubPath: path.relative(parentDir, currentDir) };
        }
        checkDir = parentDir;
    }

    return null;
}

/**
 * Prompts user to select a repository from discovered repos
 * @param {Array} repositories - List of discovered repositories
 * @returns {Promise<Object|null>} Selected repository or null
 */
async function promptRepositorySelection(repositories) {
    if (repositories.length === 0) {
        console.log(chalk.yellow('No Frigg repositories found.'));
        console.log(chalk.gray('To create a new Frigg project, run: frigg init <project-name>'));
        return null;
    }

    if (repositories.length === 1) {
        console.log(chalk.green(`Found 1 Frigg repository: ${repositories[0].name}`));
        return repositories[0];
    }

    console.log(chalk.blue(`Found ${repositories.length} Frigg repositories:`));
    console.log();
    
    repositories.forEach((repo, index) => {
        const framework = repo.framework !== 'Unknown' ? chalk.gray(`(${repo.framework})`) : '';
        console.log(`  ${chalk.cyan((index + 1).toString().padStart(2))}. ${chalk.white(repo.name)} ${framework}`);
        console.log(`      ${chalk.gray(repo.path)}`);
    });

    console.log();
    
    // For now, return the first one. In a full implementation, you'd use a prompt library
    console.log(chalk.yellow('Auto-selecting first repository. Use interactive selection in future versions.'));
    return repositories[0];
}

/**
 * Formats repository information for display
 * @param {Object} repoInfo - Repository information
 * @returns {string} Formatted display string
 */
function formatRepositoryInfo(repoInfo) {
    const parts = [
        chalk.white(repoInfo.name),
        repoInfo.version ? chalk.gray(`v${repoInfo.version}`) : '',
        repoInfo.framework !== 'Unknown' ? chalk.blue(`[${repoInfo.framework}]`) : '',
        repoInfo.hasBackend ? chalk.green('[Backend]') : ''
    ].filter(Boolean);

    return parts.join(' ');
}

module.exports = {
    isFriggRepository,
    discoverFriggRepositories,
    getCurrentRepositoryInfo,
    promptRepositorySelection,
    formatRepositoryInfo,
    detectFramework
};