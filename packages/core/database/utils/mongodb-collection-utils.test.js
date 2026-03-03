/**
 * Tests for MongoDB Collection Utilities
 */

const {
    ensureCollectionExists,
    ensureCollectionsExist,
    collectionExists,
} = require('./mongodb-collection-utils');

// Mock prisma
const mockPrisma = {
    $runCommandRaw: jest.fn(),
};

jest.mock('../prisma', () => ({
    prisma: mockPrisma,
}));

describe('MongoDB Collection Utilities', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('ensureCollectionExists', () => {
        it('should create collection if it does not exist', async () => {
            // Mock: collection doesn't exist
            mockPrisma.$runCommandRaw
                .mockResolvedValueOnce({ cursor: { firstBatch: [] } }) // listCollections
                .mockResolvedValueOnce({ ok: 1 }); // create

            await ensureCollectionExists('TestCollection');

            expect(mockPrisma.$runCommandRaw).toHaveBeenCalledWith({
                listCollections: 1,
                filter: { name: 'TestCollection' },
            });
            expect(mockPrisma.$runCommandRaw).toHaveBeenCalledWith({
                create: 'TestCollection',
            });
        });

        it('should not create collection if it already exists', async () => {
            // Mock: collection exists
            mockPrisma.$runCommandRaw.mockResolvedValueOnce({
                cursor: { firstBatch: [{ name: 'TestCollection' }] },
            });

            await ensureCollectionExists('TestCollection');

            expect(mockPrisma.$runCommandRaw).toHaveBeenCalledWith({
                listCollections: 1,
                filter: { name: 'TestCollection' },
            });
            expect(mockPrisma.$runCommandRaw).toHaveBeenCalledTimes(1);
        });

        it('should not throw if collection creation fails with NamespaceExists error', async () => {
            // Mock: collection doesn't exist in list, but creation fails (race condition)
            mockPrisma.$runCommandRaw.mockResolvedValueOnce({
                cursor: { firstBatch: [] },
            });
            const error = new Error('Collection already exists');
            error.codeName = 'NamespaceExists';
            mockPrisma.$runCommandRaw.mockRejectedValueOnce(error);

            // Should not throw
            await expect(ensureCollectionExists('TestCollection')).resolves.not.toThrow();
        });

        it('should log warning on other errors but not throw', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Mock: listCollections fails
            mockPrisma.$runCommandRaw.mockRejectedValueOnce(new Error('Connection error'));

            // Should not throw
            await expect(ensureCollectionExists('TestCollection')).resolves.not.toThrow();
            expect(consoleWarnSpy).toHaveBeenCalled();

            consoleWarnSpy.mockRestore();
        });
    });

    describe('ensureCollectionsExist', () => {
        it('should ensure multiple collections exist', async () => {
            // Mock: no collections exist
            mockPrisma.$runCommandRaw.mockImplementation((cmd) => {
                if (cmd.listCollections) {
                    return Promise.resolve({ cursor: { firstBatch: [] } });
                }
                if (cmd.create) {
                    return Promise.resolve({ ok: 1 });
                }
            });

            await ensureCollectionsExist(['Collection1', 'Collection2', 'Collection3']);

            // 3 listCollections + 3 creates = 6 calls
            const createCalls = mockPrisma.$runCommandRaw.mock.calls.filter(
                ([cmd]) => cmd.create
            );
            expect(createCalls).toHaveLength(3);
            expect(createCalls[0][0]).toEqual({ create: 'Collection1' });
            expect(createCalls[1][0]).toEqual({ create: 'Collection2' });
            expect(createCalls[2][0]).toEqual({ create: 'Collection3' });
        });
    });

    describe('collectionExists', () => {
        it('should return true if collection exists', async () => {
            mockPrisma.$runCommandRaw.mockResolvedValueOnce({
                cursor: { firstBatch: [{ name: 'TestCollection' }] },
            });

            const exists = await collectionExists('TestCollection');

            expect(exists).toBe(true);
        });

        it('should return false if collection does not exist', async () => {
            mockPrisma.$runCommandRaw.mockResolvedValueOnce({
                cursor: { firstBatch: [] },
            });

            const exists = await collectionExists('TestCollection');

            expect(exists).toBe(false);
        });

        it('should return false on error', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            mockPrisma.$runCommandRaw.mockRejectedValueOnce(new Error('Connection error'));

            const exists = await collectionExists('TestCollection');

            expect(exists).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalled();

            consoleErrorSpy.mockRestore();
        });
    });
});
