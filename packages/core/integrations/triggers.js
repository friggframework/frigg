/**
 * Recurring triggers (ADR-055): what an integration declares, how one installation resolves it, and whether it is
 * due at a tick. Pure; no I/O. The tick itself is `use-cases/run-trigger-tick.js`; the run is
 * `IntegrationBase.onTriggerRun`.
 *
 *   static Definition = {
 *       name: 'housecallpro',
 *       triggers: {
 *           pollErp: { every: '15m', handler: 'pollErp' },                              // every installation
 *           ongoingSync: { every: '1h', configurable: { min: '15m' }, handler: sync },   // an installation may retime it
 *           perPlan: { every: (config) => config.pollEvery, when: (config) => config.poll !== false, handler },
 *           digest: { cron: '0 8 * * 1-5', timezone: 'America/New_York', configurable: true, handler },
 *           nightly: { at: 'cron(0 3 * * ? *)', timezone: 'Europe/London', handler },   // same time for everyone
 *       },
 *   };
 *
 * Nothing is created per installation. Devtools provisions one function per integration with one schedule per
 * distinct tick and one per `at` trigger (`provisioningOf`). At each tick the function pages through the ENABLED
 * installations and sends `{ event: 'FRIGG_TRIGGER_RUN', data: { integrationId, trigger, scheduledFor } }` for each
 * one that is due. A disabled or deleted installation is simply not due, and a config change applies at the next tick.
 *
 * Two additions to ADR-055 (its "Amendment (ADR-063)"):
 *   - `configurable: true | { min }` on an `every` or `cron` trigger lets an installation choose its own timing at
 *     `config.triggers.<name>` (`{ every }`, `{ cron, timezone }` or `{ enabled: false }`), never more often than `min`.
 *     A choice that breaks the floor, or a trigger that is not configurable, keeps the default (and is reported).
 *   - `cron` (five fields, with `timezone`) is a calendar trigger that may differ per installation. It runs off the
 *     shared tick: due when a firing falls in (previous tick, this tick]. `at` stays the ADR-055 calendar trigger,
 *     the same for every installation, with an exact schedule of its own.
 */
const { parseEvery, validateRecurrence, minGapMinutes, lastFiringIn, isTimeZone } = require('../infrastructure/scheduler/recurrence');

const TRIGGER_RUN = 'FRIGG_TRIGGER_RUN';
/** A tick that ran out of time sends this to the integration's queue to carry on from its page cursor. */
const TRIGGER_TICK = 'FRIGG_TRIGGER_TICK';

const DEFAULT_TICK_MINUTES = 5;
const MAX_EVERY_MINUTES = 1440;   // longer cadences use a calendar (`at` / `cron`)
const AT = /^cron\(\S+ \S+ \S+ \S+ \S+ \S+\)$/;
const OVERLAP = ['skip', 'allow'];

const configurableOf = (c) => (c ? (c === true ? {} : c) : false);
const kindOf = (t) => (t.at !== undefined ? 'at' : t.cron !== undefined ? 'cron' : 'every');
const recurrenceOf = (r) => (r?.every !== undefined ? { every: r.every } : r?.cron !== undefined ? { cron: r.cron, ...(r.timezone ? { timezone: r.timezone } : {}) } : null);

/** A minutes count as the shortest duration string: 90 -> '90m', 60 -> '1h', 1440 -> '1d'. */
function durationOf(minutes) {
    if (minutes % 1440 === 0) return `${minutes / 1440}d`;
    if (minutes % 60 === 0) return `${minutes / 60}h`;
    return `${minutes}m`;
}

/**
 * The tick a trigger runs on, in minutes. `tick` when set. Otherwise: for a constant `every`, that interval; for an
 * `every` given as a function, 5 minutes; for a `cron`, 5 minutes, or less when the cron itself fires more often.
 * A configurable trigger never ticks slower than its floor (or 5 minutes, without one), so the fastest choice it
 * allows can run. `at` triggers have no tick (null): each has its own schedule.
 */
function tickMinutesOf(trigger) {
    if (kindOf(trigger) === 'at') return null;
    if (trigger.tick !== undefined) return parseEvery(trigger.tick);
    const configurable = configurableOf(trigger.configurable);
    const floor = configurable ? (configurable.min !== undefined ? parseEvery(configurable.min) : DEFAULT_TICK_MINUTES) : Infinity;
    let natural;
    if (kindOf(trigger) === 'cron') {
        const gap = minGapMinutes({ cron: trigger.cron });
        natural = Math.max(1, Math.min(DEFAULT_TICK_MINUTES, gap ?? DEFAULT_TICK_MINUTES));
    } else {
        natural = typeof trigger.every === 'function' ? DEFAULT_TICK_MINUTES : parseEvery(trigger.every) ?? DEFAULT_TICK_MINUTES;
    }
    return Math.max(1, Math.min(natural, floor ?? DEFAULT_TICK_MINUTES, MAX_EVERY_MINUTES));
}

