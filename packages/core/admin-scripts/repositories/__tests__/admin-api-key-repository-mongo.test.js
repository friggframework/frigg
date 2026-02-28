const {
    AdminApiKeyRepositoryMongo,
} = require('../admin-api-key-repository-mongo');

describe('AdminApiKeyRepositoryMongo', () => {
    let repository;
    let mockPrisma;

    beforeEach(() => {
        mockPrisma = {
            adminApiKey: {
                create: jest.fn(),
                findUnique: jest.fn(),
                findMany: jest.fn(),
                update: jest.fn(),
                delete: jest.fn(),
            },
        };

        repository = new AdminApiKeyRepositoryMongo();
        repository.prisma = mockPrisma;
    });

    describe('createApiKey()', () => {
        it('should create a new API key with all fields', async () => {
            const params = {
                name: 'Test Key',
                keyHash: 'hash123',
                keyLast4: '1234',
                scopes: ['scripts:execute', 'scripts:read'],
                expiresAt: new Date('2025-12-31'),
                createdBy: 'admin@example.com',
            };

            const mockApiKey = {
                id: '507f1f77bcf86cd799439011',
                ...params,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.adminApiKey.create.mockResolvedValue(mockApiKey);

            const result = await repository.createApiKey(params);

            expect(result).toEqual(mockApiKey);
            expect(mockPrisma.adminApiKey.create).toHaveBeenCalledWith({
                data: params,
            });
        });

        it('should create API key without optional fields', async () => {
            const params = {
                name: 'Test Key',
                keyHash: 'hash123',
                keyLast4: '1234',
                scopes: ['scripts:execute'],
            };

            const mockApiKey = {
                id: '507f1f77bcf86cd799439011',
                ...params,
                expiresAt: null,
                createdBy: null,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.adminApiKey.create.mockResolvedValue(mockApiKey);

            const result = await repository.createApiKey(params);

            expect(result).toEqual(mockApiKey);
        });
    });

    describe('findApiKeyByHash()', () => {
        it('should find API key by hash', async () => {
            const keyHash = 'hash123';
            const mockApiKey = {
                id: '507f1f77bcf86cd799439011',
                name: 'Test Key',
                keyHash,
                keyLast4: '1234',
                scopes: ['scripts:execute'],
                isActive: true,
            };

            mockPrisma.adminApiKey.findUnique.mockResolvedValue(mockApiKey);

            const result = await repository.findApiKeyByHash(keyHash);

            expect(result).toEqual(mockApiKey);
            expect(mockPrisma.adminApiKey.findUnique).toHaveBeenCalledWith({
                where: { keyHash },
            });
        });

        it('should return null if API key not found', async () => {
            mockPrisma.adminApiKey.findUnique.mockResolvedValue(null);

            const result = await repository.findApiKeyByHash('nonexistent');

            expect(result).toBeNull();
        });
    });

    describe('findApiKeyById()', () => {
        it('should find API key by ID', async () => {
            const id = '507f1f77bcf86cd799439011';
            const mockApiKey = {
                id,
                name: 'Test Key',
                keyHash: 'hash123',
                keyLast4: '1234',
                scopes: ['scripts:execute'],
                isActive: true,
            };

            mockPrisma.adminApiKey.findUnique.mockResolvedValue(mockApiKey);

            const result = await repository.findApiKeyById(id);

            expect(result).toEqual(mockApiKey);
            expect(mockPrisma.adminApiKey.findUnique).toHaveBeenCalledWith({
                where: { id },
            });
        });

        it('should return null if API key not found', async () => {
            mockPrisma.adminApiKey.findUnique.mockResolvedValue(null);

            const result = await repository.findApiKeyById('nonexistent');

            expect(result).toBeNull();
        });
    });

    describe('findActiveApiKeys()', () => {
        it('should find all active non-expired keys', async () => {
            const now = new Date();
            const mockApiKeys = [
                {
                    id: '507f1f77bcf86cd799439011',
                    name: 'Key 1',
                    isActive: true,
                    expiresAt: null,
                },
                {
                    id: '507f1f77bcf86cd799439012',
                    name: 'Key 2',
                    isActive: true,
                    expiresAt: new Date(Date.now() + 86400000), // tomorrow
                },
            ];

            mockPrisma.adminApiKey.findMany.mockResolvedValue(mockApiKeys);

            const result = await repository.findActiveApiKeys();

            expect(result).toEqual(mockApiKeys);
            expect(mockPrisma.adminApiKey.findMany).toHaveBeenCalledWith({
                where: {
                    isActive: true,
                    OR: [
                        { expiresAt: null },
                        { expiresAt: { gt: expect.any(Date) } },
                    ],
                },
            });
        });

        it('should return empty array if no active keys', async () => {
            mockPrisma.adminApiKey.findMany.mockResolvedValue([]);

            const result = await repository.findActiveApiKeys();

            expect(result).toEqual([]);
        });
    });

    describe('updateApiKeyLastUsed()', () => {
        it('should update lastUsedAt timestamp', async () => {
            const id = '507f1f77bcf86cd799439011';
            const mockApiKey = {
                id,
                name: 'Test Key',
                lastUsedAt: new Date(),
            };

            mockPrisma.adminApiKey.update.mockResolvedValue(mockApiKey);

            const result = await repository.updateApiKeyLastUsed(id);

            expect(result).toEqual(mockApiKey);
            expect(mockPrisma.adminApiKey.update).toHaveBeenCalledWith({
                where: { id },
                data: {
                    lastUsedAt: expect.any(Date),
                },
            });
        });
    });

    describe('deactivateApiKey()', () => {
        it('should set isActive to false', async () => {
            const id = '507f1f77bcf86cd799439011';
            const mockApiKey = {
                id,
                name: 'Test Key',
                isActive: false,
            };

            mockPrisma.adminApiKey.update.mockResolvedValue(mockApiKey);

            const result = await repository.deactivateApiKey(id);

            expect(result).toEqual(mockApiKey);
            expect(mockPrisma.adminApiKey.update).toHaveBeenCalledWith({
                where: { id },
                data: {
                    isActive: false,
                },
            });
        });
    });

    describe('deleteApiKey()', () => {
        it('should delete API key and return result', async () => {
            const id = '507f1f77bcf86cd799439011';

            mockPrisma.adminApiKey.delete.mockResolvedValue({});

            const result = await repository.deleteApiKey(id);

            expect(result).toEqual({
                acknowledged: true,
                deletedCount: 1,
            });
            expect(mockPrisma.adminApiKey.delete).toHaveBeenCalledWith({
                where: { id },
            });
        });

        it('should propagate error if delete fails', async () => {
            const id = '507f1f77bcf86cd799439011';
            const error = new Error('Not found');

            mockPrisma.adminApiKey.delete.mockRejectedValue(error);

            await expect(repository.deleteApiKey(id)).rejects.toThrow(
                'Not found'
            );
        });
    });
});
