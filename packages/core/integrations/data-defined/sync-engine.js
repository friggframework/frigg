/**
 * The sync engine: keeps records on two modules as copies of each other, per a definition's `syncs`. I/O comes in
 * as ports (Api calls through the manifest, links over IntegrationMapping) and a state store, so it runs the same in a
 * test and in Lambda. Queueing the next page is the caller's job: each step returns what to do next.
 *
 * One record, one direction (syncRecord):
 *   1. Find the other side: its link (link:<sync>:<module>:<id>), else the identity index (idx:<sync>:<key>:<value>),
 *      else the other side's search by identity key (onAmbiguous decides 0/1/many), else create.
 *   2. Map: rows flowing this way. On an update a row applies only when its master is the side the change came from
 *      (`newest`: unless the other side changed later). On a create every row flowing this way applies.
 *   3. Write only what changed: the link remembers a hash of every value known on each side, so an unchanged
 *      payload is not written, and the echo of our own write (the other side's webhook) ends there.
 *   4. Link both ids and identity keys, with what is now known on each side.
 *
 * How each object is read and written is the manifest's `objects.<obj>.sync` (list, get, search, create, update).
 */
const { createHash } = require('crypto');
const { applyMapping, readField, TRANSFORMS } = require('./transforms');
const { resolve, evaluate, getPath } = require('./expressions');

const hash = (v) => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 16);
const otherRole = (role) => (role === 'source' ? 'target' : 'source');
const blank = (v) => v === undefined || v === null || v === '';
const ERROR_SAMPLE = 20;

/**
 * @param {object} p
 * @param {object} p.def
 * @param {object} p.installation   Integration.config (+ integrationId); syncs.<id>.mapping overrides the default mapping
 * @param {object} p.install        the $.install context (installContext)
 * @param {Record<string, object>} p.manifests
 * @param {{ call: Function, links: { find: Function, upsert: Function } }} p.ports
 * @param {{ get(key): Promise<object|null>, put(key, value): Promise<void> }} p.state   raw IntegrationMapping rows
 * @param {() => Date} [p.now]
 */
