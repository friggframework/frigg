const {IntegrationManager: IntegrationBase} = require('./manager')
const { Credential, Entity } = require('@friggframework/module-plugin');
const {Integration} = require("./model");
const _ = require('lodash');
const {IntegrationMapping} = require("./integration-mapping");

class IntegrationFactory {
    constructor(integrationClasses = [], moduleFactory, primary) {
        this.integrationClasses = integrationClasses;
        this.moduleFactory = moduleFactory;
        this.primary = primary;
        this.integrationTypes = this.integrationClasses.map(IntegrationClass => IntegrationClass.getName());
        this.getIntegrationConfigs = this.integrationClasses.map(IntegrationClass => IntegrationClass.Config);
    }

    async getIntegrationOptions() {
        const options = this.integrationClasses.map(IntegrationClass => IntegrationClass.Options);
        return {
            entities: {
                primary: this.primary.getName(),
                options: options.map(val => val.get()),
                authorized: [],
            },
            integrations: [],
        };
    }

    getIntegrationClassDefByType(type) {
        const integrationClassIndex = this.integrationTypes.indexOf(type);
        return this.integrationClasses[integrationClassIndex];
    }

    async getInstanceFromIntegrationId(params) {
        const integrationRecord = await IntegrationHelper.getIntegrationById(params.integrationId);
        let {userId} = params;
        if (!integrationRecord) {
            throw new Error(`No integration found by the ID of ${params.integrationId}`);
        }

        if (!userId) {
            userId = integrationRecord.user._id.toString();
        } else if (userId !== integrationRecord.user._id.toString()) {
            throw new Error(`Integration ${params.integrationId} does not belong to User ${userId}, ${integrationRecord.user.id.toString()}`);
        }

        const integrationClassDef = this.getIntegrationClassDefByType(integrationRecord.config.type);
        const instance = await integrationClassDef.getInstance({
            userId,
            integrationId: params.integrationId,
        });
        instance.record = integrationRecord;
        instance.delegateTypes.push(...integrationClassDef.Config.events);
        instance.primary = await this.moduleFactory.getModuleInstanceFromEntityId(
            instance.record.entities[0],
            instance.record.user
        );
        instance.target = await this.moduleFactory.getModuleInstanceFromEntityId(
            instance.record.entities[1],
            instance.record.user
        );
        instance.delegate = instance;
        await instance.getUserActions();
        instance.delegateTypes.push(...Object.keys(instance.userActions));
        return instance;
    }

    async createIntegration(entities, userId, config) {
        // verify entity ids belong to the user
        for (const id of entities) {
            const entity = await Entity.findById(id);
            if (!entity) {
                throw new Error(`Entity with ID ${id} does not exist.`);
            }
            if (entity.user.toString() !== userId.toString()) {
                throw new Error('one or more the entities do not belong to the user');
            }
        }

        // build integration
        const integrationClassDef = this.getIntegrationClassDefByType(config.type);
        const integrationRecord = await Integration.create({
            entities: entities,
            user: userId,
            config,
            version: '0.0.0',
        });

        const instance = await integrationClassDef.getInstance({
            userId,
            integrationId: integrationRecord.id,
        });
        instance.record = integrationRecord;
        instance.delegateTypes.push(...integrationClassDef.Config.events);
        instance.primary = await this.moduleFactory.getModuleInstanceFromEntityId(
            instance.record.entities[0],
            instance.record.user
        );
        instance.target = await this.moduleFactory.getModuleInstanceFromEntityId(
            instance.record.entities[1],
            instance.record.user
        );
        instance.delegate = instance;
        return instance;
    }
}

class IntegrationHelper {
    static async getFormattedIntegration(integration) {
        const integrationObj = {
            id: integration.id,
            status: integration.status,
            config: integration.config,
            entities: [],
            version: integration.version,
            messages: integration.messages,
        };
        for (const entityId of integration.entities) {
            // Only return non-internal fields. Leverages "select" and "options" to non-excepted fields and a pure object.
            const entity = await Entity.findById(
                entityId,
                '-createdAt -updatedAt -user -credentials -credential -_id -__t -__v',
                { lean: true }
            );
            integrationObj.entities.push({
                id: entityId,
                ...entity,
            });
        }
        return integrationObj;
    }

    static async getIntegrationsForUserId(userId) {
        const integrationList = await Integration.find({ user: userId });
        const responseArray = [];

        for (const integration of integrationList) {
            const integrationObj =
                await IntegrationFactory.getFormattedIntegration(integration);
            responseArray.push(integrationObj);
        }

        return responseArray;
    }

    static async deleteIntegrationForUserById(userId, integrationId) {
        const integrationList = await Integration.find({
            user: userId,
            _id: integrationId,
        });
        if (integrationList.length == 1) {
            await Integration.deleteOne({ _id: integrationId });
        } else {
            throw new Error(
                `Integration with id of ${integrationId} does not exist for this user`
            );
        }
    }

    static async getIntegrationById(id) {
        return await Integration.findById(id);
    }

    static async listCredentials(options) {
        return Credential.find(options);
    }

    static async getIntegrationMapping(integration_id, source_id) {
        return IntegrationMapping.findBy(integration_id, source_id);
    }

    static async upsertMapping(
        integration_id,
        userId,
        source_id,
        mapping
    ) {
        if (!source_id) {
            throw new Error(`sourceId must be set`);
        }
        // verify integration id belongs to the user
        const integration = await Integration.findById(integration_id);

        if (!integration) {
            throw new Error(
                `Integration with ID ${integration_id} does not exist.`
            );
        }

        if (integration.user.toString() !== userId.toString()) {
            throw new Error(
                'the integration mapping does not belong to the user'
            );
        }

        const integrationMapping = await IntegrationMapping.upsert(
            { integration, sourceId: source_id },
            {
                integration,
                sourceId: source_id,
                mapping,
            }
        );

        return integrationMapping;
    }
}

module.exports = { IntegrationFactory, IntegrationHelper };
