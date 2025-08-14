const { IntegrationBase } = require('../../integration-base');

class DummyModule {
    static definition = {
        getName: () => 'dummy'
    };
}

class DummyIntegration extends IntegrationBase {
    static Definition = {
        name: 'dummy',
        version: '1.0.0',
        modules: {
            dummy: DummyModule
        },
        display: {
            label: 'Dummy Integration',
            description: 'A dummy integration for testing',
            detailsUrl: 'https://example.com',
            icon: 'dummy-icon'
        }
    };

    static getOptionDetails() {
        return {
            name: this.Definition.name,
            version: this.Definition.version,
            display: this.Definition.display
        };
    }

    constructor(params) {
        super(params);
        this.sendSpy = jest.fn();
        this.eventCallHistory = [];
        this.events = {};

        this.integrationRepository = {
            updateIntegrationById: jest.fn().mockResolvedValue({}),
            findIntegrationById: jest.fn().mockResolvedValue({}),
        };

        this.updateIntegrationStatus = {
            execute: jest.fn().mockResolvedValue({})
        };

        this.updateIntegrationMessages = {
            execute: jest.fn().mockResolvedValue({})
        };

        this.registerEventHandlers();
    }

    async loadDynamicUserActions() {
        return {};
    }

    async registerEventHandlers() {
        super.registerEventHandlers();
        return;
    }

    async send(event, data) {
        this.sendSpy(event, data);
        this.eventCallHistory.push({ event, data, timestamp: Date.now() });
        return super.send(event, data);
    }

    async initialize() {
        return;
    }

    async onCreate({ integrationId }) {
        return;
    }

    async onUpdate(params) {
        return;
    }

    async onDelete(params) {
        return;
    }

    getConfig() {
        return this.config || {};
    }
}

module.exports = { DummyIntegration }; 