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
 * Preamble injected at the top of every generated function entry point.
 *
 * This makes the backend's app definition statically traceable by nft/esbuild:
 * - require('../../backend/index.js') is a static path nft can follow
 * - setAppDefinition() caches the definition so loadAppDefinition() in core
 *   routers skips process.cwd() discovery (which fails on Netlify at runtime)
 *
 * The relative path ../../backend/index.js resolves from netlify/functions/
 * up to the project root, then into backend/.
 */
const APP_DEFINITION_PREAMBLE = [
    '// Pre-load app definition so nft can trace backend dependencies statically.',
    '// This avoids process.cwd() discovery which fails in Netlify function runtime.',
    "const { setAppDefinition } = require('@friggframework/core/handlers/app-definition-loader');",
    "const { Definition: _friggAppDef } = require('../../backend/index.js');",
    'setAppDefinition(_friggAppDef);',
    '',
].join('\n');

/**
 * Get all function entry point files for a Netlify deployment.
 *
 * Returns a map of filename → file content that can be written to the
 * functions directory of a Netlify project. Each file is prefixed with
 * a preamble that pre-loads the app definition via a static require,
 * enabling nft to trace the backend dependencies into the function bundle.
 *
 * @param {Object} appDefinition - Frigg app definition
 * @returns {{ [filename: string]: string }}
 */
function getFunctionEntryPoints(appDefinition) {
    const entryPoints = {};

    for (const filename of STANDARD_FUNCTIONS) {
        const filePath = path.join(FUNCTIONS_DIR, filename);
        if (fs.existsSync(filePath)) {
            const templateContent = fs.readFileSync(filePath, 'utf-8');
            entryPoints[filename] = APP_DEFINITION_PREAMBLE + templateContent;
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
