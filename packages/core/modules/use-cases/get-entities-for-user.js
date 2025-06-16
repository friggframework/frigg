const { Module } = require('../module');
const { mapModuleClassToModuleDTO } = require('../utils/map-module-dto');

class GetEntitiesForUser {
    constructor({ moduleRepository, moduleDefinitions }) {
        this.moduleRepository = moduleRepository;

        this.definitionMap = new Map();
        for (const definition of moduleDefinitions) {
            this.definitionMap.set(definition.moduleName, definition);
        }
    }

    async execute(userId) {
        const entities = await this.moduleRepository.findEntitiesByUserId(
            userId
        );

        return entities.map((entity) => {
            const definition = this.definitionMap.get(entity.moduleName);

            const moduleInstance = new Module({
                userId,
                definition: definition,
                entity: entity,
            });
            return mapModuleClassToModuleDTO(moduleInstance);
        });
    }
}

module.exports = { GetEntitiesForUser }; 