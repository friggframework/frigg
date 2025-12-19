/**
 * UpdateProcessState Use Case
 *
 * Updates the state of a process and optionally merges context updates.
 * Handles state transitions in the process state machine.
 *
 * Design Philosophy:
 * - State transitions are explicit and tracked
 * - Context updates are merged (not replaced) to preserve data
 * - Repository handles persistence, use case handles business logic
 *
 * State Machine (CRM Sync Example):
 * INITIALIZING → FETCHING_TOTAL → QUEUING_PAGES → PROCESSING_BATCHES →
 * COMPLETING → COMPLETED
 *
 * Any state can transition to ERROR on failure.
 *
 * @example
 * const updateProcessState = new UpdateProcessState({ processRepository });
 * await updateProcessState.execute(processId, 'FETCHING_TOTAL', {
 *   currentPage: 1,
 *   pagination: { pageSize: 100 }
 * });
 */
class UpdateProcessState {
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
     * Execute the use case to update process state
     * @param {string} processId - Process ID to update
     * @param {string} newState - New state value
     * @param {Object} [contextUpdates={}] - Context fields to merge
     * @returns {Promise<Object>} Updated process record
     * @throws {Error} If process not found or update fails
     */
    async execute(processId, newState, contextUpdates = {}) {
        // Validate inputs
        if (!processId || typeof processId !== 'string') {
            throw new Error('processId must be a non-empty string');
        }
        if (!newState || typeof newState !== 'string') {
            throw new Error('newState must be a non-empty string');
        }
        if (contextUpdates && typeof contextUpdates !== 'object') {
            throw new Error('contextUpdates must be an object');
        }

        // Retrieve current process
        const process = await this.processRepository.findById(processId);
        if (!process) {
            throw new Error(`Process not found: ${processId}`);
        }

        // Prepare updates
        const updates = {
            state: newState,
        };

        // Merge context updates if provided
        if (contextUpdates && Object.keys(contextUpdates).length > 0) {
            updates.context = {
                ...process.context,
                ...contextUpdates,
            };
        }

        // Persist updates
        try {
            const updatedProcess = await this.processRepository.update(
                processId,
                updates
            );
            return updatedProcess;
        } catch (error) {
            throw new Error(`Failed to update process state: ${error.message}`);
        }
    }

    /**
     * Helper method to update state without context changes
     * @param {string} processId - Process ID to update
     * @param {string} newState - New state value
     * @returns {Promise<Object>} Updated process record
     */
    async updateStateOnly(processId, newState) {
        return this.execute(processId, newState, {});
    }

    /**
     * Helper method to update context without changing state
     * @param {string} processId - Process ID to update
     * @param {Object} contextUpdates - Context fields to merge
     * @returns {Promise<Object>} Updated process record
     */
    async updateContextOnly(processId, contextUpdates) {
        const process = await this.processRepository.findById(processId);
        if (!process) {
            throw new Error(`Process not found: ${processId}`);
        }

        const updates = {
            context: {
                ...process.context,
                ...contextUpdates,
            },
        };

        return this.processRepository.update(processId, updates);
    }
}

module.exports = { UpdateProcessState };
