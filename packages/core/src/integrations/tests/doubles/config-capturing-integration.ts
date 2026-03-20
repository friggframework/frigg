import { IntegrationBase } from '../../integration-base';

class ConfigCapturingModule {
    static readonly definition = {
        getName: () => 'config-capturing-module'
    };
}

export class ConfigCapturingIntegration extends IntegrationBase {
    static readonly Definition: any = {
        name: 'config-capturing',
        version: '1.0.0',
        supportedVersions: ['1.0.0'],
        modules: {
            primary: ConfigCapturingModule as any
        },
        display: {
            name: 'config-capturing',
            label: 'Config Capturing Integration',
            description: 'Test double for capturing config state during updates',
            detailsUrl: 'https://example.com',
            icon: 'test-icon'
        }
    };

    static _capturedOnUpdateState: any = null;

    static resetCaptures() {
        this._capturedOnUpdateState = null;
    }

    static getCapturedOnUpdateState() {
        return this._capturedOnUpdateState;
    }

    constructor(params: any) {
        super(params);
        this.integrationRepository = {
            updateIntegrationById: jest.fn().mockResolvedValue({}),
            findIntegrationById: jest.fn().mockResolvedValue({}),
        } as any;
        this.updateIntegrationStatus = {
            execute: jest.fn().mockResolvedValue({})
        } as any;
        this.updateIntegrationMessages = {
            execute: jest.fn().mockResolvedValue({})
        } as any;
    }

    async initialize() {
        this.registerEventHandlers();
    }

    async onUpdate(params: any) {
        ConfigCapturingIntegration._capturedOnUpdateState = {
            thisConfig: JSON.parse(JSON.stringify(this.config)),
            paramsConfig: params.config
        };

        this.config = this._deepMerge(this.config, params.config);
    }

    _deepMerge(target: any, source: any): any {
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
