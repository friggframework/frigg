const fs = require('fs-extra');
const path = require('path');
const { logInfo } = require('./logger');
const { getIntegrationTemplate } = require('./template');
const INTEGRATIONS_DIR = 'src/integrations';

function createIntegrationFile(backendPath, apiModuleName, ApiClass) {
    const integrationDir = path.join(
        path.dirname(backendPath),
        INTEGRATIONS_DIR
    );
    logInfo(`Ensuring directory exists: ${integrationDir}`);
    fs.ensureDirSync(integrationDir);

    const integrationFilePath = path.join(
        integrationDir,
        `${apiModuleName}Integration.js`
    );
    logInfo(`Writing integration file: ${integrationFilePath}`);
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
