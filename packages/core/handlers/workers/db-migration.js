/**
 * Database Migration Lambda Handler
 *
 * Lambda function that runs Prisma database migrations from within the VPC,
 * enabling CI/CD pipelines to migrate databases without requiring public access.
 *
 * This handler uses the prisma-runner utilities from @friggframework/core,
 * ensuring consistency with the `frigg db:setup` command.
 *
 * Environment Variables Required:
 * - DATABASE_URL: Database connection string (automatically set from Secrets Manager)
 * - DB_TYPE: Database type ('postgresql', 'mongodb', or 'documentdb')
 * - STAGE: Deployment stage (determines migration command: 'dev' or 'deploy')
 *
 * Invocation:
 *   aws lambda invoke \
 *     --function-name my-app-production-dbMigrate \
 *     --region us-east-1 \
 *     response.json
 *
 * Success Response:
 *   {
 *     "statusCode": 200,
 *     "body": {
 *       "success": true,
 *       "message": "Database migration completed successfully",
 *       "dbType": "postgresql",
 *       "stage": "production",
 *       "migrationCommand": "deploy"
 *     }
 *   }
 *
 * Error Response:
 *   {
 *     "statusCode": 500,
 *     "body": {
 *       "success": false,
 *       "error": "Migration failed: ...",
 *       "stack": "Error: ..."
 *     }
 *   }
 */

const {
    RunDatabaseMigrationUseCase,
    MigrationError,
    ValidationError,
} = require('../../database/use-cases/run-database-migration-use-case');
const {
    CheckDatabaseStateUseCase,
} = require('../../database/use-cases/check-database-state-use-case');
// Inject prisma-runner as dependency
const prismaRunner = require('../../database/utils/prisma-runner');

// Migration status repository is loaded from the resolved provider.
const { resolveProvider } = require('../../providers/resolve-provider');

let _migrationStatusRepository = null;
function getMigrationStatusRepository() {
    if (!_migrationStatusRepository) {
        const provider = resolveProvider();
        const MigrationStatusRepository = provider.MigrationStatusRepositoryS3;
        if (!MigrationStatusRepository) {
            throw new Error(
                `Provider '${provider.name}' does not export a MigrationStatusRepository`
            );
        }
        const bucketName =
            process.env.S3_BUCKET_NAME || process.env.MIGRATION_STATUS_BUCKET;
        _migrationStatusRepository = new MigrationStatusRepository(bucketName);
    }
    return _migrationStatusRepository;
}

/**
 * Sanitizes error messages to prevent credential leaks
 * @param {string} errorMessage - Error message that might contain credentials
 * @returns {string} Sanitized error message
 */
function sanitizeError(errorMessage) {
    if (!errorMessage) return 'Unknown error';

    return (
        String(errorMessage)
            // Remove PostgreSQL connection strings
            .replace(
                /postgresql:\/\/[^@\s]+@[^\s/]+/gi,
                'postgresql://***:***@***'
            )
            // Remove MongoDB connection strings
            .replace(
                /mongodb(\+srv)?:\/\/[^@\s]+@[^\s/]+/gi,
                'mongodb$1://***:***@***'
            )
            // Remove password parameters
            .replace(/password[=:]\s*[^\s,;)]+/gi, 'password=***')
            // Remove API keys
            .replace(/apikey[=:]\s*[^\s,;)]+/gi, 'apikey=***')
            .replace(/api[_-]?key[=:]\s*[^\s,;)]+/gi, 'api_key=***')
            // Remove tokens
            .replace(/token[=:]\s*[^\s,;)]+/gi, 'token=***')
            .replace(/bearer\s+[^\s,;)]+/gi, 'bearer ***')
    );
}

/**
 * Sanitizes DATABASE_URL for safe logging
 * @param {string} url - Database URL
 * @returns {string} Sanitized URL
 */
function sanitizeDatabaseUrl(url) {
    if (!url) return '';

    // Replace credentials in connection string
    return url.replace(/(:\/\/)([^:]+):([^@]+)@/, '$1***:***@');
}

