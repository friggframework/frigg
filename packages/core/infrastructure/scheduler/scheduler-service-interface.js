/**
 * Scheduler Service Interface (Port)
 *
 * Defines the contract for scheduling one-time jobs.
 * All scheduler adapters must extend this interface.
 *
 * Following Frigg's hexagonal architecture pattern:
 * - Port defines WHAT the service does (contract)
 * - Adapters implement HOW (AWS EventBridge, Mock, etc.)
 */
class SchedulerServiceInterface {
    /**
     * Schedule a one-time job to be executed at a specific time
     *
     * @param {Object} params
     * @param {string} params.scheduleName - Unique name for the schedule
     * @param {Date} params.scheduleAt - When to trigger the schedule
     * @param {string} params.queueResourceId - Queue resource identifier to send message to
     * @param {Object} params.payload - JSON payload to send
     * @returns {Promise<{scheduledJobId: string, scheduledAt: string}>}
     */
    async scheduleOneTime({ scheduleName, scheduleAt, queueResourceId, payload }) {
        throw new Error('Method scheduleOneTime must be implemented by subclass');
    }

    /**
     * Create or update a recurring schedule (idempotent by name).
     *
     * The recurrence is host-neutral ({ every } or { cron, timezone }, see recurrence.js); each adapter translates it.
     * String values in `payload` equal to TICK.id or TICK.scheduledFor are replaced, per firing, with that firing's
     * id and scheduled time when the host can supply them, so a consumer can dedupe redeliveries of one tick.
     *
     * @param {Object} params
     * @param {string} params.scheduleName - Unique name for the schedule
     * @param {{every?: string, cron?: string, timezone?: string}} params.recurrence
     * @param {string} params.queueResourceId - Queue resource identifier to send message to
     * @param {Object} params.payload - JSON payload to send on every firing
     * @param {boolean} [params.enabled=true] - false keeps the schedule but stops it firing
     * @returns {Promise<{scheduledJobId: string, created: boolean}>}
     */
    async upsertRecurring({ scheduleName, recurrence, queueResourceId, payload, enabled }) {
        throw new Error('Method upsertRecurring must be implemented by subclass');
    }

    /**
     * Delete a scheduled job
     *
     * @param {string} scheduleName - Name of the schedule to delete
     * @returns {Promise<void>}
     */
    async deleteSchedule(scheduleName) {
        throw new Error('Method deleteSchedule must be implemented by subclass');
    }

    /**
     * Get the status of a scheduled job
     *
     * @param {string} scheduleName - Name of the schedule
     * @returns {Promise<{exists: boolean, scheduledAt?: string, state?: string}>}
     */
    async getScheduleStatus(scheduleName) {
        throw new Error('Method getScheduleStatus must be implemented by subclass');
    }
}

/** Placeholders an adapter fills per firing (see upsertRecurring). */
const TICK = Object.freeze({ id: '{{frigg.tick.id}}', scheduledFor: '{{frigg.tick.scheduledFor}}' });

/** Replace every string equal to a TICK placeholder, deeply. */
function fillTick(payload, values) {
    const swap = (v) => {
        if (v === TICK.id) return values.id;
        if (v === TICK.scheduledFor) return values.scheduledFor;
        if (Array.isArray(v)) return v.map(swap);
        if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)]));
        return v;
    };
    return swap(payload);
}

module.exports = { SchedulerServiceInterface, TICK, fillTick };
