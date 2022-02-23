const { Migrator, Options } = require('@friggframework/migrations');
const { IntegrationManager } = require('./integration-manager');
// const CompanySync = require('../../syncs/sync/CompanySync');
// const ContactSync = require('../../syncs/sync/ContactSync');
const { debug } = require('@friggframework/logs');

// TODO move to HubSpot module ?

class HubSpotMigrator extends Migrator {
    static integrationManager = IntegrationManager;

    constructor(params) {
        super(params);
        this.integrationManager = HubSpotMigrator.integrationManager;
        this.options = [
            new Options({
                integrationManager: HubSpotMigrator.integrationManager,
                fromVersion: '*',
                toVersion: '1.0.0',
                perIntegrationFunctions: [
                    // this.setupSyncObjects,
                ],
                generalFunctions: [
                    this.rotateAesKey,
                    this.rotateFastSpringAesKey,
                ],
            }),
        ];
    }

    // Holding off for now, as they seem to be working fine
    // async setupSyncObjects(integrationManagerInstance) {
    //     // for the integration, get all Companies and Contacts
    //     const companies = await integrationManagerInstance.primaryInstance.api.listCompanies();
    //     const contacts = await integrationManagerInstance.primaryInstance.api.listContacts();
    //
    //     // For each company that has externalId and externalSourceType of HubSpot
    //     const hubspotCompanies = companies.filter((company) => company.sourceType === 'hubspot');
    //     // Create CompanySync object, add identifiers, save to the DB
    //     for (const company of hubspotCompanies) {
    //
    //     }
    //     // For each contact that has externalId and externalSourceType of hubspot
    //     const hubspotContact = companies.filter((contact) => contact.sourceType === 'hubspot');
    //     // create ContactSync object, add identifiers, save to the DB
    // }

    async rotateFastSpringAesKey() {
        const credentialMO =
            new (require('../../modules/SalesRight/models/Credential'))();
        const allSalesRightCreds = await credentialMO.list();
        debug('Updating SalesRight credentials for encryption purposes');
        for (const credential of allSalesRightCreds) {
            debug(`Updating credential ${credential.id}`);
            await credentialMO.update(credential.id, {
                accessToken: credential.accessToken,
                refreshToken: credential.refreshToken,
            });
        }
        debug('All done updating SalesRight credentials');
    }

    async rotateAesKey() {
        const credentialMO =
            new (require('../../modules/Hubspot/models/Credential'))();
        const allHubSpotCreds = await credentialMO.list();
        debug('Updating HubSpot credentials for encryption purposes');
        for (const credential of allHubSpotCreds) {
            debug(`Updating credential ${credential.id}`);
            await credentialMO.update(credential.id, {
                accessToken: credential.accessToken,
                refreshToken: credential.refreshToken,
            });
        }
        debug('All done updating HubSpot credentials');
    }
}

module.exports = HubSpotMigrator;
