/**
 * GetProcess Use Case
 *
 * Retrieves a process by ID with proper error handling.
 * Simple use case that delegates to repository.
 *
 * Design Philosophy:
 * - Use cases provide consistent error handling
 * - Business logic layer between controllers and repositories
 * - Return null for not found vs throwing error (configurable)
 *
 * @example
 * const getProcess = new GetProcess({ processRepository });
 * const process = await getProcess.execute(processId);
 * // or
 * const process = await getProcess.executeOrThrow(processId);
 */
class GetProcess {
    /**
     * @param {Object} params
     * @param {ProcessRepositoryInterface} params.processRepository - Repository for process data access
     */
    constructor({ processRepository }) {
        if (!processRepository) {
            throw new Error('processRepository is required');
        }
        this.processRepository = processRepository;
    }

    /**
     * Execute the use case to get a process by ID
     * @param {string} processId - Process ID to retrieve
     * @returns {Promise<Object|null>} Process record or null if not found
     * @throws {Error} If processId is invalid
     */
    async execute(processId) {
        // Validate input
        if (!processId || typeof processId !== 'string') {
            throw new Error('processId must be a non-empty string');
        }

        // Delegate to repository
        try {
            const process = await this.processRepository.findById(processId);
            return process;
        } catch (error) {
            throw new Error(`Failed to retrieve process: ${error.message}`);
        }
    }

    /**
     * Execute and throw if process not found
     * @param {string} processId - Process ID to retrieve
     * @returns {Promise<Object>} Process record
     * @throws {Error} If process not found or retrieval fails
     */
    async executeOrThrow(processId) {
        const process = await this.execute(processId);

        if (!process) {
            throw new Error(`Process not found: ${processId}`);
        }

        return process;
    }

    /**
     * Get multiple processes by IDs
     * @param {string[]} processIds - Array of process IDs
     * @returns {Promise<Array>} Array of process records (excludes not found)
     */
    async executeMany(processIds) {
        if (!Array.isArray(processIds)) {
            throw new Error('processIds must be an array');
        }

        const processes = await Promise.all(
            processIds.map((id) => this.execute(id))
        );

        // Filter out nulls (not found)
        return processes.filter((p) => p !== null);
    }
}

module.exports = { GetProcess };
