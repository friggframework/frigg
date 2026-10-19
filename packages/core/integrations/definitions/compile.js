/**
 * Compile a definition + one installation into what Frigg runs: an events map shaped exactly like a hand-written
 * integration's `this.events`, plus the routing tables the runtime needs. Pure; no I/O.
 *
 * Only what the installation has enabled is compiled, so a disabled workflow has no event, no route and no schedule.
 *
 * Event names:  SYNC_<ID>_BACKFILL (USER_ACTION) · SYNC_<ID>_PAGE (QUEUE) · SYNC_<ID>_ONGOING (WEBHOOK|CRON)
 *               WF_<ID> (WEBHOOK|CRON|USER_ACTION|QUEUE) · Q_<ID> (ROUTE) · UI_<ID> (ROUTE)
 */
const eventName = (prefix, id, suffix) => [prefix, id.toUpperCase().replace(/-/g, '_'), suffix].filter(Boolean).join('_');

function isOn(item, chosen) {
    if (chosen && typeof chosen.enabled === 'boolean') return chosen.enabled;
    return (item.default || 'on') === 'on';
}

function compile(def, installation = {}) {
    const events = {};
    const webhooks = {};      // moduleKey -> topic -> [eventName]
    const schedules = [];     // { key, event, default: { every } | { cron, timezone }, configurable, choice } (integrations/schedules.js)
    const configurableOf = (c) => (c ? (c === true ? {} : c) : false);
    const userActions = [];   // { event, label, from }
    const routes = [];        // { method, path, event }
    const add = (name, e) => { events[name] = e; return name; };
    const route = (mod, topic, name) => { ((webhooks[mod] ||= {})[topic] ||= []).push(name); };

    for (const s of def.syncs || []) {
        if (!isOn(s, installation.syncs?.[s.id])) continue;
        if (s.backfill?.trigger === 'userAction') {
            const n = add(eventName('SYNC', s.id, 'BACKFILL'), { type: 'USER_ACTION', userActionType: 'SYNC_ACTION', title: `Sync existing ${s.label.toLowerCase()}`, ref: { kind: 'sync', id: s.id, phase: 'backfill' } });
            userActions.push({ event: n, label: events[n].title });
        }
        add(eventName('SYNC', s.id, 'PAGE'), { type: 'QUEUE', ref: { kind: 'sync', id: s.id, phase: 'page' } });
        const mode = s.ongoing?.mode || 'none';
        if (mode === 'webhook') {
            const n = add(eventName('SYNC', s.id, 'ONGOING'), { type: 'WEBHOOK', ref: { kind: 'sync', id: s.id, phase: 'ongoing' } });
            for (const side of [s.source, ...(s.direction === 'two_way' ? [s.target] : [])]) {
                const [mod, obj] = side.split('.');
                route(mod, `${obj}.*`, n);
            }
        } else if (mode === 'poll') {
            const n = add(eventName('SYNC', s.id, 'ONGOING'), { type: 'CRON', ref: { kind: 'sync', id: s.id, phase: 'ongoing' } });
            schedules.push({ key: n, event: n, default: { every: s.ongoing.every || '15m' }, configurable: configurableOf(s.ongoing.configurable), choice: installation.syncs?.[s.id]?.schedule });
        }
    }

    for (const w of def.workflows || []) {
        if (!isOn(w, installation.workflows?.[w.id])) continue;
        const t = w.trigger;
        const type = { webhook: 'WEBHOOK', schedule: 'CRON', userAction: 'USER_ACTION', syncRecord: 'QUEUE' }[t.type];
        const n = add(eventName('WF', w.id), { type, ...(type === 'USER_ACTION' ? { userActionType: 'DATA_ACTION', title: t.label } : {}), ref: { kind: 'workflow', id: w.id } });
        if (t.type === 'webhook') route(t.module, t.topic, n);
        if (t.type === 'schedule') {
            const recurrence = t.every !== undefined ? { every: t.every } : { cron: t.cron, ...(t.timezone ? { timezone: t.timezone } : {}) };
            schedules.push({ key: n, event: n, default: recurrence, configurable: configurableOf(t.configurable), choice: installation.workflows?.[w.id]?.schedule });
        }
        if (t.type === 'userAction') userActions.push({ event: n, label: t.label, from: t.from || null });
        if (t.type === 'syncRecord') route('$sync', `${t.sync}:${(t.on || []).join('|')}`, n);
    }

    for (const q of def.queries || []) add(eventName('Q', q.id), { type: 'ROUTE', ref: { kind: 'query', id: q.id } });
    for (const u of def.ui || []) {
        if (!isOn(u, installation.ui?.[u.id])) continue;
        const n = add(eventName('UI', u.id), { type: 'ROUTE', ref: { kind: 'ui', id: u.id } });
        routes.push({ method: 'GET', path: `/ui/${u.id}`, event: n });
    }

    return { events, webhooks, schedules, userActions, routes };
}

/** Which compiled events a delivered webhook goes to. Topic patterns may end in ".*". */
function routeWebhook(compiled, moduleKey, topic) {
    const table = compiled.webhooks[moduleKey] || {};
    const out = new Set(table[topic] || []);
    for (const [pattern, names] of Object.entries(table)) {
        if (pattern.endsWith('.*') && topic.startsWith(pattern.slice(0, -1))) names.forEach((n) => out.add(n));
    }
    return [...out];
}

module.exports = { compile, routeWebhook, eventName };
