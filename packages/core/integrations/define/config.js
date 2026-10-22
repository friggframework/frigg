/**
 * `config` (ADR-054 §4): the end user's per-install form, compiled to what `getConfigOptions()` returns today
 * (`{ jsonSchema, uiSchema }`), so `validateConfig()`, NEEDS_CONFIG and the config/options routes work unchanged.
 *
 * An entry is either a JSON Schema fragment, with two conveniences:
 *
 *     minAmount: { type: 'number', title: 'Only deals worth at least', default: 0, required: true, ui: { 'ui:help': '…' } }
 *
 * or a module field: what a module's `fields.<name>(opts)` returns. A field is a schema fragment plus a loader for
 * its choices, run with the installation's own credential for that module:
 *
 *     { module: 'slack', schema: { type: 'string', title }, required, ui, options: async (api, { config }) => [{ const, title }] }
 *
 * The loader runs against the binding of that module. When a module is bound twice, the author picks one with
 * `{ ...slack.fields.channel(), from: 'chatA' }`. No field reaches a form unless the integration author put it in
 * `config`, which keeps ADR-054 §4's rule: an extension never adds to the end user's form by itself.
 */
const { withDefaults } = require('./json-schema-lite');

const isField = (v) => Boolean(v && typeof v === 'object' && v.schema && typeof v.schema === 'object' && typeof v.options === 'function');

/**
 * @param {object} config the `config` given to defineIntegration
 * @param {Array<{ key, moduleName }>} bindings
 * @param {string} where for messages
 */
function compileConfig(config = {}, bindings = [], where = 'defineIntegration') {
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error(`${where}: "config" must be an object keyed by field name`);
    const properties = {}, uiSchema = {}, required = [], fields = {};
    for (const [name, entry] of Object.entries(config)) {
        if (!entry || typeof entry !== 'object') throw new Error(`${where}: config.${name} must be a JSON Schema fragment or a module field`);
        if (isField(entry)) {
            const candidates = bindings.filter((b) => (entry.from ? b.key === entry.from : b.moduleName === entry.module));
            if (candidates.length === 0) {
                throw new Error(`${where}: config.${name} is a ${entry.module} field${entry.from ? ` from "${entry.from}"` : ''}, but no such module is bound in "modules"`);
            }
            if (candidates.length > 1) {
                throw new Error(`${where}: config.${name} is a ${entry.module} field and ${entry.module} is bound as ${candidates.map((b) => b.key).join(' and ')}; say which with { ...field, from: '<key>' }`);
            }
            fields[name] = { field: entry, moduleKey: candidates[0].key };
            properties[name] = { ...entry.schema };
            if (entry.ui) uiSchema[name] = { ...entry.ui };
            if (entry.required) required.push(name);
            continue;
        }
        const { required: isRequired, ui, ...schema } = entry;
        if (isRequired !== undefined && typeof isRequired !== 'boolean') throw new Error(`${where}: config.${name}.required must be true or false`);
        properties[name] = schema;
        if (ui) uiSchema[name] = { ...ui };
        if (isRequired) required.push(name);
    }
    const jsonSchema = { type: 'object', properties, ...(required.length ? { required } : {}) };
    return { jsonSchema, uiSchema, fields };
}

/** The config a handler sees: the stored config with the form's defaults filled in. */
function resolveConfig(plan, stored = {}) {
    return withDefaults(plan.jsonSchema, stored || {});
}

const asChoice = (c) => (c && typeof c === 'object'
    ? { const: c.const ?? c.value ?? c.id, title: String(c.title ?? c.label ?? c.name ?? c.const ?? c.value ?? c.id) }
    : { const: c, title: String(c) });

/**
 * The form with each module field's choices loaded from the connected account.
 * @param {object} plan compileConfig's result
 * @param {(moduleKey: string) => object|undefined} apiFor the installation's Api for a binding key
 * @param {object} values the stored config, or the form's current values on refresh
 * @param {{ warn: Function }} [log]
 */
async function configOptions(plan, apiFor, values = {}, log) {
    const jsonSchema = JSON.parse(JSON.stringify(plan.jsonSchema));
    const uiSchema = JSON.parse(JSON.stringify(plan.uiSchema));
    const config = resolveConfig(plan, values);
    for (const [name, { field, moduleKey }] of Object.entries(plan.fields)) {
        const api = apiFor(moduleKey);
        let choices = [];
        if (api) {
            try {
                choices = (await field.options(api, { config })) || [];
            } catch (error) {
                log?.warn?.('Config field options did not load', { eventName: 'frigg.define.config_options_failed', field: name, error });
                uiSchema[name] = { ...(uiSchema[name] || {}), 'ui:help': 'The options could not be loaded from the connected account. Try again.' };
            }
        } else {
            uiSchema[name] = { ...(uiSchema[name] || {}), 'ui:help': `Connect ${field.module} to choose.` };
        }
        const oneOf = choices.map(asChoice);
        if (!oneOf.length) continue;
        const prop = { ...field.schema, ...(field.schema.title ? { title: field.schema.title } : {}) };
        if (prop.type === 'array') jsonSchema.properties[name] = { ...prop, uniqueItems: true, items: { ...(prop.items || { type: 'string' }), oneOf } };
        else jsonSchema.properties[name] = { ...prop, oneOf };
    }
    return { jsonSchema, uiSchema };
}

module.exports = { compileConfig, resolveConfig, configOptions, isField };
