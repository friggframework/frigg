/**
 * Extension Loader
 *
 * Validates and normalizes extensions from the app definition.
 * Extensions allow integration developers to add custom Prisma models,
 * encryption schemas, routes, and bootstrap logic to a Frigg app.
 *
 * @example
 * const extensions = loadExtensions(appDefinition);
 * // extensions is a normalized array, safe to iterate
 */

const path = require('path');

/**
 * Validates a single extension definition.
 * @param {Object} ext - Raw extension config from app definition
 * @param {number} index - Position in the extensions array (for error messages)
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateExtension(ext, index) {
    const prefix = `extensions[${index}]`;
    const errors = [];

    if (!ext || typeof ext !== 'object') {
        errors.push(`${prefix}: must be an object`);
        return { valid: false, errors };
    }

    if (!ext.name || typeof ext.name !== 'string') {
        errors.push(`${prefix}.name: required string`);
    }

    // schema is optional — path to a .prisma file
    if (ext.schema !== undefined) {
        if (typeof ext.schema !== 'string') {
            errors.push(`${prefix}.schema: must be a string (path to .prisma file)`);
        } else if (!ext.schema.endsWith('.prisma')) {
            errors.push(`${prefix}.schema: must end with .prisma`);
        }
    }

    // encryption is optional — object with model names → { fields: [...] }
    if (ext.encryption !== undefined) {
        if (!ext.encryption || typeof ext.encryption !== 'object') {
            errors.push(`${prefix}.encryption: must be an object`);
        } else {
            for (const [model, config] of Object.entries(ext.encryption)) {
                if (!config || !Array.isArray(config.fields)) {
                    errors.push(
                        `${prefix}.encryption.${model}: must have a "fields" array`
                    );
                }
            }
        }
    }

    // routes is optional — { path, handler }
    if (ext.routes !== undefined) {
        if (!ext.routes || typeof ext.routes !== 'object') {
            errors.push(`${prefix}.routes: must be an object with { path, handler }`);
        } else {
            if (!ext.routes.path || typeof ext.routes.path !== 'string') {
                errors.push(`${prefix}.routes.path: required string`);
            }
            if (!ext.routes.handler) {
                errors.push(`${prefix}.routes.handler: required (function or module path)`);
            }
        }
    }

    // bootstrap is optional — function or module path
    if (ext.bootstrap !== undefined) {
        if (typeof ext.bootstrap !== 'function' && typeof ext.bootstrap !== 'string') {
            errors.push(
                `${prefix}.bootstrap: must be a function or a string (module path)`
            );
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Loads and validates extensions from the app definition.
 *
 * @param {Object} appDefinition - The full app definition
 * @returns {Array<Object>} Normalized extensions array (empty if none)
 * @throws {Error} If any extension fails validation
 */
function loadExtensions(appDefinition) {
    if (!appDefinition) return [];

    const raw = appDefinition.extensions;
    if (!raw) return [];

    if (!Array.isArray(raw)) {
        throw new Error('appDefinition.extensions must be an array');
    }

    if (raw.length === 0) return [];

    const allErrors = [];

    const normalized = raw.map((ext, index) => {
        const { valid, errors } = validateExtension(ext, index);
        if (!valid) {
            allErrors.push(...errors);
            return null;
        }

        // Normalize bootstrap — resolve string paths to functions
        let bootstrapFn = null;
        if (typeof ext.bootstrap === 'function') {
            bootstrapFn = ext.bootstrap;
        } else if (typeof ext.bootstrap === 'string') {
            bootstrapFn = require(ext.bootstrap);
        }

        // Normalize route handler — resolve string paths to functions
        let routeHandler = null;
        if (ext.routes) {
            if (typeof ext.routes.handler === 'function') {
                routeHandler = ext.routes.handler;
            } else if (typeof ext.routes.handler === 'string') {
                routeHandler = require(ext.routes.handler);
            } else {
                routeHandler = ext.routes.handler;
            }
        }

        return {
            name: ext.name,
            schema: ext.schema || null,
            encryption: ext.encryption || null,
            routes: ext.routes
                ? { path: ext.routes.path, handler: routeHandler }
                : null,
            bootstrap: bootstrapFn,
        };
    });

    if (allErrors.length > 0) {
        throw new Error(
            `Invalid extension configuration:\n- ${allErrors.join('\n- ')}`
        );
    }

    return normalized.filter(Boolean);
}

/**
 * Get extension schema file paths from loaded extensions.
 * @param {Array<Object>} extensions - Normalized extensions
 * @returns {string[]} Array of absolute paths to .prisma schema files
 */
function getExtensionSchemaPaths(extensions) {
    return extensions
        .filter((ext) => ext.schema)
        .map((ext) => ext.schema);
}

module.exports = {
    loadExtensions,
    validateExtension,
    getExtensionSchemaPaths,
};
