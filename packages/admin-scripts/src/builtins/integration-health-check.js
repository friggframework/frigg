const { AdminScriptBase } = require('../application/admin-script-base');

/**
 * Integration Health Check Script
 *
 * Checks the health of integrations by verifying:
 * - Credential validity
 * - API connectivity
 * - Configuration integrity
 */
class IntegrationHealthCheckScript extends AdminScriptBase {
    static Definition = {
        name: 'integration-health-check',
        version: '1.0.0',
        description: 'Checks health of integrations and reports issues',
        source: 'BUILTIN',

        inputSchema: {
            type: 'object',
            properties: {
                integrationIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Specific integration IDs to check (optional, defaults to all)'
                },
                checkCredentials: {
                    type: 'boolean',
                    default: true,
                    description: 'Verify credential validity'
                },
                checkConnectivity: {
                    type: 'boolean',
                    default: true,
                    description: 'Test API connectivity'
                },
                updateStatus: {
                    type: 'boolean',
                    default: false,
                    description: 'Update integration status based on health'
                }
            }
        },

        outputSchema: {
            type: 'object',
            properties: {
                healthy: { type: 'number' },
                unhealthy: { type: 'number' },
                unknown: { type: 'number' },
                results: { type: 'array' }
            }
        },

        config: {
            timeout: 900000, // 15 minutes
            maxRetries: 0,
            requiresIntegrationFactory: true,
        },

        schedule: {
            enabled: false,  // Can be enabled via API
            cronExpression: 'cron(0 6 * * ? *)', // Daily at 6 AM UTC
        },

        display: {
            label: 'Integration Health Check',
            description: 'Check health and connectivity of integrations',
            category: 'maintenance',
        },
    };

    async execute(frigg, params = {}) {
        const {
            integrationIds = null,
            checkCredentials = true,
            checkConnectivity = true,
            updateStatus = false
        } = params;

        const summary = {
            healthy: 0,
            unhealthy: 0,
            unknown: 0,
            results: []
        };

        frigg.log('info', 'Starting integration health check', {
            checkCredentials,
            checkConnectivity,
            updateStatus,
            specificIds: integrationIds?.length || 'all'
        });

        // Get integrations to check
        let integrations;
        if (integrationIds && integrationIds.length > 0) {
            integrations = await Promise.all(
                integrationIds.map(id => frigg.findIntegrationById(id).catch(() => null))
            );
            integrations = integrations.filter(Boolean);
        } else {
            integrations = await this.getAllIntegrations(frigg);
        }

        frigg.log('info', `Checking ${integrations.length} integrations`);

        for (const integration of integrations) {
            const result = await this.checkIntegration(frigg, integration, {
                checkCredentials,
                checkConnectivity
            });

            summary.results.push(result);

            if (result.status === 'healthy') {
                summary.healthy++;
            } else if (result.status === 'unhealthy') {
                summary.unhealthy++;
            } else {
                summary.unknown++;
            }

            // Optionally update integration status
            if (updateStatus && result.status !== 'unknown') {
                try {
                    const newStatus = result.status === 'healthy' ? 'ACTIVE' : 'ERROR';
                    await frigg.updateIntegrationStatus(integration.id, newStatus);
                    frigg.log('info', `Updated status for ${integration.id} to ${newStatus}`);
                } catch (error) {
                    frigg.log('warn', `Failed to update status for ${integration.id}`, {
                        error: error.message
                    });
                }
            }
        }

        frigg.log('info', 'Health check completed', {
            healthy: summary.healthy,
            unhealthy: summary.unhealthy,
            unknown: summary.unknown
        });

        return summary;
    }

    async getAllIntegrations(frigg) {
        return frigg.listIntegrations({});
    }

    async checkIntegration(frigg, integration, options) {
        const { checkCredentials, checkConnectivity } = options;

        const result = {
            integrationId: integration.id,
            integrationType: integration.config?.type || 'unknown',
            status: 'unknown',
            checks: {},
            issues: []
        };

        try {
            // Check credentials
            if (checkCredentials) {
                const credCheck = this.checkCredentialValidity(integration);
                result.checks.credentials = credCheck;
                if (!credCheck.valid) {
                    result.issues.push(credCheck.issue);
                }
            }

            // Check connectivity
            if (checkConnectivity) {
                const connCheck = await this.checkApiConnectivity(frigg, integration);
                result.checks.connectivity = connCheck;
                if (!connCheck.valid) {
                    result.issues.push(connCheck.issue);
                }
            }

            // Determine overall status
            if (result.issues.length === 0) {
                result.status = 'healthy';
            } else {
                result.status = 'unhealthy';
            }

        } catch (error) {
            frigg.log('error', `Error checking integration ${integration.id}`, {
                error: error.message
            });
            result.status = 'unknown';
            result.issues.push(`Check failed: ${error.message}`);
        }

        return result;
    }

    checkCredentialValidity(integration) {
        const result = { valid: true, issue: null };

        // Check for access token
        if (!integration.config?.credentials?.access_token) {
            result.valid = false;
            result.issue = 'Missing access token';
            return result;
        }

        // Check for expiry
        const expiresAt = integration.config?.credentials?.expires_at;
        if (expiresAt) {
            const expiryTime = new Date(expiresAt);
            if (expiryTime < new Date()) {
                result.valid = false;
                result.issue = 'Access token expired';
                return result;
            }
        }

        return result;
    }

    async checkApiConnectivity(frigg, integration) {
        const result = { valid: true, issue: null, responseTime: null };

        try {
            const startTime = Date.now();
            const instance = await frigg.instantiate(integration.id);

            // Try to make a simple API call
            if (instance.primary?.api?.getAuthenticationInfo) {
                await instance.primary.api.getAuthenticationInfo();
            } else if (instance.primary?.api?.getCurrentUser) {
                await instance.primary.api.getCurrentUser();
            } else {
                // No suitable health check method
                result.valid = true;
                result.issue = null;
                result.note = 'No health check endpoint available';
                return result;
            }

            result.responseTime = Date.now() - startTime;
        } catch (error) {
            result.valid = false;
            result.issue = `API connectivity failed: ${error.message}`;
        }

        return result;
    }
}

module.exports = { IntegrationHealthCheckScript };
