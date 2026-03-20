export class MigrationError extends Error {
    context: Record<string, unknown>;

    constructor(message: string, context: Record<string, unknown> = {}) {
        super(message);
        this.name = 'MigrationError';
        this.context = context;
    }
}

export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

interface PrismaRunner {
    runPrismaGenerate(dbType: string, verbose?: boolean): Promise<{ success: boolean; output?: string; error?: string }>;
    getMigrationCommand(stage: string): string;
    runPrismaMigrate(command: string, verbose?: boolean): Promise<{ success: boolean; output?: string; error?: string }>;
    runPrismaDbPush(verbose?: boolean, nonInteractive?: boolean): Promise<{ success: boolean; output?: string; error?: string }>;
}

interface MigrationParams {
    dbType: string;
    stage: string;
    verbose?: boolean;
}

export interface MigrationResult {
    success: boolean;
    dbType: string;
    stage: string;
    command: string;
    message: string;
}

export class RunDatabaseMigrationUseCase {
    private readonly prismaRunner: PrismaRunner;

    constructor({ prismaRunner }: { prismaRunner: PrismaRunner }) {
        if (!prismaRunner) {
            throw new Error('prismaRunner dependency is required');
        }
        this.prismaRunner = prismaRunner;
    }

    async execute({ dbType, stage, verbose = false }: MigrationParams): Promise<MigrationResult> {
        this._validateParams({ dbType, stage });

        const generateResult = await this.prismaRunner.runPrismaGenerate(dbType, verbose);

        if (!generateResult.success) {
            throw new MigrationError(
                `Failed to generate Prisma client: ${generateResult.error || 'Unknown error'}`,
                { dbType, stage, step: 'generate', output: generateResult.output }
            );
        }

        let migrationResult: { success: boolean; output?: string; error?: string };
        let migrationCommand: string;

        if (dbType === 'postgresql') {
            migrationCommand = this.prismaRunner.getMigrationCommand(stage);
            migrationResult = await this.prismaRunner.runPrismaMigrate(migrationCommand, verbose);

            if (!migrationResult.success) {
                throw new MigrationError(
                    `PostgreSQL migration failed: ${migrationResult.error || 'Unknown error'}`,
                    { dbType, stage, command: migrationCommand, step: 'migrate', output: migrationResult.output }
                );
            }
        } else if (dbType === 'mongodb' || dbType === 'documentdb') {
            migrationCommand = 'db push';
            migrationResult = await this.prismaRunner.runPrismaDbPush(verbose, true);

            if (!migrationResult.success) {
                throw new MigrationError(
                    `Mongo-compatible push failed: ${migrationResult.error || 'Unknown error'}`,
                    { dbType, stage, command: migrationCommand, step: 'push', output: migrationResult.output }
                );
            }
        } else {
            throw new ValidationError(
                `Unsupported database type: ${dbType}. Must be 'postgresql', 'mongodb', or 'documentdb'.`
            );
        }

        return {
            success: true,
            dbType,
            stage,
            command: migrationCommand,
            message: 'Database migration completed successfully',
        };
    }

    private _validateParams({ dbType, stage }: { dbType: string; stage: string }): void {
        if (!dbType) {
            throw new ValidationError('dbType is required');
        }
        if (typeof dbType !== 'string') {
            throw new ValidationError('dbType must be a string');
        }
        if (!stage) {
            throw new ValidationError('stage is required');
        }
        if (typeof stage !== 'string') {
            throw new ValidationError('stage must be a string');
        }
    }
}
