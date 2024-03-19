const hubspotMigrator = require("./HubSpotMigrator");
const salesforceMigrator = require("./SalesforceMigrator");

class MigrationManager {
  static migratorClasses = [hubspotMigrator, salesforceMigrator];

  static integrationTypes = MigrationManager.migratorClasses.map(
    (MigratorClass) => MigratorClass.getName()
  );

  constructor() {
    // ...
  }

  static async getMigrator(params) {
    const { integrationType, fromVersion, toVersion } = params;
    const indexOfMigrator =
      MigrationManager.integrationTypes.indexOf(integrationType);
    if (indexOfMigrator < 0) {
      throw new Error(
        `Error: Invalid integration type of ${
          params.integrationType
        }, options are ${MigrationManager.integrationTypes.join(", ")}`
      );
    }
    const instance = await MigrationManager.migratorClasses[
      indexOfMigrator
    ].getInstance();
    return instance;
  }
}

module.exports = MigrationManager;
