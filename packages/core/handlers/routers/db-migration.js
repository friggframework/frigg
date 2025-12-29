/**
 * Database Migration Router
 *
 * HTTP API for triggering and monitoring database migrations.
 *
 * Endpoints:
 * - GET /db-migrate/status - Check if migrations are pending
 * - POST /db-migrate - Trigger async migration (queues job)
 * - GET /db-migrate/:processId - Check migration status
 *
 * Security:
 * - Requires ADMIN_API_KEY header for all requests
 *
 * Architecture:
 * - Router (Adapter Layer) → Use Cases (Domain) → Repositories (Infrastructure)
 * - Follows DDD/Hexagonal architecture
 */

const { Router } = require('express');
const catchAsyncError = require('express-async-handler');
const {
    MigrationStatusRepositoryS3,
} = require('../../database/repositories/migration-status-repository-s3');
const {
    TriggerDatabaseMigrationUseCase,
    ValidationError: TriggerValidationError,
} = require('../../database/use-cases/trigger-database-migration-use-case');
const {
    GetMigrationStatusUseCase,
    ValidationError: GetValidationError,
    NotFoundError,
} = require('../../database/use-cases/get-migration-status-use-case');
const { LambdaInvoker } = require('../../database/adapters/lambda-invoker');
const {
    GetDatabaseStateViaWorkerUseCase,
} = require('../../database/use-cases/get-database-state-via-worker-use-case');

const router = Router();

// Dependency injection
// Use S3 repository to avoid User table dependency (chicken-and-egg problem)
const bucketName =
    process.env.S3_BUCKET_NAME || process.env.MIGRATION_STATUS_BUCKET;
const migrationStatusRepository = new MigrationStatusRepositoryS3(bucketName);

const triggerMigrationUseCase = new TriggerDatabaseMigrationUseCase({
    migrationStatusRepository,
    // Note: QueuerUtil is used directly in the use case (static utility)
});
const getStatusUseCase = new GetMigrationStatusUseCase({
    migrationStatusRepository,
});

// Lambda invocation for database state check (keeps router lightweight)
const lambdaInvoker = new LambdaInvoker();
const workerFunctionName =
    process.env.WORKER_FUNCTION_NAME ||
    `${process.env.SERVICE || 'unknown'}-${
        process.env.STAGE || 'production'
    }-dbMigrationWorker`;

const getDatabaseStateUseCase = new GetDatabaseStateViaWorkerUseCase({
    lambdaInvoker,
    workerFunctionName,
});

/**
 * Admin API key validation middleware
 * Matches pattern from health.js:72-88
 */
const validateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-frigg-admin-api-key'];

    if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
        console.error('Unauthorized access attempt to db-migrate endpoint');
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized - x-frigg-admin-api-key header required',
        });
    }

    next();
};

// Apply API key validation to all routes
router.use(validateApiKey);

/**
 * POST /db-migrate
 *
 * Trigger database migration (async via SQS queue)
 *
 * Request body:
 * {
 *   userId: string (optional, defaults to 'admin'),
 *   dbType: 'postgresql' | 'mongodb' | 'documentdb',
 *   stage: string (e.g., 'production', 'dev')
 * }
 *
 * Response (202 Accepted):
 * {
 *   success: true,
 *   processId: string,
 *   state: 'INITIALIZING',
 *   statusUrl: string,
 *   message: string
 * }
 */
router.post(
    '/db-migrate',
    catchAsyncError(async (req, res) => {
        const dbType = req.body.dbType || process.env.DB_TYPE || 'postgresql';
        const { stage } = req.body;
        // TODO: Extract userId from JWT token when auth is implemented
        const userId = req.body.userId || 'admin';

        console.log(
            `Migration trigger request: dbType=${dbType}, stage=${
                stage || 'auto-detect'
            }, userId=${userId}`
        );

        try {
            const result = await triggerMigrationUseCase.execute({
                userId,
                dbType,
                stage,
            });

            // 202 Accepted - request accepted but not completed
            res.status(202).json(result);
        } catch (error) {
            // Handle validation errors (400 Bad Request)
            if (error instanceof TriggerValidationError) {
                return res.status(400).json({
                    success: false,
                    error: error.message,
                });
            }

            // Re-throw other errors for global error handler
            throw error;
        }
    })
);

