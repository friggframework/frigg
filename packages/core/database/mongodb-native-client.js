/**
 * Native MongoDB Client for DocumentDB Compatibility
 * Infrastructure adapter - bypasses Prisma's $$REMOVE operator usage
 */

const { MongoClient } = require('mongodb');

class MongoDBNativeClient {
    constructor() {
        this.client = null;
        this.db = null;
        this.isConnected = false;
    }

    async connect() {
        if (this.isConnected) {
            return;
        }

        const connectionString = process.env.MONGO_URI || process.env.DATABASE_URL;
        
        if (!connectionString) {
            throw new Error(
                'MongoDB connection string not found. Set MONGO_URI or DATABASE_URL environment variable.'
            );
        }

        const url = new URL(connectionString);
        const params = url.searchParams;

        const options = {
            readPreference: 'primary',
            retryWrites: params.get('retryWrites') === 'true',
            tls: params.get('tls') === 'true' || params.get('ssl') === 'true',
        };

        const tlsCAFile = params.get('tlsCAFile');
        if (tlsCAFile) {
            options.tlsCAFile = tlsCAFile;
        }

        this.client = new MongoClient(connectionString, options);
        await this.client.connect();
        this.db = this.client.db();
        this.isConnected = true;
        
        console.log('✓ Native MongoDB client connected');
    }

    async disconnect() {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.db = null;
            this.isConnected = false;
            console.log('✓ Native MongoDB client disconnected');
        }
    }

    collection(collectionName) {
        if (!this.isConnected || !this.db) {
            throw new Error(
                'MongoDB client not connected. Call connect() first.'
            );
        }

        return this.db.collection(collectionName);
    }

    async runCommand(command) {
        if (!this.isConnected || !this.db) {
            throw new Error(
                'MongoDB client not connected. Call connect() first.'
            );
        }

        return await this.db.command(command);
    }
}

let _nativeMongoClientInstance = null;

function getNativeMongoClient() {
    if (!_nativeMongoClientInstance) {
        _nativeMongoClientInstance = new MongoDBNativeClient();
    }
    return _nativeMongoClientInstance;
}

function _resetSingleton() {
    if (_nativeMongoClientInstance) {
        _nativeMongoClientInstance.disconnect().catch(() => {});
        _nativeMongoClientInstance = null;
    }
}

module.exports = {
    MongoDBNativeClient,
    getNativeMongoClient,
    _resetSingleton,
};