/**
 * Extract migration parameters from SQS event or direct invocation
 * @param {Object} event - Lambda event (SQS or direct)
 * @returns {Object} Extracted parameters { migrationId, dbType, stage }
 */
function extractMigrationParams(event) {
    let migrationId = null;
    let stage = null;
    let dbType = process.env.DB_TYPE || 'postgresql';

    // Check if this is an SQS event
    if (event.Records && event.Records.length > 0) {
        // SQS event - extract from message body
        const message = JSON.parse(event.Records[0].body);
        migrationId = message.migrationId;
        stage = message.stage || process.env.STAGE || 'production';
        dbType = message.dbType || dbType;

        console.log('SQS event detected');
        console.log(`  Migration ID: ${migrationId}`);
        console.log(`  DB Type: ${dbType}`);
        console.log(`  Stage: ${stage}`);
    } else {
        // Direct invocation - use event properties or environment variables
        migrationId = event.migrationId || null;
        stage = event.stage || process.env.STAGE || 'production';
        dbType = event.dbType || dbType;

        console.log('Direct invocation detected');
        if (migrationId) {
            console.log(`  Migration ID: ${migrationId}`);
        }
        console.log(`  DB Type: ${dbType}`);
        console.log(`  Stage: ${stage}`);
    }

    return { migrationId, dbType, stage };
}

/**
 * Lambda handler entry point
 * @param {Object} event - Lambda event (SQS message or direct invocation)
 * @param {Object} context - Lambda context (contains AWS request ID, timeout info)
 * @returns {Promise<Object>} Response with statusCode and body
 */
