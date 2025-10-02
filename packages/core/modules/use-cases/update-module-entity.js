/**
 * UpdateModuleEntity Use Case
 * Updates a module entity with new data
 */
class UpdateModuleEntity {
    constructor({ moduleRepository }) {
        this.moduleRepository = moduleRepository;
    }

    async execute(entityId, updates) {
        const entity = await this.moduleRepository.findEntityById(entityId);

        if (!entity) {
            throw new Error(`Entity not found: ${entityId}`);
        }

        // Update the entity using repository method
        const updatedEntity = await this.moduleRepository.updateEntity(entityId, updates);

        return updatedEntity;
    }
}

module.exports = { UpdateModuleEntity };
