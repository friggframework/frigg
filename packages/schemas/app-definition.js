/**
 * App definition helpers shared by the runtime (core) and the tooling
 * (devtools, frigg CLI). See ADR-051.
 *
 * This file loads only the JSON schema, not Ajv, so the runtime can apply
 * the schema defaults at cold start without compiling a validator.
 */

const appDefinitionSchema = require('./schemas/app-definition.schema.json');

function isPlainObject(value) {
    if (value === null || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function cloneDefault(value) {
    // Schema defaults are JSON values: a JSON round trip copies them fully.
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

/**
 * Copy plain objects and arrays, keep everything else (classes, functions,
 * instances) by reference.
 */
function clonePlain(value) {
    if (Array.isArray(value)) return value.map(clonePlain);
    if (isPlainObject(value)) {
        const copy = {};
        for (const [key, inner] of Object.entries(value)) {
            copy[key] = clonePlain(inner);
        }
        return copy;
    }
    return value;
}

function applyDefaultsInPlace(schema, data) {
    if (!schema || !isPlainObject(data)) return;
    const properties = schema.properties || {};
    for (const [key, propertySchema] of Object.entries(properties)) {
        if (data[key] === undefined && propertySchema.default !== undefined) {
            data[key] = cloneDefault(propertySchema.default);
        }
        if (isPlainObject(data[key]) && propertySchema.properties) {
            applyDefaultsInPlace(propertySchema, data[key]);
        }
    }
}

/**
 * Return a copy of the app definition with every `default` that the
 * app-definition schema declares applied, the way Ajv `useDefaults` does:
 * only for properties of objects that exist (a block the app leaves out is
 * not created unless the block itself has a default, as `user` does). It
 * also copies the deprecated `user.password` into `user.usePassword` when
 * only the old spelling is set. Classes and other non-plain values are kept by reference.
 * The input is not mutated, and the function is idempotent.
 *
 * This is the only place schema defaults are applied. core's
 * loadAppDefinition and devtools' createFriggInfrastructure both call it,
 * so a default in the schema is a default at runtime.
 *
 * @param {object} definition the `Definition` exported by the backend
 * @returns {object} the definition with defaults applied
 */
function applyAppDefinitionDefaults(definition) {
    if (!isPlainObject(definition)) return definition;
    const copy = clonePlain(definition);
    // user.password is the deprecated spelling of user.usePassword.
    if (
        isPlainObject(copy.user) &&
        copy.user.usePassword === undefined &&
        typeof copy.user.password === 'boolean'
    ) {
        copy.user.usePassword = copy.user.password;
    }
    applyDefaultsInPlace(appDefinitionSchema, copy);
    return copy;
}

// Keys whose entries are classes with a static Definition.
const CLASS_LIST_KEYS = ['integrations', 'adminScripts', 'reports'];

/**
 * JSON Schema cannot describe a JavaScript class, and apps list integration
 * (and admin script, and report) classes. Validators therefore check this serialisable view, in which each
 * class is replaced by `{ Definition }` (its static Definition). The schema
 * describes that view; `frigg validate` checks the Definition itself.
 *
 * @param {object} definition the `Definition` exported by the backend
 * @returns {object} a shallow copy with the class lists mapped to views
 */
function toAppDefinitionSchemaView(definition) {
    if (!isPlainObject(definition)) return definition;
    const view = { ...definition };
    for (const key of CLASS_LIST_KEYS) {
        if (Array.isArray(definition[key])) {
            view[key] = definition[key].map((entry) =>
                typeof entry === 'function'
                    ? { Definition: entry.Definition }
                    : entry
            );
        }
    }
    return view;
}

module.exports = {
    applyAppDefinitionDefaults,
    toAppDefinitionSchemaView,
    appDefinitionSchema,
};
