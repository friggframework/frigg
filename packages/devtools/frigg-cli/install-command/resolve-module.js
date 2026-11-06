const fs = require('fs');
const path = require('path');

/**
 * Locate an installed API module from the app's point of view.
 *
 * Resolution starts at the app directory (`require.resolve` with
 * `paths: [projectDir]`), so it finds the copy npm just installed whether
 * node_modules sits in the app (a `frigg init` app) or is hoisted to a
 * workspace root (the older `backend/` layout).
 *
 * @param {string} packageName
 * @param {string} projectDir - Directory holding the app's package.json
 * @returns {{ entryPath: string, moduleDir: string }}
 */
function resolveInstalledModule(packageName, projectDir) {
    const entryPath = require.resolve(packageName, { paths: [projectDir] });

    // Walk up from the entry file to the package root (its package.json).
    let dir = path.dirname(entryPath);
    while (dir !== path.dirname(dir)) {
        const pkgJson = path.join(dir, 'package.json');
        if (fs.existsSync(pkgJson)) {
            try {
                const { name } = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
                if (name === packageName) {
                    return { entryPath, moduleDir: dir };
                }
            } catch (error) {
                // Not a readable package.json; keep walking.
            }
        }
        dir = path.dirname(dir);
    }
    return { entryPath, moduleDir: path.dirname(entryPath) };
}

/**
 * Load an installed API module and read what the integration scaffold needs.
 *
 * @returns {{ moduleName: string, label: string, description?: string,
 *   detailsUrl?: string, icon?: string, categories?: string[] }}
 */
function readModuleInfo(entryPath, packageName) {
    // eslint-disable-next-line global-require
    const mod = require(entryPath);
    const definition = mod && mod.Definition;
    if (!definition) {
        throw new Error(
            `${packageName} does not export a Definition, so it is not a Frigg API module.`
        );
    }
    const config = (mod && mod.Config) || {};
    const moduleName =
        (typeof definition.getName === 'function' && definition.getName()) ||
        definition.moduleName ||
        config.name ||
        packageName.replace(/^@friggframework\/api-module-/, '');
    return {
        moduleName,
        label: config.label || config.displayName || moduleName,
        description: config.description,
        detailsUrl: config.productUrl || config.detailsUrl,
        icon: config.logoUrl || config.icon,
        categories: config.categories,
    };
}

module.exports = { resolveInstalledModule, readModuleInfo };
