/**
 * Frigg Infrastructure Configuration
 *
 * This file exports the serverless configuration for your Frigg application.
 * The createFriggInfrastructure function reads your app definition and
 * generates the appropriate serverless.yml configuration.
 */

const { createFriggInfrastructure } = require('@friggframework/devtools');

// Serverless supports async configuration by exporting a promise
module.exports = createFriggInfrastructure();
