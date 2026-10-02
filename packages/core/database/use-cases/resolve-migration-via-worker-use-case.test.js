/**
 * Tests for ResolveMigrationViaWorkerUseCase
 * Domain layer - resolves a failed migration by invoking the worker Lambda
 */

const {
    ResolveMigrationViaWorkerUseCase,
} = require('./resolve-migration-via-worker-use-case');

describe('ResolveMigrationViaWorkerUseCase', () => {
    let useCase;
    let mockLambdaInvoker;
    const workerFunctionName = 'my-app-prod-dbMigrationWorker';

    beforeEach(() => {
        mockLambdaInvoker = {
            invoke: jest.fn(),
        };
        useCase = new ResolveMigrationViaWorkerUseCase({
            lambdaInvoker: mockLambdaInvoker,
            workerFunctionName,
        });
    });

    describe('constructor', () => {
        it('should require lambdaInvoker dependency', () => {
            expect(
                () =>
                    new ResolveMigrationViaWorkerUseCase({ workerFunctionName })
            ).toThrow('lambdaInvoker dependency is required');
        });

        it('should require workerFunctionName dependency', () => {
            expect(
                () =>
                    new ResolveMigrationViaWorkerUseCase({
                        lambdaInvoker: mockLambdaInvoker,
                    })
            ).toThrow('workerFunctionName is required');
        });
    });

    describe('execute()', () => {
        it('should invoke worker with a resolve payload (default applied)', async () => {
            mockLambdaInvoker.invoke.mockResolvedValue({ success: true });

            await useCase.execute({
                migrationName: '20260422120001_create_process_table',
                stage: 'prod',
            });

            expect(mockLambdaInvoker.invoke).toHaveBeenCalledWith(
                workerFunctionName,
                {
                    action: 'resolve',
                    migrationName: '20260422120001_create_process_table',
                    resolveAction: 'applied',
                    dbType: 'postgresql',
                    stage: 'prod',
                }
            );
        });

        it('should pass through rolled-back as resolveAction', async () => {
            mockLambdaInvoker.invoke.mockResolvedValue({ success: true });

            await useCase.execute({
                migrationName: 'mig',
                action: 'rolled-back',
                stage: 'dev',
            });

            expect(mockLambdaInvoker.invoke).toHaveBeenCalledWith(
                workerFunctionName,
                expect.objectContaining({ resolveAction: 'rolled-back' })
            );
        });

        it('should return the worker result body', async () => {
            const body = {
                success: true,
                message: 'Migration mig marked as applied',
                migrationName: 'mig',
                action: 'applied',
            };
            mockLambdaInvoker.invoke.mockResolvedValue(body);

            const result = await useCase.execute({
                migrationName: 'mig',
                stage: 'prod',
            });

            expect(result).toEqual(body);
        });

        it('should propagate worker errors', async () => {
            mockLambdaInvoker.invoke.mockRejectedValue(
                new Error('Worker Lambda failed')
            );

            await expect(
                useCase.execute({ migrationName: 'mig', stage: 'prod' })
            ).rejects.toThrow('Worker Lambda failed');
        });
    });
});
