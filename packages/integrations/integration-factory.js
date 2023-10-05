const { ModuleFactory, Credential, Entity } = require('@friggframework/module-plugin');
const {IntegrationModel} = require("./integration-model");
const _ = require('lodash');
const {IntegrationMapping} = require("./integration-mapping");

class IntegrationFactory {
    constructor(integrationClasses = []) {
        this.integrationClasses = integrationClasses;
        this.moduleFactory = new ModuleFactory(...this.getModules());
        this.integrationTypes = this.integrationClasses.map(IntegrationClass => IntegrationClass.getName());
        this.getIntegrationConfigs = this.integrationClasses.map(IntegrationClass => IntegrationClass.Config);
    }

    async getIntegrationOptions() {
        const options = this.integrationClasses.map(IntegrationClass => IntegrationClass.Options);
        return {
            entities: {
                primary: this.getPrimaryName(),
                options: options.map(val => val.get()),
                authorized: [],
            },
            integrations: [],
        };
    }

    getModules() {
        return  [... new Set(this.integrationClasses.map(integration =>
            Object.values(integration.modules)
        ).flat())];
    }

    getPrimaryName() {
        function findMostFrequentElement(array) {
            const frequencyMap = _.countBy(array);
            return _.maxBy(_.keys(frequencyMap), (element) => frequencyMap[element]);
        }
        const allModulesNames = _.flatten(this.integrationClasses.map(integration =>
            Object.values(integration.modules).map(module => module.getName())
        ));
        return findMostFrequentElement(allModulesNames);
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
        const instance = new integrationClassDef({
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

        await instance.getUserActions();
        instance.delegateTypes.push(...Object.keys(instance.userActions));
        return instance;
    }

    async createIntegration(entities, userId, config) {
        // verify entity ids belong to the user
        // for (const id of entities) {
        //     const entity = await Entity.findById(id);
        //     if (!entity) {
        //         throw new Error(`Entity with ID ${id} does not exist.`);
        //     }
        //     if (entity.user.toString() !== userId.toString()) {
        //         throw new Error('one or more the entities do not belong to the user');
        //     }
        // }

        // build integration
        const integrationRecord = await IntegrationModel.create({
            entities: entities,
            user: userId,
            config,
            version: '0.0.0',
        });
        return await this.getInstanceFromIntegrationId({integrationId: integrationRecord.id, userId});
    }
}

class IntegrationHelper {
    static async getFormattedIntegration(integrationRecord) {
        const integrationObj = {
            id: integrationRecord.id,
            status: integrationRecord.status,
            config: integrationRecord.config,
            entities: [],
            version: integrationRecord.version,
            messages: integrationRecord.messages,
        };
        for (const entityId of integrationRecord.entities) {
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
        const integrationList = await IntegrationModel.find({ user: userId });
        return await Promise.all(integrationList.map(async (integrationRecord) =>
            await IntegrationHelper.getFormattedIntegration(integrationRecord)
        ));
    }

    static async deleteIntegrationForUserById(userId, integrationId) {
        const integrationList = await IntegrationModel.find({
            user: userId,
            _id: integrationId,
        });
        if (integrationList.length !== 1) {
            throw new Error(
                `Integration with id of ${integrationId} does not exist for this user`
            );
        }
        await IntegrationModel.deleteOne({ _id: integrationId });
    }

    static async getIntegrationById(id) {
        return await IntegrationModel.findById(id);
    }

    static async listCredentials(options) {
        return Credential.find(options);
    }
}

module.exports = { IntegrationFactory, IntegrationHelper };
