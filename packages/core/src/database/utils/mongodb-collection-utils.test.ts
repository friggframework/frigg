jest.mock('../prisma', () => ({
    prisma: { $runCommandRaw: jest.fn() },
}));

const { prisma: mockPrisma } = require('../prisma');
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
            mockPrisma.$runCommandRaw
                .mockResolvedValueOnce({ cursor: { firstBatch: [] } })
                .mockResolvedValueOnce({ ok: 1 });

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
            mockPrisma.$runCommandRaw.mockResolvedValueOnce({
                cursor: { firstBatch: [] },
            });
            const error = new Error('Collection already exists') as any;
            error.codeName = 'NamespaceExists';
            mockPrisma.$runCommandRaw.mockRejectedValueOnce(error);

            await expect(ensureCollectionExists('TestCollection')).resolves.not.toThrow();
        });

        it('should log warning on other errors but not throw', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            mockPrisma.$runCommandRaw.mockRejectedValueOnce(new Error('Connection error'));

            await expect(ensureCollectionExists('TestCollection')).resolves.not.toThrow();
            expect(consoleWarnSpy).toHaveBeenCalled();

            consoleWarnSpy.mockRestore();
        });
    });

    describe('ensureCollectionsExist', () => {
        it('should ensure multiple collections exist', async () => {
            mockPrisma.$runCommandRaw.mockImplementation((cmd: any) => {
                if (cmd.listCollections) {
                    return Promise.resolve({ cursor: { firstBatch: [] } });
                }
                if (cmd.create) {
                    return Promise.resolve({ ok: 1 });
                }
            });

            await ensureCollectionsExist(['Collection1', 'Collection2', 'Collection3']);

            const createCalls = mockPrisma.$runCommandRaw.mock.calls.filter(
                ([cmd]: [any]) => cmd.create
            );
            expect(createCalls).toHaveLength(3);
            const createCommands = createCalls.map(([cmd]: [any]) => cmd);
            expect(createCommands).toEqual(
                expect.arrayContaining([
                    { create: 'Collection1' },
                    { create: 'Collection2' },
                    { create: 'Collection3' },
                ])
            );
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
