const { restoreEnvironment } = require('./override-environment')
module.exports = async function () {
    restoreEnvironment();
    await global.testMongo.stop();
};