/**
 * Problems with a trigger declaration, found without an installation (definition time and build time).
 * @returns {string[]}
 */
function validateTrigger(name, t) {
    const at = (m) => `${name}: ${m}`;
    if (!t || typeof t !== 'object') return [at('A trigger is an object')];
    const problems = [];
    const kinds = ['every', 'at', 'cron'].filter((k) => t[k] !== undefined);
    if (kinds.length !== 1) return [at('Give exactly one of every, at or cron')];
    if (typeof t.handler !== 'function' && typeof t.handler !== 'string') problems.push(at('handler must be a function or a method name'));
    if (t.overlap !== undefined && !OVERLAP.includes(t.overlap)) problems.push(at(`overlap must be ${OVERLAP.join(' or ')}`));
    if (t.when !== undefined && typeof t.when !== 'function') problems.push(at('when must be a function of the installation config'));
    if (t.tick !== undefined) {
        const tick = parseEvery(t.tick);
        if (tick === null || tick > MAX_EVERY_MINUTES) problems.push(at(`tick "${t.tick}" is not a duration between 1m and 1d`));
    }
    const kind = kinds[0];
    if (kind === 'at') {
        if (typeof t.at !== 'string' || !AT.test(t.at)) problems.push(at(`at "${t.at}" must be an EventBridge cron(...) expression with six fields`));
        if (t.timezone !== undefined && !isTimeZone(t.timezone)) problems.push(at(`Unknown time zone "${t.timezone}"`));
        if (t.configurable) problems.push(at('An at trigger runs at one time for every installation; use cron to let installations choose'));
        if (t.tick !== undefined) problems.push(at('An at trigger has its own schedule; tick does not apply'));
        return problems;
    }
    const configurable = configurableOf(t.configurable);
    if (configurable && configurable.min !== undefined && parseEvery(configurable.min) === null) problems.push(at(`configurable.min "${configurable.min}" is not a duration (15m, 2h, 1d)`));
    if (kind === 'every' && typeof t.every === 'function') return problems;
    const recurrence = recurrenceOf(t);
    for (const p of validateRecurrence(recurrence)) problems.push(at(p));
    if (kind === 'every' && parseEvery(t.every) > MAX_EVERY_MINUTES) problems.push(at(`every "${t.every}" is longer than 1d; use at or cron`));
    if (!problems.length && configurable && configurable.min !== undefined) {
        for (const p of validateRecurrence(recurrence, { min: configurable.min })) problems.push(at(`The default breaks its own minimum: ${p}`));
    }
    return problems;
}

/** Problems with every trigger a Definition declares. */
function validateTriggers(triggers = {}) {
    return Object.entries(triggers || {}).flatMap(([name, t]) => validateTrigger(name, t));
}

/**
 * What devtools provisions for an integration class: the distinct ticks (minutes) of its `every`/`cron` triggers,
 * including the tick of the triggers it resolves per installation (`Definition.instanceTriggers`), and one entry per
 * `at` trigger. Throws on an invalid declaration, so a bad trigger fails the build rather than the first tick.
 *
 * @returns {{ ticks: number[], at: Array<{ name, at, timezone? }> }}
 */
function provisioningOf(IntegrationClass) {
    const Definition = IntegrationClass?.Definition || {};
    const triggers = Definition.triggers || {};
    const problems = validateTriggers(triggers);
    const instance = Definition.instanceTriggers;
    if (instance && parseEvery(instance.tick) === null) problems.push(`instanceTriggers.tick "${instance.tick}" is not a duration`);
    if (problems.length) throw new Error(`Integration "${Definition.name}" declares invalid triggers: ${problems.join('; ')}`);
    const ticks = new Set();
    const at = [];
    for (const [name, t] of Object.entries(triggers)) {
        if (kindOf(t) === 'at') at.push({ name, at: t.at, ...(t.timezone ? { timezone: t.timezone } : {}) });
        else ticks.add(tickMinutesOf(t));
    }
    if (instance) ticks.add(parseEvery(instance.tick));
    return { ticks: [...ticks].sort((a, b) => a - b), at };
}

/** Does this class declare any triggers (fixed or per installation)? */
function hasTriggers(IntegrationClass) {
    const Definition = IntegrationClass?.Definition || {};
    return Object.keys(Definition.triggers || {}).length > 0 || Boolean(Definition.instanceTriggers);
}

