/**
 * The v0.1 step catalogue. A step is { id?, use, with?, when?, onError? }.
 *
 * `use` is either a built-in below or "<moduleKey>.<object>.<verb>": a capability the module's manifest declares
 * (e.g. "hubspot.task.create" -> HubSpot Api.createTask). Nothing else can run: there is no http, eval or script step.
 * The only way to run custom code is `code`, which calls a named, versioned function registered with the runtime.
 */
const { applyMapping } = require('./transforms');
const { resolve } = require('./expressions');

const BUILTINS = {
    'links.find': {
        summary: 'Find the records a sync has already linked. By one side\'s id, or by an identity key the sync indexes (email, phone).',
        args: { sync: 'string (sync id)', from: 'module key, with id', id: 'that module\'s record id', key: '{ <identity field>: value }' },
        run: (a, { ports }) => ports.links.find(a),
    },
    'links.upsert': {
        summary: 'Record that records on two sides are the same thing, and index their identity keys.',
        args: { sync: 'string', ids: '{ <module key>: id }', keys: '{ <identity field>: value }' },
        run: (a, { ports }) => ports.links.upsert(a),
    },
    map: {
        summary: 'Apply a field mapping: a sync\'s mapping (with the installation\'s overrides) or an inline one.',
        args: { sync: 'sync id', mapping: 'inline rows', record: 'the source record' },
        run: (a, { def, installation }) => {
            let rows = a.mapping;
            if (!rows && a.sync) {
                const sync = (def.syncs || []).find((s) => s.id === a.sync);
                if (!sync) throw new Error(`map: unknown sync "${a.sync}"`);
                rows = installation?.syncs?.[a.sync]?.mapping || sync.mapping;
            }
            return applyMapping(rows, a.record || {});
        },
    },
    template: {
        summary: 'Render a named template (definition.templates) or inline text.',
        args: { id: 'template id', text: 'inline template' },
        run: (a, { def, ctx }) => {
            const src = a.id ? def.templates?.[a.id] : a.text;
            if (src == null) throw new Error(`template: unknown template "${a.id}"`);
            return resolve(src, ctx);
        },
    },
    set: {
        summary: 'Store values in $.vars for later steps.',
        args: { '<name>': 'value' },
        run: (a, { ctx }) => { Object.assign(ctx.vars, a); return a; },
    },
    stop: {
        summary: 'End the run early (a normal outcome, not an error). Usually guarded by `when`.',
        args: { reason: 'string' },
        run: (a) => ({ stop: true, reason: a.reason || 'stopped' }),
    },
    foreach: {
        summary: 'Run nested steps once per item ($.item). Bounded by max (default 100, hard cap 1000).',
        args: { over: 'array', max: 'number', do: 'steps' },
        nested: true,
    },
    branch: {
        summary: 'Run the first case whose `when` holds, else the `else` steps.',
        args: { cases: '[{ when, do }]', else: 'steps' },
        nested: true,
    },
    code: {
        summary: 'Call a registered code step: a named, versioned function shipped in reviewed code ("pkg#fn@1.2.0").',
        args: { ref: 'string', with: 'object' },
        run: (a, { ports }) => {
            if (!ports.runCode) throw new Error('code: this runtime has no code steps registered');
            return ports.runCode(a.ref, a.with || {});
        },
    },
};

const FOREACH_HARD_CAP = 1000;

function isBuiltin(use) { return Object.prototype.hasOwnProperty.call(BUILTINS, use); }

/** "hubspot.task.create" -> { module: 'hubspot', capability: 'task.create' } */
function splitCapability(use) {
    const i = use.indexOf('.');
    return i < 0 ? null : { module: use.slice(0, i), capability: use.slice(i + 1) };
}

module.exports = { BUILTINS, FOREACH_HARD_CAP, isBuiltin, splitCapability };
