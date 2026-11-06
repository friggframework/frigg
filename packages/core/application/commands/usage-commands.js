// `frigg.usage.*` — the read/write surface over the durable usage store.
const {
    createUsageRepository,
} = require('../../usage/repositories/usage-repository-factory');
const { computeUsageWindows } = require('../../usage/usage-windows');
const { resolveNorthStarEntry } = require('../../telemetry/north-star');

function createUsageCommands({ usageRepository } = {}) {
    const repository = usageRepository || createUsageRepository();

    return {
        // Increments both the day and hour window rows for `at`.
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

        async getTotalsByDimension(args) {
            return repository.getTotalsByDimension(args);
        },

        async getTimeSeries(args) {
            return repository.getTimeSeries(args);
        },

        // Caller supplies the North Star config (Definition.telemetry.northStar);
        // resolves the counter for the type (byType > default), null if none.
        async getNorthStarTotals({ northStar, integrationType, since, groupBy = 'integrationType', bucket } = {}) {
            const entry = resolveNorthStarEntry(northStar, integrationType);
            if (!entry) return null;
            const totals = await repository.getTotalsByDimension({
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
