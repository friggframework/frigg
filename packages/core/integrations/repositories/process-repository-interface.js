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
     * Apply atomic mutations to a process record.
     *
     * Race-safe counterpart to `update()`. Where `update()` takes full
     * JSON blobs and does read-modify-write at the ORM layer (clobber-
     * prone under concurrent writers), `applyProcessUpdate()` describes
     * the intent declaratively and each backend uses its native atomic
     * primitive:
     *   - PostgreSQL: `jsonb_set` chain inside a single UPDATE ... RETURNING
     *   - MongoDB: `$inc` / `$set` / `$push` via findAndModify
     *   - DocumentDB: same operator set as MongoDB (with version caveats)
     *
     * All paths are dot-delimited and rooted in `context` or `results`
     * (e.g. `context.processedRecords`,
     * `results.aggregateData.totalSynced`). Paths MUST match
     * `^(context|results)(\\.[a-zA-Z_][a-zA-Z0-9_]*)+$` — validated by
     * each adapter before any SQL/command generation.
     *
     * Intended primary callers: UpdateProcessMetrics and
     * UpdateProcessState. Other callers can use this directly when they
     * need race-free cumulative updates.
     *
     * @typedef {Object} ProcessUpdateOps
     * @property {Object.<string, number>} [increment] - Atomic numeric
     *   increments keyed by dot-path. e.g.
     *   `{ 'context.processedRecords': 1, 'results.aggregateData.totalSynced': 1 }`
     * @property {Object.<string, *>} [set] - Atomic whole-subtree set
     *   keyed by dot-path. Replaces the value at the path (NOT deep
     *   merge). e.g. `{ 'context.fetchDone': true }`
     * @property {Object.<string, {values: Array, keepLast: number}>} [pushSlice]
     *   Atomic array push with bounded retention (sliding window of the
     *   last `keepLast` items). Keys are dot-paths pointing to arrays.
     *   e.g. `{ 'results.aggregateData.errors': { values: [err], keepLast: 100 } }`
     * @property {string} [newState] - Top-level `state` column update.
     *   Written alongside the JSON mutations in the same UPDATE so state
     *   + counters move together.
     *
     * @param {string} processId - Process ID to update
     * @param {ProcessUpdateOps} ops - Atomic operations to apply
     * @returns {Promise<Object|null>} Updated process record (post-
     *   mutation) or null if the process does not exist.
     */
    async applyProcessUpdate(processId, ops) {
        throw new Error('Method applyProcessUpdate() must be implemented');
    }

    /**
     * Find processes by integration and type
     * @param {string} integrationId - Integration ID
     * @param {string} type - Process type
     * @returns {Promise<Array>} Array of process records
     */
    async findByIntegrationAndType(integrationId, type) {
        throw new Error('Method findByIntegrationAndType() must be implemented');
    }

    /**
     * Find active processes (not in excluded states)
     * @param {string} integrationId - Integration ID
     * @param {string[]} [excludeStates=['COMPLETED', 'ERROR']] - States to exclude
     * @returns {Promise<Array>} Array of active process records
     */
    async findActiveProcesses(integrationId, excludeStates = ['COMPLETED', 'ERROR']) {
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

