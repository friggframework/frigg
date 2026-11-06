const path = require('path');
const fs = require('fs');

/**
 * Finds the nearest backend package.json by traversing up the directory tree
 * @param {string} startDir - Directory to start searching from
 * @returns {string|null} - Path to the backend directory or null if not found
 */
function findNearestBackendPackageJson(startDir = process.cwd()) {
    let currentDir = startDir;
    
    while (currentDir !== path.dirname(currentDir)) {
        const backendPath = path.join(currentDir, 'backend', 'package.json');
        if (fs.existsSync(backendPath)) {
            return path.dirname(backendPath);
        }
        currentDir = path.dirname(currentDir);
    }
    
    return null;
}

module.exports = {
    findNearestBackendPackageJson
};