/**
 * Netlify Function Entry Point Generator
 *
 * Returns the file contents for all Netlify Function entry points.
 * These are the split-per-concern functions that Netlify deploys individually.
 *
 * The static function files in ../functions/ are the source of truth.
 * This generator reads them and returns a map of { filename: content }
 * for programmatic use (e.g., scaffolding a new project).
 */
const fs = require('fs');
const path = require('path');

const FUNCTIONS_DIR = path.join(__dirname, '..', 'functions');

/**
 * Standard function entry points included in every Netlify deployment.
 */
const STANDARD_FUNCTIONS = [
    'auth.js',
    'user.js',
    'health.js',
    'admin.js',
    'docs.js',
    'integration-routes.js',
    'webhooks.js',
    'worker-background.js',
    'scheduled-sync.js',
];

/**
 * Get all function entry point files for a Netlify deployment.
 *
 * Returns a map of filename → file content that can be written to the
 * functions directory of a Netlify project.
 *
 * @param {Object} appDefinition - Frigg app definition
 * @returns {{ [filename: string]: string }}
 */
function getFunctionEntryPoints(appDefinition) {
    const entryPoints = {};

    for (const filename of STANDARD_FUNCTIONS) {
        const filePath = path.join(FUNCTIONS_DIR, filename);
        if (fs.existsSync(filePath)) {
            entryPoints[filename] = fs.readFileSync(filePath, 'utf-8');
        }
    }

    return entryPoints;
}

/**
 * Get the absolute path to the bundled function entry points directory.
 * Useful when the deployer can copy files directly rather than reading content.
 *
 * @returns {string} Absolute path to the functions directory
 */
function getFunctionEntryPointsDir() {
    return FUNCTIONS_DIR;
}

/**
 * Runtime lib files that function entry points depend on via require('../lib/...').
 *
 * Rather than copying these files (which may have their own relative imports),
 * we generate re-export shims that point back to the installed npm package.
 * This keeps the output minimal and always in sync with the package version.
 */
const LIB_REQUIRE_PATTERN = /require\(['"]\.\.\/lib\/([^'"]+)['"]\)/g;

/**
 * Get re-export shim files for all lib/ dependencies referenced by function entry points.
 *
 * Scans function entry point contents for require('../lib/...') references
 * and generates shim files that re-export from the installed package.
 *
 * @param {Object} appDefinition - Frigg app definition
 * @returns {{ [filename: string]: string }} Map of lib filename → re-export shim content
 */
function getLibEntryPoints(appDefinition) {
    const functionEntryPoints = getFunctionEntryPoints(appDefinition);
    const libModules = new Set();

    // Scan function contents for ../lib/ references
    for (const content of Object.values(functionEntryPoints)) {
        let match;
        // Reset lastIndex for each content string since we reuse the regex
        LIB_REQUIRE_PATTERN.lastIndex = 0;
        while ((match = LIB_REQUIRE_PATTERN.exec(content)) !== null) {
            libModules.add(match[1]);
        }
    }

    const libEntryPoints = {};
    for (const modulePath of libModules) {
        const filename = modulePath.endsWith('.js') ? modulePath : `${modulePath}.js`;
        const requirePath = modulePath.replace(/\.js$/, '');
        libEntryPoints[filename] = `module.exports = require('@friggframework/provider-netlify/lib/${requirePath}');\n`;
    }

    return libEntryPoints;
}

module.exports = { getFunctionEntryPoints, getFunctionEntryPointsDir, getLibEntryPoints };
