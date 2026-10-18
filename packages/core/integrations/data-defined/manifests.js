/**
 * Validate a capability manifest (v0.1): the module author's promise of what a definition may call. Definitions are
 * validated against manifests, so a broken manifest would let a broken definition through; this checks the manifest
 * itself.
 *
 * @param {object} m  capabilities/<module>.capabilities.json
 * @returns {{ valid: boolean, errors: Array<{path:string,message:string}> }}
 */
const { templateTags, FILTERS } = require('./expressions');

const PATH_RE = /^\$\.[A-Za-z_][\w-]*(\.[\w-]+|\[\d+\])*$/;
const KINDS = new Set(['read', 'search', 'write', 'delete', 'subscribe']); // schema/capability-manifest.v0.1.schema.json
const READS = new Set(['read', 'search']);

function validateManifest(m) {
    const errors = [];
    const err = (path, message) => errors.push({ path, message });
    if (!m || typeof m !== 'object') return { valid: false, errors: [{ path: '', message: 'Manifest must be an object' }] };
    if (!/^[a-z][a-z0-9-]*$/.test(m.module || '')) err('module', 'Lowercase module name');
    if (!m.label) err('label', 'Required');

    const objects = m.objects || {};
    for (const [o, def] of Object.entries(objects)) {
        const names = new Set();
        (def.fields || []).forEach((f, i) => {
            if (!f?.name) err(`objects.${o}.fields[${i}]`, 'Field needs a name');
            else if (names.has(f.name)) err(`objects.${o}.fields[${i}]`, `Duplicate field "${f.name}"`);
            else names.add(f.name);
            // An enum lists its values, or names one of this module's option lists when they differ per account
            // (HubSpot deal stages are per portal).
            if (f?.type === 'enum' && !Array.isArray(f.values) && !(typeof f.values === 'string' && m.options?.[f.values])) err(`objects.${o}.fields[${i}]`, 'An enum lists its values, or names an option list of this module');
        });
    }

    const caps = m.capabilities || {};
    for (const [name, c] of Object.entries(caps)) {
        const p = `capabilities.${name}`;
        if (!/^[A-Za-z][\w]*\.[A-Za-z][\w]*$/.test(name)) err(p, 'Capability names are "<object>.<verb>"');
        if (!KINDS.has(c?.kind)) err(`${p}.kind`, [...KINDS].join(', '));
        if (!/^[A-Za-z_$][\w$]*$/.test(c?.method || '')) err(`${p}.method`, 'Name of a method on the module\'s Api class');
        for (const [arg, spec] of Object.entries(c?.input || {})) if (!spec?.type) err(`${p}.input.${arg}`, 'Input needs a type');
    }

    for (const [topic, e] of Object.entries(m.events || {})) {
        const p = `events.${topic}`;
        if (e.object && !objects[e.object]) err(`${p}.object`, `"${e.object}" is not an object of this module`);
        if (e.record && e.payload) {
            let cur = e.payload;
            for (const seg of e.record.split(/\.|(?=\[)/)) { const i = /^\[(\d+)\]$/.exec(seg); cur = cur == null ? undefined : i ? cur[Number(i[1])] : cur[seg]; }
            if (cur === undefined) err(`${p}.record`, `"${e.record}" is not a path in the example payload`);
        }
    }

    // An option list: a read capability, its inputs, and how each item becomes { label, value } (one reference, or
    // a template). A string that mixes "$.x" into text renders the path literally, so it is refused.
    const checkItemExpr = (v, p) => {
        if (typeof v !== 'string') { err(p, 'A reference ($.item.id) or a template ({{item.name}})'); return; }
        if (!PATH_RE.test(v) && v.includes('$.')) err(p, `"${v}" mixes a $. reference into text, which renders literally; use {{item.x}} for every part`);
        for (const t of templateTags(v)) {
            if (t.path.split(/\.|\[/)[0] !== 'item') err(p, `{{${t.path}}} — an option label can only read item`);
            for (const f of t.filters) if (!FILTERS[f.name]) err(p, `Unknown template filter "${f.name}"`);
        }
        if (PATH_RE.test(v) && !v.startsWith('$.item')) err(p, 'An option value can only read $.item');
    };
    for (const [name, o] of Object.entries(m.options || {})) {
        const p = `options.${name}`;
        const c = caps[o?.capability];
        if (!c) err(`${p}.capability`, `"${o?.capability}" is not a capability of this module`);
        else if (!READS.has(c.kind)) err(`${p}.capability`, `An option list reads; ${o.capability} is a ${c.kind} capability`);
        checkItemExpr(o?.label, `${p}.label`);
        checkItemExpr(o?.value, `${p}.value`);
        for (const [input, spec] of Object.entries(o?.inputs || {})) {
            if (c && !(input in (c.input || {}))) err(`${p}.inputs.${input}`, `${o.capability} takes no argument "${input}"`);
            if (!spec?.type) err(`${p}.inputs.${input}`, 'Input needs a type');
        }
        if (c) for (const [arg, spec] of Object.entries(c.input || {})) if (spec.required && !(arg in (o.inputs || {}))) err(`${p}.inputs`, `${o.capability} requires "${arg}", so the option list must declare it as an input`);
    }

    for (const pl of m.ui?.placements || []) if (typeof pl !== 'string') err('ui.placements', 'Placements are strings');
    return { valid: errors.length === 0, errors };
}

module.exports = { validateManifest };
