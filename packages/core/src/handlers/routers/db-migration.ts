/**
 * Database Migration Router
 *
 * HTTP API for triggering and monitoring database migrations.
 */
import express, { Router, type Request, type Response } from 'express';
import catchAsyncError from 'express-async-handler';
import serverlessHttp from 'serverless-http';
import cors from 'cors';

/* eslint-disable @typescript-eslint/no-var-requires */
const { MigrationStatusRepositoryS3 } = require('../../database/repositories/migration-status-repository-s3');
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
const { GetDatabaseStateViaWorkerUseCase } = require('../../database/use-cases/get-database-state-via-worker-use-case');
/* eslint-enable @typescript-eslint/no-var-requires */

const router = Router();

// Dependency injection
const bucketName = process.env.S3_BUCKET_NAME || process.env.MIGRATION_STATUS_BUCKET;
const migrationStatusRepository = new MigrationStatusRepositoryS3(bucketName);

const triggerMigrationUseCase = new TriggerDatabaseMigrationUseCase({ migrationStatusRepository });
const getStatusUseCase = new GetMigrationStatusUseCase({ migrationStatusRepository });

const lambdaInvoker = new LambdaInvoker();
const workerFunctionName = process.env.WORKER_FUNCTION_NAME ||
    `${process.env.SERVICE || 'unknown'}-${process.env.STAGE || 'production'}-dbMigrationWorker`;

const getDatabaseStateUseCase = new GetDatabaseStateViaWorkerUseCase({
    lambdaInvoker,
    workerFunctionName,
});

const validateApiKey = (req: Request, res: Response, next: () => void): void => {
    const apiKey = req.headers['x-frigg-admin-api-key'] as string | undefined;
    if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
        console.error('Unauthorized access attempt to db-migrate endpoint');
        res.status(401).json({
            status: 'error',
            message: 'Unauthorized - x-frigg-admin-api-key header required',
        });
        return;
    }
    next();
};

router.use(validateApiKey);



router.post(
    '/db-migrate',
    catchAsyncError(async (req: Request, res: Response) => {
        const dbType = req.body.dbType || process.env.DB_TYPE || 'postgresql';
        const { stage } = req.body;
        const userId = req.body.userId || 'admin';

        console.log(`Migration trigger request: dbType=${dbType}, stage=${stage || 'auto-detect'}, userId=${userId}`);

        try {
            const result = await triggerMigrationUseCase.execute({ userId, dbType, stage });
            res.status(202).json(result);
        } catch (error: any) {
            if (error instanceof TriggerValidationError) {
                res.status(400).json({ success: false, error: error.message });
                return;
            }
            throw error;
        }
    })
);

router.get(
    '/db-migrate/status',
    catchAsyncError(async (req: Request, res: Response) => {
        const stage = (req.query.stage as string) || process.env.STAGE || 'production';
        console.log(`Checking database state: stage=${stage}, worker=${workerFunctionName}`);

        try {
            const status = await getDatabaseStateUseCase.execute(stage);
            res.status(200).json(status);
        } catch (error: any) {
            console.error('Database state check failed:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to check database state',
                details: error.message,
            });
        }
    })
);

router.get(
    '/db-migrate/:migrationId',
    catchAsyncError(async (req: Request, res: Response) => {
        const { migrationId } = req.params;
        const stage = (req.query.stage as string) || process.env.STAGE || 'production';

        try {
            const status = await getStatusUseCase.execute(migrationId, stage);
            res.status(200).json(status);
        } catch (error: any) {
            if (error instanceof NotFoundError) {
                res.status(404).json({ success: false, error: error.message });
                return;
            }
            if (error instanceof GetValidationError) {
                res.status(400).json({ success: false, error: error.message });
                return;
            }
            throw error;
        }
    })
);

router.post(
    '/db-migrate/resolve',
    catchAsyncError(async (req: Request, res: Response) => {
        const { migrationName, action = 'applied' } = req.body;
        console.log(`Migration resolve request: migration=${migrationName}, action=${action}`);

        if (!migrationName) {
            res.status(400).json({ success: false, error: 'migrationName is required' });
            return;
        }
        if (!['applied', 'rolled-back'].includes(action)) {
            res.status(400).json({ success: false, error: 'action must be either "applied" or "rolled-back"' });
            return;
        }

        try {
            const prismaRunner = require('../../database/utils/prisma-runner');
            const result = await prismaRunner.runPrismaMigrateResolve(migrationName, action, true);
            if (!result.success) {
                res.status(500).json({ success: false, error: `Failed to resolve migration: ${result.error}` });
                return;
            }
            res.status(200).json({
                success: true,
                message: `Migration ${migrationName} marked as ${action}`,
                migrationName,
                action,
            });
        } catch (error: any) {
            console.error('Migration resolve failed:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    })
);

// Minimal Lambda handler
const app = express();
app.use(cors());
app.use(express.json());
app.use(router);
app.use((err: any, _req: Request, res: Response, _next: any) => {
    console.error('Migration Router Error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
});

const handler = serverlessHttp(app);

export { handler, router };