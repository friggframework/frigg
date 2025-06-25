const { TestMongo } = require('@friggframework/devtools');
require('dotenv');
module.exports = async () => {
    global.testMongo = new TestMongo();
    await global.testMongo.start();
};
