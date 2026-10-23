const { MongoMemoryServer } = require('mongodb-memory-server');

// mongodb-memory-server 8 defaults to MongoDB 5.0.19, whose Linux build links
// libcrypto.so.1.1. Ubuntu 24.04 (GitHub's ubuntu-latest since Oct 2026) ships
// only OpenSSL 3, so that mongod cannot start. 7.0 publishes Ubuntu 24.04
// builds. MONGOMS_VERSION still overrides it.
const MONGODB_VERSION = '7.0.14';

class TestMongo {
    #mongoServer;

    // Start the in-memory mongo instance and set env variable for the app to use in its connection.
    async start() {
        this.#mongoServer = await MongoMemoryServer.create({
            binary: { version: process.env.MONGOMS_VERSION || MONGODB_VERSION },
            // The library's default, ephemeralForTest, was removed in MongoDB 7.
            instance: { storageEngine: 'wiredTiger' },
        });
        process.env.MONGO_URI = this.#mongoServer.getUri();
        console.log('Started in memory mongo server', process.env.MONGO_URI);
    }

    async stop() {
        await this.#mongoServer.stop();
        process.env.MONGO_URI = undefined;
        this.#mongoServer = undefined;
    }
}

module.exports = {
    TestMongo,
};
