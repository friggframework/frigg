const { TestMongo } = require("@friggframework/test-environment");

module.exports = async () => {
  global.testMongo = new TestMongo();
  await global.testMongo.start();
};
