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
     * @param {Object} dependencies.migrationStatusRepository - Repository for migration status (S3)
     * @param {Object} [dependencies.queuerUtil] - SQS utility (injectable for testing)
     */
    constructor({ migrationStatusRepository, queuerUtil = QueuerUtil }) {
        if (!migrationStatusRepository) {
            throw new Error('migrationStatusRepository dependency is required');
        }
        this.migrationStatusRepository = migrationStatusRepository;
        this.queuerUtil = queuerUtil;
    }

    /**
     * Execute database migration trigger
     *
     * @param {Object} params
     * @param {string} params.userId - User ID triggering the migration
     * @param {string} params.dbType - Database type ('postgresql', 'mongodb', or 'documentdb')
     * @param {string} params.stage - Deployment stage (determines migration command)
     * @returns {Promise<Object>} Process info { success, processId, state, statusUrl, message }
     * @throws {ValidationError} If parameters are invalid
     * @throws {Error} If process creation or queue send fails
     */
    async execute({ userId, dbType, stage }) {
        // Validation
        this._validateParams({ userId, dbType, stage });

        // Create migration status in S3 (no User table dependency)
        const migrationStatus = await this.migrationStatusRepository.create({
            stage: stage || process.env.STAGE || 'production',
            triggeredBy: userId || 'system',
            triggeredAt: new Date().toISOString(),
        });

        console.log(`Created migration status: ${migrationStatus.migrationId}`);

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
                    migrationId: migrationStatus.migrationId,
                    dbType,
                    stage,
                },
                queueUrl
            );

            console.log(`Sent migration job to queue: ${migrationStatus.migrationId}`);
        } catch (error) {
            console.error(`Failed to send migration to queue:`, error);

            // Update migration status to FAILED
            await this.migrationStatusRepository.update({
                migrationId: migrationStatus.migrationId,
                stage: migrationStatus.stage,
                state: 'FAILED',
                error: `Failed to queue migration: ${error.message}`,
            });

            throw new Error(
                `Failed to queue migration: ${error.message}`
            );
        }

        // Return migration info immediately (don't wait for migration completion)
        return {
            success: true,
            migrationId: migrationStatus.migrationId,
            state: migrationStatus.state,
            statusUrl: `/admin/db-migrate/${migrationStatus.migrationId}`,
            s3Key: `migrations/${migrationStatus.stage}/${migrationStatus.migrationId}.json`,
            message: 'Database migration queued successfully',
        };
    }

    /**
     * Validate execution parameters
     * @private
     */
    _validateParams({ userId, dbType, stage }) {
        // userId is optional for system migrations
        if (userId && typeof userId !== 'string') {
            throw new ValidationError('userId must be a string');
        }

        if (!dbType) {
            throw new ValidationError('dbType is required');
        }

        if (typeof dbType !== 'string') {
            throw new ValidationError('dbType must be a string');
        }

        const validDbTypes = ['postgresql', 'mongodb', 'documentdb'];
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

