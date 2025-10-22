/**
 * Check Migration Status Use Case
 * 
 * Domain logic for checking if database has pending migrations.
 * Does NOT trigger migrations, just reports status.
 * 
 * Architecture: Hexagonal/Clean
 * - Use Case (Domain Layer)
 * - Depends on prismaRunner (Infrastructure abstraction)
 * - Called by Router (Adapter Layer)
 */

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
    }
}

class CheckMigrationStatusUseCase {
    /**
     * @param {Object} dependencies
     * @param {Object} dependencies.prismaRunner - Prisma runner utility
     */
    constructor({ prismaRunner }) {
        if (!prismaRunner) {
            throw new Error('prismaRunner dependency is required');
        }
        this.prismaRunner = prismaRunner;
    }

    /**
     * Execute check migration status
     * 
     * @param {string} dbType - Database type (postgresql or mongodb)
     * @param {string} stage - Deployment stage (default: 'production')
     * @returns {Promise<Object>} Migration status
     */
    async execute(dbType, stage = 'production') {
        // Validate inputs
        if (!dbType) {
            throw new ValidationError('dbType is required');
        }

        if (!['postgresql', 'mongodb'].includes(dbType)) {
            throw new ValidationError('dbType must be postgresql or mongodb');
        }

        console.log(`Checking migration status for ${dbType} in ${stage}`);

        // Check database state using Prisma
        const state = await this.prismaRunner.checkDatabaseState(dbType);

        // Build response
        const response = {
            upToDate: state.upToDate,
            pendingMigrations: state.pendingMigrations || 0,
            dbType,
            stage,
        };

        // Add error if present
        if (state.error) {
            response.error = state.error;
            response.recommendation = 'Run POST /db-migrate to initialize database';
        }

        // Add recommendation if migrations pending
        if (!state.upToDate && state.pendingMigrations > 0) {
            response.recommendation = `Run POST /db-migrate to apply ${state.pendingMigrations} pending migration(s)`;
        }

        return response;
    }
}

module.exports = {
    CheckMigrationStatusUseCase,
    ValidationError,
};

