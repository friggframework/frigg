/**
 * Run one recurring trigger for one installation (ADR-055 "Run"). The queue worker has already hydrated the
 * installation by `integrationId`; this decides whether the run happens and records it.
 *
 * 1. The installation must be ENABLED; anything else discards the run.
 * 2. With `overlap: 'skip'` (the default) a Process record per (installation, trigger), type `TRIGGER:<name>`, is
 *    the lease: a run whose record is not terminal and was touched within 2 x tick is still going, so this run is
 *    skipped and acked. Otherwise the record is reused (one row per installation and trigger, not one per run), set
 *    RUNNING, and set COMPLETED or ERROR when the handler ends. A failed run is marked ERROR before the error is
 *    rethrown, so the worker's retry is not skipped by the run it is retrying. `overlap: 'allow'` keeps no record.
 * 3. Errors go back to the queue worker: its retry, halt and DLQ rules apply as for any queued event.
 */
const TERMINAL = ['COMPLETED', 'ERROR'];
const AT_LEASE_MINUTES = 60;   // an `at` trigger has no tick; its lease is two hours

class RunTrigger {
    /**
     * @param {Object} deps
     * @param {Object} deps.processRepository - findByIntegrationAndType, create, update
     * @param {() => number} [deps.now]
     */
    constructor({ processRepository, now = () => Date.now() }) {
        this.processRepository = processRepository;
        this.now = now;
    }

    /**
     * @param {Object} params
     * @param {Object} params.integration - hydrated instance: id, userId, status, telemetry
     * @param {Object} params.resolved - resolveTrigger(...) for this installation
     * @param {(payload) => Promise<any>} params.invoke - calls the trigger's handler
     * @param {{ trigger: string, scheduledFor: string }} params.payload
     * @returns {Promise<{ status: 'ran'|'skipped'|'discarded', reason?: string, result?: any }>}
     */
    async execute({ integration, resolved, invoke, payload }) {
        const count = (name) => { try { integration.telemetry?.count(name, 1, { trigger: payload.trigger }); } catch (_) { /* never fails a run */ } };
        if (integration.status !== 'ENABLED') return { status: 'discarded', reason: `installation is ${integration.status}` };
        if (!resolved?.active) return { status: 'discarded', reason: resolved ? `trigger is ${resolved.inactive}` : 'trigger is not declared' };

        if (resolved.overlap === 'allow') return this.run({ invoke, payload, count });

        const type = `TRIGGER:${payload.trigger}`;
        const [existing] = await this.processRepository.findByIntegrationAndType(integration.id, type);
        const leaseMs = 2 * (resolved.tickMinutes || AT_LEASE_MINUTES) * 60000;
        const touched = existing ? new Date(existing.updatedAt || existing.createdAt || 0).getTime() : 0;
        if (existing && !TERMINAL.includes(existing.state) && this.now() - touched < leaseMs) {
            count('trigger.skipped');
            return { status: 'skipped', reason: `a run of ${payload.trigger} is still going` };
        }

        const context = { scheduledFor: payload.scheduledFor, startedAt: new Date(this.now()).toISOString() };
        const record = existing
            ? await this.processRepository.update(existing.id, { state: 'RUNNING', context })
            : await this.processRepository.create({ userId: integration.userId, integrationId: integration.id, name: type, type, state: 'RUNNING', context, results: {} });
        try {
            const out = await this.run({ invoke, payload, count });
            await this.processRepository.update(record.id, { state: 'COMPLETED', results: { scheduledFor: payload.scheduledFor, finishedAt: new Date(this.now()).toISOString() } });
            return out;
        } catch (error) {
            await this.processRepository.update(record.id, { state: 'ERROR', results: { scheduledFor: payload.scheduledFor, error: error.message } }).catch(() => {});
            throw error;
        }
    }

    async run({ invoke, payload, count }) {
        try {
            const result = await invoke(payload);
            count('trigger.run');
            return { status: 'ran', result };
        } catch (error) {
            count('trigger.failed');
            throw error;
        }
    }
}

module.exports = { RunTrigger, TERMINAL };
