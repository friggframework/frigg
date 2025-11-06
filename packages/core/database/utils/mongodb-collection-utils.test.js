/**
 * Tests for MongoDB Collection Utilities
 */

// Mock Prisma BEFORE requiring the module
const mockPrisma = {
    $runCommandRaw: jest.fn(),
};

jest.mock('../prisma', () => ({
    prisma: mockPrisma,
}));

const {
    ensureCollectionExists,
    ensureCollectionsExist,
    collectionExists,
} = require('./mongodb-collection-utils');

describe('MongoDB Collection Utilities', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('ensureCollectionExists', () => {
        it('should create collection if it does not exist', async () => {
            // Mock: collection doesn't exist
            mockPrisma.$runCommandRaw
                .mockResolvedValueOnce({
                    cursor: { firstBatch: [] }
                })
                .mockResolvedValueOnce({ ok: 1 });

            await ensureCollectionExists('TestCollection');

            expect(mockPrisma.$runCommandRaw).toHaveBeenCalledTimes(2);
            expect(mockPrisma.$runCommandRaw).toHaveBeenNthCalledWith(1, {
                listCollections: 1,
                filter: { name: 'TestCollection' }
            });
            expect(mockPrisma.$runCommandRaw).toHaveBeenNthCalledWith(2, {
                create: 'TestCollection'
            });
        });

        it('should not create collection if it already exists', async () => {
            // Mock: collection exists
            mockPrisma.$runCommandRaw.mockResolvedValueOnce({
                cursor: { firstBatch: [{ name: 'TestCollection' }] }
            });

            await ensureCollectionExists('TestCollection');

            expect(mockPrisma.$runCommandRaw).toHaveBeenCalledTimes(1);
            expect(mockPrisma.$runCommandRaw).toHaveBeenCalledWith({
                listCollections: 1,
                filter: { name: 'TestCollection' }
            });
        });

        it('should not throw if collection creation fails with NamespaceExists error', async () => {
            // Mock: collection doesn't exist in list, but creation fails (race condition)
            mockPrisma.$runCommandRaw
                .mockResolvedValueOnce({
                    cursor: { firstBatch: [] }
                });
            
            const error = new Error('Collection already exists');
            error.code = 48;
            error.codeName = 'NamespaceExists';
            mockPrisma.$runCommandRaw.mockRejectedValueOnce(error);

            // Should not throw
            await expect(ensureCollectionExists('TestCollection')).resolves.toBeUndefined();
        });

        it('should log warning on other errors but not throw', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Mock: $runCommandRaw fails
            mockPrisma.$runCommandRaw.mockRejectedValue(new Error('Connection error'));

            // Should not throw
            await expect(ensureCollectionExists('TestCollection')).resolves.toBeUndefined();
            expect(consoleWarnSpy).toHaveBeenCalled();

            consoleWarnSpy.mockRestore();
        });
    });

    describe('ensureCollectionsExist', () => {
        it('should ensure multiple collections exist', async () => {
            // Mock: no collections exist
            let callCount = 0;
            mockPrisma.$runCommandRaw.mockImplementation((cmd) => {
                callCount++;
                if (cmd.listCollections) {
                    return Promise.resolve({ cursor: { firstBatch: [] } });
                }
                if (cmd.create) {
                    return Promise.resolve({ ok: 1 });
                }
            });

            await ensureCollectionsExist(['Collection1', 'Collection2', 'Collection3']);

            expect(mockPrisma.$runCommandRaw).toHaveBeenCalledTimes(6); // 2 calls per collection
            expect(mockPrisma.$runCommandRaw).toHaveBeenCalledWith({
                create: 'Collection1'
            });
            expect(mockPrisma.$runCommandRaw).toHaveBeenCalledWith({
                create: 'Collection2'
            });
            expect(mockPrisma.$runCommandRaw).toHaveBeenCalledWith({
                create: 'Collection3'
            });
        });
    });

    describe('collectionExists', () => {
        it('should return true if collection exists', async () => {
            mockPrisma.$runCommandRaw.mockResolvedValueOnce({
                cursor: { firstBatch: [{ name: 'TestCollection' }] }
            });

            const exists = await collectionExists('TestCollection');

            expect(exists).toBe(true);
        });

        it('should return false if collection does not exist', async () => {
            mockPrisma.$runCommandRaw.mockResolvedValueOnce({
                cursor: { firstBatch: [] }
            });

            const exists = await collectionExists('TestCollection');

            expect(exists).toBe(false);
        });

        it('should return false on error', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            mockPrisma.$runCommandRaw.mockRejectedValue(new Error('Connection error'));

            const exists = await collectionExists('TestCollection');

            expect(exists).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalled();

            consoleErrorSpy.mockRestore();
        });
    });
});
