/**
 * Adapter Layer Tests - Database Migration Router
 * 
 * CRITICAL TEST: Verify handler loads without app definition
 * 
 * Business logic is tested in:
 * - database/use-cases/trigger-database-migration-use-case.test.js (14 tests)
 * - database/use-cases/get-migration-status-use-case.test.js (11 tests)
 * 
 * Following hexagonal architecture principles:
 * - Handlers are thin adapters (HTTP → Use Case → HTTP)
 * - Use cases contain all business logic (fully tested)
 * - Repositories are infrastructure adapters (tested separately)
 */

process.env.ADMIN_API_KEY = 'test-admin-key';
process.env.DB_MIGRATION_QUEUE_URL = 'https://sqs.test/queue';

// Mock infrastructure dependencies to prevent app definition loading
jest.mock('../../integrations/repositories/process-repository-postgres', () => ({
    ProcessRepositoryPostgres: jest.fn(() => ({
        create: jest.fn(),
        findById: jest.fn(),
    })),
}));

describe('Database Migration Router - Adapter Layer', () => {
    it('should load without requiring app definition (critical bug fix)', () => {
        // Before fix: createProcessRepository() → getDatabaseType() → loads app definition → requires integrations → CRASH
        // After fix: ProcessRepositoryPostgres instantiated directly → no app definition → SUCCESS
        
        expect(() => {
            require('./db-migration');
        }).not.toThrow();
    });

    it('should export handler and router', () => {
        const { handler, router } = require('./db-migration');
        expect(typeof handler).toBe('function');
        expect(typeof router).toBe('function');
        expect(router.stack).toBeDefined();
    });
});
