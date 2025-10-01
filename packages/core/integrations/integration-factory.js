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

    async getInstanceFromIntegrationId(params) {
        const integrationRecord = await IntegrationHelper.getIntegrationById(
            params.integrationId
        );
        let { userId } = params;
        if (!integrationRecord) {
            throw new Error(
                `No integration found by the ID of ${params.integrationId}`
            );
        }

        if (!userId) {
            userId = integrationRecord.user._id.toString();
        } else if (userId.toString() !== integrationRecord.user.toString()) {
            throw new Error(
                `Integration ${
                    params.integrationId
                } does not belong to User ${userId}, ${integrationRecord.user.toString()}`
            );
        }

        const integrationClass = this.getIntegrationClassByType(
            integrationRecord.config.type
        );
        
        console.log('🔍 Debug integration factory:');
        console.log('   Integration record type:', integrationRecord.config.type);
        console.log('   Available integration types:', this.integrationTypes);
        console.log('   Retrieved integration class:', integrationClass);
        console.log('   Is constructor?', typeof integrationClass === 'function');
        
        if (!integrationClass) {
            console.warn(`⚠️  No integration class found for type: ${integrationRecord.config.type}. Skipping this integration.`);
            console.warn(`   Available types: ${this.integrationTypes.join(', ')}`);
            return null;
        }
        
        if (typeof integrationClass !== 'function') {
            console.warn(`⚠️  Integration class for type "${integrationRecord.config.type}" is not a constructor function. Skipping this integration.`);
            return null;
        }

        const instance = new integrationClass({
            userId,
            integrationId: params.integrationId,
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
        // Get integration class to check for global entities
        const integrationClass = this.getIntegrationClassByType(config.type);
        const allEntities = [...entities];

        if (integrationClass && integrationClass.Definition?.entities) {
            // Check for global entities that need to be auto-included
            for (const [entityKey, entityConfig] of Object.entries(integrationClass.Definition.entities)) {
                if (entityConfig.global === true) {
                    // Find the global entity of this type
                    const globalEntity = await Entity.findOne({
                        type: entityConfig.type,
                        isGlobal: true,
                        status: 'connected'
                    });

                    if (globalEntity) {
                        console.log(`✅ Auto-including global entity: ${entityConfig.type} (${globalEntity._id})`);
                        allEntities.push(globalEntity._id.toString());
                    } else if (entityConfig.required !== false) {
                        throw new Error(
                            `Required global entity "${entityConfig.type}" not found. Admin must configure this entity first.`
                        );
                    }
                }
            }
        }

        const integrationRecord = await IntegrationModel.create({
            entities: allEntities,
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

const IntegrationHelper = {
    getFormattedIntegration: async function (integrationRecord, integrationFactory) {
        // Try to get the integration class to retrieve proper names
        let integrationType = integrationRecord.config?.type;
        let integrationDisplayName = integrationType;
        let modules = {};

        if (integrationFactory && integrationType) {
            try {
                const IntegrationClass = integrationFactory.getIntegrationClassByType(integrationType);
                if (IntegrationClass && IntegrationClass.Definition) {
                    // Use the Definition name as the canonical name
                    integrationType = IntegrationClass.Definition.name;
                    integrationDisplayName = IntegrationClass.Definition.display?.label || IntegrationClass.Definition.display?.name || integrationType;

                    // Map out the modules for this integration
                    if (IntegrationClass.Definition.modules) {
                        for (const [key, moduleConfig] of Object.entries(IntegrationClass.Definition.modules)) {
                            if (moduleConfig && moduleConfig.definition) {
                                modules[key] = {
                                    name: moduleConfig.definition.getName ? moduleConfig.definition.getName() : key,
                                    type: moduleConfig.definition.moduleType || 'unknown',
                                };
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn(`Could not get integration class for type ${integrationType}:`, error.message);
            }
        }

        const integrationObj = {
            id: integrationRecord.id,
            status: integrationRecord.status,
            config: integrationRecord.config,
            type: integrationType,  // The canonical type from Definition.name
            displayName: integrationDisplayName,  // The display name from Definition.display.name
            modules: modules,  // Map of API modules this integration uses
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

    getIntegrationsForUserId: async function (userId, integrationFactory) {
        const integrationList = await IntegrationModel.find({ user: userId });
        return await Promise.all(
            integrationList.map(
                async (integrationRecord) =>
                    await IntegrationHelper.getFormattedIntegration(
                        integrationRecord,
                        integrationFactory
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
