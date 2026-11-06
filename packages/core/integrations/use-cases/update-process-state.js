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
const { invalidProcessData, processNotFound } = require('./process-errors');

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
            throw invalidProcessData('processId must be a non-empty string');
        }
        if (!newState || typeof newState !== 'string') {
            throw invalidProcessData('newState must be a non-empty string');
        }
        if (contextUpdates && typeof contextUpdates !== 'object') {
            throw invalidProcessData('contextUpdates must be an object');
        }

        // Route through the atomic path when the repo supports it AND we
        // have context keys to set. The atomic path writes the state
        // column + the context field-sets in one DB round trip without
        // read-modify-write, so a concurrent counter bump from
        // UpdateProcessMetrics can't clobber our flags (e.g. `fetchDone`)
        // or vice versa.
        //
        // Each context update key becomes a `set` at path
        // `context.<key>` — matching the prior semantics of a shallow
        // top-level merge (sub-objects were and still are replaced
        // whole, not deep-merged).
        const hasContextKeys =
            contextUpdates && Object.keys(contextUpdates).length > 0;

        if (
            hasContextKeys &&
            typeof this.processRepository.applyProcessUpdate === 'function'
        ) {
            const set = {};
            for (const [key, value] of Object.entries(contextUpdates)) {
                set[`context.${key}`] = value;
            }
            try {
                const updated = await this.processRepository.applyProcessUpdate(
                    processId,
                    { set, newState }
                );
                if (!updated) {
                    throw processNotFound(`Process not found: ${processId}`);
                }
                return updated;
            } catch (error) {
                if (error.code === 'PROCESS_NOT_FOUND') {
                    throw error;
                }
                throw new Error(
                    `Failed to update process state: ${error.message}`
                );
            }
        }

        // Legacy path (no contextUpdates or repo lacks applyProcessUpdate):
        // preserve the original read-merge-write semantics for backward
        // compatibility with any custom repos. Wrap the full read+write
        // in try/catch so a findById error surfaces under the same
        // "Failed to update process state" message as a write failure.
        try {
            const process = await this.processRepository.findById(processId);
            if (!process) {
                throw processNotFound(`Process not found: ${processId}`);
            }

            const updates = { state: newState };
            if (hasContextKeys) {
                updates.context = {
                    ...process.context,
                    ...contextUpdates,
                };
            }

            return await this.processRepository.update(processId, updates);
        } catch (error) {
            // Re-throw "Process not found" as-is; wrap other errors.
            if (error.code === 'PROCESS_NOT_FOUND') {
                throw error;
            }
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
            throw processNotFound(`Process not found: ${processId}`);
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

