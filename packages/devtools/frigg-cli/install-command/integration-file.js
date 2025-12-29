const fs = require('fs-extra');
const path = require('path');
const output = require('../utils/output');
const { getIntegrationTemplate } = require('./template');
const INTEGRATIONS_DIR = 'src/integrations';

function createIntegrationFile(backendPath, apiModuleName, ApiClass) {
    const integrationDir = path.join(
        path.dirname(backendPath),
        INTEGRATIONS_DIR
    );
    output.debug(`Ensuring directory exists: ${integrationDir}`);
    fs.ensureDirSync(integrationDir);

    const integrationFilePath = path.join(
        integrationDir,
        `${apiModuleName}Integration.js`
    );
    output.debug(`Writing integration file: ${integrationFilePath}`);
    const integrationTemplate = getIntegrationTemplate(
        apiModuleName,
        backendPath,
        ApiClass
    );
    fs.writeFileSync(integrationFilePath, integrationTemplate);
}

module.exports = {
    createIntegrationFile,
};
