/**
 * Validate a definition (v0.1) against the capability manifests of the modules it uses.
 *
 * Structural rules mirror schema/integration-definition.v0.1.schema.json (kept dependency-free so core needs no
 * JSON-schema library). Semantic rules are the ones a schema cannot express: every step names a capability the
 * module declares and passes its required arguments; $.steps.x refers to an earlier step; $.settings.y is declared;
 * trigger topics are events the module emits; UI placements are ones the host supports.
 *
 * @param {object} def
 * @param {Record<string, object>} manifests  manifest name -> manifest (capabilities/*.capabilities.json)
 * @returns {{ valid: boolean, errors: Array<{path:string,message:string}>, warnings: Array<{path:string,message:string}> }}
 */
const { BUILTINS, isBuiltin, splitCapability } = require('./steps');
const { parseCondition, referencedPaths } = require('./expressions');

const ID = /^[a-z][a-z0-9-]*$/;
const SEMVER = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
const ROOTS = new Set(['event', 'record', 'steps', 'settings', 'install', 'vars', 'item', 'index', 'data', 'row', 'now']);
const COMPONENTS = new Set(['Stack', 'Heading', 'Text', 'KeyValue', 'List', 'Table', 'Badge', 'Button', 'Empty', 'Divider']);
const TRIGGERS = new Set(['webhook', 'schedule', 'userAction', 'syncRecord']);
const TRANSFORMS = new Set(['none', 'trim', 'lowercase', 'uppercase', 'number', 'boolean', 'to_iso_date', 'to_e164_phone', 'split_full_name', 'join', 'map_values', 'default']);
const INSTALL_KEYS = new Set(['webhookUrl', 'portalId', 'runtime', 'integrationId']);

