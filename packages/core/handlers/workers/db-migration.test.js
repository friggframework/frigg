/**
 * Adapter Layer Tests - Database Migration Worker
 * 
 * CRITICAL TEST: Verify handler loads without app definition
 * 
 * Business logic is tested in:
 * - database/use-cases/run-database-migration-use-case.test.js (22 tests)
 * 
 * Following hexagonal architecture principles:
 * - Handlers are thin adapters (SQS → Use Case → Response)
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
        // Before fix: createProcessRepository() → getDatabaseType() → loads app definition → requires integrations → CRASH
        // After fix: ProcessRepositoryPostgres instantiated directly → no app definition → SUCCESS

        expect(() => {
            require('./db-migration');
        }).not.toThrow();
    });

    it('should export handler function', () => {
        const { handler } = require('./db-migration');
        expect(typeof handler).toBe('function');
    });

    describe('checkStatus action', () => {
        let handler;
        let mockPrismaRunner;

        beforeEach(() => {
            jest.clearAllMocks();
            jest.resetModules();

            // Re-mock prisma runner
            mockPrismaRunner = {
                runMigration: jest.fn(),
                deployMigration: jest.fn(),
                checkDatabaseState: jest.fn(),
            };
            jest.mock('../../database/utils/prisma-runner', () => mockPrismaRunner);

            // Re-require handler
            const module = require('./db-migration');
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

            expect(result.statusCode).toBe(200);
            expect(result.body.upToDate).toBe(true);
            expect(result.body.pendingMigrations).toBe(0);
            expect(result.body.stage).toBe('prod');
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

            expect(result.statusCode).toBe(200);
            expect(result.body.stage).toBe('dev');
            expect(result.body.pendingMigrations).toBe(2);
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

            expect(result.statusCode).toBe(200); // Still 200, error is in body
            expect(result.body.error).toBe('Database connection failed');
            expect(result.body.upToDate).toBe(false);
        });
    });
});
