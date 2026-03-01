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

module.exports = { getFunctionEntryPoints, getFunctionEntryPointsDir };
