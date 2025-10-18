/**
 * Get Migration Status Use Case
 *
 * Retrieves the status of a database migration by process ID.
 * Formats the Process record for migration-specific response.
 *
 * This use case follows the Frigg hexagonal architecture pattern where:
 * - Routers (adapters) call use cases
 * - Use cases contain business logic and formatting
 * - Use cases call repositories for data access
 */

class GetMigrationStatusUseCase {
    /**
     * @param {Object} dependencies
     * @param {Object} dependencies.processRepository - Repository for process data access
     */
    constructor({ processRepository }) {
        if (!processRepository) {
            throw new Error('processRepository dependency is required');
        }
        this.processRepository = processRepository;
    }

    /**
     * Execute get migration status
     *
     * @param {Object} params
     * @param {string} params.processId - Process ID to retrieve
     * @returns {Promise<Object>} Migration status with process details
     * @throws {NotFoundError} If process not found
     * @throws {Error} If process is not a migration process
     */
    async execute({ processId }) {
        // Validation
        if (!processId) {
            throw new ValidationError('processId is required');
        }

        if (typeof processId !== 'string') {
            throw new ValidationError('processId must be a string');
        }

        // Get process from repository
        const process = await this.processRepository.findById(processId);

        if (!process) {
            throw new NotFoundError(`Migration process not found: ${processId}`);
        }

        // Verify this is a migration process
        if (process.type !== 'DATABASE_MIGRATION') {
            throw new Error(
                `Process ${processId} is not a migration process (type: ${process.type})`
            );
        }

        // Format response
        return {
            processId: process.id,
            type: process.type,
            state: process.state,
            context: process.context || {},
            results: process.results || {},
            createdAt: process.createdAt,
            updatedAt: process.updatedAt,
        };
    }
}

/**
 * Custom error for validation failures
 */
class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
    }
}

/**
 * Custom error for not found resources
 */
class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NotFoundError';
        this.statusCode = 404;
    }
}

module.exports = {
    GetMigrationStatusUseCase,
    ValidationError,
    NotFoundError,
};

