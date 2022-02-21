const LHDelegate = require('../LHDelegate');
const Integration = require('../models/Integration');

class LHMigrator extends LHDelegate {
    constructor(params) {
        super(params);
        this.integrationMO = new Integration();
        this.options = [];
    }

    static getInstance() {
        const instance = new this();
        return instance;
    }

    static getName() {
        return this.integrationManager.getName();
    }

    async migrate(params) {
        const fromVersion = this.getParam(params, 'fromVersion', null);
        const toVersion = this.getParam(params, 'toVersion');

        if (
            !this.integrationManager.Config.supportedVersions.some(
                (version) => version === toVersion
            )
        ) {
            throw new Error(
                `Attempting to migrate to an unsupported version. Current supported versions are ${this.integrationManager.Config.supportedVersions.join(
                    ', '
                )}`
            );
        }
        const migrationOption = this.options
            .map((val) => val.get())
            .find(
                (option) =>
                    option.fromVersion === fromVersion &&
                    option.toVersion === toVersion
            );
        if (!migrationOption)
            throw new Error(
                `No migration option found for version ${fromVersion} to ${toVersion}`
            );
        // Run all general functions
        for (const generalFunct of migrationOption.generalFunctions) {
            await generalFunct();
        }
        // Get all integration records based on fromVersion
        const filter = {
            'config.type': this.integrationManager.getName(),
        };

        const integrations = await this.integrationMO.list(filter);
        const filteredIntegrations = integrations.filter((int) => {
            const isNotToVersion = int.version !== toVersion;
            let isFromVersion = true;
            if (fromVersion && fromVersion !== '*') {
                isFromVersion = int.version === fromVersion;
            }
            return isNotToVersion && isFromVersion;
        });
        const results = {
            integrationType: this.integrationManager.getName(),
            totalIntegrations: integrations.length,
            versionReport: {
                startVersions: {},
                endVersions: {},
            },
            statusReport: {
                startStatuses: {},
                endStatuses: {},
            },
            toMigrate: filteredIntegrations.length,
            migrationResults: {
                success: 0,
                needsConfig: 0,
                error: 0,
            },
        };

        for (const integration of integrations) {
            if (results.versionReport.startVersions[integration.version]) {
                results.versionReport.startVersions[integration.version] += 1;
            } else {
                results.versionReport.startVersions[integration.version] = 1;
            }
            if (results.statusReport.startStatuses[integration.status]) {
                results.statusReport.startStatuses[integration.status] += 1;
            } else {
                results.statusReport.startStatuses[integration.status] = 1;
            }
        }

        // Instantiate the integrationManager based on integration ID, run all specific functions for each integration
        for (const integration of filteredIntegrations) {
            const integrationManagerInstance =
                await this.integrationManager.getInstanceFromIntegrationId({
                    integrationId: integration.id,
                    userId: integration.user.id,
                });

            // Test Auth
            if (integrationManagerInstance) {
                await integrationManagerInstance.testAuth();

                // Run functions
                if (integrationManagerInstance.integration.status !== 'ERROR') {
                    for (const func of migrationOption.perIntegrationFunctions) {
                        await func(integrationManagerInstance);
                    }
                }

                // Validate Config
                if (integrationManagerInstance.integration.status !== 'ERROR') {
                    await integrationManagerInstance.validateConfig();
                }

                // Add to results tally
                const currentStatus =
                    integrationManagerInstance.integration.status;
                if (currentStatus === 'ENABLED') {
                    integrationManagerInstance.integration.version = toVersion;
                    await integrationManagerInstance.integration.save();
                    results.migrationResults.success += 1;
                }
                if (currentStatus === 'NEEDS_CONFIG') {
                    integrationManagerInstance.integration.version = toVersion;
                    await integrationManagerInstance.integration.save();
                    results.migrationResults.needsConfig += 1;
                }
                if (currentStatus === 'ERROR')
                    results.migrationResults.error += 1;
            }
        }

        const freshRetrieve = await this.integrationMO.list(filter);
        for (const int of freshRetrieve) {
            if (results.versionReport.endVersions[int.version]) {
                results.versionReport.endVersions[int.version] += 1;
            } else {
                results.versionReport.endVersions[int.version] = 1;
            }
            if (results.statusReport.endStatuses[int.status]) {
                results.statusReport.endStatuses[int.status] += 1;
            } else {
                results.statusReport.endStatuses[int.status] = 1;
            }
        }

        return results;
    }
}

module.exports = LHMigrator;
