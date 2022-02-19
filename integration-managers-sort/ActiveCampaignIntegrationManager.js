const IntegrationManager = require('@friggframework/core/managers/IntegrationManager');
const { debug } = require('@friggframework/logs');

class ActiveCampaignIntegrationManager extends IntegrationManager {
    static Config = {
        name: 'activecampaign',
        version: '1.0.0',
        supportedVersions: ['1.0.0'],
        events: ['EXAMPLE_EVENT'],
    };

    constructor(params) {
        super(params);
    }

    /**
     * ALL REQUIRED METHODS FOR AN INTEGRATION MANAGER
     */
    async processCreate(params) {
        // Validate that we have all of the data we need
        // Set integration status as makes sense. Default ENABLED
        debug('processCreate() called on the ActiveCampaign Manager');
        // TODO turn this into a validateConfig method/function
        this.integration.status = 'NEEDS_CONFIG';
        await this.integration.save();
    }

    async processDelete(params) {
        debug('processDelete() called on the ActiveCampaign Manager');
    }

    async getSampleData() {
        const contactsResponse = await this.targetInstance.api.listContacts();
        const slimResponse = contactsResponse.contacts.map((c) => ({
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email,
            phone: c.phone,
            cdate: c.cdate,
            udate: c.udate,
        }));
        return { data: slimResponse };
    }
}

module.exports = ActiveCampaignIntegrationManager;
