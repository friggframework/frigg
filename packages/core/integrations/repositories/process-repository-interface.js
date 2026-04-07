/**
 * ProcessRepository Interface
 *
 * Defines the contract for Process data access operations.
 * Implementations must provide concrete methods for all operations.
 *
 * This interface supports the Hexagonal Architecture pattern by:
 * - Defining clear boundaries between domain logic and data access
 * - Allowing multiple implementations (MongoDB, PostgreSQL, in-memory)
 * - Enabling dependency injection and testability
 */
class ProcessRepositoryInterface {
    /**
     * Create a new process record
     * @param {Object} processData - Process data to create
     * @param {string} processData.userId - User ID
     * @param {string} processData.integrationId - Integration ID
     * @param {string} processData.name - Process name
     * @param {string} processData.type - Process type
     * @param {string} processData.state - Initial state
     * @param {Object} [processData.context] - Process context
     * @param {Object} [processData.results] - Process results
     * @param {string[]} [processData.childProcesses] - Child process IDs
     * @param {string} [processData.parentProcessId] - Parent process ID
     * @returns {Promise<Object>} Created process record
     */
    async create(processData) {
        throw new Error('Method create() must be implemented');
    }

    /**
     * Find a process by ID
     * @param {string} processId - Process ID to find
     * @returns {Promise<Object|null>} Process record or null if not found
     */
    async findById(processId) {
        throw new Error('Method findById() must be implemented');
    }

    /**
     * Update a process record
     * @param {string} processId - Process ID to update
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated process record
     */
    async update(processId, updates) {
        throw new Error('Method update() must be implemented');
    }

    /**
     * Find processes by integration and type
     * @param {string} integrationId - Integration ID
     * @param {string} type - Process type
     * @returns {Promise<Array>} Array of process records
     */
    async findByIntegrationAndType(integrationId, type) {
        throw new Error(
            'Method findByIntegrationAndType() must be implemented'
        );
    }

    /**
     * Find active processes (not in excluded states)
     * @param {string} integrationId - Integration ID
     * @param {string[]} [excludeStates=['COMPLETED', 'ERROR']] - States to exclude
     * @returns {Promise<Array>} Array of active process records
     */
    async findActiveProcesses(
        integrationId,
        excludeStates = ['COMPLETED', 'ERROR']
    ) {
        throw new Error('Method findActiveProcesses() must be implemented');
    }

    /**
     * Find a process by name (most recent)
     * @param {string} name - Process name
     * @returns {Promise<Object|null>} Most recent process with given name, or null
     */
    async findByName(name) {
        throw new Error('Method findByName() must be implemented');
    }

    /**
     * Delete a process by ID
     * @param {string} processId - Process ID to delete
     * @returns {Promise<void>}
     */
    async deleteById(processId) {
        throw new Error('Method deleteById() must be implemented');
    }
}

module.exports = { ProcessRepositoryInterface };
