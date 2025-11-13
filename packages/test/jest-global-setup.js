const { TestMongo } = require('./mongodb');
const {overrideEnvironment} = require('./override-environment');

/**
 * Global Jest setup
 *
 * MongoDB Memory Server is only started for integration tests that need a real database.
 * Unit tests use mocked Prisma clients and don't need MongoDB.
 *
 * To run integration tests: npm test -- --group=integration
 * Or set: TEST_TYPE=integration npm test
 */
module.exports = async function () {
    if (!process.env.STAGE) {
        overrideEnvironment({ STAGE: 'dev' });
    }

    // Check if this is an integration test run
    const isIntegrationTest =
        process.argv.some(arg => arg.includes('--group=integration')) ||
        process.env.TEST_TYPE === 'integration' ||
        process.env.REQUIRE_MONGODB === 'true';

    if (isIntegrationTest) {
        console.log('Starting MongoDB Memory Server for integration tests...');
        global.testMongo = new TestMongo();
        await global.testMongo.start();
    } else {
        console.log('Skipping MongoDB Memory Server (unit tests use mocked clients)');
        global.testMongo = null;
    }
};
