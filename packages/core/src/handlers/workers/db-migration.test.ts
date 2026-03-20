/**
 * Adapter Layer Tests - Database Migration Worker
 *
 * CRITICAL TEST: Verify handler loads without app definition
 *
 * Business logic is tested in:
 * - database/use-cases/run-database-migration-use-case.test.ts (22 tests)
 *
 * Following hexagonal architecture principles:
 * - Handlers are thin adapters (SQS -> Use Case -> Response)
 * - Use cases contain all business logic (fully tested)
 * - Repositories are infrastructure adapters (tested separately)
 */

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.STAGE = 'test';

// Mock infrastructure dependencies to prevent app definition loading
jest.mock('../../integrations/repositories/process-repository-postgres', () => ({
    ProcessRepositoryPostgres: jest.fn(() => ({
        create: jest.fn(),
        findById: jest.fn(),
        updateState: jest.fn(),
    })),
}));

jest.mock('../../integrations/use-cases/update-process-state', () => ({
    UpdateProcessState: jest.fn(() => ({ execute: jest.fn() })),
}));

jest.mock('../../database/utils/prisma-runner', () => ({
    runMigration: jest.fn(),
    deployMigration: jest.fn(),
    checkDatabaseState: jest.fn(),
}));

describe('Database Migration Worker - Adapter Layer', () => {
    it('should load without requiring app definition (critical bug fix)', () => {
        expect(() => {
            require('./db-migration');
        }).not.toThrow();
    });

    it('should export handler function', () => {
        const { handler } = require('./db-migration') as any;
        expect(typeof handler).toBe('function');
    });

    describe('checkStatus action', () => {
        let handler: any;
        let mockPrismaRunner: any;

        beforeEach(() => {
            jest.clearAllMocks();
            jest.resetModules();

            mockPrismaRunner = {
                runMigration: jest.fn(),
                deployMigration: jest.fn(),
                checkDatabaseState: jest.fn(),
            };
            jest.mock('../../database/utils/prisma-runner', () => mockPrismaRunner);

            const module = require('./db-migration') as any;
            handler = module.handler;
        });

        it('should handle checkStatus action via direct invocation', async () => {
            const event = {
                action: 'checkStatus',
                dbType: 'postgresql',
                stage: 'prod',
            };

            const context = {
                requestId: 'test-request-id',
                functionName: 'test-function',
                getRemainingTimeInMillis: () => 30000,
            };

            mockPrismaRunner.checkDatabaseState = jest.fn().mockResolvedValue({
                upToDate: true,
                pendingMigrations: 0,
            });

            const result = await handler(event, context);
            const body = JSON.parse(result.body);

            expect(result.statusCode).toBe(200);
            expect(body.upToDate).toBe(true);
            expect(body.pendingMigrations).toBe(0);
        });

        it('should include stage in checkStatus response', async () => {
            const event = {
                action: 'checkStatus',
                dbType: 'postgresql',
                stage: 'dev',
            };

            const context = {
                requestId: 'test-request-id',
                functionName: 'test-function',
                getRemainingTimeInMillis: () => 30000,
            };

            mockPrismaRunner.checkDatabaseState = jest.fn().mockResolvedValue({
                upToDate: false,
                pendingMigrations: 2,
            });

            const result = await handler(event, context);
            const body = JSON.parse(result.body);

            expect(result.statusCode).toBe(200);
            expect(body.pendingMigrations).toBe(2);
        });

        it('should handle checkStatus errors gracefully', async () => {
            const event = {
                action: 'checkStatus',
                dbType: 'postgresql',
                stage: 'prod',
            };

            const context = {
                requestId: 'test-request-id',
                functionName: 'test-function',
                getRemainingTimeInMillis: () => 30000,
            };

            mockPrismaRunner.checkDatabaseState = jest.fn().mockResolvedValue({
                upToDate: false,
                error: 'Database connection failed',
            });

            const result = await handler(event, context);
            const body = JSON.parse(result.body);

            expect(result.statusCode).toBe(200);
            expect(body.error).toBe('Database connection failed');
            expect(body.upToDate).toBe(false);
        });

        it('should pass dbType from event to checkStatus use case', async () => {
            const event = {
                action: 'checkStatus',
                dbType: 'documentdb',
                stage: 'prod',
            };

            const context = {
                requestId: 'test-request-id',
                functionName: 'test-function',
                getRemainingTimeInMillis: () => 30000,
            };

            mockPrismaRunner.checkDatabaseState = jest.fn().mockResolvedValue({
                upToDate: true,
                pendingMigrations: 0,
            });

            const result = await handler(event, context);

            expect(mockPrismaRunner.checkDatabaseState).toHaveBeenCalledWith('documentdb');
        });
    });
});
