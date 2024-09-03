const path = require('path');
const fs = require('fs-extra');
const { composeServerlessDefinition } = require('./serverless-template');

const {
    findNearestBackendPackageJson,
} = require('../frigg-cli/utils/backend-path');

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

    // const serverlessTemplate = require(path.resolve(
    //     __dirname,
    //     './serverless-template.js'
    // ));
    const definition = composeServerlessDefinition(
        appDefinition,
        backend.IntegrationFactory
    );

    return {
        ...definition,
    };
}

module.exports = { createFriggInfrastructure };
