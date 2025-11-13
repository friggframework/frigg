/**
 * Tests for MongoDB Collection Utilities
 */

// Mock mongoose - must be defined before require statements due to Jest hoisting
jest.mock('../mongoose', () => ({
    mongoose: {
        connection: {
            db: {
                listCollections: jest.fn(),
                createCollection: jest.fn(),
            },
        },
    },
}));

const {
    ensureCollectionExists,
    ensureCollectionsExist,
    collectionExists,
} = require('./mongodb-collection-utils');

const { mongoose } = require('../mongoose');

/**
 * @group unit
 * @group infrastructure
 */
describe('MongoDB Collection Utilities', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('ensureCollectionExists', () => {
        it('should create collection if it does not exist', async () => {
            // Mock: collection doesn't exist
            mongoose.connection.db.listCollections.mockReturnValue({
                toArray: jest.fn().mockResolvedValue([]),
            });
            mongoose.connection.db.createCollection.mockResolvedValue(true);

            await ensureCollectionExists('TestCollection');

            expect(mongoose.connection.db.listCollections).toHaveBeenCalledWith({
                name: 'TestCollection',
            });
            expect(mongoose.connection.db.createCollection).toHaveBeenCalledWith(
                'TestCollection'
            );
        });

        it('should not create collection if it already exists', async () => {
            // Mock: collection exists
            mongoose.connection.db.listCollections.mockReturnValue({
                toArray: jest.fn().mockResolvedValue([{ name: 'TestCollection' }]),
            });

            await ensureCollectionExists('TestCollection');

            expect(mongoose.connection.db.listCollections).toHaveBeenCalledWith({
                name: 'TestCollection',
            });
            expect(mongoose.connection.db.createCollection).not.toHaveBeenCalled();
        });

        it('should not throw if collection creation fails with NamespaceExists error', async () => {
            // Mock: collection doesn't exist in list, but creation fails (race condition)
            mongoose.connection.db.listCollections.mockReturnValue({
                toArray: jest.fn().mockResolvedValue([]),
            });
            const error = new Error('Collection already exists');
            error.codeName = 'NamespaceExists';
            mongoose.connection.db.createCollection.mockRejectedValue(error);

            // Should not throw
            await expect(ensureCollectionExists('TestCollection')).resolves.not.toThrow();
        });

        it('should log warning on other errors but not throw', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Mock: listCollections fails
            mongoose.connection.db.listCollections.mockReturnValue({
                toArray: jest.fn().mockRejectedValue(new Error('Connection error')),
            });

            // Should not throw
            await expect(ensureCollectionExists('TestCollection')).resolves.not.toThrow();
            expect(consoleWarnSpy).toHaveBeenCalled();

            consoleWarnSpy.mockRestore();
        });
    });

    describe('ensureCollectionsExist', () => {
        it('should ensure multiple collections exist', async () => {
            // Mock: no collections exist
            mongoose.connection.db.listCollections.mockReturnValue({
                toArray: jest.fn().mockResolvedValue([]),
            });
            mongoose.connection.db.createCollection.mockResolvedValue(true);

            await ensureCollectionsExist(['Collection1', 'Collection2', 'Collection3']);

            expect(mongoose.connection.db.createCollection).toHaveBeenCalledTimes(3);
            expect(mongoose.connection.db.createCollection).toHaveBeenCalledWith(
                'Collection1'
            );
            expect(mongoose.connection.db.createCollection).toHaveBeenCalledWith(
                'Collection2'
            );
            expect(mongoose.connection.db.createCollection).toHaveBeenCalledWith(
                'Collection3'
            );
        });
    });

    describe('collectionExists', () => {
        it('should return true if collection exists', async () => {
            mongoose.connection.db.listCollections.mockReturnValue({
                toArray: jest.fn().mockResolvedValue([{ name: 'TestCollection' }]),
            });

            const exists = await collectionExists('TestCollection');

            expect(exists).toBe(true);
        });

        it('should return false if collection does not exist', async () => {
            mongoose.connection.db.listCollections.mockReturnValue({
                toArray: jest.fn().mockResolvedValue([]),
            });

            const exists = await collectionExists('TestCollection');

            expect(exists).toBe(false);
        });

        it('should return false on error', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            mongoose.connection.db.listCollections.mockReturnValue({
                toArray: jest.fn().mockRejectedValue(new Error('Connection error')),
            });

            const exists = await collectionExists('TestCollection');

            expect(exists).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalled();

            consoleErrorSpy.mockRestore();
        });
    });
});
