const fs = require('fs-extra');
const path = require('path');
const { logInfo } = require('./logger');
const { getIntegrationTemplate } = require('./template');

const INTEGRATIONS_DIR = 'src/integrations';

/**
 * Write `src/integrations/<ClassName>.js` next to the app's package.json.
 * An existing file is left untouched (it may hold the user's work).
 *
 * @param {string} backendPath - Path to the app's package.json
 * @param {object} templateParams - See getIntegrationTemplate
 * @returns {{ filePath: string, created: boolean }}
 */
function createIntegrationFile(backendPath, templateParams) {
    const integrationDir = path.join(
        path.dirname(backendPath),
        INTEGRATIONS_DIR
    );
    fs.ensureDirSync(integrationDir);

    const filePath = path.join(
        integrationDir,
        `${templateParams.className}.js`
    );
    if (fs.existsSync(filePath)) {
        logInfo(`Keeping existing integration file: ${filePath}`);
        return { filePath, created: false };
    }
    logInfo(`Writing integration file: ${filePath}`);
    fs.writeFileSync(filePath, getIntegrationTemplate(templateParams));
    return { filePath, created: true };
}

module.exports = {
    INTEGRATIONS_DIR,
    createIntegrationFile,
};
