/**
 * Database Migration Lambda Handler
 *
 * Lambda function that runs Prisma database migrations from within the VPC.
 */

import {
    RunDatabaseMigrationUseCase,
    MigrationError,
    ValidationError,
} from '../../database/use-cases/run-database-migration-use-case';
import {
    CheckDatabaseStateUseCase,
} from '../../database/use-cases/check-database-state-use-case';
import {
    MigrationStatusRepositoryS3,
} from '../../database/repositories/migration-status-repository-s3';

import * as prismaRunner from '../../database/utils/prisma-runner';

const bucketName = process.env.S3_BUCKET_NAME || process.env.MIGRATION_STATUS_BUCKET;
const migrationStatusRepository = new MigrationStatusRepositoryS3(bucketName as any);

function sanitizeError(errorMessage: string): string {
    if (!errorMessage) return 'Unknown error';
    return String(errorMessage)
        .replace(/postgresql:\/\/[^@\s]+@[^\s/]+/gi, 'postgresql://***:***@***')
        .replace(/mongodb(\+srv)?:\/\/[^@\s]+@[^\s/]+/gi, 'mongodb$1://***:***@***')
        .replace(/password[=:]\s*[^\s,;)]+/gi, 'password=***')
        .replace(/apikey[=:]\s*[^\s,;)]+/gi, 'apikey=***')
        .replace(/api[_-]?key[=:]\s*[^\s,;)]+/gi, 'api_key=***')
        .replace(/token[=:]\s*[^\s,;)]+/gi, 'token=***')
        .replace(/bearer\s+[^\s,;)]+/gi, 'bearer ***');
}

function sanitizeDatabaseUrl(url: string): string {
    if (!url) return '';
    return url.replace(/(:\/\/)([^:]+):([^@]+)@/, '$1***:***@');
}

interface SQSRecord {
    body: string;
}

interface MigrationWorkerEvent {
    Records?: SQSRecord[];
    migrationId?: string;
    stage?: string;
    dbType?: string;
    action?: string;
}

interface MigrationWorkerContext {
    requestId: string;
    functionName: string;
    getRemainingTimeInMillis: () => number;
}

function extractMigrationParams(event: MigrationWorkerEvent): {
    migrationId: string | null;
    dbType: string;
    stage: string;
} {
    let migrationId: string | null = null;
    let stage: string = process.env.STAGE || 'production';
    let dbType: string = process.env.DB_TYPE || 'postgresql';

    if (event.Records && event.Records.length > 0) {
        const message = JSON.parse(event.Records[0].body);
        migrationId = message.migrationId;
        stage = message.stage || stage;
        dbType = message.dbType || dbType;
        console.log('SQS event detected');
    } else {
        migrationId = event.migrationId || null;
        stage = event.stage || stage;
        dbType = event.dbType || dbType;
        console.log('Direct invocation detected');
    }

    return { migrationId, dbType, stage };
}



export const handler = async (
    event: MigrationWorkerEvent,
    context: MigrationWorkerContext
): Promise<{ statusCode: number; body: string }> => {
    console.log('========================================');
    console.log('Database Migration Lambda Started');
    console.log('========================================');

    const { migrationId, dbType, stage } = extractMigrationParams(event);
    const action = event.action || 'migrate';

    if (action === 'checkStatus') {
        try {
            const checkDbStateUseCase = new CheckDatabaseStateUseCase({ prismaRunner });
            const status = await checkDbStateUseCase.execute(dbType, stage);
            return { statusCode: 200, body: JSON.stringify(status) };
        } catch (error: any) {
            return { statusCode: 500, body: JSON.stringify({ success: false, error: sanitizeError(error.message) }) };
        }
    }

    const databaseUrl = process.env.DATABASE_URL;

    try {
        if (!databaseUrl) {
            return { statusCode: 500, body: JSON.stringify({ success: false, error: 'DATABASE_URL not set' }) };
        }

        if (migrationId) {
            await migrationStatusRepository.update({
                migrationId, stage, state: 'RUNNING', progress: 10, startedAt: new Date().toISOString(),
            } as any);
        }

        const runMigrationUseCase = new RunDatabaseMigrationUseCase({ prismaRunner });
        const result = await runMigrationUseCase.execute({ dbType, stage, verbose: true });

        if (migrationId) {
            await migrationStatusRepository.update({
                migrationId, stage, state: 'COMPLETED', progress: 100,
                completedAt: new Date().toISOString(), migrationCommand: result.command,
            } as any);
        }

        const responseBody: any = {
            success: true, message: result.message, dbType: result.dbType,
            stage: result.stage, migrationCommand: result.command, timestamp: new Date().toISOString(),
        };
        if (migrationId) responseBody.migrationId = migrationId;

        return { statusCode: 200, body: JSON.stringify(responseBody) };
    } catch (error: any) {
        console.error('Migration Failed:', error.name, error.message);

        let statusCode = 500;
        if (error instanceof ValidationError) statusCode = 400;

        const sanitizedError = sanitizeError(error.message);

        if (migrationId) {
            try {
                await migrationStatusRepository.update({
                    migrationId, stage, state: 'FAILED', progress: 0,
                    error: sanitizedError, failedAt: new Date().toISOString(),
                } as any);
            } catch (updateError: any) {
                console.error('Failed to update migration status:', updateError.message);
            }
        }

        const errorBody: any = {
            success: false, error: sanitizedError, errorType: error.name || 'Error',
            ...(stage === 'dev' || stage === 'local' || stage === 'test' ? { stack: error.stack } : {}),
        };
        if (migrationId) errorBody.migrationId = migrationId;

        return { statusCode, body: JSON.stringify(errorBody) };
    }
};