exports.handler = async (event, context) => {
    console.log('========================================');
    console.log('Database Migration Lambda Started');
    console.log('========================================');
    console.log('Event:', JSON.stringify(event, null, 2));
    console.log(
        'Context:',
        JSON.stringify(
            {
                requestId: context.requestId,
                functionName: context.functionName,
                remainingTimeInMillis: context.getRemainingTimeInMillis(),
            },
            null,
            2
        )
    );

    // Extract migration parameters from event
    const { migrationId, dbType, stage } = extractMigrationParams(event);

    // Check for action parameter (direct invocation for status checks)
    const action = event.action || 'migrate'; // Default to migration

    // Handle checkStatus action
    if (action === 'checkStatus') {
        console.log(`\n========================================`);
        console.log(`Action: checkStatus (dbType=${dbType}, stage=${stage})`);
        console.log(`========================================`);

        try {
            const checkDbStateUseCase = new CheckDatabaseStateUseCase({
                prismaRunner,
            });
            const status = await checkDbStateUseCase.execute(dbType, stage);

            console.log('✓ Database state check completed');
            console.log(`  Up to date: ${status.upToDate}`);
            console.log(`  Pending migrations: ${status.pendingMigrations}`);

            return {
                statusCode: 200,
                body: status,
            };
        } catch (error) {
            console.error('❌ Database state check failed:', error.message);
            return {
                statusCode: 500,
                body: {
                    success: false,
                    error: sanitizeError(error.message),
                    upToDate: false,
                },
            };
        }
    }

    // Otherwise, handle migration (existing code)
    console.log(`\n========================================`);
    console.log(`Action: migrate (migrationId=${migrationId || 'new'})`);
    console.log(`========================================`);

    // Get environment variables
    const databaseUrl = process.env.DATABASE_URL;

    try {
        // Validate DATABASE_URL is set
        if (!databaseUrl) {
            const error = 'DATABASE_URL environment variable is not set';
            console.error('❌ Validation failed:', error);
            return {
                statusCode: 500,
                body: JSON.stringify({
                    success: false,
                    error,
                }),
            };
        }

        console.log('✓ Environment validated');
        console.log(`  Database Type: ${dbType}`);
        console.log(`  Stage: ${stage}`);
        console.log(`  Database URL: ${sanitizeDatabaseUrl(databaseUrl)}`);

        // Update migration status to RUNNING (if migrationId provided)
        if (migrationId) {
            console.log(
                `\n✓ Updating migration status to RUNNING: ${migrationId}`
            );
            await getMigrationStatusRepository().update({
                migrationId,
                stage,
                state: 'RUNNING',
                progress: 10,
                startedAt: new Date().toISOString(),
            });
        }

        // Create use case with dependencies (Dependency Injection)
        const runDatabaseMigrationUseCase = new RunDatabaseMigrationUseCase({
            prismaRunner,
        });

        console.log('\n========================================');
        console.log('Executing Database Migration');
        console.log('========================================');

        // Execute use case (business logic layer)
        const result = await runDatabaseMigrationUseCase.execute({
            dbType,
            stage,
            verbose: true, // Enable verbose output for Lambda CloudWatch logs
        });

        console.log('✓ Database migration completed successfully');
        console.log('\n========================================');
        console.log('Migration Summary');
        console.log('========================================');
        console.log(`  Status: Success`);
        console.log(`  Database: ${result.dbType}`);
        console.log(`  Stage: ${result.stage}`);
        console.log(`  Command: ${result.command}`);
        console.log('========================================');

        // Update migration status to COMPLETED (if migrationId provided)
        if (migrationId) {
            console.log(
                `\n✓ Updating migration status to COMPLETED: ${migrationId}`
            );
            await getMigrationStatusRepository().update({
                migrationId,
                stage,
                state: 'COMPLETED',
                progress: 100,
                completedAt: new Date().toISOString(),
                migrationCommand: result.command,
            });
        }

        // Return success response (adapter layer - HTTP mapping)
        const responseBody = {
            success: true,
            message: result.message,
            dbType: result.dbType,
            stage: result.stage,
            migrationCommand: result.command,
            timestamp: new Date().toISOString(),
        };

        if (migrationId) {
            responseBody.migrationId = migrationId;
        }

        return {
            statusCode: 200,
            body: JSON.stringify(responseBody),
        };
    } catch (error) {
        console.error('\n========================================');
        console.error('Migration Failed');
        console.error('========================================');
        console.error('Error:', error.name, error.message);

        // Log full stack trace to CloudWatch (only visible to developers)
        if (error.stack) {
            console.error('Stack:', error.stack);
        }

        // Log context if available (from MigrationError)
        if (error.context) {
            console.error('Context:', JSON.stringify(error.context, null, 2));
        }

        // Map domain errors to HTTP status codes (adapter layer)
        let statusCode = 500;
        let errorMessage = error.message || 'Unknown error occurred';

        if (error instanceof ValidationError) {
            statusCode = 400; // Bad Request for validation errors
        } else if (error instanceof MigrationError) {
            statusCode = 500; // Internal Server Error for migration failures
        }

        // Sanitize error message before returning
        const sanitizedError = sanitizeError(errorMessage);

        // Update migration status to FAILED (if migrationId provided)
        if (migrationId) {
            try {
                console.log(
                    `\n✓ Updating migration status to FAILED: ${migrationId}`
                );
                await getMigrationStatusRepository().update({
                    migrationId,
                    stage,
                    state: 'FAILED',
                    progress: 0,
                    error: sanitizedError,
                    failedAt: new Date().toISOString(),
                });
            } catch (updateError) {
                console.error(
                    'Failed to update migration status:',
                    updateError.message
                );
                // Continue - don't let status update failure block error response
            }
        }

        const errorBody = {
            success: false,
            error: sanitizedError,
            errorType: error.name || 'Error',
            // Only include stack traces in development environments
            ...(stage === 'dev' || stage === 'local' || stage === 'test'
                ? { stack: error.stack }
                : {}),
        };

        if (migrationId) {
            errorBody.migrationId = migrationId;
        }

        return {
            statusCode,
            body: JSON.stringify(errorBody),
        };
    }
};
