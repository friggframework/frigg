const { TestMongo } = require('./mongodb');
const {overrideEnvironment} = require('./override-environment');

module.exports = async function () {
    overrideEnvironment({'STAGE': 'dev'})
    global.testMongo = new TestMongo();
    await global.testMongo.start();
};
