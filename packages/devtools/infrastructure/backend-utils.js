const { createFriggBackend } = require('@friggframework/core');
const {
    findNearestBackendPackageJson,
} = require('../frigg-cli/utils/backend-path');
const path = require('path');
const fs = require('fs-extra');

const backendPath = findNearestBackendPackageJson();
if (!backendPath) {
    throw new Error('Could not find backend package.json');
}

const backendDir = path.dirname(backendPath);
const backendFilePath = path.join(backendDir, 'index.js');
if (!fs.existsSync(backendFilePath)) {
    throw new Error('Could not find index.js');
}

const backendJsFile = require(backendFilePath);
const appDefinition = backendJsFile.Definition;

const backend = createFriggBackend(appDefinition);

module.exports = {
    ...backend,
};
