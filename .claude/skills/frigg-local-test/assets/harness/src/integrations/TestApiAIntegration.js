const { IntegrationBase, createFriggCommands } = require('@friggframework/core');
const testApiA = require('../api-modules/test-api-a');

class TestApiAIntegration extends IntegrationBase {
    static Definition = {
        name: 'test-api-a',
        version: '1.0.0',
        supportedVersions: ['1.0.0'],
        display: {
            label: 'Test API A',
            description: 'Test API A integration for the local test environment',
            category: 'Testing',
            detailsUrl: 'https://example.com/test-api-a',
            icon: '',
        },
        modules: {
            // Module entries use the { definition } wrapper so Frigg's
            // getModulesDefinitionFromIntegrationClasses can read .definition.
            // The key (testApiA) is how the module attaches to `this`
            // (this.testApiA.api).
            testApiA: { definition: testApiA.Definition },
        },
    };

    constructor(params) {
        super(params);

        // Public command factory (createIntegrationCommands is internal).
        this.commands = createFriggCommands({
            integrationClass: TestApiAIntegration,
        });

        this.events = {
            ...this.events,
            LIST_ITEMS: {
                type: 'USER_ACTION',
                handler: this.listItems.bind(this),
            },
            FIND_INTEGRATION_BY_EXTERNAL_ID: {
                type: 'USER_ACTION',
                handler: this.findIntegrationByExternalId.bind(this),
            },
        };
    }

    async onCreate({ integrationId }) {
        await this.updateIntegrationStatus.execute(integrationId, 'ENABLED');
    }

    async listItems() {
        return this.testApiA?.api ? this.testApiA.api.listItems() : [];
    }

    /**
     * USER ACTION: Find integration context by external entity ID.
     *
     * Inputs are sourced from the integration itself (not from user params):
     *  - `type` from this integration's own config (`this.config.type`)
     *  - `externalId` from the bound entity (`this.entities[0].externalId`),
     *    which Frigg populates when the instance is hydrated with its context.
     *
     * Requires loading the integration context first, then dispatching.
     */
    async findIntegrationByExternalId() {
        const type = this.config?.type;
        const externalId = this.entities?.[0]?.externalId;

        console.log(
            `[TestApiAIntegration] Finding integration by externalId=${externalId}, type=${type}`
        );

        const result = await this.commands.findIntegrationContextByExternalEntityId({
            externalId,
            type,
        });

        if (result.error) {
            const error = new Error(result.reason);
            error.code = result.code;
            throw error;
        }

        console.log(
            `[TestApiAIntegration] Found integration: id=${result.record.id}, type=${result.record.config.type}`
        );

        return {
            success: true,
            integrationId: result.record.id,
            integrationType: result.record.config.type,
            entityId: result.entity.id,
            entityExternalId: result.entity.externalId,
        };
    }
}

module.exports = TestApiAIntegration;
