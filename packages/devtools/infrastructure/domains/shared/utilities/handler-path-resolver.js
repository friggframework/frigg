/**
 * Handler Path Resolver Utility
 * 
 * Utility Layer - Hexagonal Architecture
 * 
 * Handles Lambda handler path resolution for offline mode compatibility.
 * In offline mode, handler paths need to be relative to the working directory
 * rather than absolute paths to node_modules.
 */

const path = require('path');
const fs = require('fs');

/**
 * Find node_modules path for offline mode handler path resolution
 * 
 * Searches upward from current directory to locate node_modules directory
 * using multiple fallback strategies.
 * 
 * @returns {string} Path to node_modules directory
 */
function findNodeModulesPath() {
    try {
        let currentDir = process.cwd();
        let nodeModulesPath = null;

        // Strategy 1: Search upward through directory tree
        for (let i = 0; i < 5; i++) {
            const potentialPath = path.join(currentDir, 'node_modules');
            if (fs.existsSync(potentialPath)) {
                nodeModulesPath = potentialPath;
                console.log(
                    `Found node_modules at: ${nodeModulesPath} (method 1)`
                );
                break;
            }
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) break;
            currentDir = parentDir;
        }

        // Strategy 2: Use npm root command
        if (!nodeModulesPath) {
            try {
                const { execSync } = require('node:child_process');
                const npmRoot = execSync('npm root', {
                    encoding: 'utf8',
                }).trim();
                if (fs.existsSync(npmRoot)) {
                    nodeModulesPath = npmRoot;
                    console.log(
                        `Found node_modules at: ${nodeModulesPath} (method 2)`
                    );
                }
            } catch (npmError) {
                console.error('Error executing npm root:', npmError);
            }
        }

        // Strategy 3: Search from package.json locations
        if (!nodeModulesPath) {
            currentDir = process.cwd();
            for (let i = 0; i < 5; i++) {
                const packageJsonPath = path.join(currentDir, 'package.json');
                if (fs.existsSync(packageJsonPath)) {
                    const potentialNodeModules = path.join(
                        currentDir,
                        'node_modules'
                    );
                    if (fs.existsSync(potentialNodeModules)) {
                        nodeModulesPath = potentialNodeModules;
                        console.log(
                            `Found node_modules at: ${nodeModulesPath} (method 3)`
                        );
                        break;
                    }
                }
                const parentDir = path.dirname(currentDir);
                if (parentDir === currentDir) break;
                currentDir = parentDir;
            }
        }

        if (nodeModulesPath) {
            return nodeModulesPath;
        }

        // Fallback: Assume parent directory
        console.warn(
            'Could not find node_modules path, falling back to default'
        );
        return path.resolve(process.cwd(), '../node_modules');
    } catch (error) {
        console.error('Error finding node_modules path:', error);
        return path.resolve(process.cwd(), '../node_modules');
    }
}

/**
 * Modify handler paths for offline mode
 * 
 * In serverless-offline mode, handler paths need to be relative
 * to the current working directory rather than using absolute
 * node_modules paths.
 * 
 * @param {Object} functions - Serverless functions configuration
 * @returns {Object} Functions with modified handler paths
 */
function modifyHandlerPaths(functions) {
    const isOffline = process.argv.includes('offline');
    console.log('isOffline', isOffline);

    if (!isOffline) {
        console.log('Not in offline mode, skipping handler path modification');
        // Return shallow copy to prevent mutations (DDD immutability principle)
        return { ...functions };
    }

    // In offline mode, don't modify the handler paths at all
    // serverless-offline will resolve node_modules paths from the working directory
    console.log('Offline mode detected - keeping original handler paths for serverless-offline');

    // Return deep copy to prevent mutations (DDD immutability principle)
    return Object.entries(functions).reduce((acc, [key, value]) => {
        acc[key] = { ...value };
        return acc;
    }, {});
}

module.exports = {
    findNodeModulesPath,
    modifyHandlerPaths,
};

