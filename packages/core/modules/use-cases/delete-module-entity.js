/**
 * DeleteModuleEntity Use Case
 * Deletes a module entity by its ID
 */
class DeleteModuleEntity {
    constructor({ moduleRepository }) {
        this.moduleRepository = moduleRepository;
    }

    async execute(entityId) {
        const entity = await this.moduleRepository.findEntityById(entityId);

        if (!entity) {
            throw new Error(`Entity not found: ${entityId}`);
        }

        await this.moduleRepository.deleteEntity(entityId);

        return true;
    }
}

module.exports = { DeleteModuleEntity };
