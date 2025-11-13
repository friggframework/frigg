const fs = require('fs-extra');
const path = require('path');
const output = require('../utils/output');
const INTEGRATIONS_DIR = 'src/integrations';
const BACKEND_JS = 'backend.js';

function updateBackendJsFile(backendPath, apiModuleName) {
    const backendJsPath = path.join(path.dirname(backendPath), BACKEND_JS);
    output.debug(`Updating backend.js: ${backendJsPath}`);
    updateBackendJs(backendJsPath, apiModuleName);
}

function updateBackendJs(backendJsPath, apiModuleName) {
    const backendJsContent = fs.readFileSync(backendJsPath, 'utf-8');
    const importStatement = `const ${apiModuleName}Integration = require('./${INTEGRATIONS_DIR}/${apiModuleName}Integration');\n`;

    if (!backendJsContent.includes(importStatement)) {
        const updatedContent = backendJsContent.replace(
            /(integrations\s*:\s*\[)([\s\S]*?)(\])/,
            `$1\n        ${apiModuleName}Integration,$2$3`
        );
        fs.writeFileSync(backendJsPath, importStatement + updatedContent);
    } else {
        output.debug(
            `Import statement for ${apiModuleName}Integration already exists in backend.js`
        );
    }
}

module.exports = {
    updateBackendJsFile,
    updateBackendJs,
};
