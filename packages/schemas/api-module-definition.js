/**
 * API module definition helpers shared by validators and the frigg CLI.
 * Real Definitions carry classes and functions that JSON Schema cannot
 * describe; validators check the serialisable view produced here.
 */

function isPlainObject(value) {
    if (value === null || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * Schema descriptor for a JavaScript function (see api-module-definition
 * schema: `{ type: "function", async?: boolean }`).
 *
 * @param {Function} fn
 * @returns {{ type: 'function', async?: boolean }}
 */
function toFunctionDescriptor(fn) {
    const descriptor = { type: 'function' };
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction') {
        descriptor.async = true;
    }
    return descriptor;
}

/**
 * JSON Schema cannot describe a JavaScript class or function. Validators
 * therefore check this serialisable view: the API class becomes an empty
 * object, functions become `{ type: "function" }` descriptors, and
 * `undefined` env values are dropped (unset `process.env.*` entries).
 *
 * @param {object} definition the `Definition` exported by an API module
 * @returns {object} a view suitable for the api-module-definition schema
 */
function toApiModuleDefinitionSchemaView(definition) {
    if (!isPlainObject(definition)) return definition;

    const view = { ...definition };

    if (typeof view.API === 'function') {
        view.API = {};
    }

    if (typeof view.getName === 'function') {
        view.getName = toFunctionDescriptor(view.getName);
    }

    if (isPlainObject(view.requiredAuthMethods)) {
        const methods = { ...view.requiredAuthMethods };
        for (const [key, value] of Object.entries(methods)) {
            if (typeof value === 'function') {
                methods[key] = toFunctionDescriptor(value);
            }
        }
        view.requiredAuthMethods = methods;
    }

    if (isPlainObject(view.env)) {
        const env = {};
        for (const [key, value] of Object.entries(view.env)) {
            if (value !== undefined) env[key] = value;
        }
        view.env = env;
    }

    if (isPlainObject(view.manager)) {
        const manager = { ...view.manager };
        for (const key of ['Entity', 'Credential']) {
            if (typeof manager[key] === 'function') {
                manager[key] = {};
            }
        }
        if (isPlainObject(manager.methods)) {
            const methods = { ...manager.methods };
            for (const [key, value] of Object.entries(methods)) {
                if (typeof value === 'function') {
                    methods[key] = {};
                }
            }
            manager.methods = methods;
        }
        view.manager = manager;
    }

    return view;
}

module.exports = {
    toApiModuleDefinitionSchemaView,
    toFunctionDescriptor,
};
