import { IntegrationBase } from '../../integration-base';

class DummyModule {
    static definition = {
        getName: () => 'dummy'
    };
}

export class DummyIntegration extends IntegrationBase {
    static Definition: any = {
        name: 'dummy',
        version: '1.0.0',
        supportedVersions: ['1.0.0'],
        modules: {
            dummy: DummyModule as any
        },
        display: {
            name: 'dummy',
            label: 'Dummy Integration',
            description: 'A dummy integration for testing',
            detailsUrl: 'https://example.com',
            icon: 'dummy-icon'
        }
    };

    sendSpy: jest.Mock;
    eventCallHistory: any[];
    events: Record<string, any>;

    static getOptionDetails(): any {
        return {
            name: this.Definition.name,
            version: this.Definition.version,
            display: this.Definition.display
        };
    }

    constructor(params: any) {
        super(params);
        this.sendSpy = jest.fn();
        this.eventCallHistory = [];
        this.events = {};

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

    async loadDynamicUserActions() {
        return {};
    }

    async send(event: string, data: any) {
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

    async onCreate({ integrationId }: { integrationId: string }) {
        return;
    }

    async onUpdate(params: any) {
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

    async onDelete(params: any) {
        return;
    }

    getConfig(): any {
        return this.config || {};
    }
}
