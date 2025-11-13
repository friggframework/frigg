/**
 * Tests for MongoDB Schema Initialization
 */

// Mock dependencies - must be defined before require statements due to Jest hoisting
jest.mock('../mongoose', () => ({
    mongoose: {
        connection: {
            readyState: 1, // connected
        },
    },
}));

const mockEnsureCollectionsExist = jest.fn().mockResolvedValue(undefined);
const mockGetCollectionsFromSchemaSync = jest.fn().mockReturnValue([
    'User', 'Token', 'Credential', 'Entity', 'Integration',
    'IntegrationMapping', 'Process', 'Sync', 'DataIdentifier',
    'Association', 'AssociationObject', 'State', 'WebsocketConnection'
]);

jest.mock('./mongodb-collection-utils', () => ({
    ensureCollectionsExist: mockEnsureCollectionsExist,
}));

jest.mock('./prisma-schema-parser', () => ({
    getCollectionsFromSchemaSync: mockGetCollectionsFromSchemaSync,
}));

jest.mock('../config', () => ({
    DB_TYPE: 'mongodb',
}));

const {
    initializeMongoDBSchema,
    getPrismaCollections,
} = require('./mongodb-schema-init');

const { mongoose } = require('../mongoose');
const config = require('../config');

/**
 * @group unit
 * @group infrastructure
 */
describe('MongoDB Schema Initialization', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Reset mongoose connection state to connected
        mongoose.connection.readyState = 1;

        // Reset config to MongoDB
        config.DB_TYPE = 'mongodb';

        console.log = jest.fn();
        console.error = jest.fn();
        console.warn = jest.fn();

        // Reset mock to default return value
        mockGetCollectionsFromSchemaSync.mockReturnValue([
            'User', 'Token', 'Credential', 'Entity', 'Integration',
            'IntegrationMapping', 'Process', 'Sync', 'DataIdentifier',
            'Association', 'AssociationObject', 'State', 'WebsocketConnection'
        ]);
    });

    describe('initializeMongoDBSchema', () => {
        it('should dynamically parse and initialize all Prisma collections', async () => {
            await initializeMongoDBSchema();

            expect(mockGetCollectionsFromSchemaSync).toHaveBeenCalled();
            expect(mockEnsureCollectionsExist).toHaveBeenCalledWith([
                'User', 'Token', 'Credential', 'Entity', 'Integration',
                'IntegrationMapping', 'Process', 'Sync', 'DataIdentifier',
                'Association', 'AssociationObject', 'State', 'WebsocketConnection'
            ]);
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('MongoDB schema initialization complete')
            );
        });

        it('should skip initialization for PostgreSQL', async () => {
            config.DB_TYPE = 'postgresql';

            await initializeMongoDBSchema();

            expect(mockEnsureCollectionsExist).not.toHaveBeenCalled();
            expect(console.log).toHaveBeenCalledWith(
                'Schema initialization skipped - not using MongoDB'
            );
        });

        it('should throw error if database not connected', async () => {
            mongoose.connection.readyState = 0; // disconnected

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

        it('should skip initialization if no collections found in schema', async () => {
            mockGetCollectionsFromSchemaSync.mockReturnValue([]);

            await initializeMongoDBSchema();

            expect(mockEnsureCollectionsExist).not.toHaveBeenCalled();
            expect(console.warn).toHaveBeenCalledWith(
                'No collections found in Prisma schema - skipping initialization'
            );
        });
    });

    describe('getPrismaCollections', () => {
        it('should return array of collection names from schema parser', () => {
            const collections = getPrismaCollections();

            expect(mockGetCollectionsFromSchemaSync).toHaveBeenCalled();
            expect(Array.isArray(collections)).toBe(true);
            expect(collections.length).toBe(13);
            expect(collections).toContain('User');
            expect(collections).toContain('Credential');
            expect(collections).toContain('Integration');
        });

        it('should return empty array and warn if schema parsing fails', () => {
            mockGetCollectionsFromSchemaSync.mockImplementation(() => {
                throw new Error('Schema file not found');
            });

            const collections = getPrismaCollections();

            expect(collections).toEqual([]);
            expect(console.warn).toHaveBeenCalledWith(
                'Could not parse Prisma collections:',
                'Schema file not found'
            );
        });
    });
});
