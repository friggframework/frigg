const { MongoMemoryServer } = require('mongodb-memory-server');

class TestMongo {
    #mongoServer;

    // Start the in-memory mongo instance and set env variable for the app to use in its connection.
    async start() {
        this.#mongoServer = await MongoMemoryServer.create();
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
