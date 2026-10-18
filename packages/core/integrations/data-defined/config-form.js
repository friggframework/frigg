/**
 * The configure form for a data-defined installation, generated from its definition: what GET_CONFIG_OPTIONS and
 * REFRESH_CONFIG_OPTIONS return on Frigg's existing, authenticated /api/integrations/:id/config/options routes.
 *
 * The form's data has exactly the shape of Integration.config, so what the management UI PATCHes back is the config:
 *   { settings: { … }, syncs: { <id>: { enabled } }, workflows: { <id>: { enabled, settings: { … } } }, ui: { <id>: { enabled } } }
 *
 * Option settings become enums filled by `options(path, values)` (resolveOptions underneath). A list whose inputs are
 * not chosen yet comes back empty with a help line saying what to choose first; REFRESH_CONFIG_OPTIONS, called with
 * the form's current values, fills it.
 */
const SETTING_SCHEMA = {
    string: () => ({ type: 'string' }),
    text: () => ({ type: 'string' }),
    number: () => ({ type: 'number' }),
    boolean: () => ({ type: 'boolean' }),
    duration: () => ({ type: 'string', pattern: '^\\d+(m|h|d)$' }),
    enum: (s) => ({ type: 'string', enum: s.enum }),
};

const dependsOn = (s) => (s && typeof s.options === 'object' ? Object.values(s.options.with || {}).map((v) => String(v).replace(/^\$\.(settings|install)\./, '')) : []);

async function settingsSchema(settings, pathPrefix, values, options, integrationSettings) {
    const properties = {}, ui = {}, required = [];
    for (const [key, s] of Object.entries(settings || {})) {
        let schema;
        if (s.type === 'option') {
            const choices = await options(`${pathPrefix}.${key}`, values, integrationSettings);
            schema = choices.length
                ? { type: 'string', oneOf: choices.map((c) => ({ const: String(c.value), title: c.label })) }
                : { type: 'string', enum: [] };
            if (!choices.length && dependsOn(s).length) ui[key] = { 'ui:help': `Choose ${dependsOn(s).join(' and ')} first.` };
        } else schema = (SETTING_SCHEMA[s.type] || SETTING_SCHEMA.string)(s);
        properties[key] = { ...schema, title: s.label, ...(s.default !== undefined ? { default: s.default } : {}) };
        if (s.help) ui[key] = { ...(ui[key] || {}), 'ui:help': s.help };
        if (s.required && s.default === undefined) required.push(key);
    }
    return { schema: { type: 'object', properties, ...(required.length ? { required } : {}) }, ui };
}

const toggle = (title, description, enabledByDefault) => ({ type: 'boolean', title, ...(description ? { description } : {}), default: enabledByDefault });
const isOn = (item, chosen) => (typeof chosen?.enabled === 'boolean' ? chosen.enabled : (item.default || 'on') === 'on');

/**
 * @param {object} def
 * @param {object} config        the installation's current config (or the form's current values on refresh)
 * @param {(path: string, values: object, integrationSettings: object) => Promise<Array<{label,value}>>} options
 * @returns {Promise<{ jsonSchema: object, uiSchema: object, data: object }>}
 */
async function buildConfigForm(def, config = {}, options = async () => []) {
    const jsonSchema = { type: 'object', title: def.display?.label, properties: {} };
    const uiSchema = {};
    const data = { settings: { ...(config.settings || {}) }, syncs: {}, workflows: {}, ui: {} };

    if (Object.keys(def.settings || {}).length) {
        const s = await settingsSchema(def.settings, 'settings', config.settings || {}, options, config.settings || {});
        jsonSchema.properties.settings = { title: 'Settings', ...s.schema };
        uiSchema.settings = s.ui;
    }

    if ((def.syncs || []).length) {
        jsonSchema.properties.syncs = { type: 'object', title: 'Syncs', properties: {} };
        for (const s of def.syncs) {
            jsonSchema.properties.syncs.properties[s.id] = { type: 'object', title: s.label, properties: { enabled: toggle('On', s.description, (s.default || 'on') === 'on') } };
            data.syncs[s.id] = { enabled: isOn(s, config.syncs?.[s.id]) };
        }
    }

    if ((def.workflows || []).length) {
        jsonSchema.properties.workflows = { type: 'object', title: 'Workflows', properties: {} };
        uiSchema.workflows = {};
        for (const w of def.workflows) {
            const chosen = config.workflows?.[w.id] || {};
            const node = { type: 'object', title: w.label, properties: { enabled: toggle('On', w.description, (w.default || 'on') === 'on') } };
            data.workflows[w.id] = { enabled: isOn(w, chosen), settings: { ...(chosen.settings || {}) } };
            if (Object.keys(w.settings || {}).length) {
                // A workflow setting's option inputs may read integration settings, which it sees as $.install.
                const s = await settingsSchema(w.settings, `workflows.${w.id}.settings`, chosen.settings || {}, options, config.settings || {});
                node.properties.settings = { title: 'Settings', ...s.schema };
                uiSchema.workflows[w.id] = { settings: s.ui };
                // Settings only matter while the workflow is on: required only then.
                node.dependencies = { enabled: { oneOf: [{ properties: { enabled: { const: false } } }, { properties: { enabled: { const: true } }, required: ['settings'] }] } };
            }
            jsonSchema.properties.workflows.properties[w.id] = node;
        }
    }

    if ((def.ui || []).length) {
        jsonSchema.properties.ui = { type: 'object', title: 'Cards and panels', properties: {} };
        for (const u of def.ui) {
            jsonSchema.properties.ui.properties[u.id] = { type: 'object', title: u.label || u.id, properties: { enabled: toggle('Show', `${u.host} · ${u.placement}`, (u.default || 'on') === 'on') } };
            data.ui[u.id] = { enabled: isOn(u, config.ui?.[u.id]) };
        }
    }

    return { jsonSchema, uiSchema, data };
}

/** Is anything required still missing? (NEEDS_CONFIG) */
function missingRequired(def, config = {}) {
    const missing = [];
    for (const [k, s] of Object.entries(def.settings || {})) if (s.required && s.default === undefined && (config.settings?.[k] == null || config.settings[k] === '')) missing.push(`settings.${k}`);
    for (const w of def.workflows || []) {
        if (!isOn(w, config.workflows?.[w.id])) continue;
        for (const [k, s] of Object.entries(w.settings || {})) if (s.required && s.default === undefined && (config.workflows?.[w.id]?.settings?.[k] == null || config.workflows[w.id].settings[k] === '')) missing.push(`workflows.${w.id}.settings.${k}`);
    }
    return missing;
}

module.exports = { buildConfigForm, missingRequired };
