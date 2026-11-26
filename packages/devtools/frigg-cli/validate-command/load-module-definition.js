const fs = require('fs');
const path = require('path');

/**
 * Load the `Definition` exported by an API module's `./index.js`
 * (`{ Api, Definition }`). Used by `frigg validate --module`.
 *
 * @param {object} [params]
 * @param {string} [params.cwd]
 * @returns {{ ok: true, definition: object, indexPath: string }
 *   | { ok: false, issue: object }}
 */
function loadModuleDefinition({ cwd = process.cwd() } = {}) {
    const indexPath = path.join(cwd, 'index.js');
    if (!fs.existsSync(indexPath)) {
        return {
            ok: false,
            issue: {
                severity: 'error',
                code: 'module-index-not-found',
                pointer: '',
                message: `No API module index.js found at ${indexPath}.`,
                hint: 'Run `frigg validate --module` from the module directory (the one that exports `{ Api, Definition }`).',
            },
        };
    }

    let mod;
    try {
        const resolved = require.resolve(indexPath);
        delete require.cache[resolved];
        mod = require(indexPath);
    } catch (error) {
        return {
            ok: false,
            issue: {
                severity: 'error',
                code: 'load-failed',
                pointer: '',
                message: `${indexPath} failed to load: ${error.message}`,
                hint: 'Fix the error above; the module must load cleanly.',
                stack: error.stack,
            },
        };
    }

    const definition = mod && mod.Definition;
    if (!definition || typeof definition !== 'object') {
        return {
            ok: false,
            issue: {
                severity: 'error',
                code: 'definition-not-exported',
                pointer: '',
                message: `${indexPath} does not export a Definition object.`,
                hint: 'Export `{ Api, Definition }` from index.js.',
            },
        };
    }

    return { ok: true, definition, indexPath };
}

module.exports = { loadModuleDefinition };
