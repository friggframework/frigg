const LHIntegrationManager = require('../../base/managers/LHIntegrationManager');

class MarketoIntegrationManager extends LHIntegrationManager {
    static Config = {
        name: 'marketo',
        version: '1.0.0',
        supportedVersions: ['1.0.0'],
        events: ['EXAMPLE_EVENT'],
    };

    constructor(params) {
        super(params);
    }

    async receiveNotification(notifier, event, object = null) {}

    async processCreate(params) {}

    async processUpdate(params) {}

    async processDelete(params) {}

    async getConfigOptions() {
        return [];
    }

    /*async retrieveSampleData(sampleType) {
        const { name } = MarketoIntegrationManager.Config;
        const entityManager =
            this.primaryInstance.getName() === name
                ? this.primaryInstance
                : this.targetInstance;
        const { api } = entityManager.instance;

        if (sampleType === 'lead details') {
            return await api.getLeadDetails();
        }

        throw new Error(`No sample data for '${sampleType}'`);
    }*/

    async getSampleData() {
        const leadsResponse = await this.targetInstance.api.getLeads();
        const slimResponse = leadsResponse.result.map((l) => ({
            id: l.id,
            lastName: l.lastName,
            firstName: l.firstName,
        }));
        return { data: slimResponse };
    }
}

module.exports = MarketoIntegrationManager;
