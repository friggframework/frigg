const { AdminApiKeyRepositoryInterface } = require('../admin-api-key-repository-interface');

describe('AdminApiKeyRepositoryInterface', () => {
    let repository;

    beforeEach(() => {
        repository = new AdminApiKeyRepositoryInterface();
    });

    describe('Interface contract', () => {
        it('should throw error when createApiKey is not implemented', async () => {
            await expect(
                repository.createApiKey({
                    name: 'test-key',
                    keyHash: 'hash123',
                    keyLast4: '1234',
                    scopes: ['scripts:execute'],
                    expiresAt: new Date(),
                    createdBy: 'admin@example.com',
                })
            ).rejects.toThrow('Method createApiKey must be implemented by subclass');
        });

        it('should throw error when findApiKeyByHash is not implemented', async () => {
            await expect(
                repository.findApiKeyByHash('hash123')
            ).rejects.toThrow('Method findApiKeyByHash must be implemented by subclass');
        });

        it('should throw error when findApiKeyById is not implemented', async () => {
            await expect(
                repository.findApiKeyById('key123')
            ).rejects.toThrow('Method findApiKeyById must be implemented by subclass');
        });

        it('should throw error when findActiveApiKeys is not implemented', async () => {
            await expect(
                repository.findActiveApiKeys()
            ).rejects.toThrow('Method findActiveApiKeys must be implemented by subclass');
        });

        it('should throw error when updateApiKeyLastUsed is not implemented', async () => {
            await expect(
                repository.updateApiKeyLastUsed('key123')
            ).rejects.toThrow('Method updateApiKeyLastUsed must be implemented by subclass');
        });

        it('should throw error when deactivateApiKey is not implemented', async () => {
            await expect(
                repository.deactivateApiKey('key123')
            ).rejects.toThrow('Method deactivateApiKey must be implemented by subclass');
        });

        it('should throw error when deleteApiKey is not implemented', async () => {
            await expect(
                repository.deleteApiKey('key123')
            ).rejects.toThrow('Method deleteApiKey must be implemented by subclass');
        });
    });

    describe('Method signatures', () => {
        it('should accept all required parameters in createApiKey', async () => {
            const params = {
                name: 'test-key',
                keyHash: 'hash123',
                keyLast4: '1234',
                scopes: ['scripts:execute', 'scripts:read'],
                expiresAt: new Date('2025-12-31'),
                createdBy: 'admin@example.com',
            };

            await expect(repository.createApiKey(params)).rejects.toThrow();
        });

        it('should accept string parameter in findApiKeyByHash', async () => {
            await expect(
                repository.findApiKeyByHash('some-hash')
            ).rejects.toThrow();
        });

        it('should accept string parameter in findApiKeyById', async () => {
            await expect(
                repository.findApiKeyById('some-id')
            ).rejects.toThrow();
        });

        it('should accept no parameters in findActiveApiKeys', async () => {
            await expect(repository.findActiveApiKeys()).rejects.toThrow();
        });

        it('should accept string parameter in updateApiKeyLastUsed', async () => {
            await expect(
                repository.updateApiKeyLastUsed('some-id')
            ).rejects.toThrow();
        });

        it('should accept string parameter in deactivateApiKey', async () => {
            await expect(
                repository.deactivateApiKey('some-id')
            ).rejects.toThrow();
        });

        it('should accept string parameter in deleteApiKey', async () => {
            await expect(
                repository.deleteApiKey('some-id')
            ).rejects.toThrow();
        });
    });
});
