/**
 * Tests for MongoDB Schema Initialization
 */

const {
    initializeMongoDBSchema,
    getPrismaCollections,
    PRISMA_COLLECTIONS,
} = require('./mongodb-schema-init');

// Mock dependencies
const mockMongoose = {
    connection: {
        readyState: 1, // connected
    },
};

const mockEnsureCollectionsExist = jest.fn().mockResolvedValue(undefined);

jest.mock('../mongoose', () => ({
    mongoose: mockMongoose,
}));

jest.mock('./mongodb-collection-utils', () => ({
    ensureCollectionsExist: mockEnsureCollectionsExist,
}));

const mockConfig = {
    DB_TYPE: 'mongodb',
};

jest.mock('../config', () => mockConfig);

describe('MongoDB Schema Initialization', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockConfig.DB_TYPE = 'mongodb';
        mockMongoose.connection.readyState = 1;
        console.log = jest.fn();
        console.error = jest.fn();
    });

    describe('initializeMongoDBSchema', () => {
        it('should initialize all Prisma collections', async () => {
            await initializeMongoDBSchema();

            expect(mockEnsureCollectionsExist).toHaveBeenCalledWith(PRISMA_COLLECTIONS);
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('MongoDB schema initialization complete')
            );
        });

        it('should skip initialization for PostgreSQL', async () => {
            mockConfig.DB_TYPE = 'postgresql';

            await initializeMongoDBSchema();

            expect(mockEnsureCollectionsExist).not.toHaveBeenCalled();
            expect(console.log).toHaveBeenCalledWith(
                'Schema initialization skipped - not using MongoDB'
            );
        });

        it('should throw error if database not connected', async () => {
            mockMongoose.connection.readyState = 0; // disconnected

            await expect(initializeMongoDBSchema()).rejects.toThrow(
                'Cannot initialize MongoDB schema - database not connected'
            );

            expect(mockEnsureCollectionsExist).not.toHaveBeenCalled();
        });

        it('should throw error if collection creation fails', async () => {
            const error = new Error('Connection lost');
            mockEnsureCollectionsExist.mockRejectedValueOnce(error);

            await expect(initializeMongoDBSchema()).rejects.toThrow('Connection lost');
            expect(console.error).toHaveBeenCalledWith(
                'Failed to initialize MongoDB schema:',
                'Connection lost'
            );
        });

        it('should log start and completion messages', async () => {
            await initializeMongoDBSchema();

            expect(console.log).toHaveBeenCalledWith(
                'Initializing MongoDB schema - ensuring all collections exist...'
            );
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('13 collections verified')
            );
        });
    });

    describe('getPrismaCollections', () => {
        it('should return array of collection names', () => {
            const collections = getPrismaCollections();

            expect(Array.isArray(collections)).toBe(true);
            expect(collections.length).toBe(13);
            expect(collections).toContain('User');
            expect(collections).toContain('Credential');
            expect(collections).toContain('Integration');
        });

        it('should return a copy of the array', () => {
            const collections1 = getPrismaCollections();
            const collections2 = getPrismaCollections();

            expect(collections1).toEqual(collections2);
            expect(collections1).not.toBe(collections2);
        });
    });

    describe('PRISMA_COLLECTIONS constant', () => {
        it('should include all expected collections', () => {
            const expectedCollections = [
                'User',
                'Token',
                'Credential',
                'Entity',
                'Integration',
                'IntegrationMapping',
                'Process',
                'Sync',
                'DataIdentifier',
                'Association',
                'AssociationObject',
                'State',
                'WebsocketConnection',
            ];

            expect(PRISMA_COLLECTIONS).toEqual(expectedCollections);
        });

        it('should have correct count of collections', () => {
            expect(PRISMA_COLLECTIONS.length).toBe(13);
        });
    });
});
