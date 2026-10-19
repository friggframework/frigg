/**
 * The trigger tick (ADR-055 "Runtime / Tick"): one invocation of an integration's `{integration}Triggers` function.
 *
 * It is invoked by one of the integration's schedules: `{ tick: '5m', time }` for the shared tick of its `every` and
 * `cron` triggers, or `{ at: '<trigger name>', time }` for an `at` trigger. `time` is the schedule's own firing time,
 * so the slot it falls in, and therefore every due decision and every `scheduledFor`, is the same if the same tick
 * is delivered twice or carried on by a continuation.
 *
 * 1. Page through the ENABLED installations of this integration, `pageSize` (500) at a time, by id.
 * 2. For each installation and trigger, resolve config, `when` and the cadence (integrations/triggers.js).
 * 3. Due: `every` when `slot mod n == hash(integrationId) mod n`; `cron` when it fired in (previous tick, this tick];
 *    `at` always (it is its own schedule).
 * 4. Send `{ event: 'FRIGG_TRIGGER_RUN', data: { integrationId, trigger, scheduledFor } }` to the integration queue in
 *    batches, with `DelaySeconds` jitter (a stable 0..min(tick, 900 s) per installation and trigger) for tick runs.
 * 5. Near the Lambda deadline, send `{ event: 'FRIGG_TRIGGER_TICK', data: { tick|at, time, cursor } }` to the same
 *    queue and stop; the queue worker carries on from the cursor (IntegrationBase.onTriggerTick).
 *
 * Missed ticks are not replayed: a trigger is a "check now" signal, and handlers keep their own watermark.
 */
const { parseEvery, lastFiringIn } = require('../../infrastructure/scheduler/recurrence');
const { TRIGGER_RUN, TRIGGER_TICK, resolveTrigger, dueRun, slotStart, hashId } = require('../triggers');

const PAGE_SIZE = 500;
const DEADLINE_MARGIN_MS = 30000;
const MAX_DELAY_SECONDS = 900;   // SQS DelaySeconds ceiling

class RunTriggerTick {
    /**
     * @param {Object} deps
     * @param {Function} deps.integrationClass - the IntegrationBase subclass (Definition.name, triggersFor)
     * @param {Object} deps.integrationRepository - findIntegrations({ type, status, limit, after })
     * @param {Object} deps.queue - { batchSend(entries, queueUrl, { delaySeconds }), send(message, queueUrl) }
     * @param {string} deps.queueUrl
     * @param {Object} [deps.logger]
     * @param {number} [deps.pageSize]
     */
    constructor({ integrationClass, integrationRepository, queue, queueUrl, logger, pageSize = PAGE_SIZE }) {
        this.Integration = integrationClass;
        this.repository = integrationRepository;
        this.queue = queue;
        this.queueUrl = queueUrl;
        this.logger = logger;
        this.pageSize = pageSize;
    }

