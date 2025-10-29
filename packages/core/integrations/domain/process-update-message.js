/**
 * Enumeration of valid process update operations
 * @enum {string}
 */
const ProcessUpdateOperation = {
    UPDATE_STATE: 'UPDATE_STATE',
    UPDATE_METRICS: 'UPDATE_METRICS',
    COMPLETE_PROCESS: 'COMPLETE_PROCESS',
    HANDLE_ERROR: 'HANDLE_ERROR',

    /**
     * List of all valid operation types
     */
    VALID_OPERATIONS: ['UPDATE_STATE', 'UPDATE_METRICS', 'COMPLETE_PROCESS', 'HANDLE_ERROR'],

    /**
     * Validates if an operation type is valid
     * @param {string} operation - Operation to validate
     * @returns {boolean} True if valid
     */
    isValid(operation) {
        return this.VALID_OPERATIONS.includes(operation);
    },
};

/**
 * Value Object representing a process update message
 * Immutable structure for queue messages
 *
 * Domain-Driven Design: Value Object
 * - Immutable
 * - Validates invariants in constructor
 * - Equality based on values
 */
class ProcessUpdateMessage {
    /**
     * Creates a new ProcessUpdateMessage
     * @param {Object} params - Message parameters
     * @param {string} params.processId - Process ID to update
     * @param {string} params.operation - Operation type (from ProcessUpdateOperation)
     * @param {Object} params.data - Operation-specific data
     * @param {Date} [params.timestamp] - Message timestamp (defaults to now)
     * @throws {Error} If validation fails
     */
    constructor({ processId, operation, data, timestamp } = {}) {
        // Validate processId
        if (processId === undefined || processId === null) {
            throw new Error('processId is required');
        }
        if (typeof processId !== 'string') {
            throw new Error('processId must be a string');
        }
        if (processId.trim() === '') {
            throw new Error('processId cannot be empty');
        }

        // Validate operation
        if (operation === undefined || operation === null) {
            throw new Error('operation is required');
        }
        if (!ProcessUpdateOperation.isValid(operation)) {
            throw new Error(
                `Invalid operation type: ${operation}. ` +
                `Valid operations: ${ProcessUpdateOperation.VALID_OPERATIONS.join(', ')}`
            );
        }

        // Validate data
        if (data === undefined || data === null) {
            throw new Error('data is required');
        }
        if (typeof data !== 'object' || Array.isArray(data)) {
            throw new Error('data must be an object');
        }

        // Validate timestamp if provided
        const messageTimestamp = timestamp || new Date();
        if (!(messageTimestamp instanceof Date)) {
            throw new Error('timestamp must be a Date object');
        }

        // Set immutable properties
        Object.defineProperties(this, {
            processId: {
                value: processId,
                writable: false,
                enumerable: true,
            },
            operation: {
                value: operation,
                writable: false,
                enumerable: true,
            },
            data: {
                value: Object.freeze({ ...data }), // Deep freeze would be better for nested objects
                writable: false,
                enumerable: true,
            },
            timestamp: {
                value: messageTimestamp,
                writable: false,
                enumerable: true,
            },
        });
    }

    /**
     * Serializes the message to JSON format
     * @returns {Object} JSON representation
     */
    toJSON() {
        return {
            processId: this.processId,
            operation: this.operation,
            data: this.data,
            timestamp: this.timestamp.toISOString(),
        };
    }

    /**
     * Deserializes a message from JSON format
     * @param {Object|string} json - JSON object or string
     * @returns {ProcessUpdateMessage} Deserialized message
     * @throws {Error} If JSON is invalid
     */
    static fromJSON(json) {
        const obj = typeof json === 'string' ? JSON.parse(json) : json;

        return new ProcessUpdateMessage({
            processId: obj.processId,
            operation: obj.operation,
            data: obj.data,
            timestamp: new Date(obj.timestamp),
        });
    }

    /**
     * Gets the MessageGroupId for FIFO queue
     * Ensures messages for the same process are processed in order
     * @returns {string} MessageGroupId
     */
    getMessageGroupId() {
        return `process-${this.processId}`;
    }

    /**
     * Gets a unique MessageDeduplicationId for FIFO queue
     * Prevents duplicate message processing
     * @returns {string} MessageDeduplicationId
     */
    getMessageDeduplicationId() {
        // Use processId + operation + timestamp to ensure uniqueness
        // This allows multiple operations on same process but prevents exact duplicates
        return `${this.processId}-${this.operation}-${this.timestamp.getTime()}`;
    }
}

module.exports = {
    ProcessUpdateMessage,
    ProcessUpdateOperation,
};
