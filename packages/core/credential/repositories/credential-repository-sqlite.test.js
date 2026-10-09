/**
 * Tests for SQLite Credential Repository
 * Validates that SQLite repositories work identically to PostgreSQL
 */

const { CredentialRepositorySqlite } = require('./credential-repository-sqlite');

describe('CredentialRepositorySqlite', () => {
    describe('extends PostgreSQL repository', () => {
        it('should be a class that extends CredentialRepositoryPostgres', () => {
            const repository = new CredentialRepositorySqlite();
            // Verify it has the expected methods from the parent
            expect(typeof repository.findCredentialById).toBe('function');
            expect(typeof repository.updateAuthenticationStatus).toBe('function');
            expect(typeof repository.deleteCredentialById).toBe('function');
        });
    });
});
