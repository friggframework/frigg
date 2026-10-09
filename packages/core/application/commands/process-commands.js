/**
 * Process Commands
 *
 * Application Layer - Command factory for long-running process tracking.
 *
 * Wraps the Process use cases (create, get, update state, update metrics)
 * behind the same `createXCommands()` surface used by the other domains so
 * integration developers can track processes without touching repositories
 * or the underlying ORM directly.
 *
 * @example
 * const processCommands = createProcessCommands();
 * const process = await processCommands.createProcess({
 *     userId: 'user-1',
 *     integrationId: 'integration-1',
 *     name: 'zoho-crm-contact-sync',
 *     type: 'CRM_SYNC',
 * });
 * await processCommands.updateProcessState(process.id, 'FETCHING_TOTAL');
 * await processCommands.updateProcessMetrics(process.id, { processed: 100, success: 100 });
 */

const {
    createProcessRepository,
} = require('../../integrations/repositories/process-repository-factory');
const { CreateProcess } = require('../../integrations/use-cases/create-process');
const { GetProcess } = require('../../integrations/use-cases/get-process');
const {
    UpdateProcessState,
} = require('../../integrations/use-cases/update-process-state');
const {
    UpdateProcessMetrics,
} = require('../../integrations/use-cases/update-process-metrics');

const ERROR_CODE_MAP = {
    PROCESS_NOT_FOUND: 404,
    INVALID_PROCESS_DATA: 400,
};

function mapErrorToResponse(error) {
    const status = ERROR_CODE_MAP[error?.code] || 500;
    return {
        error: status,
        reason: error?.message,
        code: error?.code,
    };
}

/**
 * Create process tracking commands.
 *
 * @param {Object} [params]
 * @param {Object} [params.websocketService] - Optional WebSocket service
 *     forwarded to UpdateProcessMetrics for progress broadcasting.
 * @returns {Object} Process commands object
 */
function createProcessCommands({ websocketService } = {}) {
    const processRepository = createProcessRepository();

    const createProcessUseCase = new CreateProcess({ processRepository });
    const getProcessUseCase = new GetProcess({ processRepository });
    const updateProcessStateUseCase = new UpdateProcessState({
        processRepository,
    });
    const updateProcessMetricsUseCase = new UpdateProcessMetrics({
        processRepository,
        websocketService,
    });

    return {
        /**
         * Create a new process record.
         * @param {Object} processData - Process data (userId, integrationId, name, type, ...)
         * @returns {Promise<Object>} Created process record
         */
        async createProcess(processData) {
            try {
                return await createProcessUseCase.execute(processData);
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Retrieve a process by ID.
         * @param {string} processId - Process ID
         * @returns {Promise<Object|null>} Process record, or null if not found
         */
        async getProcess(processId) {
            try {
                return await getProcessUseCase.execute(processId);
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Transition a process to a new state, merging optional context updates.
         * @param {string} processId - Process ID
         * @param {string} newState - New state value
         * @param {Object} [contextUpdates={}] - Context fields to merge
         * @returns {Promise<Object>} Updated process record
         */
        async updateProcessState(processId, newState, contextUpdates = {}) {
            try {
                return await updateProcessStateUseCase.execute(
                    processId,
                    newState,
                    contextUpdates
                );
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Apply a metrics update (counters + bounded error history) to a process.
         * @param {string} processId - Process ID
         * @param {Object} metricsUpdate - Metrics to add (processed, success, errors, skipped, errorDetails)
         * @returns {Promise<Object>} Updated process record
         */
        async updateProcessMetrics(processId, metricsUpdate) {
            try {
                return await updateProcessMetricsUseCase.execute(
                    processId,
                    metricsUpdate
                );
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },
    };
}

module.exports = { createProcessCommands };
