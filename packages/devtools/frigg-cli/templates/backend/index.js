/**
 * Frigg Application Definition
 *
 * This is the entry point for your Frigg backend. The exported `Definition`
 * object is read by `infrastructure.js` (via `createFriggInfrastructure()`) to
 * compose your serverless infrastructure, and by the Frigg runtime to wire up
 * your integrations, database, encryption, and HTTP handlers.
 *
 * Add integrations with `frigg install <module>` (e.g. `frigg install hubspot`),
 * which installs the API module and scaffolds an integration file under
 * `src/integrations/`.
 *
 * See https://docs.friggframework.org for the full app-definition reference.
 */

'use strict';

// Import your integrations here
// const ExampleIntegration = require('./src/integrations/ExampleIntegration');

const appDefinition = {
    // Human-friendly name for this Frigg application.
    name: 'frigg-app',

    // The integrations this application exposes. Each entry is an
    // IntegrationBase subclass. Install modules with `frigg install <module>`.
    integrations: [
        // Add your integrations here as you install them
        // Example:
        // ExampleIntegration,
    ],

    // User model. Password auth is enabled by default so the Management UI and
    // API can authenticate users out of the box.
    user: {
        usePassword: true,
    },

    // Field-level encryption for sensitive data (credentials, tokens, mappings).
    // KMS is recommended for production; encryption is automatically bypassed in
    // the dev/test/local stages. Set to 'aes' to use AES with AES_KEY/AES_KEY_ID.
    encryption: {
        fieldLevelEncryptionMethod: 'kms',
    },

    // Database. Enable exactly one backend. PostgreSQL/Aurora is shown here;
    // set `mongoDB: { enable: true }` instead to use MongoDB. The connection
    // string comes from the DATABASE_URL environment variable.
    database: {
        postgres: {
            enable: true,
            management: 'discover',
        },
    },

    // VPC deployment. Enable for production so Lambdas run in private subnets.
    vpc: {
        enable: false,
    },
};

module.exports = { Definition: appDefinition };
