/**
 * Tests for MongoDB Schema Initialization
 */

const mockEnsureCollectionsExist = jest.fn().mockResolvedValue(undefined);
const mockGetCollectionsFromSchemaSync = jest.fn().mockReturnValue([
    'User', 'Token', 'Credential', 'Entity', 'Integration',
    'IntegrationMapping', 'Process', 'Sync', 'DataIdentifier',
    'Association', 'AssociationObject', 'State', 'WebsocketConnection'
]);

const mockConfig = {
    DB_TYPE: 'mongodb',
};

jest.mock('../prisma', () => ({
    prisma: { $runCommandRaw: jest.fn().mockResolvedValue({ ok: 1 }) },
}));

jest.mock('./mongodb-collection-utils', () => ({
    ensureCollectionsExist: mockEnsureCollectionsExist,
}));

jest.mock('./prisma-schema-parser', () => ({
    getCollectionsFromSchemaSync: mockGetCollectionsFromSchemaSync,
}));

jest.mock('../config', () => mockConfig);

const { prisma: mockPrisma } = require('../prisma');
const {
    initializeMongoDBSchema,
    getPrismaCollections,
} = require('./mongodb-schema-init');

describe('MongoDB Schema Initialization', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockConfig.DB_TYPE = 'mongodb';
        mockPrisma.$runCommandRaw.mockResolvedValue({ ok: 1 });
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
                expect.stringContaining('MongoDB-compatible schema initialization complete')
            );
        });

        it('should skip initialization for PostgreSQL', async () => {
            mockConfig.DB_TYPE = 'postgresql';

            await initializeMongoDBSchema();

            expect(mockEnsureCollectionsExist).not.toHaveBeenCalled();
            expect(console.log).toHaveBeenCalledWith(
                'Schema initialization skipped - not using MongoDB-compatible database'
            );
        });

        it('should initialize for DocumentDB', async () => {
            mockConfig.DB_TYPE = 'documentdb';

            await initializeMongoDBSchema();

            expect(mockEnsureCollectionsExist).toHaveBeenCalled();
        });

        it('should throw error if database not connected', async () => {
            mockPrisma.$runCommandRaw.mockRejectedValueOnce(new Error('Connection refused'));

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
                'Initializing MongoDB-compatible schema - ensuring all collections exist...'
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
