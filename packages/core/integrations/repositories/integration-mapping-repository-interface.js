/**
 * Integration Mapping Repository Interface
 * Abstract base class defining the contract for integration mapping persistence adapters
 *
 * This follows the Port in Hexagonal Architecture:
 * - Domain layer depends on this abstraction
 * - Concrete adapters implement this interface
 * - Use cases receive repositories via dependency injection
 *
 * Note: Currently, IntegrationMapping model has identical structure across MongoDB and PostgreSQL,
 * so IntegrationMappingRepository serves both. This interface exists for consistency and
 * future-proofing if database-specific implementations become needed.
 *
 * @abstract
 */
class IntegrationMappingRepositoryInterface {
    /**
     * Find mapping by integration ID and source ID
     *
     * @param {string|number} integrationId - The integration ID
     * @param {string} sourceId - The source ID for lookup
     * @returns {Promise<Object|null>} The mapping object or null
     * @abstract
     */
    async findMappingBy(integrationId, sourceId) {
        throw new Error('Method findMappingBy must be implemented by subclass');
    }

    /**
     * Create or update a mapping
     *
     * @param {string|number} integrationId - The integration ID
     * @param {string} sourceId - The source ID for lookup
     * @param {Object} mapping - The mapping data
     * @returns {Promise<Object>} The created or updated mapping document
     * @abstract
     */
    async upsertMapping(integrationId, sourceId, mapping) {
        throw new Error('Method upsertMapping must be implemented by subclass');
    }

    /**
     * Find all mappings for an integration
     *
     * @param {string|number} integrationId - The integration ID
     * @returns {Promise<Array>} Array of mapping objects
     * @abstract
     */
    async findMappingsByIntegration(integrationId) {
        throw new Error(
            'Method findMappingsByIntegration must be implemented by subclass'
        );
    }

    /**
     * Query one filtered, ordered page of an integration's mappings without
     * loading every row. Rows have the same shape as findMappingsByIntegration.
     *
     * Paths address the `mapping` JSON by identifier-only segments
     * (`'mapping.c2h.lastStatus'`), or the `sourceId` column. Conditions:
     * - `{ path: 'mapping.…', op: 'exists' | 'notExists' }` — JSON null counts
     *   as absent; notExists is the exact negation of exists.
     * - `{ path: 'mapping.…', op: 'in', value: string[] }` — matches JSON strings.
     * - `{ path: 'sourceId', op: 'notStartsWith', value: string }` — a NULL
     *   sourceId matches.
     *
     * Only rows whose `mapping` is a JSON object can match, so rows still
     * holding ciphertext from before an encryption opt-out never do. Adapters
     * refuse to run while field-level encryption is enabled and still encrypts
     * `mapping` on write; opt out with
     * `appDefinition.encryption.disable = { IntegrationMapping: ['mapping'] }`.
     *
     * @param {string|number} integrationId - The integration ID
     * @param {Object} query
     * @param {Array<Object>} [query.where=[]] - Conditions ANDed together; an
     *   entry may be `{ anyOf: Condition[] }` (one level, ORed)
     * @param {{path: string, direction: 'asc'|'desc'}} [query.orderBy] - A
     *   mapping path; nulls last, ties broken by id in the same direction.
     *   Without it rows are ordered by id ascending.
     * @param {number} [query.skip=0] - Rows to skip (integer ≥ 0)
     * @param {number} query.take - Page size (integer 1–500)
     * @param {string[]} [query.omit=[]] - Top-level mapping keys to leave out of
     *   the returned rows; such projected rows must not be written back
     * @returns {Promise<{mappings: Array<Object>, total: number}>} The page, and
     *   the number of rows matching `where`
     * @abstract
     */
    async queryMappings(integrationId, query) {
        throw new Error('Method queryMappings must be implemented by subclass');
    }

    /**
     * Delete a specific mapping
     *
     * @param {string|number} integrationId - The integration ID
     * @param {string} sourceId - The source ID
     * @returns {Promise<Object>} Deletion result
     * @abstract
     */
    async deleteMapping(integrationId, sourceId) {
        throw new Error('Method deleteMapping must be implemented by subclass');
    }

    /**
     * Delete all mappings for an integration
     *
     * @param {string|number} integrationId - The integration ID
     * @returns {Promise<Object>} Deletion result
     * @abstract
     */
    async deleteMappingsByIntegration(integrationId) {
        throw new Error(
            'Method deleteMappingsByIntegration must be implemented by subclass'
        );
    }

    /**
     * Count mappings grouped by integration id, for a bounded set of ids.
     * Adapters must drain the full grouped result (a deployment can have more
     * than one first-batch of distinct integration ids).
     *
     * @returns {Promise<Map<string, number>>} Map of integrationId (string) → count
     * @abstract
     */
    async countByIntegrationIds(ids) {
        throw new Error(
            'Method countByIntegrationIds must be implemented by subclass'
        );
    }

    /**
     * Find mapping by ID
     *
     * @param {string|number} id - The mapping ID
     * @returns {Promise<Object|null>} The mapping object or null
     * @abstract
     */
    async findMappingById(id) {
        throw new Error(
            'Method findMappingById must be implemented by subclass'
        );
    }

    /**
     * Update a mapping by ID
     *
     * @param {string|number} id - The mapping ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated mapping object
     * @abstract
     */
    async updateMapping(id, updates) {
        throw new Error('Method updateMapping must be implemented by subclass');
    }
}

module.exports = { IntegrationMappingRepositoryInterface };
