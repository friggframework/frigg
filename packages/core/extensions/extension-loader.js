/**
 * Extension Loader
 *
 * Validates and normalizes the core extensions of the app definition
 * (`appDefinition.coreExtensions`, an array). Core extensions add custom
 * Prisma models, encryption schemas, admin routes and bootstrap logic to a
 * Frigg app. The key is `coreExtensions`, not `extensions`: ADR-017 keeps
 * `appDefinition.extensions` for its keyed object form.
 *
 * @example
 * const extensions = loadExtensions(appDefinition);
 * // extensions is a normalized array, safe to iterate
 */

const path = require('path');
const {
    coreExtensionRoutePathError,
} = require('../management-api/route-registry');

const SCHEMA_DB_TYPES = ['postgresql', 'mongodb'];

function schemaErrors(schema, label) {
    if (typeof schema === 'string') {
        return schema.endsWith('.prisma') ? [] : [`${label}: must end with .prisma`];
    }
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
        return [`${label}: must be a string (path to .prisma file) or { postgresql, mongodb } paths`];
    }
    const errors = [];
    const keys = Object.keys(schema);
    if (keys.length === 0) errors.push(`${label}: names no database type`);
    for (const key of keys) {
        if (!SCHEMA_DB_TYPES.includes(key)) {
            errors.push(`${label}.${key}: unknown database type (expected ${SCHEMA_DB_TYPES.join(' or ')})`);
        } else if (typeof schema[key] !== 'string' || !schema[key].endsWith('.prisma')) {
            errors.push(`${label}.${key}: must be a path ending in .prisma`);
        }
    }
    return errors;
}

/**
 * Validates a single extension definition.
 * @param {Object} ext - Raw extension config from app definition
 * @param {number} index - Position in the coreExtensions array (for error messages)
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateExtension(ext, index) {
    const prefix = `coreExtensions[${index}]`;
    const errors = [];

    if (!ext || typeof ext !== 'object') {
        errors.push(`${prefix}: must be an object`);
        return { valid: false, errors };
    }

    if (!ext.name || typeof ext.name !== 'string') {
        errors.push(`${prefix}.name: required string`);
    }

    // schema is optional: a .prisma file for every database, or one per
    // database type ({ postgresql, mongodb }), since a model written for one
    // (an autoincrement Int id, a String[] column) does not compile for the other.
    if (ext.schema !== undefined) {
        errors.push(...schemaErrors(ext.schema, `${prefix}.schema`));
    }

    // migrations is optional: a directory of Prisma migration folders
    // (<timestamp>_<name>/migration.sql) for the extension's PostgreSQL models.
    // They are applied with the core migrations. MongoDB has no migrations.
    if (ext.migrations !== undefined && (typeof ext.migrations !== 'string' || ext.migrations === '')) {
        errors.push(`${prefix}.migrations: must be a string (path to a migrations directory)`);
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
            } else {
                const pathError = coreExtensionRoutePathError(ext.routes.path);
                if (pathError) {
                    errors.push(`${prefix}.routes.path: ${pathError}`);
                }
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

    // The array this loader reads used to be `appDefinition.extensions`;
    // that key now belongs to ADR-017's keyed object. An array there is the
    // old spelling: stop at load rather than silently dropping the extensions.
    if (Array.isArray(appDefinition.extensions)) {
        throw new Error(
            'appDefinition.extensions (array) was renamed to appDefinition.coreExtensions; ' +
                'move the array to coreExtensions'
        );
    }

    const raw = appDefinition.coreExtensions;
    if (!raw) return [];

    if (!Array.isArray(raw)) {
        throw new Error('appDefinition.coreExtensions must be an array');
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
            migrations: ext.migrations || null,
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
 * The .prisma file an extension adds for one database type.
 * @param {Object} ext - Normalized extension
 * @param {'postgresql'|'mongodb'} [dbType] - Omitted: a string schema only
 * @returns {string|null}
 */
function extensionSchemaPath(ext, dbType) {
    if (!ext?.schema) return null;
    if (typeof ext.schema === 'string') return ext.schema;
    return dbType ? ext.schema[dbType] || null : null;
}

/**
 * Get extension schema file paths from loaded extensions.
 * @param {Array<Object>} extensions - Normalized extensions
 * @param {'postgresql'|'mongodb'} [dbType] - Database the paths are for. A
 *   per-database schema ({ postgresql, mongodb }) only answers when given one.
 * @returns {string[]} Array of absolute paths to .prisma schema files
 */
function getExtensionSchemaPaths(extensions, dbType) {
    return extensions
        .map((ext) => extensionSchemaPath(ext, dbType))
        .filter(Boolean);
}

module.exports = {
    loadExtensions,
    validateExtension,
    getExtensionSchemaPaths,
    extensionSchemaPath,
};