/**
 * One trigger, resolved for one installation.
 *
 * @param {string} name
 * @param {Object} t - the declaration (plus `choice` when the caller found the installation's choice elsewhere)
 * @param {Object} config - the installation's config
 * @returns {{ name, kind, recurrence?, at?, tickMinutes, cadence?, overlap, active: boolean, inactive?: string,
 *             source: 'definition'|'installation', problems: string[] }}
 *          `active: false` when `when` excludes the installation or it paused a configurable trigger.
 *          An invalid choice keeps the default and is listed in `problems`, so a bad edit never stops a trigger.
 */
function resolveTrigger(name, t, config = {}) {
    const kind = kindOf(t);
    const out = { name, kind, tickMinutes: tickMinutesOf(t), overlap: t.overlap || 'skip', active: true, source: 'definition', problems: [] };
    if (typeof t.when === 'function' && !t.when(config)) return { ...out, active: false, inactive: 'when' };
    if (kind === 'at') return { ...out, at: t.at, timezone: t.timezone };

    let recurrence = kind === 'every' ? { every: typeof t.every === 'function' ? t.every(config) : t.every } : recurrenceOf(t);
    const configurable = configurableOf(t.configurable);
    const choice = t.choice !== undefined ? t.choice : config?.triggers?.[name];
    if (choice && typeof choice === 'object' && (recurrenceOf(choice) || choice.enabled !== undefined)) {
        if (!configurable) out.problems.push('This trigger is not configurable');
        else {
            const picked = recurrenceOf(choice);
            const issues = picked ? validateRecurrence(picked, { min: configurable.min }) : [];
            if (picked?.every !== undefined && !issues.length && parseEvery(picked.every) > MAX_EVERY_MINUTES) issues.push(`every "${picked.every}" is longer than 1d`);
            if (issues.length) out.problems.push(...issues);
            else {
                if (picked) { recurrence = picked; out.source = 'installation'; }
                if (choice.enabled === false) return { ...out, recurrence, active: false, inactive: 'paused' };
            }
        }
    }
    const own = validateRecurrence(recurrence);
    if (recurrence.every !== undefined && !own.length && parseEvery(recurrence.every) > MAX_EVERY_MINUTES) own.push(`every "${recurrence.every}" is longer than 1d`);
    if (own.length) return { ...out, recurrence, active: false, inactive: 'invalid', problems: [...out.problems, ...own] };
    out.recurrence = recurrence;
    // An interval runs every n ticks (rounded up to a whole number of ticks).
    if (recurrence.every !== undefined) out.cadence = Math.max(1, Math.ceil(parseEvery(recurrence.every) / out.tickMinutes));
    return out;
}

/** A stable, evenly spread number for an installation id (FNV-1a, 32 bits). */
function hashId(value) {
    let h = 0x811c9dc5;
    for (const ch of String(value)) {
        h ^= ch.codePointAt(0);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
}

/** The start of the tick slot an instant falls in: tick runs are keyed by slot, so a late or repeated tick agrees. */
function slotStart(timeMs, tickMinutes) {
    const size = tickMinutes * 60000;
    return Math.floor(timeMs / size) * size;
}

/**
 * Is a resolved trigger due for this installation at this tick slot?
 *
 * - every: due when `slot mod n == hash(integrationId) mod n` (n = cadence in ticks), so it is stateless and spreads
 *   installations evenly across the cadence. scheduledFor is the slot start.
 * - cron:  due when it fired in (slot start - tick, slot start]. scheduledFor is that firing, so two ticks in one slot
 *   (a redelivery, a retried continuation) name the same run.
 * - at:    due whenever its own schedule invoked the tick; scheduledFor is that time, to the minute.
 *
 * @param {Object} resolved - from resolveTrigger
 * @param {{ integrationId, slotMs: number, firing?: (recurrence, from, to) => number|null }} at
 * @returns {{ scheduledFor: string } | null}
 */
function dueRun(resolved, { integrationId, slotMs, firing = lastFiringIn }) {
    if (!resolved?.active) return null;
    if (resolved.kind === 'at') return { scheduledFor: new Date(Math.floor(slotMs / 60000) * 60000).toISOString() };
    if (resolved.recurrence.every !== undefined) {
        const n = resolved.cadence;
        const slot = Math.floor(slotMs / (resolved.tickMinutes * 60000));
        return slot % n === hashId(integrationId) % n ? { scheduledFor: new Date(slotMs).toISOString() } : null;
    }
    const fired = firing(resolved.recurrence, slotMs - resolved.tickMinutes * 60000, slotMs);
    return fired === null ? null : { scheduledFor: new Date(fired).toISOString() };
}

module.exports = {
    TRIGGER_RUN,
    TRIGGER_TICK,
    DEFAULT_TICK_MINUTES,
    configurableOf,
    recurrenceOf,
    durationOf,
    tickMinutesOf,
    validateTrigger,
    validateTriggers,
    provisioningOf,
    hasTriggers,
    resolveTrigger,
    hashId,
    slotStart,
    dueRun,
};
