const { Delegate, Integration, get } = require('@friggframework/core');

class Migrator extends Delegate {
  constructor(params) {
    super(params);
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
    try {
      const fromVersion = get(params, "fromVersion", null);
      const toVersion = get(params, "toVersion");

      console.log("Migrate called. First validating whether it can be done.");
      if (
        !this.integrationManager.Config.supportedVersions.some(
          (version) => version === toVersion
        )
      ) {
        return this.throwException(
          `Attempting to migrate to an unsupported version. Current supported versions are ${this.integrationManager.Config.supportedVersions.join(
            ", "
          )}`,
          "Migration Error"
        );
      }
      const migrationOption = this.options
        .map((val) => val.get())
        .find(
          (option) =>
            option.fromVersion === fromVersion && option.toVersion === toVersion
        );
      if (!migrationOption)
        return this.throwException(
          `No migration option found for version ${fromVersion} to ${toVersion}`,
          "Migration Error"
        );
      // Run all general functions
      for (const generalFunct of migrationOption.generalFunctions) {
        console.log("Running general functions first");
        const res = await generalFunct();
        console.log(res);
      }
      // Get all integration records based on fromVersion
      const filter = {
        "config.type": this.integrationManager.getName(),
      };
      console.log(
        `Retrieved all ${this.integrationManager.getName()} integrations`
      );

      const integrations = await Integration.find(filter);
      const filteredIntegrations = integrations.filter((int) => {
        const isNotToVersion = int.version !== toVersion;
        let isFromVersion = true;
        if (fromVersion && fromVersion !== "*") {
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
        let integrationManagerInstance;
        try {
          integrationManagerInstance =
            await this.integrationManager.getInstanceFromIntegrationId({
              integrationId: integration.id,
              userId: integration.user.id,
            });
        } catch (e) {
          console.log(e);
        }
        // Test Auth
        if (integrationManagerInstance) {
          await integrationManagerInstance.testAuth();

          // Run functions
          if (integrationManagerInstance.integration.status !== "ERROR") {
            for (const func of migrationOption.perIntegrationFunctions) {
              const res = await func(integrationManagerInstance);
              console.log(res);
            }
          }

          // Validate Config
          if (integrationManagerInstance.integration.status !== "ERROR") {
            await integrationManagerInstance.validateConfig();
          }

          // Add to results tally
          const currentStatus = integrationManagerInstance.integration.status;
          if (currentStatus === "ENABLED") {
            integrationManagerInstance.integration.version = toVersion;
            await integrationManagerInstance.integration.save();
            results.migrationResults.success += 1;
          }
          if (currentStatus === "NEEDS_CONFIG") {
            integrationManagerInstance.integration.version = toVersion;
            await integrationManagerInstance.integration.save();
            results.migrationResults.needsConfig += 1;
          }
          if (currentStatus === "ERROR") results.migrationResults.error += 1;
        }
      }

      const freshRetrieve = await Integration.find(filter);
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
    } catch (e) {
      this.throwException(e.message, "Migrate Error");
    }
  }
}

module.exports = Migrator;
