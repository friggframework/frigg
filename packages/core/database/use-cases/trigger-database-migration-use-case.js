/**
 * Trigger Database Migration Use Case
 *
 * Business logic for triggering async database migrations via SQS queue.
 * Creates a Process record for tracking and sends migration job to queue.
 *
 * This use case follows the Frigg hexagonal architecture pattern where:
 * - Routers (adapters) call use cases
 * - Use cases contain business logic and orchestration
 * - Use cases call repositories for data access
 * - Use cases delegate infrastructure concerns (SQS) to utilities
 *
 * Flow:
 * 1. Validate migration parameters
 * 2. Create Process record (state: INITIALIZING)
 * 3. Send message to SQS queue (fire-and-forget)
 * 4. Return process info immediately (async pattern)
 */

const { QueuerUtil } = require('../../queues/queuer-util');

class TriggerDatabaseMigrationUseCase {
    /**
     * @param {Object} dependencies
     * @param {Object} dependencies.processRepository - Repository for process data access
     * @param {Object} [dependencies.queuerUtil] - SQS utility (injectable for testing)
     */
    constructor({ processRepository, queuerUtil = QueuerUtil }) {
        if (!processRepository) {
            throw new Error('processRepository dependency is required');
        }
        this.processRepository = processRepository;
        this.queuerUtil = queuerUtil;
    }

    /**
     * Execute database migration trigger
     *
     * @param {Object} params
     * @param {string} params.userId - User ID triggering the migration
     * @param {string} params.dbType - Database type ('postgresql' or 'mongodb')
     * @param {string} params.stage - Deployment stage (determines migration command)
     * @returns {Promise<Object>} Process info { success, processId, state, statusUrl, message }
     * @throws {ValidationError} If parameters are invalid
     * @throws {Error} If process creation or queue send fails
     */
    async execute({ userId, dbType, stage }) {
        // Validation
        this._validateParams({ userId, dbType, stage });

        // Create Process record for tracking
        const migrationProcess = await this.processRepository.create({
            userId,
            integrationId: null, // System operation, not tied to integration
            name: 'database-migration',
            type: 'DATABASE_MIGRATION',
            state: 'INITIALIZING',
            context: {
                dbType,
                stage,
                triggeredAt: new Date().toISOString(),
            },
            results: {},
        });

        console.log(`Created migration process: ${migrationProcess.id}`);

        // Get queue URL from environment
        const queueUrl = process.env.DB_MIGRATION_QUEUE_URL;
        if (!queueUrl) {
            throw new Error(
                'DB_MIGRATION_QUEUE_URL environment variable is not set. ' +
                'Cannot send migration to queue.'
            );
        }

        // Send message to SQS queue (async fire-and-forget)
        try {
            await this.queuerUtil.send(
                {
                    processId: migrationProcess.id,
                    dbType,
                    stage,
                },
                queueUrl
            );

            console.log(`Sent migration job to queue for process: ${migrationProcess.id}`);
        } catch (error) {
            console.error(`Failed to send migration to queue:`, error);

            // Update process state to FAILED
            await this.processRepository.updateState(
                migrationProcess.id,
                'FAILED',
                {
                    error: 'Failed to queue migration job',
                    errorDetails: error.message,
                }
            );

            throw new Error(
                `Failed to queue migration: ${error.message}`
            );
        }

        // Return process info immediately (don't wait for migration completion)
        return {
            success: true,
            processId: migrationProcess.id,
            state: migrationProcess.state,
            statusUrl: `/db-migrate/${migrationProcess.id}`,
            message: 'Database migration queued successfully',
        };
    }

    /**
     * Validate execution parameters
     * @private
     */
    _validateParams({ userId, dbType, stage }) {
        if (!userId) {
            throw new ValidationError('userId is required');
        }

        if (typeof userId !== 'string') {
            throw new ValidationError('userId must be a string');
        }

        if (!dbType) {
            throw new ValidationError('dbType is required');
        }

        if (typeof dbType !== 'string') {
            throw new ValidationError('dbType must be a string');
        }

        const validDbTypes = ['postgresql', 'mongodb'];
        if (!validDbTypes.includes(dbType)) {
            throw new ValidationError(
                `Invalid dbType: "${dbType}". Must be one of: ${validDbTypes.join(', ')}`
            );
        }

        if (!stage) {
            throw new ValidationError('stage is required');
        }

        if (typeof stage !== 'string') {
            throw new ValidationError('stage must be a string');
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

module.exports = {
    TriggerDatabaseMigrationUseCase,
    ValidationError,
};

