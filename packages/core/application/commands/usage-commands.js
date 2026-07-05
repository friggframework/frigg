/**
 * Usage Commands
 *
 * Application Layer — the read/write surface over the durable usage store
 * (ADR-011 §5). Exposed as `frigg.usage.*` on the unified command object so
 * reports and integration code query usage without touching the repository.
 *
 * @example
 * const frigg = createFriggCommands({ integrationClass: MyIntegration });
 * await frigg.usage.totals({ metric: 'records.synced', groupBy: 'integrationType', since });
 * await frigg.usage.series({ metric: 'records.synced', integrationType: 'hubspot', bucket: 'day' });
 */
const {
    createUsageRepository,
} = require('../../usage/repositories/usage-repository-factory');
const { computeUsageWindows } = require('../../telemetry/usage-windows');

function createUsageCommands({ usageRepository } = {}) {
    const repository = usageRepository || createUsageRepository();

    return {
        /**
         * Record a usage counter for a point in time. Callers pass `at` (a Date,
         * default now) — NOT a raw window key — and both the day and hour windows
         * are derived, matching how the auto-rollup persists so series() reads
         * back consistently at either granularity.
         */
        async recordUsageCounter({
            integrationId,
            integrationType,
            metric,
            value = 1,
            at = new Date(),
        }) {
            for (const window of computeUsageWindows(at)) {
                await repository.increment({
                    integrationId,
                    integrationType,
                    metric,
                    window,
                    value,
                });
            }
        },

        async totals(args) {
            return repository.totals(args);
        },

        async series(args) {
            return repository.series(args);
        },
    };
}

module.exports = { createUsageCommands };
