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

function createUsageCommands({ usageRepository } = {}) {
    const repository = usageRepository || createUsageRepository();

    return {
        async recordUsageCounter({
            integrationId,
            integrationType,
            metric,
            window,
            value = 1,
        }) {
            return repository.increment({
                integrationId,
                integrationType,
                metric,
                window,
                value,
            });
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
