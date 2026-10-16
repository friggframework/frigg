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

/** Default relative path from netlify/functions/ to the backend directory. */
const DEFAULT_BACKEND_PATH = '../../backend';

/**
 * Build the preamble injected at the top of every generated function entry point.
 *
 * This makes the backend's app definition statically traceable by nft/esbuild:
 * - require('<backendPath>/index.js') is a static path nft can follow
 * - setAppDefinition() caches the definition so loadAppDefinition() in core
 *   routers skips process.cwd() discovery (which fails on Netlify at runtime)
 *
 * @param {string} backendPath - Relative path from functions dir to backend
 * @returns {string}
 */
function buildPreamble(backendPath) {
    return [
        "// One-time jobs (createSchedulerCommands().scheduleJob) must land in the",
        "// ScheduledJob rows scheduled-sync polls, not in EventBridge.",
        "process.env.SCHEDULER_PROVIDER = process.env.SCHEDULER_PROVIDER || 'netlify';",
        '// Pre-load app definition so nft can trace backend dependencies statically.',
        '// This avoids process.cwd() discovery which fails in Netlify function runtime.',
        `const { setAppDefinition } = require('${backendPath}/node_modules/@friggframework/core/handlers/app-definition-loader');`,
        `const { Definition: _friggAppDef } = require('${backendPath}/index.js');`,
        'setAppDefinition(_friggAppDef);',
        '',
    ].join('\n');
}

/**
 * Rewrite bare @friggframework/core requires to resolve through the backend's
 * node_modules.  In a pnpm monorepo, bare requires resolve to the pnpm
 * virtual store (a separate copy), causing nft to bundle two copies of
 * @friggframework/core.  Relative paths ensure a single copy.
 *
 * @param {string} content - Function file content
 * @param {string} backendPath - Relative path from functions dir to backend
 * @returns {string}
 */
function rewriteCoreRequires(content, backendPath) {
    // Match require('@friggframework/core') or require('@friggframework/core/...')
    return content.replace(
        /require\(['"]@friggframework\/core(\/[^'"]*)?['"]\)/g,
        (match, subpath) => {
            const modulePath = subpath || '';
            return `require('${backendPath}/node_modules/@friggframework/core${modulePath}')`;
        }
    );
}

/**
 * Get all function entry point files for a Netlify deployment.
 *
 * Returns a map of filename → file content that can be written to the
 * functions directory of a Netlify project. Each file is prefixed with
 * a preamble that pre-loads the app definition via a static require,
 * enabling nft to trace the backend dependencies into the function bundle.
 *
 * All bare `@friggframework/core` requires are rewritten to resolve through
 * the backend's node_modules to avoid duplicate dependency trees in pnpm
 * monorepos.
 *
 * @param {Object} appDefinition - Frigg app definition
 * @param {Object} [options]
 * @param {string} [options.backendPath] - Relative path from functions dir to backend (default: '../../backend')
 * @returns {{ [filename: string]: string }}
 */
function getFunctionEntryPoints(appDefinition, options = {}) {
    const { backendPath = DEFAULT_BACKEND_PATH } = options;
    const preamble = buildPreamble(backendPath);
    const entryPoints = {};

    for (const filename of STANDARD_FUNCTIONS) {
        const filePath = path.join(FUNCTIONS_DIR, filename);
        if (fs.existsSync(filePath)) {
            const templateContent = fs.readFileSync(filePath, 'utf-8');
            const rewritten = rewriteCoreRequires(templateContent, backendPath);
            entryPoints[filename] = preamble + rewritten;
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
 * we generate re-export shims that point back to the installed package.
 * This keeps the output minimal and always in sync with the package version.
 */
const LIB_REQUIRE_PATTERN = /require\(['"]\.\.\/lib\/([^'"]+)['"]\)/g;

/**
 * Get re-export shim files for all lib/ dependencies referenced by function entry points.
 *
 * The shims require provider-netlify through the backend's node_modules,
 * like the rewritten core requires. A bare specifier could resolve to a
 * different install (the project root's, or a pnpm store copy), and that
 * copy's own require('@friggframework/core') would then load a second
 * core: one whose app definition was never preset (setAppDefinition is
 * per module instance), so its database and logging setup would fall back
 * to process.cwd() discovery, which fails on Netlify.
 *
 * @param {Object} appDefinition - Frigg app definition
 * @param {Object} [options]
 * @param {string} [options.backendPath] - Relative path from the lib dir to
 *   the backend (default: '../../backend'; netlify/lib sits beside
 *   netlify/functions)
 * @returns {{ [filename: string]: string }} Map of lib filename → re-export shim content
 */
function getLibEntryPoints(appDefinition, options = {}) {
    const { backendPath = DEFAULT_BACKEND_PATH } = options;
    const functionEntryPoints = getFunctionEntryPoints(appDefinition, options);
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
        libEntryPoints[filename] = `module.exports = require('${backendPath}/node_modules/@friggframework/provider-netlify/lib/${requirePath}');\n`;
    }

    return libEntryPoints;
}

module.exports = { getFunctionEntryPoints, getFunctionEntryPointsDir, getLibEntryPoints };
