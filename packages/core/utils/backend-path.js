const fs = require('fs-extra');
const path = require('node:path');
const PACKAGE_JSON = 'package.json';

function findNearestBackendPackageJson() {
    let currentDir = process.cwd();
    
    // First check if we're in production by looking for package.json in the current directory
    const rootPackageJson = path.join(currentDir, PACKAGE_JSON);
    if (fs.existsSync(rootPackageJson)) {
        // In production environment, check for index.js in the same directory
        const indexJs = path.join(currentDir, 'index.js');
        if (fs.existsSync(indexJs)) {
            return rootPackageJson;
        }
    }

    // If not found at root or not in production, look for it in the backend directory
    while (currentDir !== path.parse(currentDir).root) {
        const packageJsonPath = path.join(currentDir, 'backend', PACKAGE_JSON);
        if (fs.existsSync(packageJsonPath)) {
            return packageJsonPath;
        }
        currentDir = path.dirname(currentDir);
    }
    return null;
}

function validateBackendPath(backendPath) {
    if (!backendPath) {
        throw new Error('Could not find a backend package.json file.');
    }
}

module.exports = {
    findNearestBackendPackageJson,
    validateBackendPath,
}; 