/**
 * GET /db-migrate/status
 *
 * Check if database has pending migrations
 *
 * Query params:
 * - stage: string (optional, defaults to STAGE env var or 'production')
 *
 * Response (200 OK):
 * {
 *   upToDate: boolean,
 *   pendingMigrations: number,
 *   dbType: 'postgresql',
 *   stage: string,
 *   recommendation?: string (if migrations pending),
 *   error?: string (if database check failed)
 * }
 */
router.get(
    '/db-migrate/status',
    catchAsyncError(async (req, res) => {
        const stage = req.query.stage || process.env.STAGE || 'production';

        console.log(
            `Checking database state: stage=${stage}, worker=${workerFunctionName}`
        );

        try {
            // Invoke worker Lambda to check database state
            const status = await getDatabaseStateUseCase.execute(stage);

            res.status(200).json(status);
        } catch (error) {
            // Log full error for debugging
            console.error('Database state check failed:', error);

            // Return sanitized error to client
            return res.status(500).json({
                success: false,
                error: 'Failed to check database state',
                details: error.message,
            });
        }
    })
);

/**
 * GET /db-migrate/:migrationId
 *
 * Get migration status by migration ID
 *
 * Response (200 OK):
 * {
 *   processId: string,
 *   type: 'DATABASE_MIGRATION',
 *   state: 'INITIALIZING' | 'RUNNING' | 'COMPLETED' | 'FAILED',
 *   context: {
 *     dbType: string,
 *     stage: string,
 *     migrationCommand: string (if started)
 *   },
 *   results: {
 *     success: boolean (if completed),
 *     duration: string (if completed),
 *     error: string (if failed)
 *   },
 *   createdAt: string,
 *   updatedAt: string
 * }
 */
router.get(
    '/db-migrate/:migrationId',
    catchAsyncError(async (req, res) => {
        const { migrationId } = req.params;
        const stage = req.query.stage || process.env.STAGE || 'production';

        console.log(
            `Migration status request: migrationId=${migrationId}, stage=${stage}`
        );

        try {
            const status = await getStatusUseCase.execute(migrationId, stage);

            res.status(200).json(status);
        } catch (error) {
            // Handle not found errors (404 Not Found)
            if (error instanceof NotFoundError) {
                return res.status(404).json({
                    success: false,
                    error: error.message,
                });
            }

            // Handle validation errors (400 Bad Request)
            if (error instanceof GetValidationError) {
                return res.status(400).json({
                    success: false,
                    error: error.message,
                });
            }

            // Re-throw other errors for global error handler
            throw error;
        }
    })
);

/**
 * POST /db-migrate/resolve
 *
 * Resolve a failed migration by marking it as applied or rolled back
 *
 * Request body:
 * {
 *   migrationName: string (e.g., '20251112195422_update_user_unique_constraints'),
 *   action: 'applied' | 'rolled-back',
 *   stage: string (optional, defaults to STAGE env var or 'production')
 * }
 *
 * Response (200 OK):
 * {
 *   success: true,
 *   message: string,
 *   migrationName: string,
 *   action: string
 * }
 */
router.post(
    '/db-migrate/resolve',
    catchAsyncError(async (req, res) => {
        const { migrationName, action = 'applied' } = req.body;

        console.log(
            `Migration resolve request: migration=${migrationName}, action=${action}`
        );

        // Validation
        if (!migrationName) {
            return res.status(400).json({
                success: false,
                error: 'migrationName is required',
            });
        }

        if (!['applied', 'rolled-back'].includes(action)) {
            return res.status(400).json({
                success: false,
                error: 'action must be either "applied" or "rolled-back"',
            });
        }

        try {
            // Import prismaRunner here to avoid circular dependencies
            const prismaRunner = require('../../database/utils/prisma-runner');

            const result = await prismaRunner.runPrismaMigrateResolve(
                migrationName,
                action,
                true
            );

            if (!result.success) {
                return res.status(500).json({
                    success: false,
                    error: `Failed to resolve migration: ${result.error}`,
                });
            }

            res.status(200).json({
                success: true,
                message: `Migration ${migrationName} marked as ${action}`,
                migrationName,
                action,
            });
        } catch (error) {
            console.error('Migration resolve failed:', error);
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    })
);

// Minimal Lambda handler (avoids app-handler-helpers which loads core/index.js → user/**)
const serverlessHttp = require('serverless-http');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(router);
app.use((err, _req, res, _next) => {
    console.error('Migration Router Error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
});

const handler = serverlessHttp(app);

module.exports = { handler, router };
