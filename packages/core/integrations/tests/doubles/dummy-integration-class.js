const { IntegrationBase } = require('../../integration-base');
const { Options } = require('../../options');

class DummyModule {
    static definition = {
        getName: () => 'dummy',
    };
}

class DummyIntegration extends IntegrationBase {
    static Definition = {
        name: 'dummy',
        version: '1.0.0',
        modules: {
            dummy: DummyModule,
        },
        display: {
            label: 'Dummy Integration',
            description: 'A dummy integration for testing',
            detailsUrl: 'https://example.com',
            icon: 'dummy-icon',
        },
    };

    static getOptionDetails() {
        const options = new Options({
            module: Object.values(this.Definition.modules)[0],
            ...this.Definition,
        });
        return {
            name: this.Definition.name,
            version: this.Definition.version,
            ...options.get(),
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
            execute: jest.fn().mockResolvedValue({}),
        };

        this.updateIntegrationMessages = {
            execute: jest.fn().mockResolvedValue({}),
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

class DummyIntegrationWithGlobalEntity extends IntegrationBase {
    static Definition = {
        name: 'dummy-with-global',
        version: '1.0.0',
        modules: { dummy: DummyModule },
        display: { label: 'Dummy With Global', description: 'Test' },
        entities: {
            sharedService: {
                type: 'shared-api',
                global: true,
                required: true,
            },
        },
    };

    constructor(params) {
        super(params);
        this.sendSpy = jest.fn();
        this.integrationRepository = {
            updateIntegrationById: jest.fn().mockResolvedValue({}),
            findIntegrationById: jest.fn().mockResolvedValue({}),
        };
        this.updateIntegrationStatus = { execute: jest.fn().mockResolvedValue({}) };
        this.updateIntegrationMessages = { execute: jest.fn().mockResolvedValue({}) };
    }

    async loadDynamicUserActions() { return {}; }
    async send(event, data) { this.sendSpy(event, data); return { event, data }; }
    async initialize() { return; }
    async onCreate() { return; }
}

class DummyIntegrationWithOptionalGlobalEntity extends IntegrationBase {
    static Definition = {
        name: 'dummy-with-optional-global',
        version: '1.0.0',
        modules: { dummy: DummyModule },
        display: { label: 'Dummy With Optional Global', description: 'Test' },
        entities: {
            optionalService: {
                type: 'optional-api',
                global: true,
                required: false,
            },
        },
    };

    constructor(params) {
        super(params);
        this.sendSpy = jest.fn();
        this.integrationRepository = {
            updateIntegrationById: jest.fn().mockResolvedValue({}),
            findIntegrationById: jest.fn().mockResolvedValue({}),
        };
        this.updateIntegrationStatus = { execute: jest.fn().mockResolvedValue({}) };
        this.updateIntegrationMessages = { execute: jest.fn().mockResolvedValue({}) };
    }

    async loadDynamicUserActions() { return {}; }
    async send(event, data) { this.sendSpy(event, data); return { event, data }; }
    async initialize() { return; }
    async onCreate() { return; }
}

module.exports = {
    DummyIntegration,
    DummyIntegrationWithGlobalEntity,
    DummyIntegrationWithOptionalGlobalEntity,
};
