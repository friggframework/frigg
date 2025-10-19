/**
 * Database Migration Router
 *
 * HTTP API for triggering and monitoring database migrations.
 *
 * Endpoints:
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
const { ProcessRepositoryPostgres } = require('../../integrations/repositories/process-repository-postgres');
const {
    TriggerDatabaseMigrationUseCase,
    ValidationError: TriggerValidationError,
} = require('../../database/use-cases/trigger-database-migration-use-case');
const {
    GetMigrationStatusUseCase,
    ValidationError: GetValidationError,
    NotFoundError,
} = require('../../database/use-cases/get-migration-status-use-case');

const router = Router();

// Dependency injection
// Note: Migrations are PostgreSQL-only, so we directly use ProcessRepositoryPostgres
// This avoids loading app definition (which requires integration classes)
const processRepository = new ProcessRepositoryPostgres();
const triggerMigrationUseCase = new TriggerDatabaseMigrationUseCase({
    processRepository,
    // Note: QueuerUtil is used directly in the use case (static utility)
});
const getStatusUseCase = new GetMigrationStatusUseCase({ processRepository });

/**
 * Admin API key validation middleware
 * Matches pattern from health.js:72-88
 */
const validateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
        console.error('Unauthorized access attempt to db-migrate endpoint');
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized',
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
 *   dbType: 'postgresql' | 'mongodb',
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
        // Migration infrastructure is PostgreSQL-only, so hardcode dbType
        const dbType = 'postgresql';
        const { stage } = req.body;
        // TODO: Extract userId from JWT token when auth is implemented
        const userId = req.body.userId || 'admin';

        console.log(`Migration trigger request: dbType=${dbType}, stage=${stage || 'auto-detect'}, userId=${userId}`);

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
 * GET /db-migrate/:processId
 *
 * Get migration status by process ID
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
    '/db-migrate/:processId',
    catchAsyncError(async (req, res) => {
        const { processId } = req.params;

        console.log(`Migration status request: processId=${processId}`);

        try {
            const status = await getStatusUseCase.execute({ processId });

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

// Minimal Lambda handler (avoids app-handler-helpers which loads core/index.js → user/**)
const serverlessHttp = require('serverless-http');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(router);
app.use((err, req, res, next) => {
    console.error('Migration Router Error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
});

const handler = serverlessHttp(app);

module.exports = { handler, router };

