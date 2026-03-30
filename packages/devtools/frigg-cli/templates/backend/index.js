/**
 * Frigg Application Definition
 *
 * This file defines your Frigg integration application.
 * Configure integrations, authentication, and infrastructure settings here.
 */

// Import your integrations here
// const ExampleIntegration = require('./src/integrations/ExampleIntegration');

const appDefinition = {
    // Application metadata
    label: 'My Frigg Application',
    name: 'my-frigg-app',

    // Deployment mode: 'managed' (recommended) or 'custom'
    managementMode: 'managed',

    // VPC isolation strategy: 'isolated' (each stage separate) or 'shared'
    vpcIsolation: 'isolated',

    // Your integrations - add Integration classes here
    integrations: [
        // Add your integrations here as you install them
        // Example:
        // ExampleIntegration,
    ],

    // User authentication configuration
    user: {
        usePassword: true,
        primary: 'organization',
        individualUserRequired: true,
        organizationUserRequired: true,
        authModes: {
            friggToken: true, // Support web UI login
            sharedSecret: true, // Enable backend-to-backend API communication
            adopterJwt: false, // Set true to use your own JWT tokens
        },
    },

    // Encryption settings
    encryption: {
        fieldLevelEncryptionMethod: 'kms', // KMS encryption for production
    },

    // VPC configuration
    vpc: {
        enable: true,
        enableVPCEndpoints: true,
        selfHeal: true,
    },

    // Database configuration (PostgreSQL via Aurora Serverless)
    database: {
        postgres: {
            enable: true,
            publiclyAccessible: false,
            database: 'postgres',
            minCapacity: 0.5,
            maxCapacity: 1,
        },
    },

    // SSM Parameter Store (optional)
    ssm: {
        enable: false,
    },

    // Environment variables required by your application
    // Set these in your .env file or deployment environment
    environment: {
        // Core Configuration
        BASE_URL: true,
        DATABASE_URL: true,
        DATABASE_USER: true,
        DATABASE_PASSWORD: true,
        REDIRECT_URI: true,
        HEALTH_API_KEY: true,
        ADMIN_API_KEY: true,
        FRIGG_API_KEY: true,
        FRIGG_APP_USER_ID: true,

        // AWS Configuration
        AWS_REGION: true,
        S3_BUCKET_NAME: true,

        // Add your integration-specific environment variables here
        // EXAMPLE_CLIENT_ID: true,
        // EXAMPLE_CLIENT_SECRET: true,
    },
};

module.exports = {
    Definition: appDefinition,
};
