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

    // Infrastructure ownership for `frigg deploy`. With 'managed' +
    // 'isolated', each stage's stack creates (or, on later deploys, reuses)
    // its own VPC, KMS key and Aurora PostgreSQL cluster, so a first deploy
    // works in an empty AWS account. See README.md to reuse existing resources
    // instead. Local development (`frigg start`, `frigg build`) skips AWS
    // discovery and these resources entirely.
    managementMode: 'managed',
    vpcIsolation: 'isolated',

    // Database. Enable exactly one backend. Locally, the connection string
    // comes from DATABASE_URL in `.env` (any PostgreSQL works, e.g. Docker).
    // When deployed, Frigg provisions Aurora PostgreSQL and sets DATABASE_URL.
    // Set `mongoDB: { enable: true }` instead to use MongoDB.
    database: {
        postgres: {
            enable: true,
        },
    },

    // VPC deployment: Lambdas run in private subnets so they can reach Aurora.
    vpc: {
        enable: true,
    },
};

module.exports = { Definition: appDefinition };
