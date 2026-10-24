const fs = require('fs');
const path = require('path');

/**
 * Find the backend directory the way `frigg build` and core's
 * findNearestBackendPackageJson do: the current directory when it holds
 * package.json and index.js, else the nearest ancestor's `backend/` that
 * holds a package.json. Like core, the search stops at that nearest
 * `backend/` even when it has no index.js (loadAppDefinition reports it), so
 * validation never passes on a farther app that build would not load.
 *
 * @param {string} cwd
 * @returns {string|null}
 */
function resolveBackendDir(cwd = process.cwd()) {
    if (
        fs.existsSync(path.join(cwd, 'package.json')) &&
        fs.existsSync(path.join(cwd, 'index.js'))
    ) {
        return cwd;
    }
    let dir = cwd;
    while (dir !== path.parse(dir).root) {
        const candidate = path.join(dir, 'backend');
        if (fs.existsSync(path.join(candidate, 'package.json'))) {
            return candidate;
        }
        dir = path.dirname(dir);
    }
    return null;
}

/**
 * Load the `Definition` exported by the backend's index.js, the same module
 * that infrastructure.js (createFriggInfrastructure) and core's
 * loadAppDefinition load.
 *
 * @param {object} [params]
 * @param {string} [params.cwd]
 * @returns {{ ok: true, definition: object, backendDir: string, indexPath: string }
 *   | { ok: false, issue: object }}
 */
function loadAppDefinition({ cwd = process.cwd() } = {}) {
    const backendDir = resolveBackendDir(cwd);
    if (!backendDir) {
        return {
            ok: false,
            issue: {
                severity: 'error',
                code: 'backend-not-found',
                pointer: '',
                message: `No Frigg backend found from ${cwd}: expected package.json and index.js here, or a backend/ directory above.`,
                hint: 'Run the command in your backend directory (the one with index.js and infrastructure.js).',
            },
        };
    }

    const indexPath = path.join(backendDir, 'index.js');
    if (!fs.existsSync(indexPath)) {
        return {
            ok: false,
            issue: {
                severity: 'error',
                code: 'index-not-found',
                pointer: '',
                message: `${backendDir} has a package.json but no index.js. Build and deploy use this directory (the nearest backend/), so they would fail too.`,
                hint: 'Add index.js exporting { Definition }, or run the command in the backend directory you meant.',
            },
        };
    }
    let backend;
    try {
        backend = require(indexPath);
    } catch (error) {
        return {
            ok: false,
            issue: {
                severity: 'error',
                code: 'load-failed',
                pointer: '',
                message: `${indexPath} failed to load: ${error.message}`,
                hint: 'Fix the error above; build and deploy load the same file.',
                stack: error.stack,
            },
        };
    }

    const definition = backend && backend.Definition;
    if (!definition || typeof definition !== 'object') {
        return {
            ok: false,
            issue: {
                severity: 'error',
                code: 'definition-not-exported',
                pointer: '',
                message: `${indexPath} does not export a Definition object.`,
                hint: 'End index.js with `module.exports = { Definition: appDefinition };`.',
            },
        };
    }

    return { ok: true, definition, backendDir, indexPath };
}

module.exports = { loadAppDefinition, resolveBackendDir };
