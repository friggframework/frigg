const { Module } = require('../module');
const { mapModuleClassToModuleDTO } = require('../utils/map-module-dto');
const { describeRecord, visibilityClauses } = require('../scope-visibility');
const { DEFAULT_SCOPE_POLICY } = require('../scope-policy');

class GetEntitiesForUser {
    constructor({ moduleRepository, moduleDefinitions, scopePolicy }) {
        this.scopePolicy = scopePolicy || DEFAULT_SCOPE_POLICY;
        this.moduleRepository = moduleRepository;

        this.definitionMap = new Map();
        for (const definition of moduleDefinitions) {
            this.definitionMap.set(definition.moduleName, definition);
        }
    }

    /**
     * The entities a `User` may see in the active organization (ADR-056 §3.6).
     * @param {Object} user - authenticated User
     */
    async execute(user) {
        const ctx = this.scopePolicy.accessContext(user);
        const found = await this.moduleRepository.findEntitiesByOwnership(
            visibilityClauses(ctx, 'entity')
        );
        const entities = (found || []).filter((entity) =>
            describeRecord(entity, ctx, 'entity')
        );

        return Promise.all(
            entities.map(async (entity) => {
                const definition = this.definitionMap.get(entity.moduleName);

                const moduleInstance = await Module.create({
                    userId: entity.userId,
                    definition: definition,
                    entity: entity,
                });
                return mapModuleClassToModuleDTO(moduleInstance);
            })
        );
    }
}

module.exports = { GetEntitiesForUser }; 