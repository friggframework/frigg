/**
 * Tests for MongoDB Collection Utilities
 */

const {
    ensureCollectionExists,
    ensureCollectionsExist,
    collectionExists,
} = require('./mongodb-collection-utils');

// Mock mongoose
const mockMongoose = {
    connection: {
        db: {
            listCollections: jest.fn(),
            createCollection: jest.fn(),
        },
    },
};

jest.mock('../mongoose', () => ({
    mongoose: mockMongoose,
}));

describe('MongoDB Collection Utilities', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('ensureCollectionExists', () => {
        it('should create collection if it does not exist', async () => {
            // Mock: collection doesn't exist
            mockMongoose.connection.db.listCollections.mockReturnValue({
                toArray: jest.fn().mockResolvedValue([]),
            });
            mockMongoose.connection.db.createCollection.mockResolvedValue(true);

            await ensureCollectionExists('TestCollection');

            expect(
                mockMongoose.connection.db.listCollections
            ).toHaveBeenCalledWith({
                name: 'TestCollection',
            });
            expect(
                mockMongoose.connection.db.createCollection
            ).toHaveBeenCalledWith('TestCollection');
        });

        it('should not create collection if it already exists', async () => {
            // Mock: collection exists
            mockMongoose.connection.db.listCollections.mockReturnValue({
                toArray: jest
                    .fn()
                    .mockResolvedValue([{ name: 'TestCollection' }]),
            });

            await ensureCollectionExists('TestCollection');

            expect(
                mockMongoose.connection.db.listCollections
            ).toHaveBeenCalledWith({
                name: 'TestCollection',
            });
            expect(
                mockMongoose.connection.db.createCollection
            ).not.toHaveBeenCalled();
        });

        it('should not throw if collection creation fails with NamespaceExists error', async () => {
            // Mock: collection doesn't exist in list, but creation fails (race condition)
            mockMongoose.connection.db.listCollections.mockReturnValue({
                toArray: jest.fn().mockResolvedValue([]),
            });
            const error = new Error('Collection already exists');
            error.codeName = 'NamespaceExists';
            mockMongoose.connection.db.createCollection.mockRejectedValue(
                error
            );

            // Should not throw
            await expect(
                ensureCollectionExists('TestCollection')
            ).resolves.not.toThrow();
        });

        it('should log warning on other errors but not throw', async () => {
            const consoleWarnSpy = jest
                .spyOn(console, 'warn')
                .mockImplementation();

            // Mock: listCollections fails
            mockMongoose.connection.db.listCollections.mockReturnValue({
                toArray: jest
                    .fn()
                    .mockRejectedValue(new Error('Connection error')),
            });

            // Should not throw
            await expect(
                ensureCollectionExists('TestCollection')
            ).resolves.not.toThrow();
            expect(consoleWarnSpy).toHaveBeenCalled();

            consoleWarnSpy.mockRestore();
        });
    });

    describe('ensureCollectionsExist', () => {
        it('should ensure multiple collections exist', async () => {
            // Mock: no collections exist
            mockMongoose.connection.db.listCollections.mockReturnValue({
                toArray: jest.fn().mockResolvedValue([]),
            });
            mockMongoose.connection.db.createCollection.mockResolvedValue(true);

            await ensureCollectionsExist([
                'Collection1',
                'Collection2',
                'Collection3',
            ]);

            expect(
                mockMongoose.connection.db.createCollection
            ).toHaveBeenCalledTimes(3);
            expect(
                mockMongoose.connection.db.createCollection
            ).toHaveBeenCalledWith('Collection1');
            expect(
                mockMongoose.connection.db.createCollection
            ).toHaveBeenCalledWith('Collection2');
            expect(
                mockMongoose.connection.db.createCollection
            ).toHaveBeenCalledWith('Collection3');
        });
    });

    describe('collectionExists', () => {
        it('should return true if collection exists', async () => {
            mockMongoose.connection.db.listCollections.mockReturnValue({
                toArray: jest
                    .fn()
                    .mockResolvedValue([{ name: 'TestCollection' }]),
            });

            const exists = await collectionExists('TestCollection');

            expect(exists).toBe(true);
        });

        it('should return false if collection does not exist', async () => {
            mockMongoose.connection.db.listCollections.mockReturnValue({
                toArray: jest.fn().mockResolvedValue([]),
            });

            const exists = await collectionExists('TestCollection');

            expect(exists).toBe(false);
        });

        it('should return false on error', async () => {
            const consoleErrorSpy = jest
                .spyOn(console, 'error')
                .mockImplementation();

            mockMongoose.connection.db.listCollections.mockReturnValue({
                toArray: jest
                    .fn()
                    .mockRejectedValue(new Error('Connection error')),
            });

            const exists = await collectionExists('TestCollection');

            expect(exists).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalled();

            consoleErrorSpy.mockRestore();
        });
    });
});
