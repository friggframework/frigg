const path = require('path');
const fs = require('fs-extra');

const {
    findNearestBackendPackageJson,
} = require('../frigg-cli/utils/backend-path');
const { createFriggBackend } = require('@friggframework/core');
function createFriggInfrastructure() {
    const backendPath = findNearestBackendPackageJson();
    if (!backendPath) {
        throw new Error('Could not find backend package.json');
    }

    const backendDir = path.dirname(backendPath);
    const backendFilePath = path.join(backendDir, 'index.js');
    if (!fs.existsSync(backendFilePath)) {
        throw new Error('Could not find index.js');
    }

    const backend = require(backendFilePath);
    const appDefinition = backend.Definition;

    const serverlessTemplate = require(path.resolve(
        __dirname,
        './serverless-template.js'
    ));

    return {
        ...serverlessTemplate,
    };
}

module.exports = { createFriggInfrastructure };
