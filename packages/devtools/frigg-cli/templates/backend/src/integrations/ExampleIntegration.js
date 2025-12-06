/**
 * Example Integration
 *
 * This is a template showing how to create an Integration class.
 * An Integration connects your application with a third-party API module.
 *
 * To create your own integration:
 * 1. Install the API module: npm install @friggframework/api-module-<name>
 * 2. Copy this file and rename it (e.g., SalesforceIntegration.js)
 * 3. Update the imports and class to use your API module
 * 4. Register it in index.js
 */

const { Integration } = require('@friggframework/core');
// const { Api, Entity } = require('@friggframework/api-module-example');

class ExampleIntegration extends Integration {
    static Config = {
        name: 'example',
        version: '1.0.0',
        supportedVersions: ['1.0.0'],

        // Events this integration can emit
        events: ['SYNC_COMPLETED', 'DATA_UPDATED', 'ERROR_OCCURRED'],
    };

    /**
     * Create API instance for this integration
     * @param {Object} params - Parameters from the credential
     */
    static async getInstance(params) {
        // Return your API module instance
        // return new Api(params);
        throw new Error('ExampleIntegration.getInstance() not implemented');
    }

    /**
     * Process incoming webhook events
     * @param {Object} event - The webhook event data
     */
    async processWebhook(event) {
        // Handle webhook events from the third-party service
        console.log('Processing webhook:', event);
    }

    /**
     * Perform initial sync after user connects
     * @param {Object} options - Sync options
     */
    async initialSync(options = {}) {
        // Sync initial data from the third-party service
        console.log('Performing initial sync');
    }

    /**
     * Handle OAuth callback
     * @param {Object} callbackParams - OAuth callback parameters
     */
    async handleCallback(callbackParams) {
        // Process OAuth callback and store credentials
        console.log('Handling OAuth callback');
    }
}

module.exports = ExampleIntegration;
