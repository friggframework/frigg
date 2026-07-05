/**
 * Port for the durable usage-counter store (ADR-011 Usage-Counter Contract §4).
 *
 * The store is deliberately isolated (ADR-010 Decision 3): its fact rows carry
 * NO userId and NO foreign key to Integration, so a user-scoped query can never
 * return a usage row and usage history survives integration deletion.
 *
 * Fact row: { integrationId, integrationType, metric, window, value, updatedAt }
 * Dimensions must be bounded — high-cardinality ids stay on traces.
 */
class UsageRepositoryInterface {
    /**
     * Atomically add `value` to the counter for
     * (integrationId, integrationType, metric, window), inserting if absent.
     */
    async increment(/* { integrationId, integrationType, metric, window, value } */) {
        throw new Error('increment must be implemented by subclass');
    }

    /**
     * Sum a metric grouped by a bounded dimension since an optional timestamp.
     * @returns {Promise<Array<{[groupBy]: string, value: number}>>}
     */
    async totals(/* { metric, groupBy, since } */) {
        throw new Error('totals must be implemented by subclass');
    }

    /**
     * Time series of a metric for one integration type.
     * @returns {Promise<Array<{bucket: string, value: number}>>}
     */
    async series(/* { metric, integrationType, from, to, bucket } */) {
        throw new Error('series must be implemented by subclass');
    }
}

module.exports = { UsageRepositoryInterface };
