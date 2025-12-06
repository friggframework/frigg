const { IntegrationBase } = require('@friggframework/core');
const { Definition: FormBasedMockDefinition } = require('../api-modules/formBasedMockModule');

class FormBasedIntegration extends IntegrationBase {
    static Definition = {
        name: 'form-based-integration',
        version: '1.0.0',
        supportedVersions: ['>=1.0.0'],
        modules: {
            formBasedMock: {
                definition: FormBasedMockDefinition,
                options: {},
            },
        },
        display: {
            name: 'Form-Based Integration',
            description: 'Test integration using form-based multi-step authentication',
            icon: 'form-icon',
        },
    };

    async onCreate({ integrationId }) {
        await this.updateIntegrationStatus.execute(integrationId, 'NEEDS_CONFIG');
    }

    async getConfigOptions() {
        return {
            jsonSchema: {
                type: 'object',
                properties: {
                    defaultWorkspace: { type: 'string', title: 'Default Workspace' },
                },
                required: ['defaultWorkspace'],
            },
            uiSchema: {},
        };
    }

    async testAuth() {
        let success = true;
        if (this.formBasedMock) {
            try {
                await this.formBasedMock.testAuth();
            } catch {
                success = false;
            }
        }
        return success;
    }
}

module.exports = { FormBasedIntegration };
