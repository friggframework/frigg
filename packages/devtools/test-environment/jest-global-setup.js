const { TestMongo } = require('./mongodb');

module.exports = async function () {
    global.testMongo = new TestMongo();
    await global.testMongo.start();
};
