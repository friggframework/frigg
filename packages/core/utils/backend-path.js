const fs = require('fs-extra');
const path = require('path');
const PACKAGE_JSON = 'package.json';

function findNearestBackendPackageJson() {
    let currentDir = process.cwd();
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