// Core's unit suites must not need a database, so this global setup only
// sets the test environment. It deliberately does not start an in-memory
// MongoDB (as @friggframework/test's globalSetup does): nothing in the default
// suite talks to a live server, and a binary that failed to start used to stop
// every core suite from running. Suites that need a real database are
// `*.db.test.js` files, run by `npm run test:db` (see jest.db.config.js).
const { overrideEnvironment } = require('@friggframework/test');

module.exports = async function () {
    if (!process.env.STAGE) {
        overrideEnvironment({ STAGE: 'dev' });
    }
};
