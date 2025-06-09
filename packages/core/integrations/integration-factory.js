const { ModuleFactory, Credential, Entity } = require('../module-plugin');
const { IntegrationModel } = require('./integration-model');
const _ = require('lodash');

class IntegrationFactory {
    constructor(integrationClasses = []) {
        this.integrationClasses = integrationClasses;
        this.moduleFactory = new ModuleFactory(...this.getModules());
        this.integrationTypes = this.integrationClasses.map(
            (IntegrationClass) => IntegrationClass.getName()
        );
        this.getIntegrationDefinitions = this.integrationClasses.map(
            (IntegrationClass) => IntegrationClass.Definition
        );
    }

    async getIntegrationOptions() {
        const options = this.integrationClasses.map(
            (IntegrationClass) => IntegrationClass
        );
        return {
            entities: {
                options: options.map((IntegrationClass) =>
                    IntegrationClass.getOptionDetails()
                ),
                authorized: [],
            },
            integrations: [],
        };
    }

    getModules() {
        return [
            ...new Set(
                this.integrationClasses
                    .map((integration) =>
                        Object.values(integration.Definition.modules).map(
                            (module) => module.definition
                        )
                    )
                    .flat()
            ),
        ];
    }

    getIntegrationClassByType(type) {
        const integrationClassIndex = this.integrationTypes.indexOf(type);
        return this.integrationClasses[integrationClassIndex];
    }
    getModuleTypesAndKeys(integrationClass) {
        const moduleTypesAndKeys = {};
        const moduleTypeCount = {};

        if (integrationClass && integrationClass.Definition.modules) {
            for (const [key, moduleClass] of Object.entries(
                integrationClass.Definition.modules
            )) {
                if (
                    moduleClass &&
                    typeof moduleClass.definition.getName === 'function'
                ) {
                    const moduleType = moduleClass.definition.getName();

                    // Check if this module type has already been seen
                    if (moduleType in moduleTypesAndKeys) {
                        throw new Error(
                            `Duplicate module type "${moduleType}" found in integration class definition.`
                        );
                    }

                    // Well how baout now

                    moduleTypesAndKeys[moduleType] = key;
                    moduleTypeCount[moduleType] =
                        (moduleTypeCount[moduleType] || 0) + 1;
                }
            }
        }

        // Check for any module types with count > 1
        for (const [moduleType, count] of Object.entries(moduleTypeCount)) {
            if (count > 1) {
                throw new Error(
                    `Multiple instances of module type "${moduleType}" found in integration class definition.`
                );
            }
        }

        return moduleTypesAndKeys;
    }

    async getInstanceFromIntegrationId({ integrationId, userId }) {
        const integrationRecord = await IntegrationHelper.getIntegrationById(
            integrationId
        );
        if (!integrationRecord) {
            throw new Error(
                `No integration found by the ID of ${integrationId}`
            );
        }

        if (!userId) {
            userId = integrationRecord.user._id.toString();
        } else if (userId.toString() !== integrationRecord.user.toString()) {
            throw new Error(
                `Integration ${integrationId
                } does not belong to User ${userId}, ${integrationRecord.user.toString()}`
            );
        }

        const integrationClass = this.getIntegrationClassByType(
            integrationRecord.config.type
        );

        const instance = new integrationClass({
            userId,
            integrationId,
        });

        if (
            integrationRecord.entityReference &&
            Object.keys(integrationRecord.entityReference) > 0
        ) {
            // Use the specified entityReference to find the modules and load them according to their key
            // entityReference will be a map of entityIds with their corresponding desired key
            for (const [entityId, key] of Object.entries(
                integrationRecord.entityReference
            )) {
                const moduleInstance =
                    await this.moduleFactory.getModuleInstanceFromEntityId(
                        entityId,
                        integrationRecord.user
                    );
                instance[key] = moduleInstance;
            }
        } else {
            // for each entity, get the moduleinstance and load them according to their keys
            // If it's the first entity, load the moduleinstance into primary as well
            // If it's the second entity, load the moduleinstance into target as well
            const moduleTypesAndKeys =
                this.getModuleTypesAndKeys(integrationClass);
            for (let i = 0; i < integrationRecord.entities.length; i++) {
                const entityId = integrationRecord.entities[i];
                const moduleInstance =
                    await this.moduleFactory.getModuleInstanceFromEntityId(
                        entityId,
                        integrationRecord.user
                    );
                const moduleType = moduleInstance.getName();
                const key = moduleTypesAndKeys[moduleType];
                instance[key] = moduleInstance;
                if (i === 0) {
                    instance.primary = moduleInstance;
                } else if (i === 1) {
                    instance.target = moduleInstance;
                }
            }
        }
        instance.record = integrationRecord;

        try {
            const additionalUserActions =
                await instance.loadDynamicUserActions();
            instance.events = { ...instance.events, ...additionalUserActions };
        } catch (e) {
            instance.record.status = 'ERROR';
            instance.record.messages.errors.push(e);
            await instance.record.save();
        }
        // Register all of the event handlers

        await instance.registerEventHandlers();
        return instance;
    }

    async createIntegration(entities, userId, config) {
        const integrationRecord = await IntegrationModel.create({
            entities: entities,
            user: userId,
            config,
            version: '0.0.0',
        });
        return await this.getInstanceFromIntegrationId({
            integrationId: integrationRecord.id,
            userId,
        });
    }
}

// todo: this should be split into use case classes
const IntegrationHelper = {
    getFormattedIntegration: async function (integrationRecord) {
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
    },

    getIntegrationsForUserId: async function (userId) {
        const integrationList = await IntegrationModel.find({ user: userId });
        return await Promise.all(
            integrationList.map(
                async (integrationRecord) =>
                    await IntegrationHelper.getFormattedIntegration(
                        integrationRecord
                    )
            )
        );
    },

    deleteIntegrationForUserById: async function (userId, integrationId) {
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
    },

    getIntegrationById: async function (id) {
        return IntegrationModel.findById(id).populate('entities');
    },

    listCredentials: async function (options) {
        return Credential.find(options);
    },
};

module.exports = { IntegrationFactory, IntegrationHelper };
