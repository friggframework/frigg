/**
 * Frigg App Definition for the local test harness.
 *
 * Registers the mock integrations used to exercise framework behavior
 * (integration lifecycle, user actions, credential/delegate notifications,
 * sync) against a real database (PostgreSQL or MongoDB via Docker).
 *
 * This is a minimal app definition — the same shape a `frigg init` app uses —
 * but with mock API modules instead of real third-party connectors.
 */
const TestApiAIntegration = require('./src/integrations/TestApiAIntegration');
const TestApiBIntegration = require('./src/integrations/TestApiBIntegration');

const Definition = {
    integrations: [TestApiAIntegration, TestApiBIntegration],
    user: {
        usePassword: true,
        primary: 'individual',
    },
    database: {
        type: process.env.DB_TYPE || 'postgresql',
    },
};

module.exports = { Definition };