function validate(def, manifests = {}) {
    const errors = [], warnings = [];
    const err = (path, message) => errors.push({ path, message });
    const warn = (path, message) => warnings.push({ path, message });

    if (!def || typeof def !== 'object') return { valid: false, errors: [{ path: '', message: 'Definition must be an object' }], warnings };
    if (def.schemaVersion !== '0.1') err('schemaVersion', 'Must be "0.1"');
    if (!ID.test(def.id || '')) err('id', 'Lowercase letters, digits and dashes, starting with a letter');
    if (!SEMVER.test(def.version || '')) err('version', 'Must be a semantic version (1.4.0)');
    if (!def.display?.label) err('display.label', 'Required');

    // ---------- modules ----------
    const mods = def.modules || {};
    if (!Object.keys(mods).length) err('modules', 'At least one module is required');
    const manifestOf = {};
    for (const [key, m] of Object.entries(mods)) {
        if (!m?.module) { err(`modules.${key}`, 'Needs a module name'); continue; }
        if (!manifests[m.module]) err(`modules.${key}`, `No capability manifest for module "${m.module}"`);
        else manifestOf[key] = manifests[m.module];
    }

    // ---------- ids are unique across kinds (they become event names) ----------
    const seen = new Map();
    for (const kind of ['syncs', 'workflows', 'queries', 'ui']) {
        (def[kind] || []).forEach((x, i) => {
            if (!ID.test(x?.id || '')) err(`${kind}[${i}].id`, 'Lowercase letters, digits and dashes, starting with a letter');
            else if (seen.has(x.id)) err(`${kind}[${i}].id`, `Duplicate id "${x.id}" (also ${seen.get(x.id)})`);
            else seen.set(x.id, `${kind}[${i}]`);
        });
    }
    const syncs = Object.fromEntries((def.syncs || []).map((s) => [s.id, s]));
    const workflows = Object.fromEntries((def.workflows || []).map((w) => [w.id, w]));
    const queries = Object.fromEntries((def.queries || []).map((q) => [q.id, q]));
    const uis = Object.fromEntries((def.ui || []).map((u) => [u.id, u]));

    // ---------- settings ----------
    const checkSettings = (settings, path) => {
        for (const [k, s] of Object.entries(settings || {})) {
            const p = `${path}.${k}`;
            if (!s?.label) err(p, 'Setting needs a label');
            if (!['string', 'text', 'number', 'boolean', 'enum', 'option', 'duration'].includes(s?.type)) err(p, `Unknown setting type "${s?.type}"`);
            if (s?.type === 'enum' && !Array.isArray(s.enum)) err(p, 'enum settings need an enum list');
            if (s?.type === 'option') {
                const [mk, ok] = String(s.options || '').split('.');
                if (!manifestOf[mk]) err(p, `options "${s.options}" names an unknown module key`);
                else if (!manifestOf[mk].options?.[ok]) err(p, `Module "${mk}" has no option list "${ok}"`);
            }
        }
    };
    checkSettings(def.settings, 'settings');

    const objectFields = (key, object) => (manifestOf[key]?.objects?.[object]?.fields || []).map((f) => f.name);
    const splitRef = (ref) => { const [k, o] = String(ref || '').split('.'); return { k, o }; };

    // ---------- syncs ----------
    (def.syncs || []).forEach((s, i) => {
        const p = `syncs[${i}]`;
        if (!s.label) err(`${p}.label`, 'Required');
        if (!['one_way', 'two_way'].includes(s.direction)) err(`${p}.direction`, 'one_way or two_way');
        const src = splitRef(s.source), tgt = splitRef(s.target);
        for (const [side, r] of [['source', src], ['target', tgt]]) {
            if (!manifestOf[r.k]) err(`${p}.${side}`, `Unknown module key "${r.k}"`);
            else if (!manifestOf[r.k].objects?.[r.o]) err(`${p}.${side}`, `Module "${r.k}" has no object "${r.o}"`);
        }
        const sf = objectFields(src.k, src.o), tf = objectFields(tgt.k, tgt.o);
        const match = s.identity?.match || [];
        if (!match.length) err(`${p}.identity.match`, 'At least one identity key is required');
        match.forEach((m, j) => {
            if (!m.key) err(`${p}.identity.match[${j}].key`, 'Name the identity key (email, phone)');
            if (sf.length && !sf.includes(m.source)) err(`${p}.identity.match[${j}].source`, `"${m.source}" is not a field of ${s.source}`);
            if (tf.length && !tf.includes(m.target)) err(`${p}.identity.match[${j}].target`, `"${m.target}" is not a field of ${s.target}`);
        });
        (s.mapping || []).forEach((r, j) => {
            const q = `${p}.mapping[${j}]`;
            if (sf.length && !sf.includes(r.source)) err(`${q}.source`, `"${r.source}" is not a field of ${s.source}`);
            if (tf.length && !tf.includes(r.target)) err(`${q}.target`, `"${r.target}" is not a field of ${s.target}`);
            const tfield = manifestOf[tgt.k]?.objects?.[tgt.o]?.fields?.find((f) => f.name === r.target);
            if (tfield?.readOnly && r.direction !== 'to_source') err(`${q}.target`, `"${r.target}" is read-only in ${s.target}`);
            if (r.transform && !TRANSFORMS.has(r.transform)) err(`${q}.transform`, `Unknown transform "${r.transform}"`);
        });
        if (s.ongoing?.mode === 'webhook') {
            const hasEvents = (k, o) => Object.values(manifestOf[k]?.events || {}).some((e) => e.object === o);
            if (manifestOf[src.k] && !hasEvents(src.k, src.o)) warn(`${p}.ongoing`, `${s.source} declares no webhook events; ongoing sync will need polling`);
        }
        if (s.filter) checkCondition(s.filter, `${p}.filter`);
    });

    // ---------- steps ----------
    function checkCondition(src, path) {
        try { parseCondition(src); } catch (e) { err(path, e.message); return; }
        checkRefs(src, path, null);
    }
    function checkRefs(value, path, scope) {
        for (const ref of referencedPaths(value)) {
            const segs = ref.replace(/^\$\./, '').split(/\.|\[/);
            const root = segs[0];
            if (!ROOTS.has(root)) { err(path, `Unknown root "$.${root}" (use event, record, steps, settings, install, vars, item, data)`); continue; }
            if (!scope) continue;
            if (root === 'steps' && segs[1] && !scope.steps.has(segs[1])) err(path, `$.steps.${segs[1]} is not an earlier step in this list`);
            if (root === 'settings' && segs[1] && !scope.settings.has(segs[1])) err(path, `$.settings.${segs[1]} is not a setting of this workflow`);
            if (root === 'install' && segs[1] && !scope.install.has(segs[1])) err(path, `$.install.${segs[1]} is not an integration setting`);
            if ((root === 'item' || root === 'index') && !scope.inLoop) err(path, `$.${root} is only available inside foreach`);
        }
    }
    function checkSteps(steps, path, scope) {
        if (!Array.isArray(steps)) { err(path, 'Steps must be a list'); return; }
        steps.forEach((st, i) => {
            const p = `${path}[${i}]`;
            if (!st?.use) { err(p, 'Step needs "use"'); return; }
            if (st.when) checkCondition(st.when, `${p}.when`), checkRefs(st.when, `${p}.when`, scope);
            if (st.onError && !['fail', 'continue', 'stop'].includes(st.onError)) err(`${p}.onError`, 'fail, continue or stop');
            const args = st.with || {};
            if (st.use === 'foreach') {
                checkRefs(args.over, `${p}.with.over`, scope);
                checkSteps(st.do, `${p}.do`, { ...scope, steps: new Set(scope.steps), inLoop: true });
            } else if (st.use === 'branch') {
                (st.cases || []).forEach((c, j) => { checkCondition(c.when, `${p}.cases[${j}].when`); checkRefs(c.when, `${p}.cases[${j}].when`, scope); checkSteps(c.do, `${p}.cases[${j}].do`, { ...scope, steps: new Set(scope.steps) }); });
                if (st.else) checkSteps(st.else, `${p}.else`, { ...scope, steps: new Set(scope.steps) });
            } else if (isBuiltin(st.use)) {
                checkRefs(args, `${p}.with`, scope);
                if (st.use.startsWith('links.')) {
                    const sy = syncs[args.sync];
                    if (!sy) err(`${p}.with.sync`, `Unknown sync "${args.sync}"`);
                    else if (args.key) {
                        const keys = new Set((sy.identity?.match || []).map((m) => m.key));
                        for (const k of Object.keys(args.key)) if (!keys.has(k)) err(`${p}.with.key`, `"${k}" is not an identity key of sync "${sy.id}" (${[...keys].join(', ')})`);
                    } else if (st.use === 'links.find' && !(args.from && args.id)) err(`${p}.with`, 'links.find needs key, or from + id');
                }
                if (st.use === 'template' && args.id && !def.templates?.[args.id]) err(`${p}.with.id`, `Unknown template "${args.id}"`);
                if (st.use === 'map' && args.sync && !syncs[args.sync]) err(`${p}.with.sync`, `Unknown sync "${args.sync}"`);
                if (st.use === 'code' && !/^[@\w/.-]+#\w+@\d+\.\d+\.\d+$/.test(args.ref || '')) err(`${p}.with.ref`, 'Code steps are "package#function@x.y.z"');
            } else {
                const cap = splitCapability(st.use);
                const man = cap && manifestOf[cap.module];
                if (!man) err(`${p}.use`, `"${st.use}" is not a built-in, and "${cap?.module}" is not a module key`);
                else {
                    const c = man.capabilities?.[cap.capability];
                    if (!c) err(`${p}.use`, `Module "${cap.module}" (${man.module}) has no capability "${cap.capability}"`);
                    else {
                        for (const [name, spec] of Object.entries(c.input || {})) if (spec.required && !(name in args)) err(`${p}.with.${name}`, `Required by ${st.use}`);
                        for (const name of Object.keys(args)) if (c.input && !(name in c.input)) err(`${p}.with.${name}`, `${st.use} takes no argument "${name}"`);
                    }
                }
                checkRefs(args, `${p}.with`, scope);
            }
            if (st.id) {
                if (scope.steps.has(st.id) && scope.declared.has(st.id)) err(`${p}.id`, `Step id "${st.id}" is used twice`);
                scope.steps.add(st.id); scope.declared.add(st.id);
            }
        });
    }
    const installKeys = new Set([...Object.keys(def.settings || {}), ...INSTALL_KEYS]);
    const newScope = (settings) => ({ steps: new Set(), declared: new Set(), settings: new Set(Object.keys(settings || {})), install: installKeys, inLoop: false });

    // ---------- workflows ----------
    (def.workflows || []).forEach((w, i) => {
        const p = `workflows[${i}]`;
        if (!w.label) err(`${p}.label`, 'Required');
        checkSettings(w.settings, `${p}.settings`);
        const t = w.trigger || {};
        if (!TRIGGERS.has(t.type)) err(`${p}.trigger.type`, `One of ${[...TRIGGERS].join(', ')}`);
        if (t.type === 'webhook') {
            if (!manifestOf[t.module]) err(`${p}.trigger.module`, `Unknown module key "${t.module}"`);
            else if (!manifestOf[t.module].events?.[t.topic]) err(`${p}.trigger.topic`, `Module "${t.module}" emits no event "${t.topic}"`);
        }
        if (t.type === 'schedule' && String(t.cron || '').trim().split(/\s+/).length !== 5) err(`${p}.trigger.cron`, 'Five-field cron expression');
        if (t.type === 'userAction' && t.from && !uis[t.from]) err(`${p}.trigger.from`, `Unknown UI surface "${t.from}"`);
        if (t.type === 'syncRecord' && !syncs[t.sync]) err(`${p}.trigger.sync`, `Unknown sync "${t.sync}"`);
        if (t.filter) checkCondition(t.filter, `${p}.trigger.filter`);
        if (!w.steps?.length) err(`${p}.steps`, 'At least one step');
        checkSteps(w.steps, `${p}.steps`, newScope(w.settings));
    });

    // ---------- queries ----------
    (def.queries || []).forEach((q, i) => {
        const scope = newScope({});
        checkSteps(q.steps || [], `queries[${i}].steps`, scope);
        checkRefs(q.returns, `queries[${i}].returns`, scope);
    });

    // ---------- ui ----------
    function checkView(node, path, inRow) {
        if (!node || !COMPONENTS.has(node.component)) { err(path, `Unknown component "${node?.component}" (v0.1: ${[...COMPONENTS].join(', ')})`); return; }
        if (node.when) checkCondition(node.when, `${path}.when`);
        const a = node.props?.action;
        if (a?.type === 'userAction') {
            const w = workflows[a.workflow];
            if (!w) err(`${path}.props.action.workflow`, `Unknown workflow "${a.workflow}"`);
            else if (w.trigger?.type !== 'userAction') err(`${path}.props.action.workflow`, `Workflow "${a.workflow}" is not triggered by a user action`);
        } else if (a && a.type !== 'open_url') err(`${path}.props.action.type`, 'userAction or open_url');
        (node.children || []).forEach((c, j) => checkView(c, `${path}.children[${j}]`, inRow));
    }
    (def.ui || []).forEach((u, i) => {
        const p = `ui[${i}]`;
        const host = manifestOf[u.host];
        if (!host) err(`${p}.host`, `Unknown module key "${u.host}"`);
        else if (!(host.ui?.placements || []).includes(u.placement)) err(`${p}.placement`, `"${u.placement}" is not a placement ${host.module} supports (${(host.ui?.placements || []).join(', ') || 'none'})`);
        if (!queries[u.data?.query]) err(`${p}.data.query`, `Unknown query "${u.data?.query}"`);
        checkView(u.view, `${p}.view`, false);
    });

    // ---------- lifecycle ----------
    for (const hook of ['onInstall', 'onUninstall']) if (def.lifecycle?.[hook]) checkSteps(def.lifecycle[hook], `lifecycle.${hook}`, newScope({}));

    return { valid: errors.length === 0, errors, warnings };
}

module.exports = { validate };
