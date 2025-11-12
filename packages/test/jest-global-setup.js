const { TestMongo } = require('./mongodb');
const { overrideEnvironment } = require('./override-environment');

module.exports = async function () {
    if (!process.env.STAGE) {
        overrideEnvironment({ STAGE: 'dev' });
    }

    // Only start MongoDB for integration tests
    // Unit tests should not depend on MongoDB
    const isIntegrationTest =
        process.argv.includes('--group=integration') || process.env.TEST_TYPE === 'integration';

    if (isIntegrationTest || (!process.argv.includes('--group=unit') && !process.env.TEST_TYPE)) {
        global.testMongo = new TestMongo();
        await global.testMongo.start();
    } else {
        console.log('Skipping MongoDB setup for unit tests');
    }
};
