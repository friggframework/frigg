const LHIntegrationManager = require('../../base/managers/LHIntegrationManager');
const _ = require('lodash');

class HubSpotIntegrationManager extends LHIntegrationManager {
    static Config = {
        name: 'hubspot',
        version: '1.0.0',
        supportedVersions: ['1.0.0'],
        events: ['EXAMPLE_EVENT'],
    };

    constructor(params) {
        super(params);
    }

    /**
     * HANDLE EVENTS
     */
    async receiveNotification(notifier, event, object = null) {
        this.primaryInstance = notifier.primaryInstance;
        this.targetInstance = notifier.targetInstance;
        this.integration = notifier.integration;
    }

    /**
     * ALL CUSTOM/OPTIONAL METHODS FOR AN INTEGRATION MANAGER
     */

    /**
     * ALL REQUIRED METHODS FOR AN INTEGRATION MANAGER
     */
    async processCreate(params) {
        // Validate that we have all of the data we need
        // Set integration status as makes sense. Default ENABLED

        // TODO turn this into a validateConfig method/function
        this.integration.status = 'NEEDS_CONFIG';
        await this.integration.save();
    }

    async processUpdate(params) {}

    async processDelete(params) {}

    async getConfigOptions() {}

    async getSampleData() {
        const contactsResponse = await this.targetInstance.api.listContacts();
        const slimResponse = contactsResponse.results.map((c) => ({
            id: c.id,
            firstName: c.properties.firstname,
            lastName: c.properties.lastname,
            email: c.properties.email,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
        }));
        return { data: slimResponse };
    }
}

module.exports = HubSpotIntegrationManager;
