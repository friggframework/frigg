/**
 * Usage Commands
 *
 * Application Layer — the read/write surface over the durable usage store.
 * Exposed as `frigg.usage.*` on the unified command object so
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
const { resolveNorthStarEntry } = require('../../telemetry/north-star');

function createUsageCommands({ usageRepository, northStar = null } = {}) {
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
            const windows = computeUsageWindows(at);
            for (const window of windows) {
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

        /**
         * First-class North Star read. Resolves the
         * configured counter for an integration type (byType wins over default),
         * then returns its totals from the durable usage store. Returns `null`
         * when no North Star is configured, so callers can branch without
         * knowing the counter key. Trends read via `series({ metric })`.
         */
        async northStar({ integrationType, since, groupBy = 'integrationType', bucket } = {}) {
            const entry = resolveNorthStarEntry(northStar, integrationType);
            if (!entry) return null;
            const totals = await repository.totals({
                metric: entry.name,
                groupBy,
                since,
                bucket,
            });
            return { metric: entry.name, totals };
        },
    };
}

module.exports = { createUsageCommands };
