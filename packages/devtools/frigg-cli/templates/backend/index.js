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

    // Users: one individual user per login, with a username and password.
    // `POST /user/create` registers a user and `POST /user/login` returns a
    // bearer token for the integration and entity routes. Spell out every
    // field: core reads this block as written (schema defaults such as
    // `individualUserRequired: true` are not applied), and login fails
    // unless individual or organization users are required.
    user: {
        usePassword: true,
        primary: 'individual',
        individualUserRequired: true,
        organizationUserRequired: false,
    },

    // ------------------------------------------------------------------
    // Deployment defaults: near $0 while idle.
    // `frigg deploy` creates no always-on resources (no VPC, NAT gateway,
    // VPC endpoints, Elastic IP or database cluster); everything it creates
    // is pay-per-use, plus one KMS key ($1/month, about $3/month once it has
    // been rotated twice). README.md lists every resource and the other
    // options (Frigg-managed Aurora, private VPC).
    // Local development (`frigg start`, `frigg build`) skips AWS entirely.
    // ------------------------------------------------------------------

    // Field-level encryption for sensitive data (credential tokens and
    // secrets, integration mappings, password hashes, auth tokens), using a
    // customer-managed KMS key that `frigg deploy` creates for each stage.
    // Keep this set explicitly: without it no KMS key is created. Deployed
    // stages always encrypt; only local runs (`frigg start`) and tests skip
    // it. See README.md for the exact fields.
    encryption: {
        fieldLevelEncryptionMethod: 'kms',
    },

    // Frigg owns the AWS resources it needs, and each stage gets its own
    // (here: the KMS key), so a first deploy works in an empty AWS account.
    managementMode: 'managed',
    vpcIsolation: 'isolated',

    // Lambdas run outside a VPC and reach SQS, KMS and other AWS APIs over
    // AWS's public endpoints with IAM auth and TLS, and your database over
    // its own endpoint (TLS via `sslmode=require`). There is nothing inside a
    // VPC to protect, so a VPC would only add cost.
    vpc: {
        enable: false,
    },

    // Database: PostgreSQL that you bring. `management: 'external'` tells
    // Frigg to create no database (no RDS/Aurora); the app connects through
    // DATABASE_URL. Locally that is any PostgreSQL in `.env` (e.g. Docker).
    // When deploying, set DATABASE_URL to a hosted PostgreSQL (free tiers
    // exist) with `sslmode=require`. To use MongoDB instead, replace this with
    // `mongoDB: { enable: true }, postgres: { enable: false }`.
    database: {
        postgres: {
            enable: true,
            management: 'external',
        },
    },

    // Environment variables copied into the deployed Lambdas. `frigg deploy`
    // reads them from the shell or CI job that runs it, NOT from `.env`
    // (which only `frigg start` and `frigg db:setup` read). An unset variable
    // deploys as an empty string.
    environment: {
        DATABASE_URL: true,
    },

    // CloudWatch Logs: expire each Lambda log group after 14 days. Without a
    // retention period the log groups keep everything forever. Raise it (any
    // CloudWatch value: 30, 90, 365, ...) if you need longer history.
    logging: {
        retentionInDays: 14,
    },

    // SSM Parameter Store offload is off. Enable it when your app variables
    // outgrow the 4 KB Lambda environment limit.
    ssm: {
        enable: false,
    },
};

module.exports = { Definition: appDefinition };
