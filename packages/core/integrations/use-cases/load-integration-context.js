const { IntegrationRepository } = require('../integration-repository');
const { ModuleRepository } = require('../../modules/module-repository');
const { ModuleFactory } = require('../../modules/module-factory');
const { getModulesDefinitionFromIntegrationClasses } = require('../utils/map-integration-dto');

class LoadIntegrationContextUseCase {
    constructor({
        integrationClass,
        integrationRepository,
        moduleRepository,
        moduleFactory,
    }) {
        if (!integrationClass) {
            throw new Error('integrationClass is required');
        }

        this.integrationClass = integrationClass;
        this.integrationRepository = integrationRepository || new IntegrationRepository();
        this.moduleRepository = moduleRepository || new ModuleRepository();

        const moduleDefinitions = getModulesDefinitionFromIntegrationClasses([
            integrationClass,
        ]);

        this.moduleFactory =
            moduleFactory ||
            new ModuleFactory({
                moduleRepository: this.moduleRepository,
                moduleDefinitions,
            });
    }

    async execute({ integrationId, integrationRecord }) {
        const record = integrationRecord
            ? integrationRecord
            : await this.integrationRepository.findIntegrationById(integrationId);

        if (!record) {
            const error = new Error('Integration record not found');
            error.code = 'INTEGRATION_RECORD_NOT_FOUND';
            throw error;
        }

        if (!Array.isArray(record.entitiesIds) || record.entitiesIds.length === 0) {
            return {
                record: {
                    ...record,
                    entities: [],
                },
                modules: [],
            };
        }

        const entities = await this.moduleRepository.findEntitiesByIds(
            record.entitiesIds
        );

        const modules = [];
        for (const entity of entities) {
            const moduleInstance = await this.moduleFactory.getModuleInstance(
                entity.id,
                record.userId
            );
            modules.push(moduleInstance);
        }

        return {
            record: {
                ...record,
                entities,
            },
            modules,
        };
    }
}

module.exports = { LoadIntegrationContextUseCase };
