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
        this.testAuthSpy = jest.fn();
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
    }

    async loadDynamicUserActions() {
        return {};
    }

    async send(event, data) {
        this.sendSpy(event, data);
        this.eventCallHistory.push({ event, data, timestamp: Date.now() });
        if (event === 'ON_UPDATE') {
            await this.onUpdate(data);
        }
        return { event, data };
    }

    async initialize() {
        return;
    }

    async testAuth() {
        this.testAuthSpy();
    }

    async onCreate({ integrationId }) {
        return;
    }

    async onUpdate(params) {
        this.config = this._deepMerge(this.config, params.config);
    }

    _deepMerge(target, source) {
        const result = { ...target };
        for (const key of Object.keys(source)) {
            if (
                source[key] !== null &&
                typeof source[key] === 'object' &&
                !Array.isArray(source[key]) &&
                target[key] !== null &&
                typeof target[key] === 'object' &&
                !Array.isArray(target[key])
            ) {
                result[key] = this._deepMerge(target[key], source[key]);
            } else {
                result[key] = source[key];
            }
        }
        return result;
    }

    async onDelete(params) {
        return;
    }

    getConfig() {
        return this.config || {};
    }
}

module.exports = { DummyIntegration }; 