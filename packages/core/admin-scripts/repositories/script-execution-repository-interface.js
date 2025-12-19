/**
 * Script Execution Repository Interface
 * Abstract base class defining the contract for script execution persistence adapters
 *
 * This follows the Port in Hexagonal Architecture:
 * - Domain layer depends on this abstraction
 * - Concrete adapters implement this interface
 * - Use cases receive repositories via dependency injection
 *
 * Script executions track the lifecycle of admin script runs, including:
 * - Input parameters and output results
 * - Execution status and error details
 * - Performance metrics
 * - Audit trail (who triggered, when, from where)
 * - Real-time logs
 *
 * @abstract
 */
class ScriptExecutionRepositoryInterface {
    /**
     * Create a new script execution record
     *
     * @param {Object} params - Execution creation parameters
     * @param {string} params.scriptName - Name of the script being executed
     * @param {string} [params.scriptVersion] - Version of the script
     * @param {string} params.trigger - Trigger type ('MANUAL', 'SCHEDULED', 'QUEUE', 'WEBHOOK')
     * @param {string} [params.mode] - Execution mode ('sync' or 'async', default 'async')
     * @param {Object} [params.input] - Input parameters for the script
     * @param {Object} [params.audit] - Audit information
     * @param {string} [params.audit.apiKeyName] - Name of API key used
     * @param {string} [params.audit.apiKeyLast4] - Last 4 chars of API key
     * @param {string} [params.audit.ipAddress] - IP address of requester
     * @returns {Promise<Object>} The created execution record
     * @abstract
     */
    async createExecution({
        scriptName,
        scriptVersion,
        trigger,
        mode,
        input,
        audit,
    }) {
        throw new Error(
            'Method createExecution must be implemented by subclass'
        );
    }

    /**
     * Find an execution by its ID
     *
     * @param {string|number} id - The execution ID
     * @returns {Promise<Object|null>} The execution record or null if not found
     * @abstract
     */
    async findExecutionById(id) {
        throw new Error(
            'Method findExecutionById must be implemented by subclass'
        );
    }

    /**
     * Find all executions for a specific script
     *
     * @param {string} scriptName - The script name to filter by
     * @param {Object} [options] - Query options
     * @param {number} [options.limit] - Maximum number of results
     * @param {number} [options.offset] - Number of results to skip
     * @param {string} [options.sortBy] - Field to sort by
     * @param {string} [options.sortOrder] - Sort order ('asc' or 'desc')
     * @returns {Promise<Array>} Array of execution records
     * @abstract
     */
    async findExecutionsByScriptName(scriptName, options = {}) {
        throw new Error(
            'Method findExecutionsByScriptName must be implemented by subclass'
        );
    }

    /**
     * Find all executions with a specific status
     *
     * @param {string} status - Status to filter by ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'TIMEOUT', 'CANCELLED')
     * @param {Object} [options] - Query options
     * @param {number} [options.limit] - Maximum number of results
     * @param {number} [options.offset] - Number of results to skip
     * @param {string} [options.sortBy] - Field to sort by
     * @param {string} [options.sortOrder] - Sort order ('asc' or 'desc')
     * @returns {Promise<Array>} Array of execution records
     * @abstract
     */
    async findExecutionsByStatus(status, options = {}) {
        throw new Error(
            'Method findExecutionsByStatus must be implemented by subclass'
        );
    }

    /**
     * Update the status of an execution
     *
     * @param {string|number} id - The execution ID
     * @param {string} status - New status value
     * @returns {Promise<Object>} Updated execution record
     * @abstract
     */
    async updateExecutionStatus(id, status) {
        throw new Error(
            'Method updateExecutionStatus must be implemented by subclass'
        );
    }

    /**
     * Update the output result of an execution
     *
     * @param {string|number} id - The execution ID
     * @param {Object} output - Output data from the script
     * @returns {Promise<Object>} Updated execution record
     * @abstract
     */
    async updateExecutionOutput(id, output) {
        throw new Error(
            'Method updateExecutionOutput must be implemented by subclass'
        );
    }

    /**
     * Update the error details of a failed execution
     *
     * @param {string|number} id - The execution ID
     * @param {Object} error - Error information
     * @param {string} error.name - Error name/type
     * @param {string} error.message - Error message
     * @param {string} [error.stack] - Error stack trace
     * @returns {Promise<Object>} Updated execution record
     * @abstract
     */
    async updateExecutionError(id, error) {
        throw new Error(
            'Method updateExecutionError must be implemented by subclass'
        );
    }

    /**
     * Update the performance metrics of an execution
     *
     * @param {string|number} id - The execution ID
     * @param {Object} metrics - Performance metrics
     * @param {Date} [metrics.startTime] - Execution start time
     * @param {Date} [metrics.endTime] - Execution end time
     * @param {number} [metrics.durationMs] - Duration in milliseconds
     * @returns {Promise<Object>} Updated execution record
     * @abstract
     */
    async updateExecutionMetrics(id, metrics) {
        throw new Error(
            'Method updateExecutionMetrics must be implemented by subclass'
        );
    }

    /**
     * Append a log entry to an execution's log array
     *
     * @param {string|number} id - The execution ID
     * @param {Object} logEntry - Log entry to append
     * @param {string} logEntry.level - Log level ('debug', 'info', 'warn', 'error')
     * @param {string} logEntry.message - Log message
     * @param {Object} [logEntry.data] - Additional log data
     * @param {string} logEntry.timestamp - ISO timestamp
     * @returns {Promise<Object>} Updated execution record
     * @abstract
     */
    async appendExecutionLog(id, logEntry) {
        throw new Error(
            'Method appendExecutionLog must be implemented by subclass'
        );
    }

    /**
     * Delete all executions older than a specific date
     * Used for cleanup and retention policies
     *
     * @param {Date} date - Delete executions older than this date
     * @returns {Promise<Object>} Deletion result with count
     * @abstract
     */
    async deleteExecutionsOlderThan(date) {
        throw new Error(
            'Method deleteExecutionsOlderThan must be implemented by subclass'
        );
    }
}

module.exports = { ScriptExecutionRepositoryInterface };
