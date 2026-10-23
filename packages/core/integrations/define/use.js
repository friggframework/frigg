/**
 * `use(module, extensionOptions?)` (ADR-054 §1): a module binding that enables some of the module's extensions.
 *
 *     modules: {
 *         crm: use(hubspot, { webhooks: { subscribe: ['deal.creation'] } }),   // enable hubspot.extensions.webhooks
 *         chat: use(slack),                                                    // no extension
 *         erp: erp,                                                            // the module export alone
 *         old: { definition: erp.Definition },                                 // the shape Definition.modules has today
 *     }
 *
 * The key (`crm`) is the integration author's: it names `ctx.modules.crm`, the routes, events, triggers and fields
 * the module's extensions contribute. `use` is core's, so a module does not implement it.
 */
const BINDING = Symbol.for('frigg.define.binding');

function use(module, extensions = {}) {
    if (!module || typeof module !== 'object' || !module.Definition) {
        throw new Error('use(module, options): the first argument must be an API module export (it has a Definition)');
    }
    if (!extensions || typeof extensions !== 'object' || Array.isArray(extensions)) {
        throw new Error(`use(${module.Definition.moduleName || 'module'}, options): options are an object keyed by extension name`);
    }
    return { [BINDING]: true, module, extensions };
}

/** Any accepted form of a `modules` entry, as `{ key, module, extensions, moduleName }`. */
function normalizeBinding(key, value) {
    let module, extensions = {};
    if (value && value[BINDING]) ({ module, extensions } = value);
    else if (value?.Definition) module = value;
    else if (value?.definition) module = { Definition: value.definition };
    else throw new Error(`modules.${key}: expected use(module), a module export, or { definition }`);
    const def = module.Definition;
    const moduleName = typeof def.getName === 'function' ? def.getName() : def.moduleName;
    if (!moduleName) throw new Error(`modules.${key}: the module's Definition has no moduleName`);
    return { key, module, extensions, moduleName };
}

module.exports = { use, normalizeBinding, BINDING };
