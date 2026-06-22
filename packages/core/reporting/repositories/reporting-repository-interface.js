/**
 * Reporting Repository Interface
 * Abstract base class defining the contract for read-only reporting adapters.
 *
 * Port in Hexagonal Architecture:
 * - The reporting use cases depend on this abstraction
 * - Concrete adapters (PostgreSQL, MongoDB, DocumentDB) implement it
 * - Adapters expose only aggregate/projection reads — never decrypting
 *   encrypted fields (mapping/data); counts use passthrough operations.
 *
 * @abstract
 */
class ReportingRepositoryInterface {
    /**
     * List integrations (deployment-wide) for reporting, optionally filtered.
     *
     * @param {{ status?: string, userId?: string }} [filter]
     * @returns {Promise<Array<{
     *   id: string,
     *   type: string|null,
     *   status: string|null,
     *   userId: string|null,
     *   version: string|null,
     *   errorCount: number,
     *   moduleCount: number,
     *   createdAt: (Date|string|null),
     *   updatedAt: (Date|string|null),
     * }>>}
     * @abstract
     */
    async findIntegrationsForReport(filter) {
        throw new Error(
            'Method findIntegrationsForReport must be implemented by subclass'
        );
    }

    /**
     * Count IntegrationMapping rows per integration id (passthrough count — the
     * encrypted `mapping` field is never read).
     *
     * @param {Array<string>} ids - Integration ids
     * @returns {Promise<Map<string, number>>} Map of integration id -> mapping count
     * @abstract
     */
    async countMappingsByIntegrationIds(ids) {
        throw new Error(
            'Method countMappingsByIntegrationIds must be implemented by subclass'
        );
    }
}

module.exports = { ReportingRepositoryInterface };
