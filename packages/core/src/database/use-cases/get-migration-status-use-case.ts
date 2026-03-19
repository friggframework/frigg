export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class NotFoundError extends Error {
    statusCode: number;

    constructor(message: string) {
        super(message);
        this.name = 'NotFoundError';
        this.statusCode = 404;
    }
}

interface MigrationStatusRepository {
    get(migrationId: string, stage: string): Promise<Record<string, unknown>>;
}

export class GetMigrationStatusUseCase {
    private migrationStatusRepository: MigrationStatusRepository;

    constructor({ migrationStatusRepository }: { migrationStatusRepository: MigrationStatusRepository }) {
        if (!migrationStatusRepository) {
            throw new Error('migrationStatusRepository dependency is required');
        }
        this.migrationStatusRepository = migrationStatusRepository;
    }

    async execute(migrationId: string, stage: string | null = null): Promise<Record<string, unknown>> {
        this._validateParams(migrationId);

        const effectiveStage = stage || process.env.STAGE || 'production';

        try {
            const migrationStatus = await this.migrationStatusRepository.get(migrationId, effectiveStage);
            return migrationStatus;
        } catch (error) {
            if ((error as Error).message.includes('not found')) {
                throw new NotFoundError(`Migration not found: ${migrationId}`);
            }
            throw error;
        }
    }

    private _validateParams(migrationId: string): void {
        if (!migrationId) {
            throw new ValidationError('migrationId is required');
        }

        if (typeof migrationId !== 'string') {
            throw new ValidationError('migrationId must be a string');
        }
    }
}
