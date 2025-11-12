const { restoreEnvironment } = require('./override-environment');

module.exports = async function () {
    restoreEnvironment();

    // Only stop MongoDB if it was started
    if (global.testMongo) {
        await global.testMongo.stop();
    }
};
