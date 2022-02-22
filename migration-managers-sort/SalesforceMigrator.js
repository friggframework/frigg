const { Migrator, Options } = require('@friggframework/migrations');
const IntegrationManager = require('../integrations/SalesforceIntegrationManager');
const CompanySync = require('../../syncs/sync/CompanySync');
const ContactSync = require('../../syncs/sync/ContactSync');
const { debug } = require('@friggframework/logs');

class SalesforceMigrator extends Migrator {
    static integrationManager = IntegrationManager;

    constructor(params) {
        super(params);
        this.integrationManager = SalesforceMigrator.integrationManager;
        this.options = [
            new Options({
                integrationManager: SalesforceMigrator.integrationManager,
                fromVersion: '*',
                toVersion: '1.0.0',
                perIntegrationFunctions: [
                    // this.setupSyncObjects,
                ],
                generalFunctions: [this.rotateAesKey],
            }),
        ];
    }

    async rotateAesKey() {
        const credentialMO =
            new (require('../../modules/Salesforce/models/Credential'))();
        const allSalesforceCreds = await credentialMO.list();
        debug('Updating Salesforce credentials for encryption purposes');
        for (const credential of allSalesforceCreds) {
            debug(`Updating credential ${credential.id}`);
            await credentialMO.update(credential.id, {
                accessToken: credential.accessToken,
                refreshToken: credential.refreshToken,
            });
        }
        debug('All done updating Salesforce credentials');
    }
}

module.exports = SalesforceMigrator;
