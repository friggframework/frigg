const { TestMongo } = require('@friggframework/test');
const { cleanupDatabase } = require('./db-cleanup');

let mongoServer;

beforeAll(async () => {
    mongoServer = new TestMongo();
    await mongoServer.start();
    process.env.STAGE = 'test';
    process.env.HEALTH_API_KEY = 'test-key';
});

afterEach(async () => {
    await cleanupDatabase();
});

afterAll(async () => {
    if (mongoServer) {
        await mongoServer.stop();
    }
});
