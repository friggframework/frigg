const LHIntegrationManager = require('../../base/managers/LHIntegrationManager');
const EntityManager = require('../entities/EntityManager');

const rollWorksIntegrationManager = require('./RollWorksIntegrationManager');
const mondayIntegrationManager = require('./MondayIntegrationManager');
const salesloftIntegrationManager = require('./SalesloftIntegrationManager');
const salesforceIntegrationManager = require('./SalesforceIntegrationManager');
const qboIntegrationManager = require('./QBOIntegrationManager');
const hubSpotIntegrationManager = require('./HubSpotIntegrationManager');
const stackIntegrationManager = require('./StackIntegrationManager');
const revioIntegrationManager = require('./RevioIntegrationManager');
const connectWiseIntegrationManager = require('./ConnectWiseIntegrationManager');
const crossbeamIntegrationManager = require('./CrossbeamIntegrationManager');
const marketoIntegrationManager = require('./MarketoIntegrationManager');
const activeCampaignIntegrationManager = require('./ActiveCampaignIntegrationManager');
const outreachIntegrationManager = require('./OutreachIntegrationManager');
const attentiveIntegrationManager = require('./AttentiveIntegrationManager');

class IntegrationManager extends LHIntegrationManager {
    static integrationManagerClasses = [
        rollWorksIntegrationManager,
        mondayIntegrationManager,
        crossbeamIntegrationManager,
        salesloftIntegrationManager,
        salesforceIntegrationManager,
        qboIntegrationManager,
        hubSpotIntegrationManager,
        stackIntegrationManager,
        revioIntegrationManager,
        connectWiseIntegrationManager,
        marketoIntegrationManager,
        activeCampaignIntegrationManager,
        outreachIntegrationManager,
        attentiveIntegrationManager,
    ];

    static integrationTypes = IntegrationManager.integrationManagerClasses.map(
        (ManagerClass) => ManagerClass.getName()
    );

    constructor(params) {
        super(params);
    }

    static async getInstanceFromIntegrationId(params) {
        const integration = await IntegrationManager.getIntegrationById(
            params.integrationId
        );
        let { userId } = params;
        if (!integration) {
            throw new Error(
                `No integration found by the ID of ${params.integrationId}`
            );
        }

        if (!userId) {
            userId = integration.user._id.toString();
        } else if (userId !== integration.user._id.toString()) {
            throw new Error(
                `Integration ${
                    params.integrationId
                } does not belong to User ${userId}, ${integration.user.id.toString()}`
            );
        }

        const integrationManagerIndex =
            IntegrationManager.integrationTypes.indexOf(
                integration.config.type
            );
        const integrationManagerClass =
            IntegrationManager.integrationManagerClasses[
                integrationManagerIndex
            ];

        const instance = await integrationManagerClass.getInstance({
            userId,
            integrationId: params.integrationId,
        });
        instance.integration = integration;
        instance.delegateTypes.push(...integrationManagerClass.Config.events); // populates the events available
        // Need to get special primaryInstance because it has an extra param to pass in
        instance.primaryInstance =
            await EntityManager.getEntityManagerInstanceFromEntityId(
                instance.integration.entities[0],
                instance.integration.user
            );
        // Now we can use the general ManagerGetter
        instance.targetInstance =
            await EntityManager.getEntityManagerInstanceFromEntityId(
                instance.integration.entities[1],
                instance.integration.user
            );
        instance.delegate = instance;
        return instance;
    }
}

module.exports = IntegrationManager;
