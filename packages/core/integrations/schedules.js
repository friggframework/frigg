/**
 * Recurring schedules per installation: which ones an integration should have right now. Pure; no I/O.
 *
 * A developer declares them; an installation may change the timing of one only when the developer allowed it:
 *
 *   static Definition = {
 *       schedules: {
 *           ONGOING_SYNC: { every: '1h', configurable: { min: '15m' } },     // the user may pick any interval >= 15m
 *           DAILY_DIGEST: { cron: '0 8 * * 1-5', timezone: 'America/New_York' },   // fixed
 *       },
 *   }
 *
 * The key is the event the schedule sends. An installation's choice lives at `config.schedules.<key>` (`{ every }`,
 * `{ cron, timezone }`, or `{ enabled: false }` when configurable); what the host actually holds is recorded by the
 * runtime at `config.runtime.schedules.<key>` (see scheduler-commands reconcileRecurringJobs).
 *
 * Data-defined integrations build the same entries from their compiled definition, so both forms share one
 * reconcile path and one storage shape.
 */
const { createHash } = require('crypto');
const { validateRecurrence } = require('../infrastructure/scheduler/recurrence');

const recurrenceOf = (r) => (r?.every !== undefined ? { every: r.every } : r?.cron !== undefined ? { cron: r.cron, ...(r.timezone ? { timezone: r.timezone } : {}) } : null);

/**
 * A stable host schedule name: `<integration>-<id>-<key>`, within the 64 characters EventBridge allows (and only
 * the characters it allows). Longer names keep a readable prefix and end in a short hash, so they stay unique.
 */
function scheduleJobId(integrationName, integrationId, key) {
    const clean = (v) => String(v).replace(/[^0-9A-Za-z_.-]/g, '-');
    const full = `${clean(integrationName)}-${clean(integrationId)}-${clean(key).toLowerCase()}`;
    if (full.length <= 64) return full;
    const hash = createHash('sha256').update(full).digest('hex').slice(0, 10);
    return `${full.slice(0, 53)}-${hash}`;
}

/**
 * @param {Object} params
 * @param {string} params.integrationName
 * @param {string|number} params.integrationId
 * @param {Array<{key, event?, default: {every?|cron?, timezone?}, configurable?: false|{min?}, choice?: object, enabled?: boolean, payload?: object}>} params.entries
 *        default: the developer's recurrence. choice: the installation's override (honoured only when configurable).
 * @returns {{ desired: Array<{key, jobId, event, recurrence, payload, enabled, source}>, problems: Array<{key, problems: string[]}> }}
 *          An entry whose choice is invalid keeps its default and is reported, so a bad edit never stops a schedule.
 */
function desiredSchedules({ integrationName, integrationId, entries = [] }) {
    const desired = [], problems = [];
    for (const e of entries) {
        let recurrence = recurrenceOf(e.default), source = 'definition', enabled = e.enabled !== false;
        const choice = e.choice && typeof e.choice === 'object' ? e.choice : null;
        if (choice && (recurrenceOf(choice) || choice.enabled !== undefined)) {
            if (!e.configurable) problems.push({ key: e.key, problems: ['This schedule is not configurable'] });
            else {
                const picked = recurrenceOf(choice);
                const issues = picked ? validateRecurrence(picked, { min: e.configurable.min }) : [];
                if (issues.length) problems.push({ key: e.key, problems: issues });
                else {
                    if (picked) { recurrence = picked; source = 'installation'; }
                    if (choice.enabled === false) enabled = false;
                }
            }
        }
        const own = validateRecurrence(recurrence);
        if (own.length) { problems.push({ key: e.key, problems: own.map((p) => `default: ${p}`) }); continue; }
        desired.push({
            key: e.key,
            jobId: scheduleJobId(integrationName, integrationId, e.key),
            event: e.event || e.key,
            recurrence,
            payload: { integrationId, scheduleKey: e.key, ...(e.payload || {}) },
            enabled,
            source,
        });
    }
    return { desired, problems };
}

/** The entries a hand-written integration declares: Definition.schedules plus the installation's choices. */
function entriesFromDefinition(definitionSchedules = {}, config = {}) {
    return Object.entries(definitionSchedules || {}).map(([key, s]) => ({
        key,
        event: s.event || key,
        default: s,
        configurable: s.configurable ? (s.configurable === true ? {} : s.configurable) : false,
        choice: config?.schedules?.[key],
    }));
}

module.exports = { desiredSchedules, entriesFromDefinition, scheduleJobId, recurrenceOf };
