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
});
