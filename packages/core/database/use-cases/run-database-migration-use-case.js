/**
 * Run Database Migration Use Case
 *
 * Business logic for running Prisma database migrations.
 * Orchestrates Prisma client generation and migration execution.
 *
 * This use case follows the Frigg hexagonal architecture pattern where:
 * - Handlers (adapters) call use cases
 * - Use cases contain business logic and orchestration
 * - Use cases call repositories/utilities for data access
 */

class RunDatabaseMigrationUseCase {
    /**
     * @param {Object} dependencies
     * @param {Object} dependencies.prismaRunner - Prisma runner utilities
     */
    constructor({ prismaRunner }) {
        if (!prismaRunner) {
            throw new Error('prismaRunner dependency is required');
        }
        this.prismaRunner = prismaRunner;
    }

    /**
     * Execute database migration
     *
     * @param {Object} params
     * @param {string} params.dbType - Database type ('postgresql' or 'mongodb')
     * @param {string} params.stage - Deployment stage (determines migration command)
     * @param {boolean} [params.verbose=false] - Enable verbose output
     * @returns {Promise<Object>} Migration result { success, dbType, stage, command, message }
     * @throws {MigrationError} If migration fails
     * @throws {ValidationError} If parameters are invalid
     */
    async execute({ dbType, stage, verbose = false }) {
        // Validation
        this._validateParams({ dbType, stage });

        // Step 1: Generate Prisma client
        const generateResult = await this.prismaRunner.runPrismaGenerate(dbType, verbose);

        if (!generateResult.success) {
            throw new MigrationError(
                `Failed to generate Prisma client: ${generateResult.error || 'Unknown error'}`,
                { dbType, stage, step: 'generate', output: generateResult.output }
            );
        }

        // Step 2: Run migrations based on database type
        let migrationResult;
        let migrationCommand;

        if (dbType === 'postgresql') {
            migrationCommand = this.prismaRunner.getMigrationCommand(stage);
            migrationResult = await this.prismaRunner.runPrismaMigrate(migrationCommand, verbose);

            if (!migrationResult.success) {
                throw new MigrationError(
                    `PostgreSQL migration failed: ${migrationResult.error || 'Unknown error'}`,
                    { dbType, stage, command: migrationCommand, step: 'migrate', output: migrationResult.output }
                );
            }
        } else if (dbType === 'mongodb') {
            migrationCommand = 'db push';
            // Use non-interactive mode for automated/Lambda environments
            migrationResult = await this.prismaRunner.runPrismaDbPush(verbose, true);

            if (!migrationResult.success) {
                throw new MigrationError(
                    `MongoDB push failed: ${migrationResult.error || 'Unknown error'}`,
                    { dbType, stage, command: migrationCommand, step: 'push', output: migrationResult.output }
                );
            }
        } else {
            throw new ValidationError(`Unsupported database type: ${dbType}. Must be 'postgresql' or 'mongodb'.`);
        }

        // Return success result
        return {
            success: true,
            dbType,
            stage,
            command: migrationCommand,
            message: 'Database migration completed successfully',
        };
    }

    /**
     * Validate execution parameters
     * @private
     */
    _validateParams({ dbType, stage }) {
        if (!dbType) {
            throw new ValidationError('dbType is required');
        }

        if (typeof dbType !== 'string') {
            throw new ValidationError('dbType must be a string');
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
 * Custom error for migration failures
 */
class MigrationError extends Error {
    constructor(message, context = {}) {
        super(message);
        this.name = 'MigrationError';
        this.context = context;
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
    RunDatabaseMigrationUseCase,
    MigrationError,
    ValidationError,
};
