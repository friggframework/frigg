/**
 * Frigg Application Definition
 * 
 * This file defines your Frigg application configuration.
 * Modify the integrations array to include the API modules you want to use.
 */

// Import your integrations here
// const ExampleIntegration = require('./src/integrations/ExampleIntegration');

const appDefinition = {
    integrations: [
        // Add your integrations here as you install them
        // Example:
        // ExampleIntegration,
    ],
    user: {
        password: true
    },
    encryption: {
        useDefaultKMSForFieldLevelEncryption: true
    },
    vpc: {
        enable: true
    },
    security: {
        cors: {
            origin: 'http://localhost:3000',
            credentials: true
        }
    },
    logging: {
        level: 'info'
    },
    custom: {
        appName: 'My Frigg Application',
        version: '1.0.0',
        environment: 'development'
    }
};

module.exports = appDefinition;