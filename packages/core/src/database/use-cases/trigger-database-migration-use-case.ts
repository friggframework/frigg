export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

interface MigrationStatusRepository {
    create(data: Record<string, unknown>): Promise<{ migrationId: string; state: string; stage: string }>;
    update(data: Record<string, unknown>): Promise<unknown>;
}

interface QueuerUtilLike {
    send(message: Record<string, unknown>, queueUrl: string): Promise<void>;
}

interface TriggerMigrationParams {
    userId?: string;
    dbType: string;
    stage: string;
}

export interface TriggerMigrationResult {
    success: boolean;
    migrationId: string;
    state: string;
    statusUrl: string;
    s3Key: string;
    message: string;
}

export class TriggerDatabaseMigrationUseCase {
    private readonly migrationStatusRepository: MigrationStatusRepository;
    private readonly queuerUtil: QueuerUtilLike;

    constructor({ migrationStatusRepository, queuerUtil }: {
        migrationStatusRepository: MigrationStatusRepository;
        queuerUtil?: QueuerUtilLike;
    }) {
        if (!migrationStatusRepository) {
            throw new Error('migrationStatusRepository dependency is required');
        }
        this.migrationStatusRepository = migrationStatusRepository;
        // Default QueuerUtil loaded at runtime to avoid import issues
        this.queuerUtil = queuerUtil || require('../../queues/queuer-util').QueuerUtil;
    }

    async execute({ userId, dbType, stage }: TriggerMigrationParams): Promise<TriggerMigrationResult> {
        this._validateParams({ userId, dbType, stage });

        const migrationStatus = await this.migrationStatusRepository.create({
            stage: stage || process.env.STAGE || 'production',
            triggeredBy: userId || 'system',
            triggeredAt: new Date().toISOString(),
        });

        console.log(`Created migration status: ${migrationStatus.migrationId}`);

        const queueUrl = process.env.DB_MIGRATION_QUEUE_URL;
        if (!queueUrl) {
            throw new Error(
                'DB_MIGRATION_QUEUE_URL environment variable is not set. ' +
                'Cannot send migration to queue.'
            );
        }

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

            await this.migrationStatusRepository.update({
                migrationId: migrationStatus.migrationId,
                stage: migrationStatus.stage,
                state: 'FAILED',
                error: `Failed to queue migration: ${(error as Error).message}`,
            });

            throw new Error(
                `Failed to queue migration: ${(error as Error).message}`
            );
        }

        return {
            success: true,
            migrationId: migrationStatus.migrationId,
            state: migrationStatus.state,
            statusUrl: `/db-migrate/${migrationStatus.migrationId}`,
            s3Key: `migrations/${migrationStatus.stage}/${migrationStatus.migrationId}.json`,
            message: 'Database migration queued successfully',
        };
    }

    private _validateParams({ userId, dbType, stage }: TriggerMigrationParams): void {
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
