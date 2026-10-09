const { IntegrationBase } = require('../../integration-base');

class ConfigCapturingModule {
    static definition = {
        getName: () => 'config-capturing-module'
    };
}

class ConfigCapturingIntegration extends IntegrationBase {
    static Definition = {
        name: 'config-capturing',
        version: '1.0.0',
        modules: {
            primary: ConfigCapturingModule
        },
        display: {
            label: 'Config Capturing Integration',
            description: 'Test double for capturing config state during updates',
            detailsUrl: 'https://example.com',
            icon: 'test-icon'
        }
    };

    static _capturedOnUpdateState = null;

    static resetCaptures() {
        this._capturedOnUpdateState = null;
    }

    static getCapturedOnUpdateState() {
        return this._capturedOnUpdateState;
    }

    constructor(params) {
        super(params);
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

    async initialize() {
        this.registerEventHandlers();
    }

    async onUpdate(params) {
        ConfigCapturingIntegration._capturedOnUpdateState = {
            thisConfig: JSON.parse(JSON.stringify(this.config)),
            paramsConfig: params.config
        };

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
}

module.exports = { ConfigCapturingIntegration };
