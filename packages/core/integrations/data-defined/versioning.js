/**
 * Versioning for data-defined integrations.
 *
 * A published version is immutable and every installation pins one exact version, so a release never changes a
 * running customer until that installation is upgraded. Three questions are answered here:
 *
 *   diff(from, to)              what changed, and how big each change is (patch / minor / major)
 *   checkBump(from, to)         is the declared version bump at least as big as the changes require?
 *   planUpgrade(install, a, b)  can this installation move from a to b, and what has to happen when it does?
 *
 * The rule of thumb: patch = behaviour inside the same contract (steps, templates, view, mapping rows);
 * minor = additive contract (new workflow, optional setting, new UI); major = anything an installation could be
 * relying on goes away or changes meaning (removed workflow, required setting, identity change, new module).
 */
const RANK = { none: 0, patch: 1, minor: 2, major: 3 };
const max = (a, b) => (RANK[a] >= RANK[b] ? a : b);
const byId = (xs) => Object.fromEntries((xs || []).map((x) => [x.id, x]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const optionSource = (o) => (o && typeof o === 'object' ? o.source : o);

function diffSettings(a = {}, b = {}, path, push) {
    for (const k of Object.keys(a)) if (!(k in b)) push('minor', `${path}.${k}`, 'Setting removed (saved values are dropped)');
    for (const [k, s] of Object.entries(b)) {
        if (!(k in a)) push(s.required && s.default === undefined ? 'major' : 'minor', `${path}.${k}`, s.required && s.default === undefined ? 'New required setting with no default' : 'New optional setting');
        else if (a[k].type !== s.type || optionSource(a[k].options) !== optionSource(s.options)) push('major', `${path}.${k}`, 'Setting type or option list changed');
        else if (!same(a[k].options, s.options)) push('minor', `${path}.${k}`, 'Option list inputs changed');
        else if (!a[k].required && s.required && s.default === undefined) push('major', `${path}.${k}`, 'Setting became required');
        else if (!same(a[k], s)) push('patch', `${path}.${k}`, 'Setting label, help or default changed');
    }
}

function diff(from, to) {
    const changes = [];
    const push = (level, path, message) => changes.push({ level, path, message });
    if (from.id !== to.id) push('major', 'id', 'Different integration');

    for (const k of Object.keys(from.modules || {})) if (!to.modules?.[k]) push('major', `modules.${k}`, 'Module removed');
    for (const [k, m] of Object.entries(to.modules || {})) {
        if (!from.modules?.[k]) push('major', `modules.${k}`, 'New module: installations must connect it');
        else if (from.modules[k].module !== m.module) push('major', `modules.${k}`, 'Module replaced');
        else if (from.modules[k].version !== m.version) push('patch', `modules.${k}`, 'Module version range changed');
    }
    diffSettings(from.settings, to.settings, 'settings', push);

    const sa = byId(from.syncs), sb = byId(to.syncs);
    for (const id of Object.keys(sa)) if (!sb[id]) push('major', `syncs.${id}`, 'Sync removed');
    for (const [id, s] of Object.entries(sb)) {
        const o = sa[id];
        if (!o) { push('minor', `syncs.${id}`, 'New sync'); continue; }
        if (o.source !== s.source || o.target !== s.target) push('major', `syncs.${id}`, 'Sync objects changed');
        if (o.direction !== s.direction) push('major', `syncs.${id}.direction`, 'Sync direction changed');
        if (!same(o.identity, s.identity)) push('major', `syncs.${id}.identity`, 'Identity keys changed: existing links must be rebuilt');
        if (!same(o.mapping, s.mapping)) push('patch', `syncs.${id}.mapping`, 'Default mapping changed (installations with their own mapping keep it)');
        if (!same(o.ongoing, s.ongoing) || !same(o.backfill, s.backfill) || o.filter !== s.filter) push('minor', `syncs.${id}`, 'Sync schedule or filter changed');
    }

    const la = byId(from.links), lb = byId(to.links);
    for (const id of Object.keys(la)) if (!lb[id]) push('major', `links.${id}`, 'Link set removed: workflows that read it lose their links');
    for (const [id, l] of Object.entries(lb)) {
        const o = la[id];
        if (!o) { push('minor', `links.${id}`, 'New link set'); continue; }
        if (!same(o.between, l.between)) push('major', `links.${id}.between`, 'Link set joins different objects');
        if (!same(o.identity, l.identity)) push('major', `links.${id}.identity`, 'Identity keys changed: existing links must be rebuilt');
        if (o.label !== l.label || o.description !== l.description) push('patch', `links.${id}`, 'Label or description changed');
    }

    const wa = byId(from.workflows), wb = byId(to.workflows);
    for (const id of Object.keys(wa)) if (!wb[id]) push('major', `workflows.${id}`, 'Workflow removed');
    for (const [id, w] of Object.entries(wb)) {
        const o = wa[id];
        if (!o) { push('minor', `workflows.${id}`, `New workflow (default ${w.default || 'on'})`); continue; }
        if (o.trigger?.type !== w.trigger?.type || o.trigger?.module !== w.trigger?.module) push('major', `workflows.${id}.trigger`, 'Trigger source changed');
        else if (!same(o.trigger, w.trigger)) push('minor', `workflows.${id}.trigger`, 'Trigger topic, schedule or filter changed');
        diffSettings(o.settings, w.settings, `workflows.${id}.settings`, push);
        if (!same(o.steps, w.steps)) push('patch', `workflows.${id}.steps`, 'Steps changed');
        if (o.label !== w.label || o.description !== w.description) push('patch', `workflows.${id}`, 'Label or description changed');
    }

    const qa = byId(from.queries), qb = byId(to.queries);
    for (const id of new Set([...Object.keys(qa), ...Object.keys(qb)])) if (!same(qa[id], qb[id])) push('patch', `queries.${id}`, qa[id] ? (qb[id] ? 'Query changed' : 'Query removed') : 'New query');
    const ua = byId(from.ui), ub = byId(to.ui);
    for (const id of Object.keys(ua)) if (!ub[id]) push('minor', `ui.${id}`, 'UI surface removed');
    for (const [id, u] of Object.entries(ub)) {
        if (!ua[id]) push('minor', `ui.${id}`, 'New UI surface');
        else if (ua[id].host !== u.host || ua[id].placement !== u.placement) push('minor', `ui.${id}`, 'UI surface moved');
        else if (!same(ua[id], u)) push('patch', `ui.${id}`, 'UI view or data changed');
    }
    if (!same(from.templates, to.templates)) push('patch', 'templates', 'Templates changed');
    if (!same(from.lifecycle, to.lifecycle)) push('minor', 'lifecycle', 'Install/uninstall steps changed: upgrades re-run onInstall');
    if (!same(from.display, to.display)) push('patch', 'display', 'Display text changed');

    const level = changes.reduce((l, c) => max(l, c.level), 'none');
    return { level, changes };
}

const parse = (v) => String(v).split('-')[0].split('.').map(Number);
function bumpOf(fromV, toV) {
    const [a, b, c] = parse(fromV), [x, y, z] = parse(toV);
    if (x > a) return 'major';
    if (x === a && y > b) return 'minor';
    if (x === a && y === b && z > c) return 'patch';
    return 'none';
}

/** The declared bump must cover the computed one (a major change cannot ship as 1.4.1). */
function checkBump(from, to) {
    const d = diff(from, to);
    const declared = bumpOf(from.version, to.version);
    const ok = declared !== 'none' && RANK[declared] >= RANK[d.level];
    return { ok, declared, required: d.level, changes: d.changes, message: ok ? null : declared === 'none' ? `${to.version} is not newer than ${from.version}` : `Changes need a ${d.level} bump; ${from.version} -> ${to.version} is ${declared}` };
}

/**
 * What it takes to move one installation between versions.
 * @returns {{ allowed:boolean, needs:Array<{kind:string,path:string,message:string}>, actions:Array<{kind:string,id?:string,message:string}>, config:object }}
 *   needs   things a person must supply first (a required setting, a module connection)
 *   actions what the runtime does on upgrade (enable/disable workflows, rebuild links, re-run onInstall)
 *   config  the installation config after the upgrade (pinned to the new version)
 */
function planUpgrade(installation, from, to) {
    const needs = [], actions = [];
    const config = JSON.parse(JSON.stringify(installation || {}));
    config.definition = { id: to.id, version: to.version };

    for (const k of Object.keys(to.modules || {})) if (!from.modules?.[k]) needs.push({ kind: 'connect', path: `modules.${k}`, message: `Connect ${to.modules[k].module}` });
    for (const [k, s] of Object.entries(to.settings || {})) {
        if (s.required && s.default === undefined && config.settings?.[k] === undefined) needs.push({ kind: 'setting', path: `settings.${k}`, message: `Choose "${s.label}"` });
    }
    const wa = byId(from.workflows), wb = byId(to.workflows);
    config.workflows ||= {};
    for (const id of Object.keys(config.workflows)) if (!wb[id]) { delete config.workflows[id]; actions.push({ kind: 'disable', id, message: `Workflow "${wa[id]?.label || id}" no longer exists` }); }
    for (const [id, w] of Object.entries(wb)) {
        const enabled = config.workflows[id]?.enabled ?? ((w.default || 'on') === 'on');
        if (!wa[id]) {
            config.workflows[id] = { enabled: (w.default || 'on') === 'on', settings: {} };
            actions.push({ kind: config.workflows[id].enabled ? 'enable' : 'offer', id, message: `${config.workflows[id].enabled ? 'Turns on' : 'Available, off'}: ${w.label}` });
        }
        if (!enabled) continue;
        for (const [k, s] of Object.entries(w.settings || {})) {
            if (s.required && s.default === undefined && config.workflows[id]?.settings?.[k] === undefined) needs.push({ kind: 'setting', path: `workflows.${id}.settings.${k}`, message: `"${w.label}": choose "${s.label}"` });
        }
        const keep = new Set(Object.keys(w.settings || {}));
        for (const k of Object.keys(config.workflows[id]?.settings || {})) if (!keep.has(k)) delete config.workflows[id].settings[k];
    }
    const sa = byId(from.syncs);
    for (const s of to.syncs || []) {
        if (sa[s.id] && !same(sa[s.id].identity, s.identity)) actions.push({ kind: 'relink', id: s.id, message: `Rebuild ${s.label} links with the new identity keys (runs a backfill)` });
        if (!sa[s.id]) actions.push({ kind: 'backfill', id: s.id, message: `New sync: ${s.label}` });
    }
    // A link set has no backfill to rebuild from: its links by id still resolve, but its identity index was written
    // with the old keys, so lookups by key miss until each pair is linked again. Said plainly rather than hidden.
    const la = byId(from.links), lb = byId(to.links);
    for (const l of to.links || []) if (la[l.id] && !same(la[l.id].identity, l.identity)) actions.push({ kind: 'reindex', id: l.id, message: `${l.label || l.id}: links by id still resolve; lookups by the new identity keys miss until each pair is linked again` });
    for (const id of Object.keys(la)) if (!lb[id]) actions.push({ kind: 'drop-links', id, message: `Link set "${la[id].label || id}" is gone; its stored links are no longer read` });
    if (!same(from.lifecycle?.onInstall, to.lifecycle?.onInstall)) actions.push({ kind: 'reinstall', message: 'Re-run install steps (webhook subscriptions)' });
    actions.push({ kind: 'drain', message: `Messages already queued under ${from.version} finish on ${from.version}; new events run on ${to.version}` });

    return { allowed: needs.length === 0, needs, actions, config };
}

module.exports = { diff, checkBump, planUpgrade, bumpOf };
