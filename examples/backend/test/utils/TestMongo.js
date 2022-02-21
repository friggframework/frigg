const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { connectToDatabase } = require('../../src/models/db');

class TestMongo {
    static mongoServer;
    static client;
    static originalUri;

    // Start the in-memory mongo instance and set env variable for the app to use in its connection.
    static async connect() {
        TestMongo.mongoServer = await MongoMemoryServer.create();
        TestMongo.originalUri = process.env.MONGO_URI;
        process.env.MONGO_URI = TestMongo.mongoServer.getUri();
        await connectToDatabase();
    }

    static async stop() {
        await mongoose.disconnect();
        await TestMongo.mongoServer.stop();
        process.env.MONGO_URI = TestMongo.originalUri;
        TestMongo.client = undefined;
        TestMongo.mongoServer = undefined;
    }
}

module.exports = {
    mochaHooks: {
        async beforeAll() {
            await TestMongo.connect();
        },
        async afterAll() {
            await TestMongo.stop();
        },
    },

    TestMongo,
};
