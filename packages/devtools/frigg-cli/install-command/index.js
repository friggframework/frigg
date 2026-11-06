const fs = require('fs');
const path = require('path');
const { getInstallSpec, installPackage } = require('./install-package');
const {
    createIntegrationFile,
    INTEGRATIONS_DIR,
} = require('./integration-file');
const { updateBackendJsFile } = require('./backend-js');
const { registerIntegration } = require('./app-definition');
const { resolveInstalledModule, readModuleInfo } = require('./resolve-module');
const { toIdentifier } = require('./template');
const { logInfo, logError } = require('./logger');
const { commitChanges } = require('./commit-changes');
const { handleEnvVariables } = require('./environment-variables');
const {
    validatePackageExists,
    searchAndSelectPackage,
} = require('./validate-package');
const {
    findNearestBackendPackageJson,
    validateBackendPath,
} = require('@friggframework/core/utils');

/**
 * Print what to do by hand when the app definition could not be edited.
 */
function printManualSteps({ className, requirePath, definitionFile, reason }) {
    logInfo(
        `\nCould not add ${className} to ${definitionFile} automatically (${reason}). Add it by hand:\n` +
            `  1. At the top of ${definitionFile}:\n` +
            `       const ${className} = require('${requirePath}');\n` +
            `  2. In the app definition's integrations array:\n` +
            `       integrations: [${className}],\n`
    );
}

/**
 * `frigg install <module>`: install an API module and scaffold an
 * integration for it.
 *
 * 1. `npm install` the module in the app directory (the `@next` tag for apps
 *    on a Frigg 2.x prerelease).
 * 2. Resolve it from the app directory (`require.resolve` with
 *    `paths: [appDir]`).
 * 3. Write `src/integrations/<Label>Integration.js`.
 * 4. Register it: in a `frigg init` app, in index.js's `integrations` array
 *    (or print the manual steps when that cannot be done safely); in an older
 *    app with a backend.js, in backend.js as before.
 * 5. Commit the changed files when inside a git repository.
 * 6. Report (or prompt for) environment variables the module reads.
 */
const installCommand = async (apiModuleName) => {
    try {
        const packageNames = await searchAndSelectPackage(apiModuleName);
        if (!packageNames || packageNames.length === 0) return;

        const backendPath = findNearestBackendPackageJson();
        validateBackendPath(backendPath);
        const projectDir = path.dirname(backendPath);
        const backendJsPath = path.join(projectDir, 'backend.js');
        const indexJsPath = path.join(projectDir, 'index.js');
        const hasBackendJs = fs.existsSync(backendJsPath);

        for (const packageName of packageNames) {
            await validatePackageExists(packageName);
            installPackage(
                backendPath,
                getInstallSpec(packageName, projectDir)
            );

            const { entryPath, moduleDir } = resolveInstalledModule(
                packageName,
                projectDir
            );
            const info = readModuleInfo(entryPath, packageName);
            const baseName = toIdentifier(info.label);
            const className = `${baseName}Integration`;
            const requirePath = `./${INTEGRATIONS_DIR}/${className}`;

            const { filePath } = createIntegrationFile(backendPath, {
                className,
                packageName,
                ...info,
            });
            const changedFiles = [filePath];

            if (hasBackendJs) {
                // Older layout: the app definition lives in backend.js.
                updateBackendJsFile(backendPath, baseName);
                changedFiles.push(backendJsPath);
            } else {
                const result = registerIntegration(
                    indexJsPath,
                    className,
                    requirePath
                );
                if (result.status === 'registered') {
                    logInfo(`Added ${className} to index.js`);
                    changedFiles.push(indexJsPath);
                } else if (result.status === 'already-registered') {
                    logInfo(`${className} is already in index.js`);
                } else {
                    printManualSteps({
                        className,
                        requirePath,
                        definitionFile: 'index.js',
                        reason: result.reason,
                    });
                }
            }

            for (const file of ['package.json', 'package-lock.json']) {
                const full = path.join(projectDir, file);
                if (fs.existsSync(full)) changedFiles.push(full);
            }
            commitChanges(backendPath, info.label, changedFiles);
            logInfo(
                `Successfully installed ${packageName} and updated the project.`
            );

            await handleEnvVariables(backendPath, moduleDir);
        }
    } catch (error) {
        logError('An error occurred:', error);
        process.exit(1);
    }
};

module.exports = { installCommand };
