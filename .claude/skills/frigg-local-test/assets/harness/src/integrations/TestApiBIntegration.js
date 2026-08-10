const { IntegrationBase, createFriggCommands } = require('@friggframework/core');
const testApiB = require('../api-modules/test-api-b');

class TestApiBIntegration extends IntegrationBase {
    static Definition = {
        name: 'test-api-b',
        version: '1.0.0',
        supportedVersions: ['1.0.0'],
        display: {
            label: 'Test API B',
            description: 'Test API B integration for the local test environment',
            category: 'Testing',
            detailsUrl: 'https://example.com/test-api-b',
            icon: '',
        },
        modules: {
            testApiB: { definition: testApiB.Definition },
        },
    };

    constructor(params) {
        super(params);

        this.commands = createFriggCommands({
            integrationClass: TestApiBIntegration,
        });

        this.events = {
            ...this.events,
            FETCH_DATA: {
                type: 'USER_ACTION',
                handler: this.fetchData.bind(this),
            },
        };
    }

    async onCreate({ integrationId }) {
        await this.updateIntegrationStatus.execute(integrationId, 'ENABLED');
    }

    async fetchData() {
        return this.testApiB?.api
            ? this.testApiB.api.fetchData()
            : { status: 'no-api' };
    }
}

module.exports = TestApiBIntegration;
