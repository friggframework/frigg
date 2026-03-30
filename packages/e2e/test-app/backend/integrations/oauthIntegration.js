const { IntegrationBase } = require('@friggframework/core');
const { Definition: OAuth2MockDefinition } = require('../api-modules/oauth2MockModule');

class OAuthIntegration extends IntegrationBase {
    static Definition = {
        name: 'oauth-integration',
        version: '1.0.0',
        supportedVersions: ['>=1.0.0'],
        modules: {
            oauth2Mock: {
                definition: OAuth2MockDefinition,
                options: {},
            },
        },
        display: {
            name: 'OAuth Integration',
            description: 'Test integration using OAuth2 authentication',
            icon: 'oauth-icon',
        },
    };

    async onCreate({ integrationId }) {
        await this.updateIntegrationStatus.execute(integrationId, 'ENABLED');
    }

    async getConfigOptions() {
        return {
            jsonSchema: {
                type: 'object',
                properties: {
                    syncEnabled: { type: 'boolean', title: 'Enable Sync' },
                    syncInterval: { type: 'number', title: 'Sync Interval (minutes)' },
                },
            },
            uiSchema: {},
        };
    }

    async testAuth() {
        let success = true;
        if (this.oauth2Mock) {
            try {
                await this.oauth2Mock.testAuth();
            } catch {
                success = false;
            }
        }
        return success;
    }
}

module.exports = { OAuthIntegration };
