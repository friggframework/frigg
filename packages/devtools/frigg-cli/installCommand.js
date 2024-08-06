const { installPackage } = require('./installPackage');
const { createIntegrationFile } = require('./integrationFile');
const { resolve } = require('node:path');
const { updateBackendJsFile } = require('./backendJs');
const { logInfo, logError } = require('./logger');
const { commitChanges } = require('./commitChanges');
const {
    findNearestBackendPackageJson,
    validateBackendPath,
} = require('./backendPath');
const { handleEnvVariables } = require('./environmentVariables');
const {
    validatePackageExists,
    searchAndSelectPackage,
} = require('./validatePackage');

const installCommand = async (apiModuleName) => {
    try {
        const packageNames = await searchAndSelectPackage(apiModuleName);
        if (!packageNames || packageNames.length === 0) return;

        const backendPath = findNearestBackendPackageJson();
        validateBackendPath(backendPath);

        for (const packageName of packageNames) {
            await validatePackageExists(packageName);
            installPackage(backendPath, packageName);

            const modulePath = resolve(
                backendPath,
                `../../node_modules/${packageName}`
            );
            const {
                Config: { label },
                Api: ApiClass,
            } = require(modulePath);

            const sanitizedLabel = label.replace(
                /[<>:"/\\|?*\x00-\x1F\s]/g,
                ''
            ); // Remove invalid characters and spaces            console.log('Installing integration for:', sanitizedLabel);
            createIntegrationFile(backendPath, sanitizedLabel, ApiClass);
            updateBackendJsFile(backendPath, sanitizedLabel);
            commitChanges(backendPath, sanitizedLabel);
            logInfo(
                `Successfully installed ${packageName} and updated the project.`
            );

            await handleEnvVariables(backendPath, modulePath);
        }
    } catch (error) {
        logError('An error occurred:', error);
        process.exit(1);
    }
};

module.exports = { installCommand };
