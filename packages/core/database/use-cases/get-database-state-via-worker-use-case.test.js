/**
 * Tests for GetDatabaseStateViaWorkerUseCase
 * Domain layer - gets database state by invoking worker Lambda
 */

const {
    GetDatabaseStateViaWorkerUseCase,
} = require('./get-database-state-via-worker-use-case');

describe('GetDatabaseStateViaWorkerUseCase', () => {
    let useCase;
    let mockLambdaInvoker;
    const workerFunctionName = 'my-app-prod-dbMigrationWorker';

    beforeEach(() => {
        mockLambdaInvoker = {
            invoke: jest.fn(),
        };
        useCase = new GetDatabaseStateViaWorkerUseCase({
            lambdaInvoker: mockLambdaInvoker,
            workerFunctionName,
        });
    });

    describe('constructor', () => {
        it('should require lambdaInvoker dependency', () => {
            expect(() => new GetDatabaseStateViaWorkerUseCase({ workerFunctionName }))
                .toThrow('lambdaInvoker dependency is required');
        });

        it('should require workerFunctionName dependency', () => {
            expect(() => new GetDatabaseStateViaWorkerUseCase({ lambdaInvoker: mockLambdaInvoker }))
                .toThrow('workerFunctionName is required');
        });
    });

    describe('execute()', () => {
        it('should invoke worker Lambda with correct payload', async () => {
            mockLambdaInvoker.invoke.mockResolvedValue({
                upToDate: true,
                pendingMigrations: 0,
            });

            await useCase.execute('prod');

            expect(mockLambdaInvoker.invoke).toHaveBeenCalledWith(
                workerFunctionName,
                {
                    action: 'checkStatus',
                    dbType: 'postgresql',
                    stage: 'prod',
                }
            );
        });

        it('should return database state from worker', async () => {
            mockLambdaInvoker.invoke.mockResolvedValue({
                upToDate: false,
                pendingMigrations: 3,
                stage: 'prod',
                dbType: 'postgresql',
                recommendation: 'Run POST /db-migrate to apply 3 pending migration(s).',
            });

            const result = await useCase.execute('prod');

            expect(result).toEqual({
                upToDate: false,
                pendingMigrations: 3,
                stage: 'prod',
                dbType: 'postgresql',
                recommendation: 'Run POST /db-migrate to apply 3 pending migration(s).',
            });
        });

        it('should propagate worker errors', async () => {
            mockLambdaInvoker.invoke.mockRejectedValue(new Error('Worker Lambda failed'));

            await expect(useCase.execute('prod')).rejects.toThrow('Worker Lambda failed');
        });

        it('should default to production stage if not provided', async () => {
            mockLambdaInvoker.invoke.mockResolvedValue({ upToDate: true });

            await useCase.execute();

            expect(mockLambdaInvoker.invoke).toHaveBeenCalledWith(
                workerFunctionName,
                expect.objectContaining({ stage: 'production' })
            );
        });

        it('should use DB_TYPE environment variable if set', async () => {
            const originalDbType = process.env.DB_TYPE;
            process.env.DB_TYPE = 'documentdb';

            mockLambdaInvoker.invoke.mockResolvedValue({ upToDate: true });

            await useCase.execute('prod');

            expect(mockLambdaInvoker.invoke).toHaveBeenCalledWith(
                workerFunctionName,
                expect.objectContaining({ dbType: 'documentdb' })
            );

            // Cleanup
            if (originalDbType) {
                process.env.DB_TYPE = originalDbType;
            } else {
                delete process.env.DB_TYPE;
            }
        });

        it('should default to postgresql if DB_TYPE not set', async () => {
            const originalDbType = process.env.DB_TYPE;
            delete process.env.DB_TYPE;

            mockLambdaInvoker.invoke.mockResolvedValue({ upToDate: true });

            await useCase.execute('dev');

            expect(mockLambdaInvoker.invoke).toHaveBeenCalledWith(
                workerFunctionName,
                expect.objectContaining({ dbType: 'postgresql' })
            );

            // Cleanup
            if (originalDbType) {
                process.env.DB_TYPE = originalDbType;
            }
        });
    });
});


