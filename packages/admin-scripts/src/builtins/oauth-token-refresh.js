const { AdminScriptBase } = require('../application/admin-script-base');

/**
 * OAuth Token Refresh Script
 *
 * Refreshes OAuth tokens for integrations that are near expiry.
 * This helps prevent authentication failures due to expired tokens.
 */
class OAuthTokenRefreshScript extends AdminScriptBase {
    static Definition = {
        name: 'oauth-token-refresh',
        version: '1.0.0',
        description: 'Refreshes OAuth tokens for integrations near expiry',
        source: 'BUILTIN',

        inputSchema: {
            type: 'object',
            properties: {
                integrationIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                        'Specific integration IDs to refresh (optional, defaults to all)',
                },
                expiryThresholdHours: {
                    type: 'number',
                    default: 24,
                    description:
                        'Refresh tokens expiring within this many hours',
                },
                dryRun: {
                    type: 'boolean',
                    default: false,
                    description: 'Preview without making changes',
                },
            },
        },

        outputSchema: {
            type: 'object',
            properties: {
                refreshed: { type: 'number' },
                failed: { type: 'number' },
                skipped: { type: 'number' },
                details: { type: 'array' },
            },
        },

        config: {
            timeout: 600000, // 10 minutes
            requireIntegrationInstance: true, // Needs to call external APIs
        },

        // UI-specific overrides
        display: {
            category: 'maintenance',
        },
    };

    async execute(params = {}) {
        const {
            integrationIds = null,
            expiryThresholdHours = 24,
            dryRun = false,
        } = params;

        const results = {
            refreshed: 0,
            failed: 0,
            skipped: 0,
            details: [],
        };

        this.context.log('info', 'Starting OAuth token refresh', {
            expiryThresholdHours,
            dryRun,
            specificIds: integrationIds?.length || 'all',
        });

        // Get integrations to check
        let integrations;
        if (integrationIds && integrationIds.length > 0) {
            integrations = await Promise.all(
                integrationIds.map((id) =>
                    this.context.integrationRepository
                        .findIntegrationById(id)
                        .catch(() => null)
                )
            );
            integrations = integrations.filter(Boolean);
        } else {
            // Get all integrations (this would need to be paginated for large deployments)
            integrations = await this.getAllIntegrations();
        }

        this.context.log(
            'info',
            `Found ${integrations.length} integrations to check`
        );

        for (const integration of integrations) {
            try {
                const detail = await this.processIntegration(integration, {
                    expiryThresholdHours,
                    dryRun,
                });

                results.details.push(detail);

                if (detail.action === 'refreshed') {
                    results.refreshed++;
                } else if (detail.action === 'skipped') {
                    results.skipped++;
                } else if (detail.action === 'failed') {
                    results.failed++;
                }
            } catch (error) {
                this.context.log(
                    'error',
                    `Error processing integration ${integration.id}`,
                    {
                        error: error.message,
                    }
                );
                results.failed++;
                results.details.push({
                    integrationId: integration.id,
                    action: 'failed',
                    reason: error.message,
                });
            }
        }

        this.context.log('info', 'OAuth token refresh completed', {
            refreshed: results.refreshed,
            failed: results.failed,
            skipped: results.skipped,
        });

        return results;
    }

    async getAllIntegrations() {
        // This is a simplified implementation
        // In production, would need pagination for large datasets
        return this.context.integrationRepository.findIntegrations({});
    }

    async processIntegration(integration, options) {
        const { expiryThresholdHours, dryRun } = options;

        // Check prerequisites
        const skipReason = this._checkRefreshPrerequisites(
            integration,
            expiryThresholdHours
        );
        if (skipReason) {
            return this._createResult(integration.id, 'skipped', skipReason);
        }

        // Handle dry run
        if (dryRun) {
            this.context.log(
                'info',
                `[DRY RUN] Would refresh token for ${integration.id}`
            );
            return this._createResult(
                integration.id,
                'skipped',
                'Dry run - would have refreshed'
            );
        }

        // Perform refresh
        return this._performTokenRefresh(integration);
    }

    /**
     * Check if integration meets prerequisites for token refresh
     * @private
     * @returns {string|null} Skip reason or null if eligible
     */
    _checkRefreshPrerequisites(integration, expiryThresholdHours) {
        if (!integration.config?.credentials?.access_token) {
            return 'No OAuth credentials found';
        }

        const expiresAt = integration.config?.credentials?.expires_at;
        if (!expiresAt) {
            return 'No expiry time found';
        }

        const expiryTime = new Date(expiresAt);
        const thresholdTime = new Date(
            Date.now() + expiryThresholdHours * 60 * 60 * 1000
        );

        if (expiryTime > thresholdTime) {
            return 'Token not near expiry';
        }

        return null;
    }

    /**
     * Perform the actual token refresh
     * @private
     */
    async _performTokenRefresh(integration) {
        const expiresAt = integration.config?.credentials?.expires_at;

        try {
            const instance = await this.context.instantiate(integration.id);

            if (!instance.primary?.api?.refreshAccessToken) {
                return this._createResult(
                    integration.id,
                    'skipped',
                    'API does not support token refresh'
                );
            }

            await instance.primary.api.refreshAccessToken();
            this.context.log(
                'info',
                `Refreshed token for integration ${integration.id}`
            );

            return {
                integrationId: integration.id,
                action: 'refreshed',
                previousExpiry: expiresAt,
            };
        } catch (error) {
            this.context.log(
                'error',
                `Failed to refresh token for ${integration.id}`,
                {
                    error: error.message,
                }
            );
            return this._createResult(integration.id, 'failed', error.message);
        }
    }

    /**
     * Create a result object
     * @private
     */
    _createResult(integrationId, action, reason) {
        return { integrationId, action, reason };
    }
}

module.exports = { OAuthTokenRefreshScript };
