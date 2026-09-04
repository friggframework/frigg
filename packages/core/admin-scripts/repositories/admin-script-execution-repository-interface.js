/**
 * Admin Process Repository Interface
 * Abstract base class defining the contract for admin process persistence adapters
 *
 * This follows the Port in Hexagonal Architecture:
 * - Domain layer depends on this abstraction
 * - Concrete adapters implement this interface
 * - Use cases receive repositories via dependency injection
 *
 * Admin processes track administrative operations including:
 * - Admin script executions
 * - Database migrations
 * - Scheduled maintenance tasks
 *
 * The AdminScriptExecution model uses a flexible JSON storage pattern:
 * - context: Input parameters, trigger info, audit data, script version
 * - results: Output data, logs, metrics, error details
 *
 * @abstract
 */
class AdminScriptExecutionRepositoryInterface {
    /**
     * Create a new admin process record
     *
     * @param {Object} params - Process creation parameters
     * @param {string} params.name - Name of the process (e.g., script name, migration name)
     * @param {string} params.type - Type of process (e.g., 'ADMIN_SCRIPT', 'DB_MIGRATION')
     * @param {Object} [params.context] - Context data (input, trigger, audit, script version)
     * @param {string} [params.context.scriptVersion] - Version of the script
     * @param {string} [params.context.trigger] - Trigger type ('MANUAL', 'SCHEDULED', 'QUEUE', 'WEBHOOK')
     * @param {string} [params.context.mode] - Execution mode ('sync' or 'async')
     * @param {Object} [params.context.input] - Input parameters
     * @param {Object} [params.context.audit] - Audit information
     * @param {string} [params.context.audit.apiKeyName] - Name of API key used
     * @param {string} [params.context.audit.apiKeyLast4] - Last 4 chars of API key
     * @param {string} [params.context.audit.ipAddress] - IP address of requester
     * @param {string|number} [params.parentExecutionId] - ID of the execution that queued this one, for the parent/child hierarchy
     * @returns {Promise<Object>} The created process record
     * @abstract
     */
    async createExecution({ name, type, context, parentExecutionId }) {
        throw new Error('Method createExecution must be implemented by subclass');
    }

    /**
     * Find a process by its ID
     *
     * @param {string|number} id - The process ID
     * @returns {Promise<Object|null>} The process record or null if not found
     * @abstract
     */
    async findExecutionById(id) {
        throw new Error(
            'Method findExecutionById must be implemented by subclass'
        );
    }

    /**
     * Find all processes with a specific name
     *
     * @param {string} name - The process name to filter by
     * @param {Object} [options] - Query options
     * @param {number} [options.limit] - Maximum number of results
     * @param {number} [options.offset] - Number of results to skip
     * @param {string} [options.sortBy] - Field to sort by
     * @param {string} [options.sortOrder] - Sort order ('asc' or 'desc')
     * @param {string} [options.state] - Optional state filter ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')
     * @param {string} [options.type] - Optional type filter ('ADMIN_SCRIPT', 'REPORT', 'DB_MIGRATION')
     * @param {Date} [options.from] - Optional lower bound (inclusive) on createdAt
     * @param {Date} [options.to] - Optional upper bound (inclusive) on createdAt
     * @returns {Promise<Array>} Array of process records
     * @abstract
     */
    async findExecutionsByName(name, options = {}) {
        throw new Error(
            'Method findExecutionsByName must be implemented by subclass'
        );
    }

    /**
     * Find all processes with a specific state
     *
     * @param {string} state - State to filter by ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')
     * @param {Object} [options] - Query options
     * @param {number} [options.limit] - Maximum number of results
     * @param {number} [options.offset] - Number of results to skip
     * @param {string} [options.sortBy] - Field to sort by
     * @param {string} [options.sortOrder] - Sort order ('asc' or 'desc')
     * @returns {Promise<Array>} Array of process records
     * @abstract
     */
    async findExecutionsByState(state, options = {}) {
        throw new Error(
            'Method findExecutionsByState must be implemented by subclass'
        );
    }

    /**
     * Update the state of a process
     *
     * @param {string|number} id - The process ID
     * @param {string} state - New state value ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')
     * @returns {Promise<Object>} Updated process record
     * @abstract
     */
    async updateExecutionState(id, state) {
        throw new Error(
            'Method updateExecutionState must be implemented by subclass'
        );
    }

    /**
     * Update the results of a process
     * Merges new results with existing results in the results JSON field
     *
     * @param {string|number} id - The process ID
     * @param {Object} results - Results data to merge
     * @param {Object} [results.output] - Output data from the process
     * @param {Object} [results.error] - Error information
     * @param {string} [results.error.name] - Error name/type
     * @param {string} [results.error.message] - Error message
     * @param {string} [results.error.stack] - Error stack trace
     * @param {Object} [results.metrics] - Performance metrics
     * @param {Date} [results.metrics.startTime] - Process start time
     * @param {Date} [results.metrics.endTime] - Process end time
     * @param {number} [results.metrics.durationMs] - Duration in milliseconds
     * @returns {Promise<Object>} Updated process record
     * @abstract
     */
    async updateExecutionResults(id, results) {
        throw new Error(
            'Method updateExecutionResults must be implemented by subclass'
        );
    }

    /**
     * Append a log entry to a process's log array in results
     *
     * @param {string|number} id - The process ID
     * @param {Object} logEntry - Log entry to append
     * @param {string} logEntry.level - Log level ('debug', 'info', 'warn', 'error')
     * @param {string} logEntry.message - Log message
     * @param {Object} [logEntry.data] - Additional log data
     * @param {string} logEntry.timestamp - ISO timestamp
     * @returns {Promise<Object>} Updated process record
     * @abstract
     */
    async appendExecutionLog(id, logEntry) {
        throw new Error(
            'Method appendExecutionLog must be implemented by subclass'
        );
    }

    /**
     * Delete all processes older than a specific date
     * Used for cleanup and retention policies
     *
     * @param {Date} date - Delete processes older than this date
     * @param {Object} [options] - Deletion options
     * @param {string} [options.type] - Optional type filter, so report vs script retention can diverge
     * @returns {Promise<Object>} Deletion result with count
     * @abstract
     */
    async deleteExecutionsOlderThan(date, options = {}) {
        throw new Error(
            'Method deleteExecutionsOlderThan must be implemented by subclass'
        );
    }
}

module.exports = { AdminScriptExecutionRepositoryInterface };
