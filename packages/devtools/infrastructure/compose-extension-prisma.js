/**
 * Build-time step: put the app's core extension models (and PostgreSQL
 * migrations) into the Prisma client of the @friggframework/core the backend
 * installed. See core's extensions/prisma-composer.js.
 *
 * It must run on the backend's own core, not devtools' copy: that is the
 * package the functions bundle and the Lambda layer copy their client from.
 */
const fs = require('fs');
const path = require('path');

/**
 * Directory of the @friggframework/core the backend resolves.
 * @param {string} backendDir
 */
function resolveBackendCorePath(backendDir) {
    return path.dirname(
        require.resolve('@friggframework/core/package.json', {
            paths: [backendDir],
        })
    );
}

/**
 * @param {Object} params
 * @param {Object} params.appDefinition
 * @param {string} params.backendDir - directory holding the backend's package.json
 * @param {Function} [params.generate] - injected prisma generate (tests)
 * @param {Function} [params.log]
 * @returns {{ changed: boolean, results: Array<Object> }}
 */
function composeAppExtensionPrisma({
    appDefinition,
    backendDir,
    generate,
    log,
}) {
    const declares = (appDefinition?.coreExtensions || []).some(
        (ext) => ext && (ext.schema || ext.migrations)
    );
    let corePath;
    try {
        corePath = resolveBackendCorePath(backendDir);
    } catch (error) {
        // No installed core to compose into. Fine when nothing needs composing.
        if (!declares) return { changed: false, results: [] };
        throw new Error(
            `Core extensions declare Prisma schemas, but @friggframework/core is not installed for ${backendDir}`,
            { cause: error }
        );
    }
    const composerPath = path.join(
        corePath,
        'extensions',
        'prisma-composer.js'
    );
    if (!fs.existsSync(composerPath)) {
        if (!declares) return { changed: false, results: [] };
        throw new Error(
            `@friggframework/core at ${corePath} cannot compose extension schemas; ` +
                'upgrade it to the version devtools was built with'
        );
    }
    const { composeExtensionPrisma } = require(composerPath);
    return composeExtensionPrisma({
        appDefinition,
        corePath,
        ...(generate ? { generate } : {}),
        ...(log ? { log } : {}),
    });
}

module.exports = { composeAppExtensionPrisma, resolveBackendCorePath };
