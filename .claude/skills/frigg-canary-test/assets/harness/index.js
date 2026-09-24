/**
 * Frigg App Definition for the canary test harness.
 *
 * Registers the two test integrations used to exercise framework behavior
 * (e.g. FindIntegrationContextByExternalEntityId) against a real PostgreSQL DB.
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
        type: 'postgresql',
    },
};

module.exports = { Definition };
