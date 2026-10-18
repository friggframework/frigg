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
const { parseCondition, referencedPaths, templateTags, FILTERS } = require('./expressions');
const { TRANSFORMS: TRANSFORM_FNS } = require('./transforms');

const ID = /^[a-z][a-z0-9-]*$/;
const SEMVER = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
const ROOTS = new Set(['event', 'record', 'steps', 'settings', 'install', 'vars', 'item', 'index', 'data', 'row', 'now']);
const COMPONENTS = new Set(['Stack', 'Heading', 'Text', 'KeyValue', 'List', 'Table', 'Badge', 'Button', 'Empty', 'Divider']);
const TRIGGERS = new Set(['webhook', 'schedule', 'userAction', 'syncRecord']);
const TRANSFORMS = new Set(Object.keys(TRANSFORM_FNS));
const INSTALL_KEYS = new Set(['webhookUrl', 'portalId', 'runtime', 'integrationId', 'accounts']);

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
    for (const kind of ['syncs', 'links', 'workflows', 'queries', 'ui']) {
        (def[kind] || []).forEach((x, i) => {
            if (!ID.test(x?.id || '')) err(`${kind}[${i}].id`, 'Lowercase letters, digits and dashes, starting with a letter');
            else if (seen.has(x.id)) err(`${kind}[${i}].id`, `Duplicate id "${x.id}" (also ${seen.get(x.id)})`);
            else seen.set(x.id, `${kind}[${i}]`);
        });
    }
    const installKeys = new Set([...Object.keys(def.settings || {}), ...INSTALL_KEYS]);
    const installStepIds = new Set((def.lifecycle?.onInstall || []).map((st) => st?.id).filter(Boolean));
    const syncs = Object.fromEntries((def.syncs || []).map((s) => [s.id, s]));
    const linkSets = Object.fromEntries((def.links || []).map((l) => [l.id, l]));
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
            if (s?.type === 'option') checkOptionSource(s.options, `${p}.options`, k, settings, path !== 'settings');
        }
        // An option list may read earlier choices; a loop (a reads b, b reads a) could never be filled in.
        const reads = (k) => Object.values(optionInputs(settings?.[k])).flatMap((v) => referencedPaths(v)).map((r) => r.split('.')).filter((x) => x[1] === 'settings').map((x) => x[2]);
        for (const k of Object.keys(settings || {})) {
            const seenK = new Set([k]); const stack = [...reads(k)];
            while (stack.length) { const n = stack.pop(); if (n === k) { err(`${path}.${k}.options`, `Option inputs form a loop through "${k}"`); break; } if (!seenK.has(n)) { seenK.add(n); stack.push(...reads(n)); } }
        }
    };
    const optionInputs = (s) => (s && typeof s.options === 'object' ? s.options.with || {} : {});
    function checkOptionSource(opts, p, self, siblings, isWorkflow) {
        const ref = typeof opts === 'string' ? { source: opts } : opts;
        if (!ref || typeof ref.source !== 'string') { err(p, 'options is "module.list" or { source: "module.list", with: { ... } }'); return; }
        const [mk, ok] = ref.source.split('.');
        if (!manifestOf[mk]) { err(p, `options "${ref.source}" names an unknown module key`); return; }
        const list = manifestOf[mk].options?.[ok];
        if (!list) { err(p, `Module "${mk}" has no option list "${ok}"`); return; }
        const inputs = list.inputs || {};
        for (const [name, spec] of Object.entries(inputs)) if (spec.required && !(name in (ref.with || {}))) err(`${p}.with.${name}`, `Option list ${ref.source} needs input "${name}"`);
        for (const [name, v] of Object.entries(ref.with || {})) {
            if (!(name in inputs)) { err(`${p}.with.${name}`, `Option list ${ref.source} takes no input "${name}"`); continue; }
            for (const r of referencedPaths(v)) {
                const [, root, key] = r.split(/\.|\[/);
                if (root === 'settings' && key === self) err(`${p}.with.${name}`, 'An option list cannot read its own setting');
                else if (root === 'settings' && !(key in (siblings || {}))) err(`${p}.with.${name}`, `$.settings.${key} is not a setting at this level`);
                else if (root === 'install' && !(isWorkflow && key in (def.settings || {}))) err(`${p}.with.${name}`, `$.install.${key} is not an integration setting`);
                else if (root !== 'settings' && root !== 'install') err(`${p}.with.${name}`, 'Option inputs can only read $.settings (or $.install from a workflow setting)');
            }
        }
    }
    checkSettings(def.settings, 'settings');

    const objectFields = (key, object) => (manifestOf[key]?.objects?.[object]?.fields || []).map((f) => f.name);
    const splitRef = (ref) => { const [k, o] = String(ref || '').split('.'); return { k, o }; };

    // ---------- link sets: links between records with no sync behind them ----------
    (def.links || []).forEach((l, i) => {
        const p = `links[${i}]`;
        if (!Array.isArray(l.between) || l.between.length !== 2) { err(`${p}.between`, 'Two "module.object" references'); return; }
        l.between.forEach((ref, j) => {
            const r = splitRef(ref);
            if (!manifestOf[r.k]) err(`${p}.between[${j}]`, `Unknown module key "${r.k}"`);
            else if (!manifestOf[r.k].objects?.[r.o]) err(`${p}.between[${j}]`, `Module "${r.k}" has no object "${r.o}"`);
        });
        if (splitRef(l.between[0]).k === splitRef(l.between[1]).k) err(`${p}.between`, 'A link set joins two different modules');
        (l.identity?.match || []).forEach((m, j) => {
            if (!m.key) err(`${p}.identity.match[${j}].key`, 'Name the identity key (email, phone)');
            if (m.transform && !TRANSFORMS.has(m.transform)) err(`${p}.identity.match[${j}].transform`, `Unknown transform "${m.transform}"`);
        });
    });
    const checkRows = (rows, p, sf, tf, srcName, tgtName, tgtFields) => (rows || []).forEach((r, j) => {
        const q = `${p}[${j}]`;
        const fixed = r && 'value' in r;
        if (fixed && r.source != null) err(q, 'A row has a source or a fixed value, not both');
        else if (!fixed && !r?.source) err(q, 'A row needs a source or a fixed value');
        if (!fixed && sf?.length && !sf.includes(r.source)) err(`${q}.source`, `"${r.source}" is not a field of ${srcName}`);
        if (tf?.length && !tf.includes(r.target)) err(`${q}.target`, `"${r.target}" is not a field of ${tgtName}`);
        const tfield = tgtFields?.find((f) => f.name === r.target);
        if (tfield?.readOnly && r.direction !== 'to_source') err(`${q}.target`, `"${r.target}" is read-only in ${tgtName}`);
        if (fixed && r.direction === 'to_source') err(`${q}.direction`, 'A fixed value only writes to the target');
        if (r.transform && !TRANSFORMS.has(r.transform)) err(`${q}.transform`, `Unknown transform "${r.transform}"`);
    });

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
        checkRows(s.mapping, `${p}.mapping`, sf, tf, s.source, s.target, manifestOf[tgt.k]?.objects?.[tgt.o]?.fields);
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
    function checkFilters(value, path) {
        for (const t of templateTags(value)) for (const f of t.filters) if (!FILTERS[f.name]) err(path, `Unknown template filter "${f.name}" (${Object.keys(FILTERS).join(', ')})`);
    }
    function checkRefs(value, path, scope) {
        checkFilters(value, path);
        for (const ref of referencedPaths(value)) {
            const segs = ref.replace(/^\$\./, '').split(/\.|\[/);
            const root = segs[0];
            if (!ROOTS.has(root)) { err(path, `Unknown root "$.${root}" (use event, record, steps, settings, install, vars, item, data)`); continue; }
            if (!scope) { if (root === 'install') checkInstallRef(segs, path, null); continue; }
            if (root === 'steps' && segs[1] && !scope.steps.has(segs[1])) err(path, `$.steps.${segs[1]} is not an earlier step in this list`);
            if (root === 'settings' && segs[1] && !scope.settings.has(segs[1])) err(path, `$.settings.${segs[1]} is not a setting of this workflow`);
            if (root === 'install') checkInstallRef(segs, path, scope);
            if ((root === 'item' || root === 'index') && !scope.inLoop) err(path, `$.${root} is only available inside foreach`);
        }
    }
    // $.install.<integration setting> · $.install.accounts.<module key>.<account field the manifest declares>
    // $.install.runtime.installed.<onInstall step id> (not readable while install itself is running)
    function checkInstallRef(segs, path, scope) {
        const [, key, a, b] = segs;
        if (!key) return;
        if (!installKeys.has(key)) { err(path, `$.install.${key} is not an integration setting`); return; }
        if (key === 'accounts' && a) {
            if (!manifestOf[a]) err(path, `$.install.accounts.${a}: "${a}" is not a module key`);
            else if (b && !(manifestOf[a].account?.fields || []).some((f) => f.name === b)) err(path, `$.install.accounts.${a}.${b}: ${manifestOf[a].module} declares no account field "${b}" (${(manifestOf[a].account?.fields || []).map((f) => f.name).join(', ') || 'none'})`);
        }
        if (key === 'runtime' && a) {
            if (a !== 'installed') err(path, `$.install.runtime.${a}: runtime only holds "installed" (the results of onInstall steps)`);
            else if (scope?.installing) err(path, 'Install steps cannot read $.install.runtime.installed; refer to an earlier step with $.steps');
            else if (b && !installStepIds.has(b)) err(path, `$.install.runtime.installed.${b}: no onInstall step has id "${b}"`);
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
                const inner = { ...scope, steps: new Set(scope.steps), declared: new Set(), inLoop: true };
                if (args.where) { checkCondition(args.where, `${p}.with.where`); checkRefs(args.where, `${p}.with.where`, inner); }
                if (!st.do && !('collect' in args)) err(p, 'foreach needs do steps, collect, or both');
                if (st.do) checkSteps(st.do, `${p}.do`, inner);
                if ('collect' in args) checkRefs(args.collect, `${p}.with.collect`, inner);
                if (args.max != null && !(Number.isInteger(args.max) && args.max > 0 && args.max <= 1000)) err(`${p}.with.max`, 'A whole number from 1 to 1000');
            } else if (st.use === 'branch') {
                (st.cases || []).forEach((c, j) => { checkCondition(c.when, `${p}.cases[${j}].when`); checkRefs(c.when, `${p}.cases[${j}].when`, scope); checkSteps(c.do, `${p}.cases[${j}].do`, { ...scope, steps: new Set(scope.steps) }); });
                if (st.else) checkSteps(st.else, `${p}.else`, { ...scope, steps: new Set(scope.steps) });
            } else if (isBuiltin(st.use)) {
                checkRefs(args, `${p}.with`, scope);
                if (st.use.startsWith('links.')) {
                    const isLink = 'link' in args;
                    if (isLink === ('sync' in args)) err(`${p}.with`, `${st.use} names a link set (link) or a sync (sync), exactly one`);
                    const set = isLink ? linkSets[args.link] : syncs[args.sync];
                    if (!set) err(`${p}.with.${isLink ? 'link' : 'sync'}`, `Unknown ${isLink ? 'link set' : 'sync'} "${isLink ? args.link : args.sync}"`);
                    else {
                        const keys = new Set((set.identity?.match || []).map((m) => m.key));
                        const mods = new Set((isLink ? set.between : [set.source, set.target]).map((r) => splitRef(r).k));
                        const label = `${isLink ? 'link set' : 'sync'} "${set.id}"`;
                        for (const k of Object.keys((st.use === 'links.find' ? args.key : args.keys) || {})) if (!keys.has(k)) err(`${p}.with.${st.use === 'links.find' ? 'key' : 'keys'}`, `"${k}" is not an identity key of ${label}${keys.size ? ` (${[...keys].join(', ')})` : ''}`);
                        if (st.use === 'links.find' && !args.key && !(args.from && args.id)) err(`${p}.with`, 'links.find needs key, or from + id');
                        if (args.from && !mods.has(args.from)) err(`${p}.with.from`, `"${args.from}" is not one of the modules ${label} links`);
                        for (const m of Object.keys(args.ids || {})) if (!mods.has(m)) err(`${p}.with.ids.${m}`, `"${m}" is not one of the modules ${label} links`);
                    }
                }
                if (st.use === 'merge' && !(Array.isArray(args.objects) || (typeof args.objects === 'string' && args.objects.startsWith('$.')))) err(`${p}.with.objects`, 'A list of objects (or a reference to one)');
                if (st.use === 'map' && Array.isArray(args.mapping)) checkRows(args.mapping, `${p}.with.mapping`);
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
    // A view sees $.data (the query's returns), $.record and $.install; $.item inside a List's title/meta, $.row inside
    // a Table column. Anything else is a typo that would render blank, so it is an error here, not at runtime.
    function checkViewRefs(value, path, ctx) {
        checkFilters(value, path);
        for (const ref of referencedPaths(value)) {
            const [root, key] = ref.replace(/^\$\./, '').split(/\.|\[/);
            const allowed = ['data', 'record', 'install', ...(ctx.item ? ['item'] : []), ...(ctx.row ? ['row'] : [])];
            if (!allowed.includes(root)) err(path, `$.${root} is not available here (a view can read ${allowed.map((r) => '$.' + r).join(', ')})`);
            else if (root === 'data' && key && ctx.dataKeys && !ctx.dataKeys.has(key)) err(path, `$.data.${key} is not returned by query "${ctx.query}" (${[...ctx.dataKeys].join(', ')})`);
            else if (root === 'install') checkInstallRef(ref.replace(/^\$\./, '').split(/\.|\[/), path, null);
        }
    }
    function checkView(node, path, ctx) {
        if (!node || !COMPONENTS.has(node.component)) { err(path, `Unknown component "${node?.component}" (v0.1: ${[...COMPONENTS].join(', ')})`); return; }
        if (node.when) { checkCondition(node.when, `${path}.when`); checkViewRefs(node.when, `${path}.when`, ctx); }
        const props = { ...(node.props || {}) };
        if (node.component === 'List') {
            checkViewRefs(props.items, `${path}.props.items`, ctx);
            for (const k of ['title', 'meta']) checkViewRefs(props[k], `${path}.props.${k}`, { ...ctx, item: true });
            delete props.items; delete props.title; delete props.meta;
        } else if (node.component === 'Table') {
            checkViewRefs(props.rows, `${path}.props.rows`, ctx);
            (props.columns || []).forEach((c, j) => checkViewRefs(c.value, `${path}.props.columns[${j}].value`, { ...ctx, row: true }));
            delete props.rows; delete props.columns;
        }
        const { action, ...rest } = props;
        checkViewRefs(rest, `${path}.props`, ctx);
        if (action?.url) checkViewRefs(action.url, `${path}.props.action.url`, ctx);
        const a = node.props?.action;
        if (a?.type === 'userAction') {
            const w = workflows[a.workflow];
            if (!w) err(`${path}.props.action.workflow`, `Unknown workflow "${a.workflow}"`);
            else if (w.trigger?.type !== 'userAction') err(`${path}.props.action.workflow`, `Workflow "${a.workflow}" is not triggered by a user action`);
        } else if (a && a.type !== 'open_url') err(`${path}.props.action.type`, 'userAction or open_url');
        (node.children || []).forEach((c, j) => checkView(c, `${path}.children[${j}]`, ctx));
    }
    (def.ui || []).forEach((u, i) => {
        const p = `ui[${i}]`;
        const host = manifestOf[u.host];
        if (!host) err(`${p}.host`, `Unknown module key "${u.host}"`);
        else if (!(host.ui?.placements || []).includes(u.placement)) err(`${p}.placement`, `"${u.placement}" is not a placement ${host.module} supports (${(host.ui?.placements || []).join(', ') || 'none'})`);
        const q = queries[u.data?.query];
        if (!q) err(`${p}.data.query`, `Unknown query "${u.data?.query}"`);
        const returns = q?.returns;
        const dataKeys = returns && typeof returns === 'object' && !Array.isArray(returns) ? new Set(Object.keys(returns)) : null;
        checkView(u.view, `${p}.view`, { dataKeys, query: u.data?.query });
    });

    // ---------- named templates ----------
    // A template renders in the context of the step that uses it, so its paths are checked for root and filter here
    // and its $.steps references against each workflow that renders it.
    const usedTemplates = new Set();
    const collectTemplateUse = (steps, w) => (steps || []).forEach((st) => {
        if (st?.use === 'template' && st.with?.id) usedTemplates.add(st.with.id);
        collectTemplateUse(st?.do, w); (st?.cases || []).forEach((c) => collectTemplateUse(c.do, w)); collectTemplateUse(st?.else, w);
    });
    (def.workflows || []).forEach((w) => collectTemplateUse(w.steps, w));
    (def.queries || []).forEach((q) => collectTemplateUse(q.steps));
    for (const hook of ['onInstall', 'onUninstall']) collectTemplateUse(def.lifecycle?.[hook]);
    for (const [id, text] of Object.entries(def.templates || {})) {
        if (typeof text !== 'string') { err(`templates.${id}`, 'A template is a string'); continue; }
        checkRefs(text, `templates.${id}`, null);
        if (!usedTemplates.has(id)) warn(`templates.${id}`, 'No step renders this template');
    }

    // ---------- lifecycle ----------
    // What install creates, uninstall should undo: an install step whose result onUninstall never reads is probably a
    // webhook nobody deletes. A warning, because some install steps create nothing that needs undoing.
    const uninstallReads = JSON.stringify(def.lifecycle?.onUninstall || []);
    for (const [i, st] of (def.lifecycle?.onInstall || []).entries()) {
        if (!st?.id) warn(`lifecycle.onInstall[${i}]`, 'This install step has no id, so its result is not kept and uninstall cannot undo it');
        else if (!uninstallReads.includes(`install.runtime.installed.${st.id}`)) warn(`lifecycle.onInstall[${i}]`, `onUninstall never reads $.install.runtime.installed.${st.id}, so what this step creates is never removed`);
    }
    for (const hook of ['onInstall', 'onUninstall']) if (def.lifecycle?.[hook]) checkSteps(def.lifecycle[hook], `lifecycle.${hook}`, { ...newScope({}), installing: hook === 'onInstall' });

    return { valid: errors.length === 0, errors, warnings };
}

module.exports = { validate };
