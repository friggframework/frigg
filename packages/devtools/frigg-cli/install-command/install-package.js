const { execSync } = require('child_process');
const path = require('path');

function installPackage(backendPath, packageName) {
    execSync(`npm install ${packageName}`, {
        cwd: path.dirname(backendPath),
        stdio: 'inherit',
    });
}

module.exports = {
    installPackage,
};