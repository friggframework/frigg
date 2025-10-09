/**
 * Database Migration Lambda Handler
 *
 * Lambda function that runs Prisma database migrations from within the VPC,
 * enabling CI/CD pipelines to migrate databases without requiring public access.
 *
 * This handler reuses the existing prisma-runner utilities from the Frigg CLI,
 * ensuring consistency with the `frigg db:setup` command.
 *
 * Environment Variables Required:
 * - DATABASE_URL: PostgreSQL connection string (automatically set from Secrets Manager)
 * - DB_TYPE: Database type ('postgresql' or 'mongodb')
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

// Inject prisma-runner as dependency
const prismaRunner = require('../../../devtools/frigg-cli/utils/prisma-runner');

/**
 * Sanitizes error messages to prevent credential leaks
 * @param {string} errorMessage - Error message that might contain credentials
 * @returns {string} Sanitized error message
 */
function sanitizeError(errorMessage) {
    if (!errorMessage) return 'Unknown error';

    return String(errorMessage)
        // Remove PostgreSQL connection strings
        .replace(/postgresql:\/\/[^@\s]+@[^\s/]+/gi, 'postgresql://***:***@***')
        // Remove MongoDB connection strings
        .replace(/mongodb(\+srv)?:\/\/[^@\s]+@[^\s/]+/gi, 'mongodb$1://***:***@***')
        // Remove password parameters
        .replace(/password[=:]\s*[^\s,;)]+/gi, 'password=***')
        // Remove API keys
        .replace(/apikey[=:]\s*[^\s,;)]+/gi, 'apikey=***')
        .replace(/api[_-]?key[=:]\s*[^\s,;)]+/gi, 'api_key=***')
        // Remove tokens
        .replace(/token[=:]\s*[^\s,;)]+/gi, 'token=***')
        .replace(/bearer\s+[^\s,;)]+/gi, 'bearer ***');
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
 * Lambda handler entry point
 * @param {Object} event - Lambda event (not used, migrations don't need input)
 * @param {Object} context - Lambda context (contains AWS request ID, timeout info)
 * @returns {Promise<Object>} Response with statusCode and body
 */
exports.handler = async (event, context) => {
    console.log('========================================');
    console.log('Database Migration Lambda Started');
    console.log('========================================');
    console.log('Event:', JSON.stringify(event, null, 2));
    console.log('Context:', JSON.stringify({
        requestId: context.requestId,
        functionName: context.functionName,
        remainingTimeInMillis: context.getRemainingTimeInMillis(),
    }, null, 2));

    // Get environment variables
    const databaseUrl = process.env.DATABASE_URL;
    const dbType = process.env.DB_TYPE || 'postgresql';
    const stage = process.env.STAGE || 'production';

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

        // Return success response (adapter layer - HTTP mapping)
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: result.message,
                dbType: result.dbType,
                stage: result.stage,
                migrationCommand: result.command,
                timestamp: new Date().toISOString(),
            }),
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

        return {
            statusCode,
            body: JSON.stringify({
                success: false,
                error: sanitizedError,
                errorType: error.name || 'Error',
                // Only include stack traces in development environments
                ...(stage === 'dev' || stage === 'local' || stage === 'test' ? { stack: error.stack } : {}),
            }),
        };
    }
};
