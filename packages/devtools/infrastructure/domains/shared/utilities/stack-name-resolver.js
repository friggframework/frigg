/**
 * Stack Name Resolver Utility
 *
 * Domain Utility - Hexagonal Architecture
 *
 * Provides consistent CloudFormation stack name resolution across
 * deployment and resource discovery flows.
 *
 * Resolution order:
 * 1. appDefinition.name (explicit name in app definition)
 * 2. infrastructure.js service property (serverless service name)
 * 3. backend package.json name (project name)
 * 4. 'create-frigg-app' (default fallback)
 */

const path = require('path');
const fs = require('fs');

/**
 * Sanitize stack name to conform to CloudFormation naming rules
 * Stack names must only contain alphanumeric characters and hyphens
 *
 * @param {string} name - Raw name to sanitize
 * @returns {string} Sanitized name
 */
function sanitizeStackName(name) {
    if (!name || typeof name !== 'string') {
        return '';
    }

    // Replace any non-alphanumeric characters (except hyphens) with hyphens
    // Then remove consecutive hyphens
    return name
        .replace(/[^a-zA-Z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Try to get service name from infrastructure.js
 *
 * @param {string} workingDir - Working directory path
 * @returns {string|null} Service name or null
 */
function tryGetInfrastructureServiceName(workingDir) {
    try {
        const infraPath = path.join(workingDir, 'infrastructure.js');

        if (!fs.existsSync(infraPath)) {
            return null;
        }

        const infraModule = require(infraPath);

        if (infraModule && infraModule.service && typeof infraModule.service === 'string') {
            return sanitizeStackName(infraModule.service);
        }

        return null;
    } catch (error) {
        // Ignore errors reading infrastructure file
        return null;
    }
}

/**
 * Try to get package name from package.json
 *
 * @param {string} workingDir - Working directory path
 * @returns {string|null} Package name or null
 */
function tryGetPackageName(workingDir) {
    try {
        const packagePath = path.join(workingDir, 'package.json');

        if (!fs.existsSync(packagePath)) {
            return null;
        }

        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));

        if (packageJson && packageJson.name && typeof packageJson.name === 'string') {
            return sanitizeStackName(packageJson.name);
        }

        return null;
    } catch (error) {
        // Ignore errors reading/parsing package.json
        return null;
    }
}

/**
 * Resolve CloudFormation stack name consistently
 *
 * Uses a priority-based resolution strategy:
 * 1. appDefinition.name (highest priority - explicit)
 * 2. infrastructure.js service name
 * 3. backend package.json name
 * 4. 'create-frigg-app' fallback (lowest priority - default)
 *
 * @param {Object} appDefinition - Application definition object
 * @param {Object} options - Resolution options
 * @param {string} [options.stage='dev'] - Deployment stage
 * @param {string} [options.workingDirectory] - Custom working directory (defaults to process.cwd())
 * @returns {string} Resolved stack name in format: {name}-{stage}
 */
function resolveStackName(appDefinition, options) {
    // Handle null/undefined options
    const opts = options || {};
    const stage = opts.stage || 'dev';
    const workingDir = opts.workingDirectory || process.cwd();

    let baseName = null;

    // Priority 1: Try appDefinition.name
    if (appDefinition && appDefinition.name && typeof appDefinition.name === 'string') {
        baseName = sanitizeStackName(appDefinition.name);
    }

    // Priority 2: Try infrastructure.js service name
    if (!baseName) {
        baseName = tryGetInfrastructureServiceName(workingDir);
    }

    // Priority 3: Try package.json name
    if (!baseName) {
        baseName = tryGetPackageName(workingDir);
    }

    // Priority 4: Use default fallback
    if (!baseName) {
        baseName = 'create-frigg-app';
    }

    return `${baseName}-${stage}`;
}

module.exports = {
    resolveStackName,
    sanitizeStackName,
};
