const { MongoMemoryServer } = require('mongodb-memory-server');

// Pin the MongoDB binary instead of relying on the library default. The old
// default (5.0.19) only ships Ubuntu 20.04 builds that link against OpenSSL
// 1.1 (libcrypto.so.1.1), which Ubuntu 24.04 (GitHub's ubuntu-latest) no
// longer ships, so the server failed to start in CI. MongoDB 8.0 has native
// Ubuntu 24.04 builds. MONGOMS_VERSION still overrides this for local use.
const MONGODB_BINARY_VERSION = process.env.MONGOMS_VERSION || '8.0.17';

class TestMongo {
    #mongoServer;

    // Start the in-memory mongo instance and set env variable for the app to use in its connection.
    async start() {
        this.#mongoServer = await MongoMemoryServer.create({
            binary: { version: MONGODB_BINARY_VERSION },
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
    MONGODB_BINARY_VERSION,
};
