/**
 * Tests for Native MongoDB Client
 * Infrastructure layer - handles MongoDB/DocumentDB connections
 */

const { MongoDBNativeClient, getNativeMongoClient } = require('./mongodb-native-client');

// Mock MongoDB driver
jest.mock('mongodb', () => ({
    MongoClient: jest.fn(),
}));

describe('MongoDBNativeClient', () => {
    let mockMongoClient;
    let mockDb;
    let mockCollection;
    let originalEnv;

    beforeEach(() => {
        originalEnv = { ...process.env };
        
        // Mock MongoDB collection
        mockCollection = {
            findOne: jest.fn(),
            find: jest.fn(),
            insertOne: jest.fn(),
            updateOne: jest.fn(),
            deleteOne: jest.fn(),
        };

        // Mock MongoDB database
        mockDb = {
            collection: jest.fn().mockReturnValue(mockCollection),
            command: jest.fn(),
        };

        // Mock MongoDB client
        mockMongoClient = {
            connect: jest.fn().mockResolvedValue(undefined),
            db: jest.fn().mockReturnValue(mockDb),
            close: jest.fn().mockResolvedValue(undefined),
        };

        const { MongoClient } = require('mongodb');
        MongoClient.mockImplementation(() => mockMongoClient);
    });

    afterEach(() => {
        process.env = originalEnv;
        jest.clearAllMocks();
    });

    describe('Constructor', () => {
        it('should initialize with null client and db', () => {
            const client = new MongoDBNativeClient();

            expect(client.client).toBeNull();
            expect(client.db).toBeNull();
            expect(client.isConnected).toBe(false);
        });
    });

    describe('connect()', () => {
        it('should connect to MongoDB using MONGO_URI', async () => {
            process.env.MONGO_URI = 'mongodb://localhost:27017/test';
            delete process.env.DATABASE_URL;

            const client = new MongoDBNativeClient();
            await client.connect();

            const { MongoClient } = require('mongodb');
            expect(MongoClient).toHaveBeenCalledWith(
                'mongodb://localhost:27017/test',
                expect.objectContaining({
                    readPreference: 'primary',
                })
            );
            expect(mockMongoClient.connect).toHaveBeenCalled();
            expect(client.isConnected).toBe(true);
        });

        it('should connect using DATABASE_URL if MONGO_URI not set', async () => {
            delete process.env.MONGO_URI;
            process.env.DATABASE_URL = 'mongodb://host:27017/db';

            const client = new MongoDBNativeClient();
            await client.connect();

            const { MongoClient } = require('mongodb');
            expect(MongoClient).toHaveBeenCalledWith(
                'mongodb://host:27017/db',
                expect.any(Object)
            );
        });

        it('should configure DocumentDB-specific options', async () => {
            process.env.MONGO_URI = 'mongodb://host.docdb.amazonaws.com:27017/test?tls=true&retryWrites=false';

            const client = new MongoDBNativeClient();
            await client.connect();

            const { MongoClient } = require('mongodb');
            expect(MongoClient).toHaveBeenCalledWith(
                expect.stringContaining('docdb.amazonaws.com'),
                expect.objectContaining({
                    readPreference: 'primary',
                    retryWrites: false,
                    tls: true,
                })
            );
        });

        it('should throw error if no connection string found', async () => {
            delete process.env.MONGO_URI;
            delete process.env.DATABASE_URL;

            const client = new MongoDBNativeClient();

            await expect(client.connect()).rejects.toThrow(
                'MongoDB connection string not found'
            );
        });

        it('should not connect twice', async () => {
            process.env.MONGO_URI = 'mongodb://localhost:27017/test';

            const client = new MongoDBNativeClient();
            await client.connect();
            await client.connect(); // Second call

            expect(mockMongoClient.connect).toHaveBeenCalledTimes(1);
        });
    });

    describe('disconnect()', () => {
        it('should close MongoDB connection', async () => {
            process.env.MONGO_URI = 'mongodb://localhost:27017/test';

            const client = new MongoDBNativeClient();
            await client.connect();
            await client.disconnect();

            expect(mockMongoClient.close).toHaveBeenCalled();
            expect(client.isConnected).toBe(false);
        });

        it('should handle disconnect when not connected', async () => {
            const client = new MongoDBNativeClient();

            await expect(client.disconnect()).resolves.not.toThrow();
        });
    });

    describe('collection()', () => {
        it('should return MongoDB collection', async () => {
            process.env.MONGO_URI = 'mongodb://localhost:27017/test';

            const client = new MongoDBNativeClient();
            await client.connect();
            const collection = client.collection('Credential');

            expect(mockDb.collection).toHaveBeenCalledWith('Credential');
            expect(collection).toBe(mockCollection);
        });

        it('should throw error if not connected', () => {
            const client = new MongoDBNativeClient();

            expect(() => client.collection('Credential')).toThrow(
                'MongoDB client not connected'
            );
        });
    });

    describe('Singleton - getNativeMongoClient()', () => {
        it('should return singleton instance', () => {
            const client1 = getNativeMongoClient();
            const client2 = getNativeMongoClient();

            expect(client1).toBe(client2);
        });

        it('should create new instance on first call', () => {
            // Clear singleton
            const module = require('./mongodb-native-client');
            module._resetSingleton();

            const client = getNativeMongoClient();

            expect(client).toBeInstanceOf(MongoDBNativeClient);
        });
    });
});

