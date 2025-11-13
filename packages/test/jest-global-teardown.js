const { restoreEnvironment } = require('./override-environment')

/**
 * Global Jest teardown
 *
 * Only stops MongoDB if it was started (integration tests only)
 */
module.exports = async function () {
    restoreEnvironment();

    if (global.testMongo) {
        console.log('Stopping MongoDB Memory Server...');
        await global.testMongo.stop();
    }
};
