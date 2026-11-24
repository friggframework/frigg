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
     * @param {Object} dependencies.migrationStatusRepository - Repository for migration status (S3)
     */
    constructor({ migrationStatusRepository }) {
        if (!migrationStatusRepository) {
            throw new Error('migrationStatusRepository dependency is required');
        }
        this.migrationStatusRepository = migrationStatusRepository;
    }

    /**
     * Execute get migration status
     *
     * @param {string} migrationId - Migration ID to retrieve
     * @param {string} [stage] - Deployment stage (defaults to env.STAGE)
     * @returns {Promise<Object>} Migration status from S3
     * @throws {NotFoundError} If migration not found
     * @throws {ValidationError} If migrationId is invalid
     */
    async execute(migrationId, stage = null) {
        // Validation
        this._validateParams(migrationId);

        const effectiveStage = stage || process.env.STAGE || 'production';

        // Get migration status from S3
        try {
            const migrationStatus = await this.migrationStatusRepository.get(migrationId, effectiveStage);
            return migrationStatus;
        } catch (error) {
            if (error.message.includes('not found')) {
                throw new NotFoundError(`Migration not found: ${migrationId}`);
            }
            throw error;
        }
    }

    /**
     * Validate parameters
     * @private
     */
    _validateParams(migrationId) {
        if (!migrationId) {
            throw new ValidationError('migrationId is required');
        }

        if (typeof migrationId !== 'string') {
            throw new ValidationError('migrationId must be a string');
        }
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