    /**
     * @param {Object} params
     * @param {string} [params.tick] - '5m': evaluate the every/cron triggers on this tick
     * @param {string} [params.at] - an `at` trigger's name: run it for every ENABLED installation
     * @param {string} [params.time] - the schedule's firing time (ISO); defaults to now
     * @param {string|number} [params.cursor] - continue after this installation id
     * @param {() => number} [params.remainingMs] - time left in this invocation
     * @returns {Promise<{ installations: number, sent: number, pages: number, continued: boolean, failed: Array }>}
     */
    async execute({ tick, at, time, cursor, remainingMs = () => Infinity }) {
        const name = this.Integration.Definition?.name;
        if (!this.queueUrl) throw new Error(`No queue URL for integration "${name}"; trigger runs have nowhere to go`);
        const tickMinutes = at ? null : parseEvery(tick);
        if (!at && tickMinutes === null) throw new Error(`Trigger tick "${tick}" is not a duration`);
        const timeMs = time && !Number.isNaN(Date.parse(time)) ? Date.parse(time) : Date.now();
        const slotMs = at ? Math.floor(timeMs / 60000) * 60000 : slotStart(timeMs, tickMinutes);
        const firings = new Map();   // one cron answer per recurrence per tick (the window is the same), not per installation
        const firing = (recurrence, from, to) => {
            const key = `${recurrence.cron}|${recurrence.timezone || 'UTC'}`;
            if (!firings.has(key)) firings.set(key, lastFiringIn(recurrence, from, to));
            return firings.get(key);
        };
        const delayOf = (m) => (at ? 0 : hashId(`${m.data.integrationId}:${m.data.trigger}`) % Math.min(tickMinutes * 60, MAX_DELAY_SECONDS));

        const out = { installations: 0, sent: 0, pages: 0, continued: false, failed: [] };
        let after = cursor;
        for (;;) {
            const rows = await this.repository.findIntegrations({ type: name, status: 'ENABLED', limit: this.pageSize, after });
            out.pages += 1;
            const messages = [];
            for (const row of rows) {
                out.installations += 1;
                try {
                    const declarations = await this.Integration.triggersFor({ config: row.config || {}, record: row });
                    for (const declaration of declarations) {
                        const isAt = declaration.at !== undefined;
                        if (at ? declaration.name !== at || !isAt : isAt) continue;
                        const resolved = resolveTrigger(declaration.name, declaration, row.config || {});
                        if (!at && resolved.tickMinutes !== tickMinutes) continue;
                        const due = dueRun(resolved, { integrationId: row.id, slotMs, firing });
                        if (due) messages.push({ event: TRIGGER_RUN, data: { integrationId: row.id, trigger: declaration.name, scheduledFor: due.scheduledFor } });
                    }
                } catch (error) {
                    // One installation's bad config must not stop the others' runs.
                    out.failed.push({ integrationId: row.id, error: error.message });
                    this.logger?.warn('Trigger tick skipped an installation', { eventName: 'frigg.triggers.installation_failed', integration: name, integrationId: row.id, error });
                }
            }
            if (messages.length) {
                await this.queue.batchSend(messages, this.queueUrl, { delaySeconds: delayOf });
                out.sent += messages.length;
            }
            if (rows.length < this.pageSize) return out;
            after = rows[rows.length - 1].id;
            if (remainingMs() < DEADLINE_MARGIN_MS) {
                await this.queue.send({ event: TRIGGER_TICK, data: { ...(at ? { at } : { tick }), time: new Date(timeMs).toISOString(), cursor: after } }, this.queueUrl);
                out.continued = true;
                return out;
            }
        }
    }
}

/** The queue URL Frigg's infrastructure gives an integration: `<NAME>_QUEUE_URL`, dashes as underscores. */
function queueUrlFor(integrationName) {
    return process.env[`${String(integrationName).toUpperCase().replace(/-/g, '_')}_QUEUE_URL`];
}

/**
 * Run a tick with Frigg's real adapters: the integration repository, the SQS queuer and the integration's queue.
 * Used by the `{integration}Triggers` Lambda and by a continuation on the queue worker.
 */
async function runTriggerTick(integrationClass, event = {}, context) {
    const { createIntegrationRepository } = require('../repositories/integration-repository-factory');
    const { QueuerUtil } = require('../../queues');
    const { getLogger } = require('../../logs');
    const remainingMs = typeof context?.getRemainingTimeInMillis === 'function' ? () => context.getRemainingTimeInMillis() : undefined;
    return new RunTriggerTick({
        integrationClass,
        integrationRepository: createIntegrationRepository(),
        queue: QueuerUtil,
        queueUrl: queueUrlFor(integrationClass.Definition.name),
        logger: getLogger('frigg.triggers'),
    }).execute({ tick: event.tick, at: event.at, time: event.time, cursor: event.cursor, remainingMs });
}

module.exports = { RunTriggerTick, runTriggerTick, queueUrlFor, PAGE_SIZE };
