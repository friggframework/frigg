const { execSync } = require('child_process');
const path = require('path');

function commitChanges(backendPath, apiModuleName) {
    const apiModulePath = path.join(path.dirname(backendPath), 'src', 'integrations', `${apiModuleName}Integration.js`);
    try {
        execSync(`git add ${apiModulePath}`);
        execSync(`git commit -m "Add ${apiModuleName}Integration to ${apiModuleName}Integration.js"`);
    } catch (error) {
        throw new Error('Failed to commit changes:', error);
    }
}

module.exports = {
    commitChanges,
};
