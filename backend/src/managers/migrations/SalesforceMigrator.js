const LHMigrator = require('../../base/managers/LHMigrator');
const IntegrationManager = require('../integrations/SalesforceIntegrationManager');
const Options = require('../../base/objects/migration/Options');
const CompanySync = require('../../objects/sync/CompanySync');
const ContactSync = require('../../objects/sync/ContactSync');
const { debug } = require('../../utils/logger');

class SalesforceMigrator extends LHMigrator {
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