function createSyncEngine({ def, installation = {}, install = {}, manifests, ports, state, now = () => new Date() }) {
    const syncOf = (id) => {
        const s = (def.syncs || []).find((x) => x.id === id);
        if (!s) throw new Error(`Unknown sync "${id}"`);
        return s;
    };
    const sideOf = (s, role) => {
        const [key, obj] = s[role].split('.');
        const manifest = manifests[def.modules[key]?.module];
        return { role, key, obj, manifest, spec: manifest?.objects?.[obj]?.sync || {} };
    };
    const rowsToward = (s, toRole) => {
        const rows = installation.syncs?.[s.id]?.mapping || s.mapping || [];
        if (toRole === 'target') return rows.filter((r) => (r.direction || 'both') !== 'to_source');
        // Flowing back to the source, a row reads its target and writes its source. A fixed value has no source.
        return rows.filter((r) => (r.direction || 'both') !== 'to_target' && !('value' in r)).map((r) => ({ ...r, source: r.target, target: r.source }));
    };
    /** Call one of a side's sync operations, with the sync's extra arguments for that module (s.args). */
    const call = (s, side, op, args) => {
        const spec = side.spec[op];
        if (!spec) throw new Error(`${side.key}.${side.obj} declares no sync.${op}`);
        const extra = resolve(s.args?.[side.key] || {}, { install });
        return ports.call(side.key, spec.capability, { ...extra, ...args });
    };
    const idOf = (side, record) => {
        const v = readField(record, side.spec.id || 'id');
        return blank(v) ? null : String(v);
    };
    /** Identity values, normalised as the index stores them (email lower-cased, phone E.164), so search and index agree. */
    const identityKeys = (s, role, record) => Object.fromEntries((s.identity?.match || []).map((m) => {
        const raw = readField(record, m[role]);
        const fn = m.transform && TRANSFORMS[m.transform];
        return [m.key, fn && !blank(raw) ? fn(raw, {}, record) : raw];
    }).filter(([, v]) => !blank(v)));
    const wrap = (op, payload) => (op.body ? { [op.body]: payload } : payload);

    /** Does this row apply to an update flowing from `from`? */
    const applies = (row, from, link, toKey, updatedAt) => {
        const master = row.master || 'source';
        if (master === 'newest') {
            const seen = link?.seen?.[toKey];
            return !(seen && updatedAt && Date.parse(seen) > Date.parse(updatedAt));
        }
        return master === from;
    };

    /**
     * Sync one record from one side to the other.
     * @returns {Promise<{ status: 'created'|'updated'|'linked'|'unchanged'|'skipped', reason?, ids?, action? }>}
     *          action is what a syncRecord workflow hears: created, updated or linked (absent when nothing happened)
     */
    async function syncRecord({ syncId, from, record }) {
        const s = syncOf(syncId);
        if (s.direction !== 'two_way' && from === 'target') return { status: 'skipped', reason: 'one-way sync' };
        const A = sideOf(s, from), B = sideOf(s, otherRole(from));
        if (s.filter && from === 'source' && !evaluate(s.filter, { record, install })) return { status: 'skipped', reason: 'filtered' };
        const idA = idOf(A, record);
        if (!idA) return { status: 'skipped', reason: `no id at ${A.spec.id || 'id'}` };

        let link = await ports.links.find({ sync: s.id, from: A.key, id: idA });
        let idB = link?.[B.key] ?? null;
        let linked = false;
        if (idB == null) {
            const keys = identityKeys(s, from, record);
            const hit = Object.keys(keys).length ? await ports.links.find({ sync: s.id, key: keys }) : null;
            if (hit?.[B.key] != null) {
                idB = String(hit[B.key]);
                // The index row may be older than the record's own link rows: read B's link for its current state.
                link = (await ports.links.find({ sync: s.id, from: B.key, id: idB })) || hit;
                linked = true;
            } else if (B.spec.search) {
                const input = B.manifest.capabilities?.[B.spec.search.capability]?.input || {};
                const args = Object.fromEntries(Object.entries(keys).filter(([k]) => k in input));
                if (Object.keys(args).length) {
                    const res = await call(s, B, 'search', args);
                    const found = Array.isArray(res) ? res : res?.results || res?.data || [];
                    if (found.length === 1 || (found.length > 1 && s.identity?.onAmbiguous === 'first')) { idB = idOf(B, found[0]); linked = !!idB; }
                    else if (found.length > 1 && (s.identity?.onAmbiguous || 'skip') === 'skip') return { status: 'skipped', reason: `ambiguous: ${found.length} matches in ${B.key}.${B.obj}` };
                }
            }
        }

        const isCreate = idB == null;
        const updatedAt = A.spec.updatedAt ? readField(record, A.spec.updatedAt) ?? null : null;
        // Only fields the write accepts: Phone's update takes defaultFields but not externalId, and a field the API drops
        // would read as changed forever. (A write that takes the record in one argument, body, is not checked.)
        const op = B.spec[isCreate ? 'create' : 'update'];
        const accepts = op && !op.body ? new Set(Object.keys(B.manifest?.capabilities?.[op.capability]?.input || {})) : null;
        const rows = rowsToward(s, B.role)
            .filter((r) => !accepts || accepts.has(r.target.split(/[.[]/)[0]))
            .filter((r) => isCreate || applies(r, from, link, B.key, updatedAt));
        const knownB = link?.known?.[B.key] || {};
        const mapped = applyMapping(rows, record);
        const written = {};
        for (const r of rows) { const v = readField(mapped, r.target); if (v !== undefined) written[r.target] = hash(v); }
        // An update sends only the fields whose value B does not already hold, so it cannot overwrite a concurrent
        // edit to another field on B. A create sends everything.
        const changedRows = isCreate ? rows : rows.filter((r) => written[r.target] !== undefined && knownB[r.target] !== written[r.target]);
        const payload = isCreate ? mapped : applyMapping(changedRows, record);
        // What A holds now, on the paths a sync would write into A: next time, a payload equal to it is not written.
        const knownA = Object.fromEntries(rowsToward(s, A.role).map((r) => [r.target, hash(readField(record, r.target))]));

        let wrote = false;
        if (isCreate) {
            if (!B.spec.create) return { status: 'skipped', reason: `${B.key}.${B.obj} cannot be created by a sync` };
            if (!Object.keys(payload).length) return { status: 'skipped', reason: 'nothing to write' };
            const res = await call(s, B, 'create', wrap(B.spec.create, payload));
            idB = idOf(B, res);
            if (!idB) throw new Error(`${B.key}.${B.obj} create returned no id at ${B.spec.id || 'id'}`);
            wrote = true;
        } else if (changedRows.length) {
            if (!B.spec.update) return { status: 'skipped', reason: `${B.key}.${B.obj} cannot be updated by a sync` };
            await call(s, B, 'update', { ...wrap(B.spec.update, payload), [B.spec.update.id]: idB });
            wrote = true;
        }

        const changedKnowledge = wrote || linked || JSON.stringify(knownA) !== JSON.stringify(link?.known?.[A.key] || {});
        if (changedKnowledge) {
            const keysB = Object.fromEntries((s.identity?.match || []).map((m) => [m.key, readField(payload, m[B.role])]).filter(([, v]) => !blank(v)));
            await ports.links.upsert({
                sync: s.id,
                ids: { [A.key]: idA, [B.key]: idB },
                keys: { ...keysB, ...identityKeys(s, from, record) },
                meta: {
                    known: { ...(link?.known || {}), [A.key]: knownA, [B.key]: { ...knownB, ...written } },
                    seen: { ...(link?.seen || {}), ...(updatedAt ? { [A.key]: updatedAt } : {}), ...(wrote ? { [B.key]: now().toISOString() } : {}) },
                },
            });
        }
        const ids = { [A.key]: idA, [B.key]: idB };
        if (isCreate) return { status: 'created', action: 'created', ids };
        if (linked) return { status: 'linked', action: 'linked', ids, wrote };
        return wrote ? { status: 'updated', action: 'updated', ids } : { status: 'unchanged', ids };
    }

    /** One page of one side. @returns {{ results, next }} next: the cursor of the following page, or null */
    async function readPage({ syncId, role, cursor, pageSize, since }) {
        const s = syncOf(syncId);
        const S = sideOf(s, role);
        const L = S.spec.list;
        if (!L) throw new Error(`${S.key}.${S.obj} declares no sync.list`);
        const mode = L.paging || 'cursor';
        const args = {};
        if (L.limit) args[L.limit] = pageSize;
        if (L.cursor && cursor != null) args[L.cursor] = cursor;
        if (L.since && since) args[L.since] = since;
        const res = await call(s, S, 'list', args);
        const items = (L.items ? readField(res, L.items) : res) || [];
        const list = Array.isArray(items) ? items : [];
        let next = null;
        if (mode === 'cursor') { const n = L.next ? readField(res, L.next) : null; next = blank(n) ? null : n; }
        else if (list.length >= pageSize) next = mode === 'offset' ? (Number(cursor) || 0) + list.length : (Number(cursor) || 1) + 1;
        if (next !== null && String(next) === String(cursor)) next = null;     // a cursor that does not move would loop
        const results = [];
        for (const record of list) {
            try { results.push(await syncRecord({ syncId, from: role, record })); }
            catch (e) { results.push({ status: 'failed', error: String(e.message || e), id: idOf(S, record) }); }
        }
        return { results, next, records: list };
    }

    const tally = (counts, results) => {
        const out = { ...counts };
        for (const r of results) out[r.status] = (out[r.status] || 0) + 1;
        return out;
    };
    const errorsOf = (prev, results, role) => [...(prev || []), ...results.filter((r) => r.status === 'failed').map((r) => ({ role, id: r.id, error: r.error }))].slice(-ERROR_SAMPLE);
    const backfillKey = (id) => `sync:${id}:backfill`;

    /**
     * Start a backfill: every record of the source (and of the target, for a two-way sync that can list it).
     * Refused while another is running and has made progress in the last hour.
     * @returns {{ started: boolean, progress, next?: { role, cursor, runId } }}
     */
    async function startBackfill({ syncId, runId, reason = 'backfill' }) {
        const s = syncOf(syncId);
        const prev = await state.get(backfillKey(s.id));
        if (prev?.status === 'running' && Date.now() - Date.parse(prev.updatedAt) < 3600000) return { started: false, progress: prev };
        const at = now().toISOString();
        const progress = { runId, reason, status: 'running', role: 'source', cursor: null, pages: 0, counts: {}, errors: [], startedAt: at, updatedAt: at };
        await state.put(backfillKey(s.id), progress);
        return { started: true, progress, next: { role: 'source', cursor: null, runId } };
    }

    /** Run one backfill page. A message for a run that is no longer current is dropped. */
    async function continueBackfill({ syncId, runId, role, cursor }) {
        const s = syncOf(syncId);
        const progress = await state.get(backfillKey(s.id));
        if (!progress || progress.runId !== runId || progress.status !== 'running') return { stale: true, progress };
        const pageSize = s.backfill?.pageSize || 100;
        const { results, next } = await readPage({ syncId, role, cursor, pageSize });
        const updated = { ...progress, role, cursor: next, pages: progress.pages + 1, counts: tally(progress.counts, results), errors: errorsOf(progress.errors, results, role), updatedAt: now().toISOString() };
        let following = null;
        if (next !== null) following = { role, cursor: next, runId };
        else if (role === 'source' && s.direction === 'two_way' && sideOf(s, 'target').spec.list) following = { role: 'target', cursor: null, runId };
        if (following) Object.assign(updated, { role: following.role, cursor: following.cursor });
        else Object.assign(updated, { status: 'completed', finishedAt: updated.updatedAt });
        await state.put(backfillKey(s.id), updated);
        return { progress: updated, next: following, results };
    }

    /**
     * One poll: records changed since the last poll, on each side that can list by modified time. The first poll
     * only sets the mark (a backfill copies what already exists). At most `maxPages` per side per poll; the rest
     * continues from the saved cursor at the next tick.
     */
    async function poll({ syncId, maxPages = 10 }) {
        const s = syncOf(syncId);
        const key = `sync:${s.id}:poll`;
        const st = (await state.get(key)) || { since: {}, cursor: {} };
        const roles = s.direction === 'two_way' ? ['source', 'target'] : ['source'];
        const summary = {};
        for (const role of roles) {
            const S = sideOf(s, role);
            if (!S.spec.list?.since) continue;
            const started = now().toISOString();
            if (!st.since[role]) { st.since[role] = started; summary[role] = { marked: started }; continue; }
            let cursor = st.cursor[role] ?? null, pages = 0, newest = null, results = [];
            do {
                const page = await readPage({ syncId, role, cursor, pageSize: s.backfill?.pageSize || 100, since: st.since[role] });
                results = results.concat(page.results);
                for (const r of page.records) {
                    const u = S.spec.updatedAt ? readField(r, S.spec.updatedAt) : null;
                    if (u && (!newest || Date.parse(u) > Date.parse(newest))) newest = u;
                }
                cursor = page.next;
                pages += 1;
            } while (cursor !== null && pages < maxPages);
            if (cursor !== null) st.cursor[role] = cursor;          // more to read: same mark, carry on next tick
            else { delete st.cursor[role]; st.since[role] = newest ? new Date(Date.parse(newest)).toISOString() : started; }
            summary[role] = { pages, counts: tally({}, results), more: cursor !== null };
        }
        st.lastPolledAt = now().toISOString();
        await state.put(key, st);
        return summary;
    }

    /** A webhook event about a synced object. An event that carries only an id is fetched first. */
    async function handleEvent({ syncId, moduleKey, topic, event }) {
        const s = syncOf(syncId);
        const role = sideOf(s, 'source').key === moduleKey ? 'source' : sideOf(s, 'target').key === moduleKey ? 'target' : null;
        if (!role) return { status: 'skipped', reason: `${moduleKey} is not a side of sync ${s.id}` };
        if (role === 'target' && s.direction !== 'two_way') return { status: 'skipped', reason: 'one-way sync' };
        const S = sideOf(s, role);
        const ev = S.manifest?.events?.[topic] || {};
        if (ev.object && ev.object !== S.obj) return { status: 'skipped', reason: `${topic} is about ${ev.object}` };
        let record = ev.record ? getPath(event, '$.' + ev.record) : event;
        if (ev.recordId) {
            const id = readField(event, ev.recordId);
            if (blank(id)) return { status: 'skipped', reason: `no id at ${ev.recordId}` };
            record = await call(s, S, 'get', { [S.spec.get.id]: id });
            if (!record) return { status: 'skipped', reason: 'record not found' };
        }
        return syncRecord({ syncId, from: role, record });
    }

    const status = async (syncId) => ({ backfill: await state.get(backfillKey(syncId)), poll: await state.get(`sync:${syncId}:poll`) });

    return { syncRecord, readPage, startBackfill, continueBackfill, poll, handleEvent, status };
}

module.exports = { createSyncEngine };
