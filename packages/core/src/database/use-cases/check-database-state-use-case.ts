export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export interface PrismaRunner {
    checkDatabaseState(dbType: string): Promise<{
        upToDate: boolean;
        pendingMigrations?: number;
        error?: string;
    }>;
}

export interface DatabaseStateResult {
    upToDate: boolean;
    pendingMigrations: number;
    dbType: string;
    stage: string;
    error?: string;
    recommendation?: string;
}

export class CheckDatabaseStateUseCase {
    private readonly prismaRunner: PrismaRunner;

    constructor({ prismaRunner }: { prismaRunner: PrismaRunner }) {
        if (!prismaRunner) {
            throw new Error('prismaRunner dependency is required');
        }
        this.prismaRunner = prismaRunner;
    }

    async execute(dbType: string, stage: string = 'production'): Promise<DatabaseStateResult> {
        if (!dbType) {
            throw new ValidationError('dbType is required');
        }

        if (!['postgresql', 'mongodb', 'documentdb'].includes(dbType)) {
            throw new ValidationError('dbType must be postgresql, mongodb, or documentdb');
        }

        console.log(`Checking migration status for ${dbType} in ${stage}`);

        const state = await this.prismaRunner.checkDatabaseState(dbType);

        const response: DatabaseStateResult = {
            upToDate: state.upToDate,
            pendingMigrations: state.pendingMigrations || 0,
            dbType,
            stage,
        };

        if (state.error) {
            response.error = state.error;
            response.recommendation = 'Run POST /db-migrate to initialize database';
        }

        if (!state.upToDate && state.pendingMigrations && state.pendingMigrations > 0) {
            response.recommendation = `Run POST /db-migrate to apply ${state.pendingMigrations} pending migration(s)`;
        }

        return response;
    }
}
